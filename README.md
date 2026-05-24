# Resume Modifier 📄

AI-powered LaTeX resume tailoring and refinement tool.

## Modes

### 🎯 Mode 1 — Tailor to Job Description
Paste your LaTeX resume + a job description. AI rewrites your bullet points to emphasize relevant keywords, skills, and experience. Choose which sections to tailor.

### ✏️ Mode 2 — Add / Update Content
Add a new job, project, or skills to your resume. Provide raw notes; AI generates professionally worded bullet points in the correct LaTeX format.

## Tech Stack
- **Backend**: Python + FastAPI
- **AI**: Groq API (llama-3.3-70b-versatile) — free tier
- **PDF**: Local pdflatex (TeX Live)
- **Frontend**: React + Vite + TypeScript

## Setup

### Prerequisites
```bash
# Install TeX Live (required for PDF generation)
brew install --cask mactex-no-gui

# Add to PATH (add to ~/.zshrc or ~/.bashrc)
export PATH="/Library/TeX/texbin:$PATH"
```

### Backend
```bash
python3 -m venv backend/venv
source backend/venv/bin/activate
pip install -r backend/requirements.txt

# Copy and fill in your API key
cp .env.example .env
# Edit .env: set GROQ_API_KEY=your_key_here
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

- `GET /api/health` — Check server + pdflatex availability
- `POST /api/modify` — Tailor or refine a resume
- Swagger docs at: **http://localhost:8000/docs**

## Getting a Free Groq API Key
1. Go to https://console.groq.com
2. Sign up (free)
3. Create an API key
4. Add to `.env` as `GROQ_API_KEY=gsk_...`

Free tier: 14,400 requests/day, 6,000 tokens/minute — plenty for personal use.