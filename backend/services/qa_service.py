"""
Application Q&A: answers to a portal's screening / supplemental questions for one résumé.

How the prompt stays small (the whole KB is ~74K tokens; Groq's free tier allows 8K a minute):
1. Code sorts the question into a type (short field / motivation / story / skill / other).
2. Code picks the KB entries it is about — scored by word overlap with each entry's title, tags
   and summary, ties going to the résumé's `% kb-ids:`; an entry the question names always wins.
3. Code keeps only the subsections that type needs ("Bullets I like" never goes: it's on the résumé).
4. One free call (Groq → Gemini). If code estimates the prompt won't fit Groq's minute budget, it
   asks Gemini first instead of spending a call on a sure 429 (see ai_service.qa_answer).
5. Code checks the answer: invented KB ids are dropped, the length is counted against the limit
   (one rewrite if it runs over), and anything the KB doesn't cover comes back as a warning.
A short field whose KB Profile value is empty is answered with no AI call at all.
"""

import json
import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, Field, ValidationError

from services.ai_service import AIServiceError, qa_answer
from services.kb_service import extract_kb_ids
from services.match_service import _body_only, _parse
from services.outreach_service import _kb_section

logger = logging.getLogger(__name__)

Kind = Literal["short", "motivation", "story", "skill", "other"]
KindOrAuto = Literal["auto", "short", "motivation", "story", "skill", "other"]
Unit = Literal["words", "characters"]


class QARequest(BaseModel):
    question: str = Field(..., min_length=3, max_length=2000)
    kind: KindOrAuto = "auto"
    limit: int | None = Field(None, ge=1, le=10_000)
    unit: Unit = "words"
    entry_ids: list[str] = Field(default_factory=list, max_length=3)  # Ved's own pick overrides code's
    notes: str = Field("", max_length=1000)  # anything true Ved adds (why he likes the company…)
    replace_id: str | None = None  # regenerate: the new answer takes this one's place


class Answer(BaseModel):
    id: str
    created_at: datetime
    question: str
    kind: Kind
    limit: int | None = None
    unit: Unit = "words"
    entry_ids: list[str] = []  # what Ved picked (empty = code chose)
    notes: str = ""
    answer: str
    used_ids: list[str] = []   # KB entries the answer draws on (checked against the KB)
    not_in_kb: str = ""        # what the KB couldn't answer — shown, never invented
    model: str = ""
    warning: str = ""


class AnswerUpdate(BaseModel):
    answer: str = Field(..., max_length=20_000)


class EntryOption(BaseModel):
    id: str
    title: str
    on_resume: bool


class QAState(BaseModel):
    answers: list[Answer]
    entries: list[EntryOption]  # for the "use this project" picker


class SimilarRequest(BaseModel):
    question: str = Field(..., min_length=3, max_length=2000)


class SimilarAnswer(BaseModel):
    record_id: int
    resume_title: str
    answer: Answer
    score: float


class _AIAnswer(BaseModel):
    answer: str
    used_ids: list[str] = []
    not_in_kb: str = ""


# ── Stored answers (a JSON list in resume_records.qa) ────────────────────────

def load_answers(raw: str | None) -> list[Answer]:
    return [Answer.model_validate(a) for a in json.loads(raw)] if raw else []


def dump_answers(answers: list[Answer]) -> str:
    return json.dumps([a.model_dump(mode="json") for a in answers])


# ── 1. What kind of question is it? ──────────────────────────────────────────
# Checked in order; the first match wins. Short fields first: "Are you authorized…" is never a story.

