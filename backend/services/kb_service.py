"""Read the knowledge base (kb.md) and small helpers around KB-generated resumes."""

import re
import time
import zlib
from typing import Optional

import httpx

from utils.config import get_settings

ENTRY_ID = re.compile(r"^### \[([a-z]+)-[a-z0-9-]+\]", re.MULTILINE)
KB_IDS_LINE = re.compile(r"^%\s*kb-ids:\s*(.*)$", re.MULTILINE)
TITLE_LINE = re.compile(r"^%\s*title:\s*(.+)$", re.MULTILINE)
HTML_COMMENT = re.compile(r"<!--.*?-->", re.DOTALL)
PAGES_COUNT = re.compile(rb"/Type\s*/Pages\b.*?/Count\s+(\d+)", re.DOTALL)

PREFIX_SECTIONS = {
    "exp": "experience",
    "proj": "projects",
    "edu": "education",
    "cert": "certifications",
    "ach": "achievements",
    "lead": "leadership",
}


class KBNotFoundError(Exception):
    pass


# Deployed, kb.md is read from the private GitHub repo (it never lives on the server's disk).
# A short cache keeps the status call and the generate call from fetching twice, while a
# push to the KB repo still shows up within a minute.
GITHUB_CACHE_SECONDS = 60
_github_cache: dict[str, tuple[float, str]] = {}


def _kb_source() -> str:
    s = get_settings()
    return f"github:{s.kb_github_repo}/kb.md" if s.kb_github_repo else str(s.kb_path)


def _read_raw_kb() -> str:
    """kb.md exactly as stored — from GitHub when KB_GITHUB_REPO is set, else from KB_PATH."""
    s = get_settings()
    if not s.kb_github_repo:
        if not s.kb_path.exists():
            raise KBNotFoundError(f"Knowledge base not found at {s.kb_path}. Set KB_PATH in .env.")
        return s.kb_path.read_text(encoding="utf-8")

    cached = _github_cache.get(s.kb_github_repo)
    if cached and time.monotonic() - cached[0] < GITHUB_CACHE_SECONDS:
        return cached[1]
    try:
        response = httpx.get(
            f"https://api.github.com/repos/{s.kb_github_repo}/contents/kb.md",
            headers={
                "Authorization": f"Bearer {s.github_token}",
                "Accept": "application/vnd.github.raw+json",  # file contents, not JSON metadata
                "X-GitHub-Api-Version": "2022-11-28",
            },
            timeout=10,
        )
    except httpx.HTTPError as e:
        raise KBNotFoundError(f"Couldn't reach GitHub for the knowledge base: {e}") from e
    if response.status_code != 200:
        # 404 also means "token can't see the repo" — GitHub hides private repos that way.
        raise KBNotFoundError(
            f"GitHub returned {response.status_code} for {s.kb_github_repo}/kb.md — "
            "check KB_GITHUB_REPO and that GITHUB_TOKEN can read that repo's contents."
        )
    _github_cache[s.kb_github_repo] = (time.monotonic(), response.text)
    return response.text


def load_kb() -> str:
    """kb.md as the AI sees it: template guidance comments removed, blank runs collapsed."""
    text = HTML_COMMENT.sub("", _read_raw_kb())
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def kb_status() -> dict:
    """Summary for the UI: where the KB is, how many entries of each kind, last update."""
    try:
        text = load_kb()
    except KBNotFoundError as e:
        return {"path": _kb_source(), "found": False, "error": str(e)}

    counts = {section: 0 for section in PREFIX_SECTIONS.values()}
    for prefix in ENTRY_ID.findall(text):
        if prefix in PREFIX_SECTIONS:
            counts[PREFIX_SECTIONS[prefix]] += 1
    updated = re.search(r"^- last_updated:\s*(\S+)", text, re.MULTILINE)

    return {
        "path": _kb_source(),
        "found": True,
        "entry_count": sum(counts.values()),
        "entries_by_section": counts,
        "last_updated": updated.group(1) if updated else None,
    }


def extract_kb_ids(latex: str) -> list[str]:
    """IDs from the '% kb-ids: ...' line the model writes at the top of the resume."""
    match = KB_IDS_LINE.search(latex)
    if not match:
        return []
    return [i.strip() for i in match.group(1).split(",") if i.strip()]


def extract_title(latex: str) -> Optional[str]:
    """'Company — Role' from the '% title: ...' line the model writes at the top."""
    match = TITLE_LINE.search(latex)
    if not match:
        return None
    # The model sometimes writes LaTeX dashes ("---") in the comment; show a real em dash.
    title = match.group(1).strip().replace("---", "—").replace(" -- ", " — ")
    return title[:120]


def lost_content(before: str, after: str) -> bool:
    """
    True if an AI repair pass gutted the resume: a core section vanished or more than half
    the bullets did. (A "fix" that deletes the broken parts still compiles — reject it.)
    """
    def sections(t: str) -> set[str]:
        return set(re.findall(r"\\section\{([^}]*)\}", t))

    def bullets(t: str) -> int:
        return len(re.findall(r"\\resumeItem\s*\{", t))

    core = {"Education", "Technical Skills", "Experience"} & sections(before)
    return not core <= sections(after) or bullets(after) < bullets(before) / 2


def count_pdf_pages(pdf_bytes: bytes) -> Optional[int]:
    """
    Page count of a pdflatex PDF. pdfTeX stores the page tree inside compressed object
    streams, so decompress each stream and look for the /Pages node's /Count.
    """
    for match in re.finditer(rb"stream\r?\n(.*?)\r?\nendstream", pdf_bytes, re.DOTALL):
        try:
            data = zlib.decompress(match.group(1))
        except zlib.error:
            continue
        if count := PAGES_COUNT.search(data):
            return int(count.group(1))
    count = PAGES_COUNT.search(pdf_bytes)  # uncompressed PDFs
    return int(count.group(1)) if count else None
