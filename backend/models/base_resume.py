from datetime import datetime, timezone

from sqlalchemy import DateTime, Integer, LargeBinary, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class BaseResume(Base):
    """
    A 'master' resume that serves as the always-source for tailoring.

    Tailoring a job description reads from a base and saves the derived result to
    history without touching the base. Refine (skill updates) overwrites the base
    in place, so the user's current skillset is always anchored to one document.
    """

    __tablename__ = "base_resumes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    latex_code: Mapped[str] = mapped_column(Text, nullable=False)
    pdf_bytes: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
