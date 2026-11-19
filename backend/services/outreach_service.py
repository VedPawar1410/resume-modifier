"""
Outreach: a cold email / LinkedIn note / InMail / referral ask for one résumé, plus a
"who to contact" guide of ready-made searches.

The model sees only the JD, the résumé (already the KB entries picked for this job) and the KB's
Profile + Targeting sections — not the whole KB — so the prompt fits the free providers.
The guide is plain code, no AI: Sourced never logs in to or fetches LinkedIn (its terms forbid
scraping); it builds search links Ved opens himself.
"""

import json
import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Literal
from urllib.parse import quote_plus

from pydantic import BaseModel, Field, ValidationError, field_validator

from services.ai_service import AIServiceError, outreach_message, profile_parse
from services.match_service import _body_only, _parse

logger = logging.getLogger(__name__)

Kind = Literal["email", "connection_note", "linkedin_message", "referral_ask"]
Relationship = Literal["recruiter", "hiring_manager", "engineer", "alum", "other"]

NOTE_LIMIT = 300  # LinkedIn Premium; free accounts get 200 (the UI marks both)


class OutreachRequest(BaseModel):
    kind: Kind
    recipient_name: str = Field("", max_length=100)
    recipient_role: str = Field("", max_length=150)
    relationship: Relationship = "recruiter"
    position: str = Field("", max_length=150)
    notes: str = Field("", max_length=1000)


class Draft(OutreachRequest):
    id: str
    created_at: datetime
    subject: str = ""
    body: str
    model: str = ""
    warning: str = ""


class DraftUpdate(BaseModel):
    subject: str | None = None
    body: str | None = None


class GuideLink(BaseModel):
    label: str
    url: str
    hint: str = ""


class Guide(BaseModel):
    company: str
    role: str
    links: list[GuideLink]
    tips: list[str]


class OutreachState(BaseModel):
    guide: Guide
    drafts: list[Draft]


class _AIDraft(BaseModel):
    subject: str = ""
    body: str


# ── Stored drafts (a JSON list in resume_records.outreach) ───────────────────

def load_drafts(raw: str | None) -> list[Draft]:
    return [Draft.model_validate(d) for d in json.loads(raw)] if raw else []


def dump_drafts(drafts: list[Draft]) -> str:
    return json.dumps([d.model_dump(mode="json") for d in drafts])


# ── KB context ───────────────────────────────────────────────────────────────

def _kb_section(kb_text: str, name: str) -> str:
    match = re.search(rf"^## {re.escape(name)}\s*\n(.*?)(?=^## |\Z)", kb_text, re.MULTILINE | re.DOTALL)
    return match.group(1).strip().rstrip("-").strip() if match else ""


def _school(kb_text: str) -> str:
    match = re.search(r"^- school:\s*(.+)$", _kb_section(kb_text, "Education"), re.MULTILINE)
    return match.group(1).strip() if match else ""


# ── Who to contact ───────────────────────────────────────────────────────────

def split_title(title: str) -> tuple[str, str]:
    """'Company — Role' → (company, role). Falls back to the whole title as the company."""
    company, sep, role = title.partition(" — ")
    return company.strip(), (role.strip() if sep else "")


def _people_search(keywords: str) -> str:
    return f"https://www.linkedin.com/search/results/people/?keywords={quote_plus(keywords)}"


def who_to_contact(title: str, kb_text: str) -> Guide:
    company, role = split_title(title)
    links = [
        GuideLink(label="Recruiters", url=_people_search(f"{company} recruiter"),
                  hint="Recruiter or talent acquisition — they own the pipeline."),
        GuideLink(label="Hiring managers", url=_people_search(f"{company} engineering manager"),
                  hint="Your likely manager. Best for an InMail."),
    ]
    if role:
        links.append(GuideLink(label=f"People in “{role}”", url=_people_search(f"{company} {role}"),
                               hint="Peers on the team — good for advice or a referral."))
    school = _school(kb_text)
    if school:
        links.append(GuideLink(label="Alumni from your school", url=_people_search(f"{company} {school}"),
                               hint="A shared school makes a warmer intro. Ask for a referral."))
    google_q = f'site:linkedin.com/in "{company}" (recruiter OR "talent acquisition" OR "hiring manager")'
    links.append(GuideLink(label="Google search of LinkedIn profiles",
                           url=f"https://www.google.com/search?q={quote_plus(google_q)}",
                           hint="Finds profiles LinkedIn's own search hides outside your network."))
    links.append(GuideLink(label="Company page → People tab",
                           url=f"https://www.linkedin.com/search/results/companies/?keywords={quote_plus(company)}",
                           hint="Open the company, then People: filter by school, title or location."))
    tips = [
        "Message 2–3 people per job: the hiring manager, a recruiter, and an alum or engineer.",
        "Save InMails (5 a month) for hiring managers; use connection notes for everyone else.",
        "Send within a day or two of applying, and follow up once after about a week.",
        "Check the person still works there and is on the right team before writing.",
    ]
    return Guide(company=company, role=role, links=links, tips=tips)