_KIND_PATTERNS: list[tuple[Kind, re.Pattern]] = [
    ("short", re.compile(
        r"authori[sz]|sponsor|visa\b|legally|right to work|citizen|notice period|\bnotice\b|"
        r"start date|when can you (start|join)|earliest|available to (start|join)|availability|"
        r"relocat|willing to (move|commute|work (on-?site|in))|on-?site|hybrid|in[- ]office|commut|"
        r"salary|compensation|\bctc\b|expected pay|pay expectation|desired pay|"
        r"how many years|years of (professional )?experience|18 years|background check|"
        r"how did you hear|referred by|linkedin (profile|url)|github (profile|url)|portfolio (url|link)",
        re.I)),
    ("story", re.compile(
        r"describe a (time|situation|project|challenge)|tell us about a|tell me about a|give an example|"
        r"a time (when|you)|walk us through|share an example|most (challenging|complex|proud|impactful)|"
        r"biggest (challenge|achievement|failure|mistake)|overcame|failed|conflict|disagree",
        re.I)),
    ("motivation", re.compile(
        r"why (do you want|are you interested|this (company|role|position|team)|us\b|join)|"
        r"what (excites|interests|attracts|draws) you|what makes you (want|a good fit)|"
        r"why should we|motivat|interest(ed)? in (this|our|the) (role|company|position)|why \w+\s*\?",
        re.I)),
    ("skill", re.compile(
        r"experience (with|in|using)|familiar(ity)? with|proficien|have you (used|worked|built)|"
        r"how (have|do) you (use|used|approach)|knowledge of|worked with|hands-on|expertise",
        re.I)),
]


def classify(question: str) -> Kind:
    for kind, pattern in _KIND_PATTERNS:
        if pattern.search(question):
            return kind
    return "other"


# ── 2. Which KB entries is it about? ─────────────────────────────────────────

_ENTRY = re.compile(r"^### \[([a-z]+-[a-z0-9-]+)\]\s*(.*)$", re.MULTILINE)
_NEXT_HEADING = re.compile(r"^#{2,3} ", re.MULTILINE)
_SUBSECTION = re.compile(r"^#### (.+)$", re.MULTILINE)
_WORD = re.compile(r"[a-z0-9][a-z0-9+#.]*[a-z0-9+#]|[a-z0-9]")
_STOP = set("""a an the and or of to in on for with at by from as is are was were be been being it its this that
these those you your yours we our us they their i me my mine do does did have has had can could would should will
what which who whom how why when where any some all about into over than then there here also just more most
such very please tell describe give share example time project projects role company team work worked working
experience experiences using used use including include one two three list answer question
anything else like know want need us would love feel think something way best good great""".split())

# What each type needs from a project / job entry. "Bullets I like" is never sent (it's the résumé).
_KEEP: dict[Kind, tuple[str, ...]] = {
    "story": ("context", "what i did", "results", "why it stopped", "notes for the ai"),
    "skill": ("what i did", "results", "stack", "notes for the ai"),
    "motivation": ("context", "results"),
    "other": ("context", "what i did", "results", "notes for the ai"),
    "short": (),
}
_HOW_MANY: dict[Kind, int] = {"story": 1, "skill": 2, "motivation": 1, "other": 1, "short": 0}
ENTRY_CHAR_CAP = 9_000  # ≈ 2.5K tokens — even a long entry can't crowd out the JD and résumé


class Entry(BaseModel):
    id: str
    title: str
    header: str               # the "- type: … - tags: … - summary: …" lines before the first ####
    sections: dict[str, str]  # lowercased #### name → text
    text: str                 # the whole entry


def parse_entries(kb_text: str) -> list[Entry]:
    entries: list[Entry] = []
    for m in _ENTRY.finditer(kb_text):
        nxt = _NEXT_HEADING.search(kb_text, m.end())
        body = kb_text[m.end(): nxt.start() if nxt else len(kb_text)]
        parts = _SUBSECTION.split(body)  # [header, name1, text1, name2, text2, …]
        sections = {parts[i].strip().lower(): parts[i + 1].strip() for i in range(1, len(parts) - 1, 2)}
        entries.append(Entry(id=m.group(1), title=m.group(2).strip(), header=parts[0].strip(),
                             sections=sections, text=body.strip()))
    return entries


