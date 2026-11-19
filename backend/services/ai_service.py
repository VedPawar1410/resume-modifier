"""
AI service: Claude (primary) with Groq → OpenRouter as fallbacks.

All three providers expose OpenAI-compatible endpoints, so the openai SDK talks to every
one of them — only the base_url, key and model name change.
"""

import logging
import re
from pathlib import Path
from typing import NamedTuple

from openai import APIStatusError, AsyncOpenAI

from utils.config import get_settings

logger = logging.getLogger(__name__)

# ── Prompt file paths ───────────────────────────────────────────────────────
PROMPTS_DIR = Path(__file__).parent.parent / "prompts"

def _load_prompt(filename: str) -> str:
    return (PROMPTS_DIR / filename).read_text(encoding="utf-8").strip()

# Load once at module import — these are static files
KB_GENERATE_SYSTEM = _load_prompt("kb_generate_system.txt")
KB_RESUME_TEMPLATE = _load_prompt("kb_resume_template.tex")
MATCH_REPORT_SYSTEM = _load_prompt("match_report_system.txt")
OUTREACH_SYSTEM = _load_prompt("outreach_system.txt")
PROFILE_PARSE_SYSTEM = _load_prompt("profile_parse_system.txt")
FIT_CHECK_SYSTEM = _load_prompt("fit_check_system.txt")

GROQ_MODEL       = "openai/gpt-oss-120b"
OPENROUTER_MODEL = "deepseek/deepseek-r1-0528-qwen3-8b:free"


class AIServiceError(Exception):
    pass


class Provider(NamedTuple):
    name: str
    api_key: str
    base_url: str
    model: str
    max_tokens: int  # output cap
    accepts_temperature: bool
    headers: dict[str, str] = {}
    accepts_reasoning_effort: bool = False  # OpenAI-style "low" | "medium" | "high"


# Who gets tried when a caller doesn't say. Gemini is only used where a caller names it
# (outreach), so résumé generation keeps its tested chain.
DEFAULT_ORDER = ("Claude", "Groq", "OpenRouter")


def _providers() -> list[Provider]:
    """
    Providers in the order they are tried.
    - Claude thinks before answering and the thinking counts as output, so it needs a large
      output cap (it's billed per token used, not per cap). It also rejects `temperature`.
    - Groq's free tier counts prompt + max_tokens against an 8k tokens-per-minute limit,
      so the fallbacks get a smaller cap.
    """
    s = get_settings()
    return [
        # 32k: with the full KB, Haiku used up to ~14k output tokens (thinking included); a
        # cut-off answer is a failed résumé, and you only pay for tokens actually used.
        Provider("Claude", s.anthropic_api_key, "https://api.anthropic.com/v1/", s.kb_model, 32000, False),
        Provider("Groq", s.groq_api_key, "https://api.groq.com/openai/v1", GROQ_MODEL, 4096, True,
                 accepts_reasoning_effort=True),
        # Google's OpenAI-compatible endpoint, so the same SDK works with no new dependency.
        Provider("Gemini", s.gemini_api_key, "https://generativelanguage.googleapis.com/v1beta/openai/",
                 s.gemini_model, 8192, True, accepts_reasoning_effort=True),
        Provider("OpenRouter", s.openrouter_api_key, "https://openrouter.ai/api/v1", OPENROUTER_MODEL, 4096, True, {
            "HTTP-Referer": "https://github.com/VedPawar1410/resume-modifier",
            "X-Title": "Resume Modifier",
        }),
    ]


def _describe_error(e: Exception) -> str:
    if isinstance(e, APIStatusError):
        if e.status_code == 429:
            return f"rate limit hit (retry-after: {e.response.headers.get('retry-after', 'unknown')}s)"
        return f"API error {e.status_code}: {e.message}"
    return str(e)


