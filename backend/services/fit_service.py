"""
Job-fit check: should Ved apply to this job? Runs BEFORE a résumé is generated, so it has to be
cheap — it never sends the full KB.

Split of work (same idea as the match report):
- Code builds a compact digest of the KB (Profile, Targeting, Headlines, skills as
  "name (level, N uses)", one line per entry) — ~3K tokens instead of ~60K, small enough for the
  free providers.
- A free model (Groq → Gemini) reads the JD against it and reports facts as JSON.
- Code checks those facts (quotes must really be in the JD, evidence IDs must really be in the KB)
  and computes the score and the verdict itself. A rule in code is testable and can't be talked
  into "apply" by an enthusiastic model.
"""

import logging
import re
from typing import Literal

from pydantic import BaseModel, Field, ValidationError

from services.ai_service import AIServiceError, fit_check as ai_fit_check
from services.kb_service import ENTRY_ID_FULL
from services.match_service import _parse
from services.outreach_service import _kb_section

logger = logging.getLogger(__name__)

# Ved's professional experience in years, fixed by choice (2026-11-19) rather than computed from
# KB dates. Change it here as it grows.
CANDIDATE_YEARS = 1

# Titles that mean "far above early career". Checked in code on the job title, never by the model.
SENIOR_TITLE = re.compile(
    r"\b(senior|sr\.?|lead|staff|principal|manager|architect|head|director|vp)\b", re.IGNORECASE
)
# Red flags about years or seniority repeat the checks above, so code drops them.
COVERED_FLAG = re.compile(r"\byears?\b|\bsenior|\bstaff\b|\bprincipal\b|\blead\b", re.IGNORECASE)
CONTACT_FIELDS = re.compile(r"^- (name|email|phone|linkedin|github|website):.*$", re.MULTILINE)

Verdict = Literal["apply", "maybe", "skip"]
ReasonKind = Literal["good", "warn", "bad", "info"]


# ── What the model returns ───────────────────────────────────────────────────

class _AIRequirement(BaseModel):
    skill: str
    importance: Literal["must-have", "nice-to-have"] = "must-have"
    status: Literal["strong", "weak", "missing"]
    evidence: list[str] = Field(default_factory=list)


class _AIRedFlag(BaseModel):
    flag: str
    jd_quote: str = ""


class _AIFit(BaseModel):
    job_title: str = ""
    role_match: Literal["yes", "partial", "no"] = "partial"
    role_note: str = ""
    min_years: float | None = None
    years_quote: str = ""
    work_mode: Literal["onsite", "hybrid", "remote", "unknown"] = "unknown"
    location: str = ""
    requirements: list[_AIRequirement] = Field(default_factory=list)
    red_flags: list[_AIRedFlag] = Field(default_factory=list)
    summary: str = ""


# ── What the API returns ─────────────────────────────────────────────────────

class FitReason(BaseModel):
    kind: ReasonKind
    text: str


class FitRequirement(BaseModel):
    skill: str
    importance: Literal["must-have", "nice-to-have"]
    status: Literal["strong", "weak", "missing"]
    evidence: list[str] = Field(default_factory=list)


class FitCheck(BaseModel):
    verdict: Verdict
    score: int  # 0-100, shown in the ring
    summary: str = ""
    job_title: str = ""
    reasons: list[FitReason]
    requirements: list[FitRequirement]
    must_have_coverage: int  # percent, strong = 1, weak = ½
    model: str = ""


# ── KB digest ────────────────────────────────────────────────────────────────

