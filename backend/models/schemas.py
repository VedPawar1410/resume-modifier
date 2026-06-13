from datetime import datetime
from pydantic import BaseModel, field_validator, model_validator
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
    mode: Literal["tailor", "refine"]

    # Source: either pasted LaTeX or a saved base resume (one is required).
    latex_code: Optional[str] = None
    base_resume_id: Optional[int] = None

    # Mode 1 – tailor
    job_description: Optional[str] = None
    sections_to_modify: Optional[list[str]] = None
    # Defaults applied in the router: ["Experience", "Projects", "Technical Skills"]

    # Mode 2 – refine
    target_section: Optional[str] = None
    new_entry: Optional[NewEntryPayload] = None

    @model_validator(mode="after")
    def check_source(self) -> "ModifyRequest":
        has_latex = bool(self.latex_code and self.latex_code.strip())
        if not has_latex and self.base_resume_id is None:
            raise ValueError("Either latex_code or base_resume_id must be provided")
        return self


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


class RenameHistoryRequest(BaseModel):
    label: str

    @field_validator("label")
    @classmethod
    def label_not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("label must not be empty")
        return v[:128]  # column is String(128)


# ── Resume-from-scratch generation ───────────────────────────────────────────

class ExperienceEntry(BaseModel):
    company: Optional[str] = None
    role: Optional[str] = None
    location: Optional[str] = None
    date_range: Optional[str] = None
    raw_notes: Optional[str] = None  # Unpolished notes about what they did


class ProjectEntry(BaseModel):
    name: Optional[str] = None
    tech: Optional[str] = None
    links: Optional[str] = None
    date: Optional[str] = None
    raw_notes: Optional[str] = None


class EducationEntry(BaseModel):
    school: Optional[str] = None
    degree: Optional[str] = None
    location: Optional[str] = None
    date_range: Optional[str] = None
    details: Optional[str] = None  # e.g. GPA, honors


class CareerInfo(BaseModel):
    # Contact
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    location: Optional[str] = None
    linkedin: Optional[str] = None
    github: Optional[str] = None
    website: Optional[str] = None

    summary: Optional[str] = None
    education: list[EducationEntry] = []
    experience: list[ExperienceEntry] = []
    projects: list[ProjectEntry] = []
    skills: Optional[str] = None  # Free-form; categorized or comma-separated


class GenerateRequest(BaseModel):
    resume_name: str
    career_info: CareerInfo

    @field_validator("resume_name")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("resume_name must not be empty")
        return v


class GenerateResponse(BaseModel):
    success: bool
    base_id: Optional[int] = None
    name: Optional[str] = None
    latex_code: Optional[str] = None
    pdf_base64: Optional[str] = None
    compilation_errors: Optional[str] = None
    ai_error: Optional[str] = None


# ── Base resume CRUD ─────────────────────────────────────────────────────────

class BaseResumeSummary(BaseModel):
    id: int
    name: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class BaseResumeDetail(BaseResumeSummary):
    latex_code: str


class CreateBaseRequest(BaseModel):
    name: str
    latex_code: str

    @field_validator("name", "latex_code")
    @classmethod
    def not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("must not be empty")
        return v


class UpdateBaseRequest(BaseModel):
    name: Optional[str] = None
    latex_code: str

    @field_validator("latex_code")
    @classmethod
    def latex_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("latex_code must not be empty")
        return v
