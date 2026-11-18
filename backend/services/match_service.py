"""
Match report: which job requirements a résumé covers, which the KB has but the résumé left out,
which are weak, and which are missing. Phase 1 of docs/ideas/skill-gap-insights.md.

The model does the reading; this module keeps it honest — it parses strict JSON, drops any
evidence ID that isn't really in the KB (an invented ID is an invented match), and computes the
summary counts itself instead of trusting the model's arithmetic.
"""

import json
import logging
import re
from typing import Literal

from pydantic import BaseModel, Field, ValidationError

from services.ai_service import AIServiceError, match_report as ai_match_report
from services.kb_service import ENTRY_ID_FULL

logger = logging.getLogger(__name__)

Status = Literal["on_resume", "left_out", "weak", "missing"]
Importance = Literal["must-have", "nice-to-have"]


class Requirement(BaseModel):
    skill: str
    category: str = "tool"
    importance: Importance = "nice-to-have"
    status: Status
    evidence: list[str] = Field(default_factory=list)
    jd_quote: str = ""
    note: str = ""


class MatchSummary(BaseModel):
    must_have_total: int
    must_have_covered: int  # on the résumé
    counts: dict[str, int]  # per status


class MatchReport(BaseModel):
    requirements: list[Requirement]
    advice: str = ""
    summary: MatchSummary
    model: str = ""


def _body_only(latex: str) -> str:
    """The résumé's content without the preamble — the preamble is macros, not facts."""
    start = latex.find(r"\begin{document}")
    return latex[start:] if start != -1 else latex


def _parse(text: str) -> dict:
    text = text.strip()
    if not text.startswith("{"):
        match = re.search(r"\{.*\}", text, re.DOTALL)  # tolerate stray prose around the JSON
        text = match.group(0) if match else text
    return json.loads(text)


def _summarise(reqs: list[Requirement]) -> MatchSummary:
    counts = {s: 0 for s in ("on_resume", "left_out", "weak", "missing")}
    for r in reqs:
        counts[r.status] += 1
    must = [r for r in reqs if r.importance == "must-have"]
    return MatchSummary(
        must_have_total=len(must),
        must_have_covered=sum(r.status == "on_resume" for r in must),
        counts=counts,
    )


async def build_match_report(kb_text: str, job_description: str, latex: str) -> MatchReport:
    """Run the analysis, with one retry if the model's JSON doesn't parse or validate."""
    known_ids = set(ENTRY_ID_FULL.findall(kb_text))
    last_error = ""
    for _attempt in range(2):
        text, model = await ai_match_report(kb_text, job_description, _body_only(latex))
        try:
            data = _parse(text)
            reqs = [Requirement.model_validate(r) for r in data.get("requirements", [])]
        except (json.JSONDecodeError, ValidationError, AttributeError) as e:
            last_error = str(e)[:300]
            logger.warning(f"Match report JSON didn't validate, retrying: {last_error}")
            continue
        for r in reqs:
            invented = [i for i in r.evidence if i not in known_ids]
            if invented:
                logger.info(f"Dropped evidence IDs not in the KB for {r.skill!r}: {invented}")
            r.evidence = [i for i in r.evidence if i in known_ids]
        return MatchReport(
            requirements=reqs,
            advice=str(data.get("advice", "")),
            summary=_summarise(reqs),
            model=model,
        )
    raise AIServiceError(f"The match report came back malformed twice: {last_error}")
