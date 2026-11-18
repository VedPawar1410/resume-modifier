import base64
import json

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.resume_record import ResumeRecord
from models.schemas import (
    HistoryListResponse,
    HistoryRecord,
    RenameHistoryRequest,
    SaveLatexRequest,
    SaveLatexResponse,
)
from services.ai_service import AIServiceError
from services.kb_service import KBNotFoundError, extract_title, load_kb
from services.latex_service import compile_latex
from services.match_service import MatchReport, build_match_report
from services.outreach_service import (
    Draft,
    DraftUpdate,
    OutreachRequest,
    OutreachState,
    dump_drafts,
    generate_draft,
    load_drafts,
    who_to_contact,
)

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


@router.patch("/{record_id}", response_model=HistoryRecord)
async def rename_history_record(
    record_id: int,
    req: RenameHistoryRequest,
    db: AsyncSession = Depends(get_db),
) -> HistoryRecord:
    record = await db.get(ResumeRecord, record_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Record not found")
    record.label = req.label
    await db.commit()
    await db.refresh(record)
    return _to_schema(record)


@router.put("/{record_id}/latex", response_model=SaveLatexResponse)
async def save_history_latex(
    record_id: int,
    req: SaveLatexRequest,
    db: AsyncSession = Depends(get_db),
) -> SaveLatexResponse:
    """
    Save edited LaTeX and recompile it — one call serves both the editor's live preview
    and its autosave. The code is always saved; the stored PDF is only replaced when the
    edit compiles, so a typo never wipes out the last good PDF.
    """
    record = await db.get(ResumeRecord, record_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Record not found")

    pdf_bytes, error = compile_latex(req.latex_code)
    record.modified_latex = req.latex_code
    if pdf_bytes is not None:
        record.pdf_bytes = pdf_bytes
    await db.commit()

    return SaveLatexResponse(
        pdf_base64=base64.b64encode(pdf_bytes).decode("utf-8") if pdf_bytes else None,
        compilation_errors=error,
    )


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


@router.post("/{record_id}/match-report", response_model=MatchReport)
async def match_report(
    record_id: int,
    refresh: bool = False,
    db: AsyncSession = Depends(get_db),
) -> MatchReport:
    """
    How this résumé covers its job description. Computed on demand (~1¢, 30–60 s) and saved, so
    opening it again is free; `refresh=true` recomputes it (e.g. after editing the résumé).
    """
    record = await db.get(ResumeRecord, record_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Record not found")
    if record.match_report and not refresh:
        return MatchReport.model_validate_json(record.match_report)
    if not record.job_description:
        raise HTTPException(
            status_code=409,
            detail="This résumé was made before full job descriptions were saved — "
                   "generate it again to get a match report.",
        )
    try:
        kb_text = load_kb()
    except KBNotFoundError as e:
        raise HTTPException(status_code=503, detail=str(e))
    try:
        report = await build_match_report(kb_text, record.job_description, record.modified_latex)
    except AIServiceError as e:
        raise HTTPException(status_code=502, detail=str(e))
    record.match_report = report.model_dump_json()
    await db.commit()
    return report


# ── Outreach (cold email / LinkedIn) ─────────────────────────────────────────

async def _get_record(db: AsyncSession, record_id: int) -> ResumeRecord:
    record = await db.get(ResumeRecord, record_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Record not found")
    return record


def _load_kb_or_503() -> str:
    try:
        return load_kb()
    except KBNotFoundError as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.get("/{record_id}/outreach", response_model=OutreachState)
async def get_outreach(record_id: int, db: AsyncSession = Depends(get_db)) -> OutreachState:
    """The who-to-contact guide (built from the résumé title, no AI) and every saved draft."""
    record = await _get_record(db, record_id)
    title = extract_title(record.modified_latex) or record.label
    return OutreachState(guide=who_to_contact(title, _load_kb_or_503()), drafts=load_drafts(record.outreach))


@router.post("/{record_id}/outreach", response_model=Draft)
async def create_outreach(
    record_id: int, req: OutreachRequest, db: AsyncSession = Depends(get_db),
) -> Draft:
    """Generate one message with the free providers (Groq → Gemini) and save it with the résumé."""
    record = await _get_record(db, record_id)
    if not record.job_description:
        raise HTTPException(
            status_code=409,
            detail="This résumé was made before full job descriptions were saved — "
                   "generate it again to write messages for it.",
        )
    kb_text = _load_kb_or_503()
    try:
        draft = await generate_draft(req, kb_text, record.job_description, record.modified_latex)
    except AIServiceError as e:
        raise HTTPException(
            status_code=502,
            detail=f"The free AI providers are busy or failed — try again in a minute.\n{e}",
        )
    record.outreach = dump_drafts([*load_drafts(record.outreach), draft])
    await db.commit()
    return draft


@router.patch("/{record_id}/outreach/{draft_id}", response_model=Draft)
async def update_outreach(
    record_id: int, draft_id: str, update: DraftUpdate, db: AsyncSession = Depends(get_db),
) -> Draft:
    """Save an edited subject or body."""
    record = await _get_record(db, record_id)
    drafts = load_drafts(record.outreach)
    for i, d in enumerate(drafts):
        if d.id == draft_id:
            drafts[i] = d.model_copy(update=update.model_dump(exclude_none=True))
            record.outreach = dump_drafts(drafts)
            await db.commit()
            return drafts[i]
    raise HTTPException(status_code=404, detail="Draft not found")


@router.delete("/{record_id}/outreach/{draft_id}", status_code=204)
async def delete_outreach(record_id: int, draft_id: str, db: AsyncSession = Depends(get_db)) -> None:
    record = await _get_record(db, record_id)
    drafts = load_drafts(record.outreach)
    kept = [d for d in drafts if d.id != draft_id]
    if len(kept) == len(drafts):
        raise HTTPException(status_code=404, detail="Draft not found")
    record.outreach = dump_drafts(kept)
    await db.commit()