def build_digest(kb_text: str) -> str:
    """The compact KB the model sees. No contact details; hidden (never_include) entries left out."""
    profile = CONTACT_FIELDS.sub("", _kb_section(kb_text, "Profile"))
    profile = "\n".join(line for line in profile.splitlines() if line.strip())
    targeting = _kb_section(kb_text, "Targeting")
    hidden_match = re.search(r"^- never_include:\s*(.*)$", targeting, re.MULTILINE)
    hidden = set(re.findall(r"[a-z]+-[a-z0-9-]+", hidden_match.group(1))) if hidden_match else set()

    skills = []
    for row in _kb_section(kb_text, "Skills").splitlines():
        cells = [c.strip() for c in row.strip().strip("|").split("|")]
        if len(cells) < 5 or cells[0] in ("skill", "") or set(cells[0]) <= {"-"}:
            continue
        uses = len([e for e in cells[4].split(",") if e.strip() and e.strip() not in hidden])
        skills.append(f"{cells[0]} ({cells[2] or 'unrated'}, {uses} uses)")

    entries = []
    for block in re.findall(r"^(### \[[a-z]+-[a-z0-9-]+\].*?)(?=^### |^## |\Z)", kb_text, re.MULTILINE | re.DOTALL):
        lines = block.splitlines()
        entry_id = ENTRY_ID_FULL.match(lines[0])
        if entry_id and entry_id.group(1) in hidden:
            continue
        keep = [lines[0]] + [
            line[2:] for line in lines if re.match(r"- (dates|employment|tags):", line)
        ]
        entries.append(" | ".join(keep))

    return (
        f"PROFILE\n{profile}\n\nTARGETING\n{targeting}\n\n"
        f"SKILLS\n{'; '.join(skills)}\n\nENTRIES\n" + "\n".join(entries)
    )


# ── Checks and scoring ───────────────────────────────────────────────────────

def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip().lower()


def _in_jd(quote: str, jd: str) -> bool:
    return bool(quote.strip()) and _norm(quote) in _norm(jd)


def _years_text(years: float) -> str:
    n = int(years) if float(years).is_integer() else years
    return f"{n} year{'s' if n != 1 else ''}"


