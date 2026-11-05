# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Backend
```bash
# Activate virtualenv (required before all backend commands)
source backend/venv/bin/activate

# Run dev server
cd backend && uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Install dependencies
pip install -r backend/requirements.txt
```

### Frontend
```bash
cd frontend && npm run dev        # Dev server at http://localhost:5173
cd frontend && npm run build      # TypeScript check + Vite build
cd frontend && npm run lint       # ESLint
```

### Prerequisites
- **TeX Live** must be installed for PDF generation: `brew install --cask mactex-no-gui`
- `/Library/TeX/texbin` must be in PATH for `pdflatex` to be found
- `.env` at repo root with `ANTHROPIC_API_KEY` (primary), optionally `GROQ_API_KEY` / `OPENROUTER_API_KEY` (fallbacks)
- The knowledge base: private repo `VedPawar1410/resume-knowledge-base` cloned next to this one
  (`../resume-knowledge-base/kb.md`), or `KB_PATH` set in `.env`. **Never copy KB data into this repo — it is public.**

## Architecture

Two-process app: a **FastAPI backend** (`backend/`) and a **React/Vite frontend** (`frontend/`). There is no shared code between them.

Resumes are generated from a **knowledge base** (`kb.md`, a structured Markdown file of all the
candidate's work, kept in a separate private repo with its format contract `TEMPLATE.md` and the
`kb-ingest` Claude Code skill). There are no saved base resumes.

### Backend data flow

```
POST /api/generate-from-kb {job_description}
  → routers/kb.py                         — orchestrates the pipeline, saves the result to history
  → services/kb_service.py::load_kb()     — reads kb.md, strips template guidance comments
  → services/ai_service.py::generate_from_kb()  — KB + JD + LaTeX template → full LaTeX document
  → services/latex_service.py::compile_latex()  — pdflatex × 2 passes
      on compile error → ai_service.fix_document_error()   (one pass)
      on > 1 page      → ai_service.shorten_to_one_page()   (one pass)
      a repair is rejected if kb_service.lost_content() says it dropped core sections/bullets
  → returns KBGenerateResponse (modified_latex, pdf_base64, kb_ids, page_count, model, retry_count)
```

**Prompts** (`backend/prompts/`): `kb_generate_system.txt` holds the selection, no-fabrication and
one-page rules; `kb_resume_template.tex` is the exact preamble/macros plus a placeholder body layout
(placeholders, not real content, so the model can't copy facts that aren't in the KB).

**Traceability**: the model writes `% kb-ids: exp-x, proj-y` as line 1 of the LaTeX — the KB entries
it used. `extract_kb_ids()` parses it; history keeps it because it lives inside the stored LaTeX.

**AI service** (`ai_service.py`): every provider is called through the `openai` SDK (all expose
OpenAI-compatible endpoints). Order: Claude (`KB_MODEL`, default `claude-haiku-5-5`, via
`https://api.anthropic.com/v1/`) → Groq (`openai/gpt-oss-120b`) → OpenRouter (free deepseek).
Gotchas: Claude rejects `temperature` and spends hidden thinking tokens that count as output, so it
gets a 16k output cap; Groq's free tier counts prompt + `max_tokens` against an 8k tokens/min limit,
so a full KB prompt usually exceeds it. A `finish_reason == "length"` response is treated as a failure.

**Page count** (`kb_service.count_pdf_pages`): pdfTeX compresses the page tree into object streams,
so it decompresses streams with zlib to read `/Count`.

**Routers**:
- `GET /api/health` — checks pdflatex availability
- `GET /api/kb` — KB status (found, entry counts by section, last_updated)
- `POST /api/generate-from-kb` — the main pipeline above
- `POST /api/compile` — recompile raw LaTeX to PDF with no AI (used by live-edit in frontend)
- `/api/history…` — list / get LaTeX or PDF / rename / delete saved resumes (`mode="kb"`)

### Frontend state flow

`App.tsx` owns the JD input and KB status. `useGenerateResume` (hook) owns async status and the
result. `KbPanel` shows KB status; `OutputPanel` renders the stats (KB entries used, pages, model),
the live-edit LaTeX editor and inline PDF preview. Recompile hits `POST /api/compile` directly.

PDF is returned as base64 from the API; the frontend converts it to a blob URL via `URL.createObjectURL` and revokes the previous one on each new result.

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Primary AI provider (Claude) |
| `KB_MODEL` | No | Claude model id (default `claude-haiku-5-5`) |
| `KB_PATH` | No | Path to kb.md (default `../resume-knowledge-base/kb.md`) |
| `GROQ_API_KEY` | No | Fallback AI provider |
| `OPENROUTER_API_KEY` | No | Second fallback AI provider |

`get_settings()` in `utils/config.py` is `@lru_cache`d — call it fresh in tests by clearing the cache.
