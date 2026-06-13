"""
AI service: wraps Groq API (primary) with OpenRouter fallback.

Uses the openai SDK pointed at Groq's OpenAI-compatible endpoint.
Temperature is kept low (0.3) to maximise LaTeX reliability.
"""

import json
from pathlib import Path
from typing import Any

from openai import AsyncOpenAI, APIStatusError

from utils.config import get_settings

# ── Prompt file paths ───────────────────────────────────────────────────────
PROMPTS_DIR = Path(__file__).parent.parent / "prompts"

def _load_prompt(filename: str) -> str:
    return (PROMPTS_DIR / filename).read_text(encoding="utf-8").strip()

# Load once at module import — these are static files
TAILOR_SYSTEM    = _load_prompt("tailor_system.txt")
REFINE_SYSTEM    = _load_prompt("refine_system.txt")
FEW_SHOT_EXAMPLE = _load_prompt("few_shot_example.tex")
GENERATE_SYSTEM  = _load_prompt("generate_system.txt")
RESUME_TEMPLATE  = _load_prompt("resume_template.tex")

PRIMARY_MODEL  = "llama-3.3-70b-versatile"
FALLBACK_MODEL = "deepseek/deepseek-r1-0528-qwen3-8b:free"


class AIServiceError(Exception):
    pass


def _make_groq_client() -> AsyncOpenAI:
    settings = get_settings()
    return AsyncOpenAI(
        api_key=settings.groq_api_key or "dummy",
        base_url="https://api.groq.com/openai/v1",
    )


def _make_openrouter_client() -> AsyncOpenAI:
    settings = get_settings()
    return AsyncOpenAI(
        api_key=settings.openrouter_api_key or "dummy",
        base_url="https://openrouter.ai/api/v1",
        default_headers={
            "HTTP-Referer": "https://github.com/VedPawar1410/resume-modifier",
            "X-Title": "Resume Modifier",
        },
    )