# ── Generation ───────────────────────────────────────────────────────────────

def _user_message(req: OutreachRequest, kb_text: str, job_description: str, latex: str, extra: str) -> str:
    school = _school(kb_text)
    parts = (_kb_section(kb_text, "Profile"), _kb_section(kb_text, "Targeting"), f"- school: {school}" if school else "")
    profile = "\n\n".join(s for s in parts if s)
    return f"""MESSAGE:
- type: {req.kind}
- recipient name: {req.recipient_name or "(not given)"}
- recipient role: {req.recipient_role or "(not given)"}
- relationship to the job: {req.relationship}
- position applied for: {req.position or "(see job description)"}

JOB DESCRIPTION:
{job_description}

RÉSUMÉ (LaTeX body):
{_body_only(latex)}

CANDIDATE PROFILE:
{profile}

NOTES:
{req.notes or "(none)"}
{extra}
Output the JSON object only."""


async def generate_draft(req: OutreachRequest, kb_text: str, job_description: str, latex: str) -> Draft:
    """One draft, retrying once on bad JSON or a connection note over the limit."""
    extra, last_error, result = "", "", None
    for _attempt in range(2):
        text, model = await outreach_message(_user_message(req, kb_text, job_description, latex, extra))
        try:
            ai = _AIDraft.model_validate(_parse(text))
        except (json.JSONDecodeError, ValidationError, AttributeError) as e:
            last_error = str(e)[:300]
            logger.warning(f"Outreach JSON didn't validate, retrying: {last_error}")
            continue
        result = (ai, model)
        if req.kind == "connection_note" and len(ai.body) > NOTE_LIMIT:
            extra = (f"\nYOUR LAST NOTE WAS {len(ai.body)} CHARACTERS. Rewrite it under "
                     f"{NOTE_LIMIT - 40} characters.\n")
            continue
        break
    if result is None:
        raise AIServiceError(f"The message came back malformed twice: {last_error}")
    ai, model = result
    warning = ""
    if req.kind == "connection_note":
        ai.subject = ""
        if len(ai.body) > NOTE_LIMIT:
            warning = f"{len(ai.body)} characters — over LinkedIn's {NOTE_LIMIT}. Trim before sending."
    return Draft(
        **req.model_dump(),
        id=uuid.uuid4().hex[:12],
        created_at=datetime.now(timezone.utc),
        subject=ai.subject.strip(),
        body=ai.body.strip(),
        model=model,
        warning=warning,
    )


# ── Paste a LinkedIn profile → recipient fields ──────────────────────────────
# Ved copies a profile he is viewing (⌘A ⌘C) and pastes it. Sourced never fetches LinkedIn.
# Code trims LinkedIn's menus first (cheap, predictable, keeps the prompt inside Groq's 8K
# tokens/min), the model does the judgment calls (name, current role, relationship, hooks),
# then code checks the plain facts (shared school, works at the company). Nothing is stored.

PROFILE_INPUT_MAX = 100_000  # a whole ⌘A copy is usually 5-25K characters
PROFILE_TRIM_MAX = 8_000     # ≈ 2K tokens; name, headline, highlights and experience come first

