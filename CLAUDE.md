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
- `.env` at repo root with `GROQ_API_KEY` (required) and `OPENROUTER_API_KEY` (optional fallback)

## Architecture

Two-process app: a **FastAPI backend** (`backend/`) and a **React/Vite frontend** (`frontend/`). There is no shared code between them.

### Backend data flow

```
POST /api/modify
  → routers/modify.py        — validates request, orchestrates pipeline
  → services/latex_service.py::parse_latex()   — splits .tex into preamble + named sections
  → services/ai_service.py::tailor_section() or refine_section()  — calls Groq (primary) or OpenRouter (fallback)
  → services/latex_service.py::compile_with_retry()  — pdflatex × 2 passes, AI fix on error, up to 2 retries
  → returns ModifyResponse (modified_latex + pdf_base64)
```

**LaTeX section model** (`latex_service.py`): `parse_latex()` splits the document at `\section{}` boundaries into a `ParsedResume` dataclass (preamble, `dict[name → body]`, postamble). Only the section bodies are sent to the AI — the preamble and `\end{document}` postamble are never touched. `stitch_latex()` reassembles them.

**AI service** (`ai_service.py`): Uses the `openai` SDK pointed at Groq's OpenAI-compatible endpoint (`llama-3.3-70b-versatile`). On 429 or any error, falls back to OpenRouter (`deepseek/deepseek-r1-0528-qwen3-8b:free`). System prompts are loaded from flat files in `backend/prompts/`. Temperature is 0.3 for tailor, 0.4 for refine, 0.1 for error-fix.

**Routers**:
- `GET /api/health` — checks pdflatex availability
- `POST /api/modify` — tailor or refine mode
- `POST /api/compile` — recompile raw LaTeX to PDF with no AI (used by live-edit in frontend)

### Frontend state flow

`App.tsx` owns all form state. `useModifyResume` (hook) owns async status and response. `OutputPanel` renders the modified LaTeX editor (live-edit) + inline PDF preview. The recompile path hits `POST /api/compile` directly without going through the AI pipeline.

PDF is returned as base64 from the API; the frontend converts it to a blob URL via `URL.createObjectURL` and revokes the previous one on each new result.

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `GROQ_API_KEY` | Yes | Primary AI provider |
| `OPENROUTER_API_KEY` | No | Fallback AI provider when Groq fails/rate-limits |

`get_settings()` in `utils/config.py` is `@lru_cache`d — call it fresh in tests by clearing the cache.