def _words(text: str) -> set[str]:
    return {w for w in _WORD.findall(text.lower()) if w not in _STOP and len(w) > 1}


def _short_name(title: str) -> str:
    """'EquipTrack — Plant Maintenance …' → 'equiptrack'; 'Stackular — Software Developer' → 'stackular'."""
    return re.split(r"\s+[—–-]\s+", title)[0].strip().lower()


def _never_include(kb_text: str) -> set[str]:
    match = re.search(r"^- never_include:\s*(.*)$", _kb_section(kb_text, "Targeting"), re.MULTILINE)
    return set(re.findall(r"[a-z]+-[a-z0-9-]+", match.group(1))) if match else set()


def pick_entries(question: str, kind: Kind, entries: list[Entry], resume_ids: list[str],
                 hidden: set[str], chosen: list[str]) -> list[Entry]:
    """Ved's pick if he made one; otherwise the best-scoring work entries for this question."""
    by_id = {e.id: e for e in entries}
    if chosen:
        return [by_id[i] for i in chosen if i in by_id]
    n = _HOW_MANY[kind]
    if n == 0:
        return []
    q_words, q_lower = _words(question), question.lower()
    on_resume = set(resume_ids)
    scored: list[tuple[float, Entry]] = []
    for e in entries:
        if e.id in hidden or not e.id.startswith(("proj-", "exp-")):
            continue
        name = _short_name(e.title)
        score = 0.0
        if len(name) > 2 and re.search(rf"\b{re.escape(name)}\b", q_lower):
            score += 100  # the question names it
        score += 3 * len(q_words & _words(e.title))
        score += 2 * len(q_words & _words(e.header))
        if kind == "skill":
            score += len(q_words & _words(e.sections.get("stack", "")))
        if score and e.id in on_resume:
            score += 1.5  # a tie goes to what this résumé already shows
        if score:
            scored.append((score, e))
    scored.sort(key=lambda t: -t[0])
    picked = [e for _s, e in scored[:n]]
    if not picked and kind in ("story", "other"):
        # Nothing matched by words ("Describe a hard problem you solved"): use the résumé's first project.
        first = next((i for i in resume_ids if i.startswith("proj-") and i in by_id), None)
        picked = [by_id[first]] if first else []
    return picked


def trim_entry(entry: Entry, kind: Kind) -> str:
    keep = _KEEP[kind]
    if entry.sections:
        kept = [f"#### {name.title()}\n{text}" for name, text in entry.sections.items()
                if any(name.startswith(k) for k in keep)]
        body = "\n\n".join([entry.header, *kept])
    else:
        body = entry.text
    return f"### [{entry.id}] {entry.title}\n{body}"[:ENTRY_CHAR_CAP]


# ── Short fields from the KB Profile ─────────────────────────────────────────
# Which Profile field a short question needs. An empty field → "not in your KB", no AI call.

_PROFILE_FIELDS: list[tuple[str, re.Pattern]] = [
    ("work_authorization", re.compile(r"authori[sz]|sponsor|visa\b|legally|right to work|citizen", re.I)),
    ("notice_period", re.compile(r"notice", re.I)),
    ("earliest_start", re.compile(r"start date|when can you (start|join)|earliest|available to (start|join)|availability", re.I)),
    ("relocation", re.compile(r"relocat|willing to (move|commute|work (on-?site|in))|on-?site|hybrid|in[- ]office|commut", re.I)),
    ("salary_expectation", re.compile(r"salary|compensation|\bctc\b|expected pay|pay expectation|desired pay", re.I)),
]
_CONTACT = re.compile(r"^- (name|email|phone|linkedin|github|website):.*$", re.MULTILINE)


def profile_field(kb_text: str, name: str) -> str:
    match = re.search(rf"^- {name}:[ \t]*(.*)$", _kb_section(kb_text, "Profile"), re.MULTILINE)
    return match.group(1).strip() if match else ""


