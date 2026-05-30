import json
from datetime import datetime, timezone

from sqlalchemy import DateTime, Integer, LargeBinary, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class ResumeRecord(Base):
    __tablename__ = "resume_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    mode: Mapped[str] = mapped_column(String(16), nullable=False)
    label: Mapped[str] = mapped_column(String(128), nullable=False)
    job_description_preview: Mapped[str | None] = mapped_column(String(100), nullable=True)
    sections_modified: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    modified_latex: Mapped[str] = mapped_column(Text, nullable=False)
    pdf_bytes: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)

    def sections_modified_list(self) -> list[str]:
        return json.loads(self.sections_modified)
