"""
PDF compilation service: runs pdflatex in a temp directory and returns the PDF bytes.
"""

import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Optional

PDFLATEX_TIMEOUT = 60  # seconds per run


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
            # Note: no -halt-on-error — pdflatex recovers from many warnings/errors
            # and still produces a valid PDF. We check returncode + pdf existence.
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
        # pdflatex exits with code 1 even when a PDF is produced (due to non-fatal errors).
        # We treat PDF existence as the real success signal — the same behavior as
        # running pdflatex manually in nonstopmode.
        if pdf_path.exists() and pdf_path.stat().st_size > 1000:
            return pdf_path.read_bytes(), None

        # No PDF produced — extract the most relevant error lines from pdflatex stdout
        output = (last_result.stdout if last_result else "") + "\n"
        error_lines = [
            line
            for line in output.splitlines()
            if line.startswith("!") or "Error" in line
        ]
        error_summary = "\n".join(error_lines[:30]) or "Unknown pdflatex error"
        return None, error_summary

    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)
