"""Generate a resume from scratch (structured career info -> LaTeX) and save it as a base."""

import base64
import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.base_resume import BaseResume
from models.schemas import GenerateRequest, GenerateResponse
from services.ai_service import AIServiceError, fix_document_error, generate_resume
from services.latex_service import compile_latex

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/api/generate", response_model=GenerateResponse)
async def generate_from_scratch(
    request: GenerateRequest,
    db: AsyncSession = Depends(get_db),
) -> GenerateResponse:
    """Build a full LaTeX resume from career info and persist it as a new base resume."""
    # ── AI generation ────────────────────────────────────────────────────────
    try:
        latex = await generate_resume(
            resume_name=request.resume_name,
            career_info=request.career_info.model_dump(),
        )
    except AIServiceError as e:
        logger.error(f"AI service error during generation: {e}")
        return GenerateResponse(success=False, ai_error=str(e))
    except Exception as e:
        logger.exception("Unexpected generation error")
        raise HTTPException(status_code=500, detail=f"Unexpected generation error: {e}")

    # ── Compile, with one document-level AI fix on failure ─────────────────────
    pdf_bytes, error = compile_latex(latex)
    if pdf_bytes is None and error and "not found" not in error and "timed out" not in error:
        logger.info("Generated resume failed to compile — attempting one AI fix")
        try:
            latex = await fix_document_error(latex, error)
            pdf_bytes, error = compile_latex(latex)
        except AIServiceError:
            pass  # keep the original latex + error for the user to fix in-editor

    compilation_errors = None
    pdf_base64 = None
    if pdf_bytes is not None:
        pdf_base64 = base64.b64encode(pdf_bytes).decode("utf-8")
    else:
        compilation_errors = (
            "PDF compilation failed. The generated LaTeX is returned so you can edit it. "
            f"Error: {error}"
        )

    # ── Persist as a new base resume ──────────────────────────────────────────
    bcase = BaseResume(
        name=request.resume_name.strip(),
        latex_code=latex,
        pdf_bytes=pdf_bytes,
    )
    db.add(bcase)
    await db.commit()
    await db.refresh(bcase)

    return GenerateResponse(
        success=True,
        base_id=bcase.id,
        name=bcase.name,
        latex_code=latex,
        pdf_base64=pdf_base64,
        compilation_errors=compilation_errors,
    )
