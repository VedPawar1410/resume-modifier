"""Jobs: a fit check saves a job, generate fills it, status, and the no-résumé guards.
AI, KB and pdflatex are stubbed, and the DB is a throwaway SQLite file, so this is free and fast.
Run: cd backend && source venv/bin/activate && pytest tests
"""
import asyncio
import os

os.environ["APP_PASSWORD"] = ""  # no password gate in tests
os.environ["DATABASE_URL"] = ""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

import database
import main
import routers.kb as kb_router
from services.fit_service import FitCheck

JD = "Backend Engineer at Northwind Labs. Python, FastAPI, PostgreSQL."
FIT = FitCheck.model_validate({
    "verdict": "apply", "score": 91, "summary": "Good fit.", "job_title": "Backend Engineer",
    "reasons": [{"kind": "good", "text": "Covers the must-haves."}],
    "requirements": [{"skill": "Python", "importance": "must-have", "status": "strong", "evidence": []}],
    "must_have_coverage": 100, "model": "stub",
})
LATEX = "% kb-ids: exp-a\n% title: Northwind Labs — Backend Engineer\n\\documentclass{article}\\begin{document}x\\end{document}"


@pytest.fixture()
def client(tmp_path, monkeypatch):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'test.db'}")
    Session = async_sessionmaker(engine, expire_on_commit=False)

    async def setup():
        async with engine.begin() as conn:
            await conn.run_sync(database.Base.metadata.create_all)
    asyncio.run(setup())

    async def get_db():
        async with Session() as session:
            yield session

    async def fake_check_fit(kb_text, jd):
        return FIT

    async def fake_generate(kb_text, jd):
        return LATEX, "stub-model"

    main.app.dependency_overrides[database.get_db] = get_db
    monkeypatch.setattr(kb_router, "load_kb", lambda: "kb")
    monkeypatch.setattr(kb_router, "check_fit", fake_check_fit)
    monkeypatch.setattr(kb_router, "generate_from_kb", fake_generate)
    monkeypatch.setattr(kb_router, "compile_latex", lambda latex: (b"%PDF-1.4 stub", None))
    monkeypatch.setattr(kb_router, "count_pdf_pages", lambda pdf: 1)
    yield TestClient(main.app)  # no `with`: skips the lifespan, which would touch the real DB
    main.app.dependency_overrides.clear()


def test_fit_check_saves_a_job_without_resume(client):
    r = client.post("/api/fit-check", json={"job_description": JD})
    assert r.status_code == 200
    job_id = r.json()["record_id"]
    assert job_id

    jobs = client.get("/api/history").json()["records"]
    assert [j["id"] for j in jobs] == [job_id]
    assert jobs[0]["has_resume"] is False
    assert jobs[0]["fit_verdict"] == "apply" and jobs[0]["fit_score"] == 91
    assert jobs[0]["label"] == "Backend Engineer"

    # Checking the same JD again updates that job, it doesn't add another.
    again = client.post("/api/fit-check", json={"job_description": JD}).json()
    assert again["record_id"] == job_id
    assert client.get("/api/history").json()["total"] == 1


def test_save_false_saves_nothing(client):
    r = client.post("/api/fit-check", json={"job_description": JD, "save": False})
    assert r.json()["record_id"] is None
    assert client.get("/api/history").json()["total"] == 0


def test_steps_need_a_resume(client):
    job_id = client.post("/api/fit-check", json={"job_description": JD}).json()["record_id"]
    for method, path in [
        ("post", f"/api/history/{job_id}/match-report"),
        ("get", f"/api/history/{job_id}/outreach"),
        ("get", f"/api/history/{job_id}/qa"),
    ]:
        r = getattr(client, method)(path)
        assert r.status_code == 409, path
        assert "résumé" in r.json()["detail"]