def _needed_field(question: str) -> str | None:
    return next((name for name, p in _PROFILE_FIELDS if p.search(question)), None)


def _contact_line(kb_text: str, question: str) -> str:
    """Link questions ("LinkedIn profile URL?") are answered from the contact fields."""
    q = question.lower()
    for name in ("linkedin", "github", "website"):
        if name in q or (name == "website" and "portfolio" in q):
            value = profile_field(kb_text, name)
            return f"- {name}: {value}" if value else ""
    return ""


def _candidate(kb_text: str, question: str) -> str:
    profile = _CONTACT.sub("", _kb_section(kb_text, "Profile"))
    profile = re.sub(r"\n{3,}", "\n\n", profile).strip()
    parts = [profile, "Targeting:\n" + _kb_section(kb_text, "Targeting"), _contact_line(kb_text, question)]
    return "\n\n".join(p for p in parts if p.strip())


def _work_history(entries: list[Entry]) -> str:
    """One line per job (title + dates) — enough for "how many years of experience…" questions."""
    lines = []
    for e in entries:
        if e.id.startswith("exp-"):
            dates = re.search(r"^- dates:\s*(.+)$", e.header, re.MULTILINE)
            kind = re.search(r"^- (?:type|kind):\s*(.+)$", e.header, re.MULTILINE)
            lines.append(f"- {e.title} ({dates.group(1).strip() if dates else 'dates unknown'}"
                         f"{', ' + kind.group(1).strip() if kind else ''})")
    return "\n".join(lines)


def _skill_lines(kb_text: str, question: str) -> str:
    q = _words(question)
    lines = [ln for ln in _kb_section(kb_text, "Skills").splitlines() if ln.strip() and q & _words(ln)]
    return "\n".join(lines[:12])


# ── 3. The prompt ────────────────────────────────────────────────────────────

_DEFAULT_LENGTH: dict[Kind, str] = {
    "short": "One short line, or a single sentence. A yes/no question starts with Yes or No.",
    "motivation": "100–150 words.",
    "story": "150–250 words.",
    "skill": "80–150 words.",
    "other": "About 100 words.",
}


def _length_rule(req: QARequest, kind: Kind) -> str:
    if not req.limit:
        return _DEFAULT_LENGTH[kind]
    if kind == "short":
        return f"At most {req.limit} {req.unit}."
    return f"Between {int(req.limit * 0.8)} and {req.limit} {req.unit} — HARD LIMIT {req.limit} {req.unit}."


def build_message(req: QARequest, kind: Kind, kb_text: str, job_description: str, latex: str,
                  picked: list[Entry], entries: list[Entry], extra: str = "") -> str:
    blocks = [
        f"QUESTION:\n{req.question.strip()}",
        f"QUESTION TYPE: {kind}",
        f"LENGTH: {_length_rule(req, kind)}",
        f"JOB DESCRIPTION:\n{job_description}",
    ]
    if kind != "short":
        blocks.append(f"RÉSUMÉ (LaTeX body):\n{_body_only(latex)}")
    blocks.append(f"CANDIDATE PROFILE:\n{_candidate(kb_text, req.question)}")
    if kind == "short":
        history, skills = _work_history(entries), _skill_lines(kb_text, req.question)
        if history:
            blocks.append(f"WORK HISTORY:\n{history}")
        if skills:
            blocks.append(f"MATCHING SKILLS:\n{skills}")
    if picked:
        blocks.append("KNOWLEDGE BASE ENTRIES (full detail for what this question is about):\n\n"
                      + "\n\n".join(trim_entry(e, kind) for e in picked))
    blocks.append(f"NOTES FROM THE CANDIDATE:\n{req.notes.strip() or '(none)'}")
    if extra:
        blocks.append(extra)
    blocks.append("Output the JSON object only.")
    return "\n\n".join(blocks)


