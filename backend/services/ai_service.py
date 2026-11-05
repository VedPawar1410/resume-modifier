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
        Provider("Claude", s.anthropic_api_key, "https://api.anthropic.com/v1/", s.kb_model, 16000, False),
        Provider("Groq", s.groq_api_key, "https://api.groq.com/openai/v1", GROQ_MODEL, 4096, True),
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
) -> tuple[str, str]:
    """
    Try each configured provider in order (Claude → Groq → OpenRouter).
    Returns (response text, model that produced it).
    Raises AIServiceError if every configured provider fails.
    """
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user",   "content": user_message},
    ]
    errors: list[str] = []

    for p in _providers():
        if not p.api_key:
            continue
        client = AsyncOpenAI(api_key=p.api_key, base_url=p.base_url, default_headers=p.headers)
        extra = {"temperature": temperature} if p.accepts_temperature else {}
        try:
            # Streamed so a cancel can stop generation: if the user cancels, this coroutine is
            # cancelled, the `async with` closes the connection, and the provider stops writing
            # (output tokens after that point aren't billed).
            stream = await client.chat.completions.create(
                model=p.model,
                messages=messages,
                max_tokens=p.max_tokens,
                stream=True,
                **extra,
            )
            parts: list[str] = []
            finish_reason = None
            async with stream:
                async for chunk in stream:
                    if not chunk.choices:
                        continue
                    choice = chunk.choices[0]
                    if choice.delta and choice.delta.content:
                        parts.append(choice.delta.content)
                    if choice.finish_reason:
                        finish_reason = choice.finish_reason
            if finish_reason == "length":
                # A cut-off resume is broken LaTeX — treat it as a failure, not a result.
                raise AIServiceError(f"output cut off at max_tokens={p.max_tokens}")
            return _strip_code_fences("".join(parts).strip()), p.model
        # Catches provider errors only. A cancel raises CancelledError, which is not an
        # Exception, so it skips this and doesn't fall through to the next provider.
        except Exception as e:
            logger.warning(f"{p.name} failed: {_describe_error(e)}")
            errors.append(f"{p.name}: {_describe_error(e)}")

    if not errors:
        raise AIServiceError("No AI provider configured — set ANTHROPIC_API_KEY in .env")
    raise AIServiceError("All AI providers failed.\n" + "\n".join(errors))


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
        "Cut the least relevant bullets, merge or tighten wordy ones, and drop optional sections "
        "(e.g. Certifications) before cutting core experience. Never add new facts. Keep the "
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