def test_generate_fills_the_same_job(client):
    job_id = client.post("/api/fit-check", json={"job_description": JD}).json()["record_id"]
    r = client.post("/api/generate-from-kb", json={"job_description": JD, "fit_check": FIT.model_dump(), "record_id": job_id})
    assert r.status_code == 200 and r.json()["record_id"] == job_id

    jobs = client.get("/api/history").json()["records"]
    assert len(jobs) == 1
    assert jobs[0]["has_resume"] is True
    assert jobs[0]["label"] == "Northwind Labs — Backend Engineer"  # upgraded from the résumé title

    detail = client.get(f"/api/history/{job_id}").json()
    assert detail["job_description"] == JD
    assert detail["fit_check"]["score"] == 91


def test_generate_without_record_id_still_creates_a_record(client):
    r = client.post("/api/generate-from-kb", json={"job_description": JD})
    assert r.json()["record_id"]
    assert client.get("/api/history").json()["total"] == 1


def test_status_set_clear_and_validate(client):
    job_id = client.post("/api/fit-check", json={"job_description": JD}).json()["record_id"]
    assert client.patch(f"/api/history/{job_id}", json={"status": "applied"}).json()["status"] == "applied"
    # Renaming alone leaves the status as it was.
    r = client.patch(f"/api/history/{job_id}", json={"label": "Northwind"}).json()
    assert r["label"] == "Northwind" and r["status"] == "applied"
    assert client.patch(f"/api/history/{job_id}", json={"status": None}).json()["status"] is None
    assert client.patch(f"/api/history/{job_id}", json={"status": "ghosted"}).status_code == 422


# ── Match report: opt-in (GET is free) and cancellable (POST) ─────────────────

def _job_with_resume(client):
    job_id = client.post("/api/fit-check", json={"job_description": JD}).json()["record_id"]
    client.post("/api/generate-from-kb", json={"job_description": JD, "record_id": job_id})
    return job_id


def test_match_report_get_is_free_and_404_until_run(client, monkeypatch):
    import routers.history as history_router
    from services.match_service import MatchReport, _summarise

    calls = []

    async def fake_build(kb_text, jd, latex):
        calls.append(1)
        return MatchReport(requirements=[], summary=_summarise([]), model="stub")

    monkeypatch.setattr(history_router, "load_kb", lambda: "kb")
    monkeypatch.setattr(history_router, "build_match_report", fake_build)
    job_id = _job_with_resume(client)

    # Opening the Match step only GETs: nothing saved yet → 404, and no AI call.
    assert client.get(f"/api/history/{job_id}/match-report").status_code == 404
    assert calls == []

    # Running it saves; the GET then returns it, still without calling the AI again.
    assert client.post(f"/api/history/{job_id}/match-report").status_code == 200
    r = client.get(f"/api/history/{job_id}/match-report")
    assert r.status_code == 200 and calls == [1]
    detail = client.get(f"/api/history/{job_id}").json()
    assert detail["has_match_report"] is True
    assert detail["outreach_count"] == 0 and detail["qa_count"] == 0


def test_match_report_get_needs_a_resume(client):
    job_id = client.post("/api/fit-check", json={"job_description": JD}).json()["record_id"]
    assert client.get(f"/api/history/{job_id}/match-report").status_code == 409


def test_match_report_cancel_stops_the_task_and_saves_nothing(client, monkeypatch):
    """Call the endpoint directly with a request that reports a disconnect: the AI task must be
    cancelled and no report saved — the same contract Cancel relies on for generation."""
    import routers.history as history_router

    started, cancelled = asyncio.Event(), []

    async def slow_build(kb_text, jd, latex):
        started.set()
        try:
            await asyncio.sleep(30)
        except asyncio.CancelledError:
            cancelled.append(1)
            raise

    monkeypatch.setattr(history_router, "load_kb", lambda: "kb")
    monkeypatch.setattr(history_router, "build_match_report", slow_build)
    monkeypatch.setattr(history_router, "DISCONNECT_POLL_SECONDS", 0.01)
    job_id = _job_with_resume(client)
    get_db = main.app.dependency_overrides[database.get_db]

    class GoneRequest:
        async def is_disconnected(self):
            return started.is_set()

    async def run():
        async for db in get_db():
            return await history_router.match_report(job_id, GoneRequest(), False, db)

    resp = asyncio.run(run())
    assert resp.status_code == 499
    assert cancelled == [1]
    assert client.get(f"/api/history/{job_id}/match-report").status_code == 404