async def call_ai(
    system_prompt: str,
    user_message: str,
    temperature: float = 0.3,
    order: tuple[str, ...] = DEFAULT_ORDER,
    max_tokens: int | None = None,
    reasoning_effort: str | None = None,
    models: dict[str, str] | None = None,
    max_retries: int | None = None,
) -> tuple[str, str]:
    """
    Try each configured provider named in `order` (default Claude → Groq → OpenRouter).
    Providers not in `order` are never tried — outreach passes ("Groq", "Gemini") so it can't
    fall through to the paid model. `max_tokens` lowers the output cap; `reasoning_effort` goes
    only to providers that accept it. `models` swaps a provider's model ({"Groq": "..."}), same key.
    `max_retries=0` turns off the SDK's own retry, which waits out a 429 (up to ~40 s on Groq)
    instead of moving on to the next provider.
    Returns (response text, model that produced it).
    Raises AIServiceError if every configured provider fails.
    """
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user",   "content": user_message},
    ]
    errors: list[str] = []
    by_name = {p.name: p for p in _providers()}
    chain = [by_name[name] for name in order if name in by_name]
    chain = [p._replace(model=models[p.name]) if models and p.name in models else p for p in chain]

    for p in chain:
        if not p.api_key:
            continue
        retries = {"max_retries": max_retries} if max_retries is not None else {}
        client = AsyncOpenAI(api_key=p.api_key, base_url=p.base_url, default_headers=p.headers, **retries)
        extra = {"temperature": temperature} if p.accepts_temperature else {}
        if reasoning_effort and p.accepts_reasoning_effort:
            extra["reasoning_effort"] = reasoning_effort
        cap = min(p.max_tokens, max_tokens) if max_tokens else p.max_tokens
        try:
            # Streamed so a cancel can stop generation: if the user cancels, this coroutine is
            # cancelled, the `async with` closes the connection, and the provider stops writing
            # (output tokens after that point aren't billed).
            stream = await client.chat.completions.create(
                model=p.model,
                messages=messages,
                max_tokens=cap,
                stream=True,
                stream_options={"include_usage": True},  # final chunk carries token counts
                **extra,
            )
            parts: list[str] = []
            finish_reason = None
            async with stream:
                async for chunk in stream:
                    if chunk.usage:
                        _log_usage(p.model, chunk.usage)
                    if not chunk.choices:
                        continue
                    choice = chunk.choices[0]
                    if choice.delta and choice.delta.content:
                        parts.append(choice.delta.content)
                    if choice.finish_reason:
                        finish_reason = choice.finish_reason
            if finish_reason == "length":
                # A cut-off resume is broken LaTeX — treat it as a failure, not a result.
                raise AIServiceError(f"output cut off at max_tokens={cap}")
            return _strip_code_fences("".join(parts).strip()), p.model
        # Catches provider errors only. A cancel raises CancelledError, which is not an
        # Exception, so it skips this and doesn't fall through to the next provider.
        except Exception as e:
            logger.warning(f"{p.name} failed: {_describe_error(e)}")
            errors.append(f"{p.name}: {_describe_error(e)}")

    if not errors:
        keys = " or ".join(f"{p.name.upper()}_API_KEY" for p in chain)
        raise AIServiceError(f"No AI provider configured — set {keys} in .env")
    raise AIServiceError("All AI providers failed.\n" + "\n".join(errors))


# $ per million tokens: (input, output) up to the long-prompt threshold, then (input, output) above it.
# Claude Haiku 5.5 charges 5x for prompts over 100K tokens — the KB alone is ~68K, so watch this.
PRICING = {"claude-haiku-5-5": (100_000, (0.10, 0.50), (0.50, 2.50))}


def _log_usage(model: str, usage) -> None:
    """Log tokens (and cost, when the model's price is known) for every AI call."""
    tin, tout = usage.prompt_tokens, usage.completion_tokens
    cost = ""
    if model in PRICING:
        threshold, normal, long = PRICING[model]
        rate_in, rate_out = long if tin > threshold else normal
        cost = f" cost=${(tin * rate_in + tout * rate_out) / 1_000_000:.4f}"
    logger.info(f"AI usage: model={model} input={tin} output={tout}{cost}")


def _strip_code_fences(text: str) -> str:
    """Remove markdown code fences (```latex ... ```) that models sometimes add."""
    # Remove opening fence: ```latex or ``` or ```tex
    text = re.sub(r"^```[a-z]*\n?", "", text, flags=re.MULTILINE)
    # Remove closing fence
    text = re.sub(r"^```\s*$", "", text, flags=re.MULTILINE)
    return text.strip()


# ── Resume generation from the knowledge base ────────────────────────────────

async def generate_from_kb(kb_text: str, job_description: str) -> tuple[str, str]:
    """Write a full one-page LaTeX resume for the job, using only facts from the KB."""
    user_message = f"""LATEX TEMPLATE (copy the preamble verbatim; follow the body layout):
{KB_RESUME_TEMPLATE}

KNOWLEDGE BASE (the only source of facts about the candidate):
{kb_text}

JOB DESCRIPTION:
{job_description}

Output the complete LaTeX document, starting with the % kb-ids line."""

    return await call_ai(KB_GENERATE_SYSTEM, user_message, temperature=0.3)