def score_fit(ai: _AIFit, jd: str, known_ids: set[str], model: str = "") -> FitCheck:
    """Verify the model's facts, then compute score and verdict. Pure function — easy to test."""
    reasons: list[FitReason] = []
    blockers = 0
    soft = 0

    # Evidence must be real KB IDs; a "strong" match whose cited IDs are all invented is only "weak".
    reqs: list[FitRequirement] = []
    for r in ai.requirements:
        evidence = [i for i in r.evidence if i in known_ids][:2]
        status = r.status
        if status == "strong" and r.evidence and not evidence:
            status = "weak"
        reqs.append(FitRequirement(skill=r.skill, importance=r.importance, status=status, evidence=evidence))

    must = [r for r in reqs if r.importance == "must-have"] or reqs
    points = sum(1.0 if r.status == "strong" else 0.5 if r.status == "weak" else 0.0 for r in must)
    coverage = points / len(must) if must else 0.5  # a JD with no requirements: unknown, not zero
    covered = sum(r.status == "strong" for r in must)
    missing = [r.skill for r in must if r.status == "missing"]
    if not must:
        reasons.append(FitReason(kind="info", text="No concrete skill requirements found in the JD."))
    elif coverage >= 0.7:
        reasons.append(FitReason(kind="good", text=f"Covers {covered} of {len(must)} must-haves strongly."))
    elif coverage >= 0.4:
        soft += 1
        reasons.append(FitReason(kind="warn", text=f"Covers {covered} of {len(must)} must-haves strongly; the rest are weak or missing."))
    else:
        blockers += 1
        reasons.append(FitReason(kind="bad", text=f"Only {covered} of {len(must)} must-haves covered."))
    if missing:
        reasons.append(FitReason(kind="bad" if len(missing) > 2 else "warn",
                                 text="Missing: " + ", ".join(missing[:5]) + "."))

    # Years: only trusted when the quote is really in the JD.
    years = ai.min_years if ai.min_years is not None and _in_jd(ai.years_quote, jd) else None
    if ai.min_years is not None and years is None:
        logger.info(f"Fit check: dropped min_years={ai.min_years} — quote not in JD: {ai.years_quote!r}")
    years_points = 10
    if years is not None:
        gap = years - CANDIDATE_YEARS
        quote = ai.years_quote.strip()
        if gap >= 2:
            blockers += 1
            years_points = 0
            reasons.append(FitReason(kind="bad", text=f"Asks {_years_text(years)} (“{quote}”); you have {_years_text(CANDIDATE_YEARS)}."))
        elif gap >= 1:
            soft += 1
            years_points = 5
            reasons.append(FitReason(kind="warn", text=f"Asks {_years_text(years)} (“{quote}”); you have {_years_text(CANDIDATE_YEARS)} — a stretch."))
        else:
            reasons.append(FitReason(kind="good", text=f"Experience asked ({_years_text(years)}) fits yours."))

    # Seniority: the title, checked in code. Use the model's title only if it's really in the JD,
    # else the JD's first line (usually the title).
    first_line = next((line.strip() for line in jd.splitlines() if line.strip()), "")
    title = ai.job_title.strip() if _in_jd(ai.job_title, jd) else first_line
    if senior := SENIOR_TITLE.search(title):
        blockers += 1
        reasons.append(FitReason(kind="bad", text=f"Senior-level title (“{senior.group(0)}”)."))

    # Role type: judged by the model by meaning (Gen AI = Generative AI).
    role_points = {"yes": 20, "partial": 10, "no": 0}[ai.role_match]
    note = f" — {ai.role_note}" if ai.role_note else ""
    if ai.role_match == "yes":
        reasons.append(FitReason(kind="good", text=f"A role you want{note}."))
    elif ai.role_match == "partial":
        reasons.append(FitReason(kind="warn", text=f"Partly the kind of role you want{note}."))
    else:
        soft += 1
        reasons.append(FitReason(kind="warn", text=f"Not one of the roles you want{note}."))

    # Other screens, only with a quote that's really in the JD.
    for flag in ai.red_flags[:3]:
        if _in_jd(flag.jd_quote, jd) and not COVERED_FLAG.search(flag.flag):
            soft += 1
            reasons.append(FitReason(kind="warn", text=flag.flag))

    # Location never counts against a job (Ved: on-site, hybrid or remote are all fine).
    mode = "" if ai.work_mode == "unknown" else ai.work_mode.replace("onsite", "on-site")
    where = ", ".join(p for p in (mode, ai.location.strip()) if p)
    if where:
        reasons.append(FitReason(kind="info", text=f"{'Work mode' if mode else 'Location'}: {where}."))

    score = round(coverage * 70 + role_points + years_points)
    if blockers:
        score = min(score, 39)
    if blockers or score < 40:
        verdict: Verdict = "skip"
    elif score >= 70 and soft == 0:
        verdict = "apply"
    else:
        verdict = "maybe"
        score = min(score, 69)  # the ring and the verdict always agree

    return FitCheck(
        verdict=verdict,
        score=max(0, min(100, score)),
        summary=ai.summary.strip(),
        job_title=title[:120],
        reasons=reasons,
        requirements=reqs,
        must_have_coverage=round(coverage * 100),
        model=model,
    )


def _drop_nulls(value):
    """Models write `"location": null` for "not given"; dropping nulls lets the defaults apply."""
    if isinstance(value, dict):
        return {k: _drop_nulls(v) for k, v in value.items() if v is not None}
    if isinstance(value, list):
        return [_drop_nulls(v) for v in value if v is not None]
    return value


async def check_fit(kb_text: str, job_description: str) -> FitCheck:
    """Digest → free model → verified, scored result. One retry if the JSON doesn't validate."""
    digest = build_digest(kb_text)
    known_ids = set(ENTRY_ID_FULL.findall(kb_text))
    last_error = ""
    for _attempt in range(2):
        text, model = await ai_fit_check(digest, job_description)
        try:
            ai = _AIFit.model_validate(_drop_nulls(_parse(text)))
        except (ValueError, ValidationError, AttributeError) as e:  # JSONDecodeError is a ValueError
            last_error = str(e)[:300]
            logger.warning(f"Fit check JSON didn't validate, retrying: {last_error}")
            continue
        return score_fit(ai, job_description, known_ids, model)
    raise AIServiceError(f"The fit check came back malformed twice: {last_error}")
