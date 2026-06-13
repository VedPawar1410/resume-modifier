"""CRUD for base ('master') resumes — the always-source for tailoring."""

import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.base_resume import BaseResume
from models.schemas import (
    BaseResumeDetail,
    BaseResumeSummary,
    CreateBaseRequest,
    UpdateBaseRequest,
)
from services.latex_service import compile_latex

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/bases", tags=["bases"])


@router.get("", response_model=list[BaseResumeSummary])
async def list_bases(db: AsyncSession = Depends(get_db)) -> list[BaseResume]:
    stmt = select(BaseResume).order_by(BaseResume.updated_at.desc())
    return list((await db.execute(stmt)).scalars().all())


@router.get("/{base_id}", response_model=BaseResumeDetail)
async def get_base(base_id: int, db: AsyncSession = Depends(get_db)) -> BaseResume:
    base = await db.get(BaseResume, base_id)
    if base is None:
        raise HTTPException(status_code=404, detail="Base resume not found")
    return base


@router.get("/{base_id}/pdf")
async def get_base_pdf(base_id: int, db: AsyncSession = Depends(get_db)) -> Response:
    base = await db.get(BaseResume, base_id)
    if base is None:
        raise HTTPException(status_code=404, detail="Base resume not found")
    if base.pdf_bytes is None:
        raise HTTPException(status_code=404, detail="No PDF stored for this base resume")
    return Response(
        content=base.pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="base_{base_id}.pdf"'},
    )


@router.post("", response_model=BaseResumeDetail, status_code=201)
async def create_base(
    request: CreateBaseRequest,
    db: AsyncSession = Depends(get_db),
) -> BaseResume:
    pdf_bytes, _ = compile_latex(request.latex_code)  # best-effort; store even if it fails
    base = BaseResume(
        name=request.name.strip(),
        latex_code=request.latex_code,
        pdf_bytes=pdf_bytes,
    )
    db.add(base)
    await db.commit()
    await db.refresh(base)
    return base


@router.put("/{base_id}", response_model=BaseResumeDetail)
async def update_base(
    base_id: int,
    request: UpdateBaseRequest,
    db: AsyncSession = Depends(get_db),
) -> BaseResume:
    base = await db.get(BaseResume, base_id)
    if base is None:
        raise HTTPException(status_code=404, detail="Base resume not found")

    base.latex_code = request.latex_code
    if request.name is not None and request.name.strip():
        base.name = request.name.strip()
    pdf_bytes, _ = compile_latex(request.latex_code)
    base.pdf_bytes = pdf_bytes
    await db.commit()
    await db.refresh(base)
    return base


@router.delete("/{base_id}", status_code=204)
async def delete_base(base_id: int, db: AsyncSession = Depends(get_db)) -> None:
    result = await db.execute(delete(BaseResume).where(BaseResume.id == base_id))
    await db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Base resume not found")
