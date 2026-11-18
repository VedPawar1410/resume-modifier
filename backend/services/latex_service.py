"""
PDF compilation service: runs pdflatex in a temp directory and returns the PDF bytes.
"""

import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Optional

PDFLATEX_TIMEOUT = 60  # seconds per run

# ── Sandbox ──────────────────────────────────────────────────────────────────
# The editor sends any LaTeX the user types, and LaTeX can read files by path
# (\input{/proc/1/environ} would print the server's API keys into the PDF). TeX Live's
# openin_any=p does NOT stop absolute-path reads in TL 2026 (tested), so isolation is
# done by the operating system instead:
#   1. pdflatex gets a minimal environment — no API keys, tokens or database URL.
#   2. In the container (running as root, Linux), pdflatex runs as `nobody` via setpriv,
#      so it can't read the API process's environment (/proc/1/environ is root-only).
#   3. Shell escape is off, and writes stay in the temp folder (openout_any=p).
# Secrets never live in files the app writes (the KB is fetched into memory).
NOBODY_UID = 65534
SANDBOX_ENV = {
    "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
    "LANG": "C.UTF-8",
    "openin_any": "p",
    "openout_any": "p",
    "shell_escape": "f",
}


def _drop_privileges() -> bool:
    """True when we can run pdflatex as an unprivileged user (root in a Linux container)."""
    return hasattr(os, "geteuid") and os.geteuid() == 0 and shutil.which("setpriv") is not None


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

        prefix: list[str] = []
        if _drop_privileges():
            # `nobody` must be able to write its output into the temp folder.
            os.chown(tmpdir, NOBODY_UID, NOBODY_UID)
            os.chown(tex_path, NOBODY_UID, NOBODY_UID)
            prefix = ["setpriv", f"--reuid={NOBODY_UID}", f"--regid={NOBODY_UID}",
                      "--clear-groups", "--no-new-privs"]

        cmd = [
            *prefix,
            "pdflatex",
            "-interaction=nonstopmode",
            # Note: no -halt-on-error — pdflatex recovers from many warnings/errors
            # and still produces a valid PDF. We check returncode + pdf existence.
            "-no-shell-escape",  # \write18 can't run shell commands
            tex_path.name,  # relative: paranoid mode below rejects absolute paths
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
                    env={**SANDBOX_ENV, "HOME": str(tmpdir)},
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
