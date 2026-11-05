"""Read the knowledge base (kb.md) and small helpers around KB-generated resumes."""

import re
import zlib
from typing import Optional

from utils.config import get_settings

ENTRY_ID = re.compile(r"^### \[([a-z]+)-[a-z0-9-]+\]", re.MULTILINE)
KB_IDS_LINE = re.compile(r"^%\s*kb-ids:\s*(.*)$", re.MULTILINE)
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


def load_kb() -> str:
    """kb.md as the AI sees it: template guidance comments removed, blank runs collapsed."""
    path = get_settings().kb_path
    if not path.exists():
        raise KBNotFoundError(f"Knowledge base not found at {path}. Set KB_PATH in .env.")
    text = HTML_COMMENT.sub("", path.read_text(encoding="utf-8"))
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def kb_status() -> dict:
    """Summary for the UI: where the KB is, how many entries of each kind, last update."""
    path = get_settings().kb_path
    if not path.exists():
        return {"path": str(path), "found": False}

    text = load_kb()
    counts = {section: 0 for section in PREFIX_SECTIONS.values()}
    for prefix in ENTRY_ID.findall(text):
        if prefix in PREFIX_SECTIONS:
            counts[PREFIX_SECTIONS[prefix]] += 1
    updated = re.search(r"^- last_updated:\s*(\S+)", text, re.MULTILINE)

    return {
        "path": str(path),
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
