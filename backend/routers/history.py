import json

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.resume_record import ResumeRecord
from models.schemas import HistoryListResponse, HistoryRecord

router = APIRouter(prefix="/api/history", tags=["history"])


def _to_schema(row) -> HistoryRecord:
    return HistoryRecord(
        id=row.id,
        created_at=row.created_at,
        mode=row.mode,
        label=row.label,
        job_description_preview=row.job_description_preview,
        sections_modified=json.loads(row.sections_modified),
    )


@router.get("", response_model=HistoryListResponse)
async def list_history(
    db: AsyncSession = Depends(get_db),
    limit: int = 50,
    offset: int = 0,
) -> HistoryListResponse:
    stmt = (
        select(
            ResumeRecord.id,
            ResumeRecord.created_at,
            ResumeRecord.mode,
            ResumeRecord.label,
            ResumeRecord.job_description_preview,
            ResumeRecord.sections_modified,
        )
        .order_by(ResumeRecord.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    rows = (await db.execute(stmt)).fetchall()

    count_result = await db.execute(select(func.count()).select_from(ResumeRecord))
    total = count_result.scalar() or 0

    return HistoryListResponse(records=[_to_schema(r) for r in rows], total=total)


@router.get("/{record_id}/pdf")
async def get_history_pdf(
    record_id: int,
    db: AsyncSession = Depends(get_db),
) -> Response:
    result = await db.execute(
        select(ResumeRecord.pdf_bytes).where(ResumeRecord.id == record_id)
    )
    row = result.first()
    if row is None:
        raise HTTPException(status_code=404, detail="Record not found")
    if row.pdf_bytes is None:
        raise HTTPException(status_code=404, detail="No PDF stored for this record")
    return Response(
        content=row.pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="resume_{record_id}.pdf"'},
    )


@router.get("/{record_id}/latex")
async def get_history_latex(
    record_id: int,
    db: AsyncSession = Depends(get_db),
) -> dict:
    result = await db.execute(
        select(ResumeRecord.modified_latex).where(ResumeRecord.id == record_id)
    )
    row = result.first()
    if row is None:
        raise HTTPException(status_code=404, detail="Record not found")
    return {"modified_latex": row.modified_latex}


@router.delete("/{record_id}", status_code=204)
async def delete_history_record(
    record_id: int,
    db: AsyncSession = Depends(get_db),
) -> None:
    result = await db.execute(
        delete(ResumeRecord).where(ResumeRecord.id == record_id)
    )
    await db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Record not found")
