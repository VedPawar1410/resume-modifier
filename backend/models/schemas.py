from datetime import datetime
from pydantic import BaseModel, field_validator
from typing import Optional

from services.fit_service import FitCheck


JOB_STATUSES = ("applied", "interviewing", "offer", "rejected")


class HistoryRecord(BaseModel):
    """One job in the list. A job exists from its fit check; has_resume says if it's generated."""
    id: int
    created_at: datetime
    mode: str
    label: str
    job_description_preview: Optional[str] = None
    sections_modified: list[str]
    status: Optional[str] = None
    has_resume: bool = True
    fit_verdict: Optional[str] = None  # apply / maybe / skip, when a fit check was run
    fit_score: Optional[int] = None

    model_config = {"from_attributes": True}


class HistoryDetail(HistoryRecord):
    job_description: Optional[str] = None
    fit_check: Optional[FitCheck] = None
    # For the step tabs ("Match ✓", "Outreach · 2", "Q&A · 3") without loading each step.
    has_match_report: bool = False
    outreach_count: int = 0
    qa_count: int = 0


class HistoryListResponse(BaseModel):
    records: list[HistoryRecord]
    total: int


class UpdateHistoryRequest(BaseModel):
    """Rename and/or set the status. Send status null (or "") to clear it."""
    label: Optional[str] = None
    status: Optional[str] = None

    @field_validator("label")
    @classmethod
    def label_not_empty(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        v = v.strip()
        if not v:
            raise ValueError("label must not be empty")
        return v[:128]  # column is String(128)

    @field_validator("status")
    @classmethod
    def status_known(cls, v: Optional[str]) -> Optional[str]:
        if not v:
            return None
        if v not in JOB_STATUSES:
            raise ValueError(f"status must be one of {', '.join(JOB_STATUSES)}")
        return v


class SaveLatexRequest(BaseModel):
    latex_code: str


class SaveLatexResponse(BaseModel):
    pdf_base64: Optional[str] = None  # None when the edit doesn't compile (code is still saved)
    compilation_errors: Optional[str] = None


# ── Knowledge-base generation ────────────────────────────────────────────────

class KBStatus(BaseModel):
    path: str
    found: bool
    entry_count: int = 0
    entries_by_section: dict[str, int] = {}
    last_updated: Optional[str] = None
    error: Optional[str] = None  # why it wasn't found (shown in the UI)


class KBGenerateRequest(BaseModel):
    job_description: str
    # The fit check Ved ran on this JD before generating (optional), saved with the résumé.
    fit_check: Optional[FitCheck] = None
    # Fill this existing job (made by the fit check) instead of creating a new record.
    record_id: Optional[int] = None

    @field_validator("job_description")
    @classmethod
    def jd_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("job_description must not be empty")
        return v


class KBGenerateResponse(BaseModel):
    success: bool
    record_id: Optional[int] = None  # history entry the result was saved as
    title: Optional[str] = None  # "Company — Role", also used as the history label
    modified_latex: Optional[str] = None
    pdf_base64: Optional[str] = None  # Base64-encoded PDF bytes
    compilation_errors: Optional[str] = None  # Set if pdflatex failed after the fix pass
    ai_error: Optional[str] = None
    kb_ids: list[str] = []  # KB entries the AI says it used
    page_count: Optional[int] = None
    model: Optional[str] = None  # Which model actually wrote it (shows if a fallback ran)
    retry_count: int = 0


class FitCheckRequest(BaseModel):
    job_description: str
    save: bool = True  # save the JD as a job (no résumé yet) and return its record_id

    @field_validator("job_description")
    @classmethod
    def jd_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("job_description must not be empty")
        return v


class FitCheckSaved(FitCheck):
    record_id: Optional[int] = None  # the job this check was saved as
