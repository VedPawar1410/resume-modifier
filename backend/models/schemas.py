from datetime import datetime
from pydantic import BaseModel, field_validator
from typing import Literal, Optional


class NewEntryPayload(BaseModel):
    """Structured data for a new resume entry (used in Refine mode)."""

    # Experience fields
    company: Optional[str] = None
    role: Optional[str] = None
    location: Optional[str] = None
    date_range: Optional[str] = None

    # Project fields
    project_name: Optional[str] = None
    links: Optional[str] = None
    date: Optional[str] = None

    # Shared
    raw_notes: Optional[str] = None  # Unpolished notes about what they did

    # Skills
    new_skills: Optional[str] = None  # Comma-separated new skills


class ModifyRequest(BaseModel):
    latex_code: str
    mode: Literal["tailor", "refine"]

    # Mode 1 – tailor
    job_description: Optional[str] = None
    sections_to_modify: Optional[list[str]] = None
    # Defaults applied in the router: ["Experience", "Projects", "Technical Skills"]

    # Mode 2 – refine
    target_section: Optional[str] = None
    new_entry: Optional[NewEntryPayload] = None

    @field_validator("latex_code")
    @classmethod
    def latex_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("latex_code must not be empty")
        return v


class ModifyResponse(BaseModel):
    success: bool
    modified_latex: Optional[str] = None
    pdf_base64: Optional[str] = None  # Base64-encoded PDF bytes
    compilation_errors: Optional[str] = None  # Set if pdflatex failed all retries
    ai_error: Optional[str] = None
    sections_modified: list[str] = []
    retry_count: int = 0


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