async def call_ai(
    system_prompt: str,
    user_message: str,
    temperature: float = 0.3,
    max_tokens: int = 2048,
) -> str:
    """
    Call Groq (primary) with automatic fallback to OpenRouter.
    Returns the text content of the assistant's response.
    Raises AIServiceError if both providers fail.
    """
    groq_client = _make_groq_client()
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user",   "content": user_message},
    ]

    groq_err_msg = ""
    try:
        response = await groq_client.chat.completions.create(
            model=PRIMARY_MODEL,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        content = response.choices[0].message.content or ""
        return _strip_code_fences(content.strip())
    except APIStatusError as e:
        if e.status_code == 429:
            retry_after = e.response.headers.get("retry-after", "unknown")
            groq_err_msg = f"Groq rate limit hit (retry-after: {retry_after}s)"
        else:
            groq_err_msg = f"Groq API error {e.status_code}: {e.message}"
    except Exception as e:
        groq_err_msg = f"Groq error: {e}"

    # Fallback to OpenRouter
    settings = get_settings()
    if not settings.openrouter_api_key:
        raise AIServiceError(
            f"{groq_err_msg}. No OPENROUTER_API_KEY configured for fallback."
        )

    or_client = _make_openrouter_client()
    try:
        response = await or_client.chat.completions.create(
            model=FALLBACK_MODEL,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        content = response.choices[0].message.content or ""
        return _strip_code_fences(content.strip())
    except Exception as e:
        raise AIServiceError(
            f"Both providers failed.\nGroq: {groq_err_msg}\nOpenRouter: {e}"
        )


def _strip_code_fences(text: str) -> str:
    """Remove markdown code fences (```latex ... ```) that models sometimes add."""
    import re
    # Remove opening fence: ```latex or ``` or ```tex
    text = re.sub(r"^```[a-z]*\n?", "", text, flags=re.MULTILINE)
    # Remove closing fence
    text = re.sub(r"^```\s*$", "", text, flags=re.MULTILINE)
    return text.strip()


# ── Mode-specific orchestration ──────────────────────────────────────────────

async def tailor_section(
    section_name: str,
    section_body: str,
    job_description: str,
) -> str:
    """
    Rewrite a single resume section body to match the given job description.
    Returns the modified section body (LaTeX, no \\section{} wrapper).
    """
    user_message = f"""--- FEW-SHOT EXAMPLE (shows correct macro usage — do not reproduce this content) ---
{FEW_SHOT_EXAMPLE}
--- END EXAMPLE ---

SECTION TO TAILOR: {section_name}

CURRENT SECTION BODY:
{section_body}

JOB DESCRIPTION:
{job_description}

Output the tailored section body only. Do not include \\section{{{section_name}}} or any document-level LaTeX."""

    return await call_ai(TAILOR_SYSTEM, user_message, temperature=0.3)


async def refine_section(
    section_name: str,
    section_body: str,
    new_entry: dict[str, Any],
) -> str:
    """
    Insert a new entry (job / project / skills) into an existing section body.
    Returns the updated section body (LaTeX, no \\section{} wrapper).
    """
    # Filter out None values for a cleaner prompt
    entry_str = json.dumps(
        {k: v for k, v in new_entry.items() if v is not None},
        indent=2,
    )

    user_message = f"""--- FEW-SHOT EXAMPLE (shows correct macro usage — do not reproduce this content) ---
{FEW_SHOT_EXAMPLE}
--- END EXAMPLE ---

SECTION TO MODIFY: {section_name}

CURRENT SECTION BODY:
{section_body}

NEW ENTRY TO ADD:
{entry_str}

Output the complete updated section body only. Do not include \\section{{{section_name}}} or any document-level LaTeX."""

    return await call_ai(REFINE_SYSTEM, user_message, temperature=0.4)


async def fix_compilation_error(
    section_name: str,
    broken_body: str,
    error_message: str,
) -> str:
    """
    Ask the AI to fix a LaTeX syntax error in a single section body.
    Used as the retry callback in compile_with_retry().
    """
    system = (
        "You are a LaTeX syntax expert. Fix the provided LaTeX section body so it compiles "
        "correctly with pdflatex. Output ONLY the corrected section body — no explanation, "
        "no code fences, no \\section{} wrapper, no document-level LaTeX."
    )
    user_message = f"""SECTION: {section_name}

BROKEN LATEX:
{broken_body}

PDFLATEX ERROR:
{error_message}

Output the corrected section body only."""

    return await call_ai(system, user_message, temperature=0.1)


# ── Resume-from-scratch generation ───────────────────────────────────────────

async def generate_resume(resume_name: str, career_info: dict[str, Any]) -> str:
    """
    Generate a complete, compilable LaTeX resume from structured career info.
    Returns the full LaTeX document (preamble + sections + \\end{document}).
    """
    # Drop empty values so the model isn't distracted by blank fields
    info_str = json.dumps(_prune_empty(career_info), indent=2)

    user_message = f"""--- LATEX TEMPLATE (use this exact preamble and these macros) ---
{RESUME_TEMPLATE}
--- END TEMPLATE ---

CANDIDATE CAREER INFO (JSON):
{info_str}

Produce one complete LaTeX document for "{resume_name}" using the template's preamble
and macros. Fill the header with the contact info and build Education, Technical Skills,
Experience, and Projects sections from the data. Output the full document only."""

    return await call_ai(GENERATE_SYSTEM, user_message, temperature=0.3, max_tokens=4096)


async def fix_document_error(broken_latex: str, error_message: str) -> str:
    """
    Ask the AI to fix a full LaTeX document so it compiles with pdflatex.
    Used as a one-shot retry for generated resumes.
    """
    system = (
        "You are a LaTeX syntax expert. Fix the provided full LaTeX document so it compiles "
        "with pdflatex. Output ONLY the corrected complete document — no explanation, no code fences."
    )
    user_message = f"""BROKEN LATEX DOCUMENT:
{broken_latex}

PDFLATEX ERROR:
{error_message}

Output the corrected complete document only."""

    return await call_ai(system, user_message, temperature=0.1, max_tokens=4096)


def _prune_empty(value: Any) -> Any:
    """Recursively drop None / empty-string / empty-list values for a cleaner prompt."""
    if isinstance(value, dict):
        cleaned = {k: _prune_empty(v) for k, v in value.items()}
        return {k: v for k, v in cleaned.items() if v not in (None, "", [], {})}
    if isinstance(value, list):
        items = [_prune_empty(v) for v in value]
        return [v for v in items if v not in (None, "", [], {})]
    return value
