# Resume Modifier 📄

Generates a job-tailored, one-page LaTeX résumé from a personal **knowledge base**.

Instead of tailoring one fixed base résumé, you keep everything about your work — every job,
project (working or not), skill, certification and achievement — in one structured Markdown file
(`kb.md`). Paste a job description and the AI picks the most relevant entries and writes a
one-page résumé, using only facts from the knowledge base.

## How it works

1. **Knowledge base** — `kb.md` follows a strict format (entries with permanent IDs, results tagged
   `exact` / `approx` / `estimate`, project status, skill levels with evidence). It lives in a
   separate private repo, next to this one.
2. **Generate** — `POST /api/generate-from-kb` sends the KB, the job description and a LaTeX
   template to Claude, which returns a complete résumé. Line 1 lists the KB entry IDs it used,
   so every bullet can be traced back to a fact.
3. **Compile & repair** — pdflatex builds the PDF. If it fails to compile, the AI fixes it once;
   if it spills past one page, the AI trims it once. A repair that drops content is rejected.
4. **Edit** — the result opens in a live LaTeX editor with PDF preview, and is saved to history.

## Tech Stack
- **Backend**: Python + FastAPI, SQLite (history)
- **AI**: Claude (`claude-haiku-5-5` by default) via Anthropic's OpenAI-compatible endpoint, with
  Groq and OpenRouter as optional fallbacks — all through the `openai` SDK
- **PDF**: Local pdflatex (TeX Live)
- **Frontend**: React + Vite + TypeScript, CodeMirror

## Setup

### Prerequisites
```bash
# Install TeX Live (required for PDF generation)
brew install --cask mactex-no-gui

# Add to PATH (add to ~/.zshrc or ~/.bashrc)
export PATH="/Library/TeX/texbin:$PATH"
```

### Knowledge base
Clone or create your knowledge-base repo next to this one so that `../resume-knowledge-base/kb.md`
exists, or set `KB_PATH` in `.env`.

### Backend
```bash
python3 -m venv backend/venv
source backend/venv/bin/activate
pip install -r backend/requirements.txt

# Copy and fill in your API key
cp .env.example .env
# Edit .env: set ANTHROPIC_API_KEY
```

### Frontend
```bash
cd frontend
npm install
```

## Running

**Terminal 1 — Backend:**
```bash
cd backend
source venv/bin/activate
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

**Terminal 2 — Frontend:**
```bash
cd frontend
npm run dev
```

Open **http://localhost:5173**

## API

- `GET /api/health` — server + pdflatex availability
- `GET /api/kb` — knowledge-base status (entry counts, last updated)
- `POST /api/generate-from-kb` — generate a résumé for a job description
- `POST /api/compile` — compile LaTeX to PDF (no AI; used by the live editor)
- `/api/history` — saved résumés
- Swagger docs at: **http://localhost:8000/docs**

## Cost
About half a US cent per résumé on `claude-haiku-5-5` (~9k input tokens, ~7.5k output tokens
including the model's thinking).
