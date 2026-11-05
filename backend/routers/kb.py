"""Generate a resume for a job description from the knowledge base (kb.md)."""

import asyncio
import base64
import contextlib
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.resume_record import ResumeRecord
from models.schemas import KBGenerateRequest, KBGenerateResponse, KBStatus
from services.ai_service import (
    AIServiceError,
    fix_document_error,
    generate_from_kb,
    shorten_to_one_page,
)
from services.kb_service import (
    KBNotFoundError,
    count_pdf_pages,
    extract_kb_ids,
    extract_title,
    kb_status,
    load_kb,
    lost_content,
)
from services.latex_service import compile_latex

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/api/kb", response_model=KBStatus)
async def get_kb_status() -> KBStatus:
    return KBStatus(**kb_status())


DISCONNECT_POLL_SECONDS = 0.5


@router.post("/api/generate-from-kb", response_model=KBGenerateResponse)
async def generate_resume_from_kb(
    body: KBGenerateRequest,
    http_request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Runs the pipeline as a task and watches the connection. If the user cancels (the browser
    drops the request), the task is cancelled: the in-flight AI stream closes, no repair
    passes run and nothing is saved to history.

    FastAPI doesn't do this by itself — without it, a cancelled request keeps running (and
    spending tokens) on the server until it finishes.
    """
    task = asyncio.create_task(_run_pipeline(body, db))
    while True:
        done, _ = await asyncio.wait({task}, timeout=DISCONNECT_POLL_SECONDS)
        if done:
            return task.result()
        if await http_request.is_disconnected():
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task
            logger.info("Client cancelled generation — stopped the pipeline")
            return Response(status_code=499)  # nginx's "client closed request"; nobody reads it


async def _run_pipeline(request: KBGenerateRequest, db: AsyncSession) -> KBGenerateResponse:
    """
    KB + job description → AI-written LaTeX → PDF.
    Two automatic repair passes: one AI fix if it doesn't compile, one AI trim if it
    spills past one page. The result is saved to history.
    """
    try:
        kb_text = load_kb()
    except KBNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))

    # ── AI generation ────────────────────────────────────────────────────────
    try:
        latex, model = await generate_from_kb(kb_text, request.job_description)
    except AIServiceError as e:
        logger.error(f"AI service error during KB generation: {e}")
        return KBGenerateResponse(success=False, ai_error=str(e))

    retry_count = 0

    # ── Compile, with one document-level AI fix on failure ─────────────────────
    pdf_bytes, error = compile_latex(latex)
    if pdf_bytes is None and error and "not found" not in error and "timed out" not in error:
        logger.info(f"Generated resume failed to compile — attempting one AI fix. Error: {error[:300]}")
        retry_count += 1
        try:
            fixed, _ = await fix_document_error(latex, error)
            if lost_content(latex, fixed):
                logger.warning("AI fix dropped resume content — keeping the original for manual editing")
            else:
                latex = fixed
                pdf_bytes, error = compile_latex(latex)
        except AIServiceError:
            pass  # keep the original latex + error for the user to fix in-editor

    # ── Enforce one page, with one AI trim pass ────────────────────────────────
    page_count = count_pdf_pages(pdf_bytes) if pdf_bytes else None
    if page_count and page_count > 1:
        logger.info(f"Resume is {page_count} pages — asking the AI to trim it")
        retry_count += 1
        try:
            shorter, _ = await shorten_to_one_page(latex, page_count)
            short_pdf, _ = compile_latex(shorter)
            # Only accept the trim if it still compiles and didn't gut the resume
            if short_pdf is not None and not lost_content(latex, shorter):
                latex, pdf_bytes = shorter, short_pdf
                page_count = count_pdf_pages(short_pdf)
        except AIServiceError:
            pass  # keep the multi-page version

    compilation_errors = None
    if pdf_bytes is None:
        compilation_errors = (
            "PDF compilation failed. The generated LaTeX is returned so you can edit it. "
            f"Error: {error}"
        )

    # ── Persist to history (the kb-ids line inside the LaTeX records the sources) ──
    # Label = the AI's "Company — Role" title, else the JD's first line.
    jd_first_line = next((line.strip() for line in request.job_description.splitlines() if line.strip()), "")
    title = extract_title(latex) or jd_first_line[:80] or "Résumé"
    record_id = None
    try:
        record = ResumeRecord(
            created_at=datetime.now(timezone.utc),
            mode="kb",
            label=title[:128],
            job_description_preview=request.job_description[:100],
            sections_modified="[]",
            modified_latex=latex,
            pdf_bytes=pdf_bytes,
        )
        db.add(record)
        await db.flush()  # assigns the id before commit expires the object
        record_id = record.id
        await db.commit()
    except Exception:
        logger.exception("Persist failed — continuing without saving")

    return KBGenerateResponse(
        success=True,
        record_id=record_id,
        title=title,
        modified_latex=latex,
        pdf_base64=base64.b64encode(pdf_bytes).decode("utf-8") if pdf_bytes else None,
        compilation_errors=compilation_errors,
        kb_ids=extract_kb_ids(latex),
        page_count=page_count,
        model=model,
        retry_count=retry_count,
    )
