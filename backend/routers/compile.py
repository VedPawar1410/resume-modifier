import base64
import logging

from fastapi import APIRouter
from pydantic import BaseModel, field_validator
from typing import Optional

from services.latex_service import compile_latex

logger = logging.getLogger(__name__)

router = APIRouter()


class CompileRequest(BaseModel):
    latex_code: str

    @field_validator("latex_code")
    @classmethod
    def not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("latex_code must not be empty")
        return v


class CompileResponse(BaseModel):
    success: bool
    pdf_base64: Optional[str] = None
    compilation_errors: Optional[str] = None


@router.post("/api/compile", response_model=CompileResponse)
async def compile_resume(request: CompileRequest) -> CompileResponse:
    """
    Compile raw LaTeX to PDF with no AI involvement.
    Used by the live-edit recompilation path in the frontend.
    """
    pdf_bytes, error = compile_latex(request.latex_code)

    if pdf_bytes is not None:
        return CompileResponse(
            success=True,
            pdf_base64=base64.b64encode(pdf_bytes).decode("utf-8"),
        )

    logger.warning(f"Compile endpoint failed: {error[:200] if error else 'unknown'}")
    return CompileResponse(
        success=False,
        compilation_errors=error or "Unknown compilation error",
    )
