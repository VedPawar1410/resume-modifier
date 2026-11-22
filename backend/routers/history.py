import asyncio
import base64
import contextlib
import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.resume_record import ResumeRecord
from models.schemas import (
    HistoryDetail,
    HistoryListResponse,
    HistoryRecord,
    UpdateHistoryRequest,
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
    ProfileParse,
    ProfileParseRequest,
    dump_drafts,
    generate_draft,
    load_drafts,
    parse_profile,
    split_title,
    who_to_contact,
)
from routers.kb import DISCONNECT_POLL_SECONDS
from services.qa_service import (
    Answer,
    AnswerUpdate,
    QARequest,
    QAState,
    SimilarAnswer,
    SimilarRequest,
    answer_question,
    dump_answers,
    entry_options,
    find_similar,
    load_answers,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/history", tags=["history"])


NO_RESUME = "Generate the résumé for this job first."


async def _get_record(db: AsyncSession, record_id: int, need_resume: bool = False) -> ResumeRecord:
    record = await db.get(ResumeRecord, record_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Record not found")
    if need_resume and not record.modified_latex:
        raise HTTPException(status_code=409, detail=NO_RESUME)
    return record


def _fit_summary(fit_json: str | None) -> tuple[str | None, int | None]:
    """(verdict, score) from the stored fit check JSON, if there is one."""
    if not fit_json:
        return None, None
    try:
        fit = json.loads(fit_json)
        return fit.get("verdict"), fit.get("score")
    except (ValueError, AttributeError):
        return None, None


def _to_schema(row) -> HistoryRecord:
    verdict, score = _fit_summary(row.fit_check)
    return HistoryRecord(
        id=row.id,
        created_at=row.created_at,
        mode=row.mode,
        label=row.label,
        job_description_preview=row.job_description_preview,
        sections_modified=json.loads(row.sections_modified),
        status=row.status,
        has_resume=bool(row.has_resume) if hasattr(row, "has_resume") else bool(row.modified_latex),
        fit_verdict=verdict,
        fit_score=score,
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
            ResumeRecord.status,
            ResumeRecord.fit_check,
            (func.length(ResumeRecord.modified_latex) > 0).label("has_resume"),
        )
        .order_by(ResumeRecord.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    rows = (await db.execute(stmt)).fetchall()

    count_result = await db.execute(select(func.count()).select_from(ResumeRecord))
    total = count_result.scalar() or 0

    return HistoryListResponse(records=[_to_schema(r) for r in rows], total=total)


@router.get("/{record_id}", response_model=HistoryDetail)
async def get_history_record(record_id: int, db: AsyncSession = Depends(get_db)) -> HistoryDetail:
    """One job: its JD, fit check and status (the résumé itself comes from /latex and /pdf)."""
    record = await _get_record(db, record_id)
    base = _to_schema(record)
    return HistoryDetail(
        **base.model_dump(),
        job_description=record.job_description,
        fit_check=json.loads(record.fit_check) if record.fit_check else None,
        has_match_report=bool(record.match_report),
        outreach_count=_json_len(record.outreach),
        qa_count=_json_len(record.qa),
    )


def _json_len(raw: str | None) -> int:
    """How many items a JSON-list column holds (drafts / answers), for the step-tab counts."""
    try:
        return len(json.loads(raw)) if raw else 0
    except (ValueError, TypeError):
        return 0


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
async def update_history_record(
    record_id: int,
    req: UpdateHistoryRequest,
    db: AsyncSession = Depends(get_db),
) -> HistoryRecord:
    """Rename a job and/or set its status — only the fields sent are changed."""
    record = await db.get(ResumeRecord, record_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Record not found")
    if req.label is not None:
        record.label = req.label
    if "status" in req.model_fields_set:
        record.status = req.status
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


@router.get("/{record_id}/match-report", response_model=MatchReport)
async def get_match_report(record_id: int, db: AsyncSession = Depends(get_db)) -> MatchReport:
    """The saved match report, or 404 if none has been run yet. Free — never calls the AI.
    The page opens with this, so looking at the Match step never spends anything by itself."""
    record = await _get_record(db, record_id, need_resume=True)
    if not record.match_report:
        raise HTTPException(status_code=404, detail="No match report yet")
    return MatchReport.model_validate_json(record.match_report)


@router.post("/{record_id}/match-report", response_model=MatchReport)
async def match_report(
    record_id: int,
    http_request: Request,
    refresh: bool = False,
    db: AsyncSession = Depends(get_db),
):
    """
    How this résumé covers its job description. Computed on demand (~1¢, 30–60 s) and saved, so
    opening it again is free; `refresh=true` recomputes it (e.g. after editing the résumé).

    Like generate-from-kb, the work runs as a task while we watch the connection: if the user
    presses Cancel the browser drops the request, the task is cancelled (the AI call closes)
    and nothing is saved.
    """
    record = await _get_record(db, record_id, need_resume=True)
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

    task = asyncio.create_task(build_match_report(kb_text, record.job_description, record.modified_latex))
    while True:
        done, _ = await asyncio.wait({task}, timeout=DISCONNECT_POLL_SECONDS)
        if done:
            break
        if await http_request.is_disconnected():
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task
            logger.info("Client cancelled the match report — stopped it, nothing saved")
            return Response(status_code=499)
    try:
        report = task.result()
    except AIServiceError as e:
        raise HTTPException(status_code=502, detail=str(e))
    record.match_report = report.model_dump_json()
    await db.commit()
    return report


# ── Outreach (cold email / LinkedIn) ─────────────────────────────────────────

def _load_kb_or_503() -> str:
    try:
        return load_kb()
    except KBNotFoundError as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.get("/{record_id}/outreach", response_model=OutreachState)
async def get_outreach(record_id: int, db: AsyncSession = Depends(get_db)) -> OutreachState:
    """The who-to-contact guide (built from the résumé title, no AI) and every saved draft."""
    record = await _get_record(db, record_id, need_resume=True)
    title = extract_title(record.modified_latex) or record.label
    return OutreachState(guide=who_to_contact(title, _load_kb_or_503()), drafts=load_drafts(record.outreach))


@router.post("/{record_id}/outreach", response_model=Draft)
async def create_outreach(
    record_id: int, req: OutreachRequest, db: AsyncSession = Depends(get_db),
) -> Draft:
    """Generate one message with the free providers (Groq → Gemini) and save it with the résumé."""
    record = await _get_record(db, record_id, need_resume=True)
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


@router.post("/{record_id}/outreach/parse-profile", response_model=ProfileParse)
async def parse_outreach_profile(
    record_id: int, req: ProfileParseRequest, db: AsyncSession = Depends(get_db),
) -> ProfileParse:
    """
    A pasted LinkedIn profile → the recipient fields (free providers). Nothing is saved: the
    paste is used for this one call; only what Ved later puts in a draft is stored.
    """
    record = await _get_record(db, record_id, need_resume=True)
    company, _role = split_title(extract_title(record.modified_latex) or record.label)
    try:
        return await parse_profile(req.profile_text, company, _load_kb_or_503())
    except AIServiceError as e:
        raise HTTPException(
            status_code=502,
            detail=f"The free AI providers are busy or failed — try again in a minute.\n{e}",
        )


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


# ── Application Q&A (screening / supplemental questions) ─────────────────────

@router.get("/{record_id}/qa", response_model=QAState)
async def get_qa(record_id: int, db: AsyncSession = Depends(get_db)) -> QAState:
    """Saved answers for this résumé, plus the KB projects/jobs for the "use this project" picker."""
    record = await _get_record(db, record_id, need_resume=True)
    return QAState(answers=load_answers(record.qa), entries=entry_options(_load_kb_or_503(), record.modified_latex))


@router.post("/{record_id}/qa", response_model=Answer)
async def create_qa(record_id: int, req: QARequest, db: AsyncSession = Depends(get_db)) -> Answer:
    """
    Answer one question with the free providers (Groq / Gemini) from the JD, this résumé and the KB
    entries it's about, and save it. `replace_id` (regenerate) puts the new answer in the old one's place.
    """
    record = await _get_record(db, record_id, need_resume=True)
    if not record.job_description:
        raise HTTPException(
            status_code=409,
            detail="This résumé was made before full job descriptions were saved — "
                   "generate it again to answer questions for it.",
        )
    kb_text = _load_kb_or_503()
    try:
        answer = await answer_question(req, kb_text, record.job_description, record.modified_latex)
    except AIServiceError as e:
        raise HTTPException(
            status_code=502,
            detail=f"The free AI providers are busy or failed — try again in a minute.\n{e}",
        )
    answers = load_answers(record.qa)
    if req.replace_id and any(a.id == req.replace_id for a in answers):
        answers = [answer if a.id == req.replace_id else a for a in answers]
    else:
        answers.append(answer)
    record.qa = dump_answers(answers)
    await db.commit()
    return answer


@router.post("/{record_id}/qa/similar", response_model=list[SimilarAnswer])
async def similar_qa(record_id: int, req: SimilarRequest, db: AsyncSession = Depends(get_db)) -> list[SimilarAnswer]:
    """Saved answers to similar questions, across every résumé. Plain word overlap — no AI, no cost."""
    rows = (await db.execute(
        select(ResumeRecord.id, ResumeRecord.label, ResumeRecord.qa).where(ResumeRecord.qa.is_not(None))
    )).fetchall()
    return find_similar(req.question, [(r.id, r.label, r.qa) for r in rows])


@router.patch("/{record_id}/qa/{answer_id}", response_model=Answer)
async def update_qa(
    record_id: int, answer_id: str, update: AnswerUpdate, db: AsyncSession = Depends(get_db),
) -> Answer:
    """Save an edited answer."""
    record = await _get_record(db, record_id)
    answers = load_answers(record.qa)
    for i, a in enumerate(answers):
        if a.id == answer_id:
            answers[i] = a.model_copy(update={"answer": update.answer, "warning": ""})
            record.qa = dump_answers(answers)
            await db.commit()
            return answers[i]
    raise HTTPException(status_code=404, detail="Answer not found")


@router.delete("/{record_id}/qa/{answer_id}", status_code=204)
async def delete_qa(record_id: int, answer_id: str, db: AsyncSession = Depends(get_db)) -> None:
    record = await _get_record(db, record_id)
    answers = load_answers(record.qa)
    kept = [a for a in answers if a.id != answer_id]
    if len(kept) == len(answers):
        raise HTTPException(status_code=404, detail="Answer not found")
    record.qa = dump_answers(kept)
    await db.commit()