def measure(text: str, unit: Unit) -> int:
    return len(text.split()) if unit == "words" else len(text)


# ── 4. + 5. Generate and check ───────────────────────────────────────────────

async def answer_question(req: QARequest, kb_text: str, job_description: str, latex: str) -> Answer:
    kind: Kind = classify(req.question) if req.kind == "auto" else req.kind
    entries = parse_entries(kb_text)
    known = {e.id for e in entries}
    base = dict(id=uuid.uuid4().hex[:12], created_at=datetime.now(timezone.utc), question=req.question.strip(),
                kind=kind, limit=req.limit, unit=req.unit, entry_ids=req.entry_ids, notes=req.notes)

    # A short field the KB has no value for: say so, spend nothing.
    field = _needed_field(req.question) if kind == "short" else None
    if field and not profile_field(kb_text, field) and not req.notes.strip():
        return Answer(**base, answer="",
                      not_in_kb=f"Your KB has no `{field}` yet — add it under Profile in kb.md "
                                f"(or type the fact in Notes and ask again).")

    picked = pick_entries(req.question, kind, entries, extract_kb_ids(latex), _never_include(kb_text), req.entry_ids)
    extra, last_error, result = "", "", None
    for _attempt in range(2):
        message = build_message(req, kind, kb_text, job_description, latex, picked, entries, extra)
        text, model = await qa_answer(message)
        try:
            ai = _AIAnswer.model_validate(_parse(text))
        except (json.JSONDecodeError, ValidationError, AttributeError) as e:
            last_error = str(e)[:300]
            logger.warning(f"Q&A JSON didn't validate, retrying: {last_error}")
            continue
        result = (ai, model)
        size = measure(ai.answer, req.unit)
        if req.limit and size > req.limit:
            extra = (f"YOUR LAST ANSWER WAS {size} {req.unit.upper()} — OVER THE {req.limit}-{req.unit.upper()} "
                     f"LIMIT. Rewrite it to about {int(req.limit * 0.85)} {req.unit}, keeping the strongest facts.")
            continue
        break
    if result is None:
        raise AIServiceError(f"The answer came back malformed twice: {last_error}")

    ai, model = result
    answer = ai.answer.strip()
    size = measure(answer, req.unit)
    warning = f"{size} {req.unit} — over your {req.limit} limit. Trim before pasting." if req.limit and size > req.limit else ""
    return Answer(**base, answer=answer, model=model, warning=warning,
                  used_ids=[i for i in dict.fromkeys(ai.used_ids) if i in known],  # invented ids dropped
                  not_in_kb=ai.not_in_kb.strip())


def entry_options(kb_text: str, latex: str) -> list[EntryOption]:
    on_resume, hidden = set(extract_kb_ids(latex)), _never_include(kb_text)
    opts = [EntryOption(id=e.id, title=e.title, on_resume=e.id in on_resume)
            for e in parse_entries(kb_text) if e.id.startswith(("proj-", "exp-")) and e.id not in hidden]
    return sorted(opts, key=lambda o: (not o.on_resume, o.id))


# ── Reuse: have I answered something like this before? (code only, no AI) ───

SIMILAR_MIN = 0.35


def similarity(a: str, b: str) -> float:
    wa, wb = _words(a), _words(b)
    return len(wa & wb) / len(wa | wb) if wa and wb else 0.0


def find_similar(question: str, rows: list[tuple[int, str, str | None]], limit: int = 3) -> list[SimilarAnswer]:
    """rows = (record id, résumé title, qa JSON) for every résumé. Best matches first."""
    hits: list[SimilarAnswer] = []
    for record_id, title, raw in rows:
        for a in load_answers(raw):
            score = similarity(question, a.question)
            if score >= SIMILAR_MIN and a.answer:
                hits.append(SimilarAnswer(record_id=record_id, resume_title=title, answer=a, score=round(score, 2)))
    hits.sort(key=lambda h: -h.score)
    return hits[:limit]