async def shorten_to_one_page(latex: str, page_count: int) -> tuple[str, str]:
    """Trim a resume that compiled to more than one page, without changing any facts."""
    system = (
        "You are a resume editor. Shorten the given LaTeX resume so it fits on exactly one page. "
        "It usually overflows by only a few lines, so cut the MINIMUM: first tighten wordy bullets "
        "so they take one line less, then remove single bullets from the least relevant entries. "
        "Keep all three projects and every experience entry: remove a whole entry only if bullet "
        "cuts still aren't enough. Keep the skills as one comma-separated run (you may drop the "
        "least relevant skills). The result should still fill most of the page. "
        "Never add new facts. Keep the "
        "preamble unchanged, and update the first-line '% kb-ids:' comment if you remove an "
        "entry entirely. Output ONLY the complete LaTeX document — no explanation, no code fences."
    )
    user_message = f"""This resume compiled to {page_count} pages. Shorten it to one page.

{latex}"""

    return await call_ai(system, user_message, temperature=0.2)


async def fix_document_error(broken_latex: str, error_message: str) -> tuple[str, str]:
    """
    Ask the AI to fix a full LaTeX document so it compiles with pdflatex.
    Used as a one-shot retry for generated resumes.
    """
    system = (
        "You are a LaTeX syntax expert. Fix the provided full LaTeX document so it compiles "
        "with pdflatex. Keep the first-line '% kb-ids:' comment. "
        "Output ONLY the corrected complete document — no explanation, no code fences."
    )
    user_message = f"""BROKEN LATEX DOCUMENT:
{broken_latex}

PDFLATEX ERROR:
{error_message}

Output the corrected complete document only."""

    return await call_ai(system, user_message, temperature=0.1)


# ── Match report (phase 1 of docs/ideas/skill-gap-insights.md) ───────────────

async def match_report(kb_text: str, job_description: str, resume_body: str) -> tuple[str, str]:
    """JD requirements vs KB vs the résumé → strict JSON text (parsed in match_service)."""
    user_message = f"""JOB DESCRIPTION:
{job_description}

KNOWLEDGE BASE:
{kb_text}

RÉSUMÉ (LaTeX body):
{resume_body}

Output the JSON object only."""
    return await call_ai(MATCH_REPORT_SYSTEM, user_message, temperature=0.1)


# ── Outreach messages (cold email / LinkedIn) ────────────────────────────────

async def outreach_message(user_message: str) -> tuple[str, str]:
    """
    One outreach draft → JSON text {"subject", "body"} (parsed in outreach_service).
    Free providers only (Ved's decision): the prompt is small (~5K tokens, no full KB), which
    fits Groq's 8K tokens/minute; a second message in the same minute falls to Gemini. Low
    reasoning effort and a 2K cap keep it inside Groq's limit (prompt + cap both count).
    """
    return await call_ai(
        OUTREACH_SYSTEM, user_message, temperature=0.5,
        order=("Groq", "Gemini"), max_tokens=2048, reasoning_effort="low",
    )


async def profile_parse(user_message: str) -> tuple[str, str]:
    """
    A pasted LinkedIn profile → JSON text {"recipient_name", ...} (parsed in outreach_service).
    Free providers only, on smaller models than outreach drafts: rate limits are per model, so a
    paste and a draft in the same minute don't eat each other's budget. The trimmed paste is
    ~1-2K tokens; a 1K cap leaves room for the 20B model's short reasoning.
    """
    s = get_settings()
    return await call_ai(
        PROFILE_PARSE_SYSTEM, user_message, temperature=0.1,
        order=("Groq", "Gemini"), max_tokens=1024, reasoning_effort="low",
        models={"Groq": s.profile_groq_model, "Gemini": s.profile_gemini_model},
    )


# ── Job-fit check (before generating) ────────────────────────────────────────

async def fit_check(digest: str, job_description: str) -> tuple[str, str]:
    """
    JD vs the compact KB digest → JSON text (parsed and scored in fit_service).
    Free providers only, like outreach: the digest is ~3-4K tokens (the full KB never goes), so
    prompt + a 1.5K cap stays under Groq's 8K tokens/minute; a second check inside a minute falls
    to Gemini.
    """
    user_message = f"""CANDIDATE DIGEST:
{digest}

JOB DESCRIPTION:
{job_description}

Output the JSON object only."""
    return await call_ai(
        FIT_CHECK_SYSTEM, user_message, temperature=0.1,
        order=("Groq", "Gemini"), max_tokens=1536, reasoning_effort="low",
        max_retries=0,  # Ved is waiting on the screen: a Groq 429 goes straight to Gemini
    )
