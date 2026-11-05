from datetime import datetime
from pydantic import BaseModel, field_validator
from typing import Optional


class HistoryRecord(BaseModel):
    id: int
    created_at: datetime
    mode: str
    label: str
    job_description_preview: Optional[str] = None
    sections_modified: list[str]

    model_config = {"from_attributes": True}


class HistoryListResponse(BaseModel):
    records: list[HistoryRecord]
    total: int


class RenameHistoryRequest(BaseModel):
    label: str

    @field_validator("label")
    @classmethod
    def label_not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("label must not be empty")
        return v[:128]  # column is String(128)


# ── Knowledge-base generation ────────────────────────────────────────────────

class KBStatus(BaseModel):
    path: str
    found: bool
    entry_count: int = 0
    entries_by_section: dict[str, int] = {}
    last_updated: Optional[str] = None


class KBGenerateRequest(BaseModel):
    job_description: str

    @field_validator("job_description")
    @classmethod
    def jd_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("job_description must not be empty")
        return v


class KBGenerateResponse(BaseModel):
    success: bool
    modified_latex: Optional[str] = None
    pdf_base64: Optional[str] = None  # Base64-encoded PDF bytes
    compilation_errors: Optional[str] = None  # Set if pdflatex failed after the fix pass
    ai_error: Optional[str] = None
    kb_ids: list[str] = []  # KB entries the AI says it used
    page_count: Optional[int] = None
    model: Optional[str] = None  # Which model actually wrote it (shows if a fallback ran)
    retry_count: int = 0
