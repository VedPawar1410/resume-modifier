"""
LaTeX parsing, stitching, and PDF compilation service.

Design: section-level modification approach.
- parse_latex() splits the document into named sections.
- stitch_latex() reassembles them back into a full LaTeX document.
- compile_latex() runs pdflatex in a temp directory and returns the PDF bytes.
- compile_with_retry() compiles and calls the AI fix function on errors (up to max_retries).
"""

import re
import shutil
import subprocess
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Awaitable, Callable, Optional

# Matches \section{Name} followed by its body, stopping at the next \section or \end{document}
SECTION_PATTERN = re.compile(
    r"\\section\{([^}]+)\}(.*?)(?=\\section\{|\\end\{document\})",
    re.DOTALL,
)

PDFLATEX_TIMEOUT = 60  # seconds per run


@dataclass
class ParsedResume:
    preamble: str  # Everything up to (but not including) the first \section{}
    sections: dict[str, str]  # section name → section body (without the \section{} header)
    section_order: list[str]  # Preserves original section order
    postamble: str = r"\end{document}"  # Always \end{document}


class LaTeXParseError(Exception):
    pass


class LaTeXCompilationError(Exception):
    def __init__(self, message: str, log: str = ""):
        super().__init__(message)
        self.log = log


def parse_latex(latex_code: str) -> ParsedResume:
    """
    Split a full LaTeX document into preamble, named section bodies, and postamble.

    Stops parsing at \\end{document} — any dead code after that line is discarded.
    Raises LaTeXParseError if the document structure is invalid.
    """
    if r"\begin{document}" not in latex_code:
        raise LaTeXParseError(r"LaTeX must contain \begin{document}")
    if r"\end{document}" not in latex_code:
        raise LaTeXParseError(r"LaTeX must contain \end{document}")

    # Keep \end{document} in active_code so it can serve as the lookahead
    # terminator for the last section. Everything AFTER \end{document} is dead code.
    end_doc_idx = latex_code.index(r"\end{document}")
    end_doc_end = end_doc_idx + len(r"\end{document}")
    active_code = latex_code[:end_doc_end]  # includes \end{document}

    # Find where the first \section{} begins — everything before is the preamble
    first_match = SECTION_PATTERN.search(active_code)
    if first_match is None:
        raise LaTeXParseError("No \\section{} found in the document body")

    preamble = active_code[: first_match.start()]

    sections: dict[str, str] = {}
    section_order: list[str] = []

    for m in SECTION_PATTERN.finditer(active_code):
        name = m.group(1).strip()
        body = m.group(2)
        sections[name] = body
        section_order.append(name)

    return ParsedResume(
        preamble=preamble,
        sections=sections,
        section_order=section_order,
    )


def stitch_latex(parsed: ParsedResume) -> str:
    """
    Reassemble a (potentially modified) ParsedResume back into a full LaTeX string.
    """
    parts: list[str] = [parsed.preamble]
    for name in parsed.section_order:
        parts.append(f"\\section{{{name}}}")
        parts.append(parsed.sections[name])
    parts.append(parsed.postamble)
    return "".join(parts)


def compile_latex(latex_code: str) -> tuple[Optional[bytes], Optional[str]]:
    """
    Compile LaTeX to PDF using pdflatex in an isolated temp directory.

    Runs pdflatex twice (standard practice for stable cross-references).

    Returns:
        (pdf_bytes, None)   on success
        (None, error_str)   on failure
    """
    if shutil.which("pdflatex") is None:
        return None, (
            "pdflatex not found. Install TeX Live: brew install --cask mactex-no-gui\n"
            "Then restart your terminal so /Library/TeX/texbin is in your PATH."
        )

    tmpdir = Path(tempfile.mkdtemp(prefix="resume_compile_"))
    try:
        tex_path = tmpdir / "resume.tex"
        tex_path.write_text(latex_code, encoding="utf-8")

        cmd = [
            "pdflatex",
            "-interaction=nonstopmode",
            "-halt-on-error",
            f"-output-directory={tmpdir}",
            str(tex_path),
        ]

        last_result: Optional[subprocess.CompletedProcess[str]] = None
        for _ in range(2):  # Run twice for stable refs
            try:
                last_result = subprocess.run(
                    cmd,
                    capture_output=True,
                    text=True,
                    timeout=PDFLATEX_TIMEOUT,
                    cwd=str(tmpdir),
                )
            except subprocess.TimeoutExpired:
                return None, f"pdflatex timed out after {PDFLATEX_TIMEOUT}s"

        pdf_path = tmpdir / "resume.pdf"
        if last_result and last_result.returncode == 0 and pdf_path.exists():
            return pdf_path.read_bytes(), None

        # Extract the most relevant error lines from pdflatex stdout
        output = (last_result.stdout if last_result else "") + "\n"
        error_lines = [
            line
            for line in output.splitlines()
            if line.startswith("!") or "Error" in line or "l." in line
        ]
        error_summary = "\n".join(error_lines[:30]) or "Unknown pdflatex error"
        return None, error_summary

    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


async def compile_with_retry(
    parsed: ParsedResume,
    modified_sections: dict[str, str],
    ai_fix_fn: Callable[[str, str, str], Awaitable[str]],
    max_retries: int = 2,
) -> tuple[Optional[bytes], str, int]:
    """
    Stitch sections, compile, and retry on compilation failure by feeding errors to AI.

    Args:
        parsed:            The ParsedResume object (will be mutated with modified_sections).
        modified_sections: Dict of section_name → new section body to apply.
        ai_fix_fn:         Async callable(section_name, broken_body, error) → fixed_body.
        max_retries:       How many times to retry after failure.

    Returns:
        (pdf_bytes_or_None, final_latex_str, retry_count)
    """
    # Apply the initial modifications
    for name, body in modified_sections.items():
        parsed.sections[name] = body

    retry_count = 0

    for attempt in range(max_retries + 1):
        latex = stitch_latex(parsed)
        pdf_bytes, error = compile_latex(latex)

        if pdf_bytes is not None:
            return pdf_bytes, latex, retry_count

        if attempt < max_retries and error:
            # Don't retry for infrastructure errors (pdflatex not installed, timeout)
            # Only retry for actual LaTeX syntax/compilation errors
            infrastructure_errors = ("pdflatex not found", "timed out", "not found")
            if any(msg in error for msg in infrastructure_errors):
                break  # No point retrying — this is an env issue, not a LaTeX issue

            # Ask AI to fix each modified section individually
            for section_name in list(modified_sections.keys()):
                broken_body = parsed.sections[section_name]
                try:
                    fixed_body = await ai_fix_fn(section_name, broken_body, error)
                    modified_sections[section_name] = fixed_body
                    parsed.sections[section_name] = fixed_body
                except Exception:
                    pass  # If AI fix also fails, keep the broken body and let next attempt handle it
            retry_count += 1

    # All retries exhausted — return None PDF but keep the last LaTeX so user can see what was generated
    return None, stitch_latex(parsed), retry_count
