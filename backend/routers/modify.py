import base64
import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.base_resume import BaseResume
from models.resume_record import ResumeRecord
from models.schemas import ModifyRequest, ModifyResponse
from services.ai_service import (
    AIServiceError,
    fix_compilation_error,
    refine_section,
    tailor_section,
)
from services.latex_service import (
    LaTeXParseError,
    compile_with_retry,
    parse_latex,
)

logger = logging.getLogger(__name__)

router = APIRouter()

DEFAULT_TAILOR_SECTIONS = ["Experience", "Projects", "Technical Skills"]


@router.post("/api/modify", response_model=ModifyResponse)
async def modify_resume(
    request: ModifyRequest,
    db: AsyncSession = Depends(get_db),
) -> ModifyResponse:
    """
    Main endpoint for both Tailor and Refine modes.

    Tailor mode: rewrites resume sections to match the given job description.
    Refine mode: inserts a new entry (job/project/skills) into a section.
    """
    # ── Validate mode-specific fields ───────────────────────────────────────
    if request.mode == "tailor":
        if not request.job_description or not request.job_description.strip():
            raise HTTPException(
                status_code=422,
                detail="job_description is required for tailor mode",
            )
    elif request.mode == "refine":
        if not request.target_section or not request.target_section.strip():
            raise HTTPException(
                status_code=422,
                detail="target_section is required for refine mode",
            )
        if request.new_entry is None:
            raise HTTPException(
                status_code=422,
                detail="new_entry is required for refine mode",
            )

    # ── Resolve source LaTeX (saved base resume or pasted code) ───────────────
    base: BaseResume | None = None
    if request.base_resume_id is not None:
        base = await db.get(BaseResume, request.base_resume_id)
        if base is None:
            raise HTTPException(status_code=404, detail="Base resume not found")
        source_latex = base.latex_code
    else:
        source_latex = request.latex_code  # guaranteed present by the schema validator

    # ── Parse LaTeX ──────────────────────────────────────────────────────────
    try:
        parsed = parse_latex(source_latex)
    except LaTeXParseError as e:
        raise HTTPException(status_code=422, detail=f"LaTeX parse error: {e}")

    sections_modified: list[str] = []
    modified_sections: dict[str, str] = {}

    # ── AI modification ──────────────────────────────────────────────────────
    try:
        if request.mode == "tailor":
            target_sections = request.sections_to_modify or DEFAULT_TAILOR_SECTIONS
            # Only attempt sections that actually exist in the parsed document
            target_sections = [s for s in target_sections if s in parsed.sections]

            for section_name in target_sections:
                logger.info(f"Tailoring section: {section_name}")
                modified_body = await tailor_section(
                    section_name=section_name,
                    section_body=parsed.sections[section_name],
                    job_description=request.job_description,  # type: ignore[arg-type]
                )
                modified_sections[section_name] = modified_body
                sections_modified.append(section_name)

        elif request.mode == "refine":
            section_name = request.target_section  # type: ignore[assignment]
            if section_name not in parsed.sections:
                raise HTTPException(
                    status_code=422,
                    detail=f"Section '{section_name}' not found in the provided LaTeX. "
                    f"Available sections: {', '.join(parsed.section_order)}",
                )

            logger.info(f"Refining section: {section_name}")
            modified_body = await refine_section(
                section_name=section_name,
                section_body=parsed.sections[section_name],
                new_entry=request.new_entry.model_dump(),  # type: ignore[union-attr]
            )
            modified_sections[section_name] = modified_body
            sections_modified.append(section_name)

    except AIServiceError as e:
        logger.error(f"AI service error: {e}")
        return ModifyResponse(
            success=False,
            ai_error=str(e),
            sections_modified=[],
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Unexpected AI error")
        raise HTTPException(status_code=500, detail=f"Unexpected AI error: {e}")

    # ── Compile PDF (with retry on pdflatex errors) ──────────────────────────
    pdf_bytes, final_latex, retry_count = await compile_with_retry(
        parsed=parsed,
        modified_sections=modified_sections,
        ai_fix_fn=fix_compilation_error,
        max_retries=2,
    )

    pdf_base64: str | None = None
    compilation_errors: str | None = None

    if pdf_bytes is not None:
        pdf_base64 = base64.b64encode(pdf_bytes).decode("utf-8")
    else:
        compilation_errors = (
            "PDF compilation failed after retries. "
            "The modified LaTeX is returned so you can inspect it. "
            "Common fixes: ensure all braces are balanced and special characters are escaped."
        )
        logger.warning(f"PDF compilation failed for sections: {sections_modified}")

    response = ModifyResponse(
        success=True,
        modified_latex=final_latex,
        pdf_base64=pdf_base64,
        compilation_errors=compilation_errors,
        sections_modified=sections_modified,
        retry_count=retry_count,
    )

    # ── Persist result ───────────────────────────────────────────────────────
    # Refine on a base updates the base in place (the master is the source of truth).
    # Everything else is saved as an immutable history snapshot.
    if response.success and response.modified_latex:
        try:
            if request.mode == "refine" and base is not None:
                base.latex_code = final_latex
                base.pdf_bytes = pdf_bytes
                await db.commit()
                logger.info(f"Updated base resume {base.id} in place")
            else:
                now = datetime.now(timezone.utc)
                prefix = "Tailored" if request.mode == "tailor" else "Refined"
                base_tag = f" · {base.name}" if base is not None else ""
                label = f"{prefix} Resume{base_tag} · {now.strftime('%b %-d %Y')}"
                jd_preview = (request.job_description or "")[:100] or None
                record = ResumeRecord(
                    created_at=now,
                    mode=request.mode,
                    label=label,
                    job_description_preview=jd_preview,
                    sections_modified=json.dumps(sections_modified),
                    modified_latex=final_latex,
                    pdf_bytes=pdf_bytes,
                )
                db.add(record)
                await db.commit()
                logger.info("Saved resume to history (id will be assigned by DB)")
        except Exception:
            logger.exception("Persist failed — continuing without saving")

    return response