# The page's sidebar and footer start here; everything after is other people or LinkedIn chrome.
_TAIL_MARKERS = (
    "People also viewed", "More profiles for you", "People you may know", "You might like",
    "Explore Premium profiles", "Explore collaborative articles", "LinkedIn Corporation ©",
)
# Whole lines that are menus or buttons, compared lowercased.
_UI_LINES = {
    "skip to main content", "home", "my network", "jobs", "messaging", "notifications", "me",
    "for business", "learning", "try premium for free", "try premium", "reactivate premium",
    "connect", "message", "more", "follow", "following", "pending", "show all", "see more",
    "…see more", "...see more", "show more", "show less", "like", "comment", "repost", "send",
    "contact info", "view my services", "open to", "add profile section", "enhance profile",
    "resources", "save to pdf", "about this profile", "report / block", "·", "•",
}
_NOISE = re.compile(r"^(\d+\+?|\d+ notifications?|· (1st|2nd|3rd\+?)|(1st|2nd|3rd\+?) degree connection)$", re.I)
_COMPANY_SUFFIX = re.compile(r"[,\s]+(inc\.?|llc|ltd\.?|limited|pvt\.?|private|corp\.?|corporation|gmbh|co\.?)$", re.I)


class ProfileParseRequest(BaseModel):
    profile_text: str = Field(..., min_length=20, max_length=PROFILE_INPUT_MAX)


class ProfileParse(BaseModel):
    recipient_name: str = ""
    recipient_role: str = ""
    relationship: Relationship = "other"
    notes: str = ""
    warning: str = ""
    model: str = ""


class _AIProfile(BaseModel):
    recipient_name: str = ""
    recipient_role: str = ""
    relationship: str = "other"
    notes: str = ""

    @field_validator("relationship")
    @classmethod
    def _known(cls, v: str) -> str:  # an unexpected label shouldn't cost a retry
        return v if v in ("recruiter", "hiring_manager", "engineer") else "other"


def trim_profile(text: str) -> str:
    """Drop LinkedIn's menus, buttons, repeated lines and the sidebar; cap the length."""
    lines: list[str] = []
    for raw in text.splitlines():
        line = " ".join(raw.split())
        if not line:
            continue
        if line.startswith(_TAIL_MARKERS):
            break
        if line.lower() in _UI_LINES or _NOISE.match(line):
            continue
        if lines and lines[-1] == line:  # LinkedIn repeats titles for screen readers
            continue
        lines.append(line)
    return "\n".join(lines)[:PROFILE_TRIM_MAX]


def _mentions(text: str, name: str) -> bool:
    core = _COMPANY_SUFFIX.sub("", name.strip())
    return bool(core) and core.lower() in text.lower()


async def parse_profile(profile_text: str, company: str, kb_text: str) -> ProfileParse:
    trimmed = trim_profile(profile_text)
    # Lengths only, never the text: it's someone else's profile.
    logger.info(f"Profile paste trimmed {len(profile_text)} → {len(trimmed)} characters")
    message = f"TARGET COMPANY: {company or '(unknown)'}\n\nPROFILE:\n{trimmed}\n\nOutput the JSON object only."

    ai, model, last_error = None, "", ""
    for _attempt in range(2):
        text, model = await profile_parse(message)
        try:
            ai = _AIProfile.model_validate(_parse(text))
            break
        except (json.JSONDecodeError, ValidationError, AttributeError) as e:
            last_error = str(e)[:300]
            logger.warning(f"Profile JSON didn't validate, retrying: {last_error}")
    if ai is None:
        raise AIServiceError(f"The profile came back malformed twice: {last_error}")

    # Plain facts are checked in code, not trusted to the model.
    relationship, hooks = ai.relationship, [h.strip() for h in ai.notes.splitlines() if h.strip()]
    school = _school(kb_text)
    if school and _mentions(trimmed, school):
        hooks = [h for h in hooks if not _mentions(h, school)]  # one school hook, not two
        hooks.append(f"Also studied at {school}.")
        if relationship in ("engineer", "other"):  # a recruiter or manager keeps their tone
            relationship = "alum"
    warning = ""
    if company and not _mentions(trimmed, company):
        warning = f"Couldn't see {company} on this profile — check they still work there."

    return ProfileParse(
        recipient_name=ai.recipient_name.strip()[:100],
        recipient_role=ai.recipient_role.strip()[:150],
        relationship=relationship,
        notes="\n".join(hooks[:3])[:1000],
        warning=warning,
        model=model,
    )
