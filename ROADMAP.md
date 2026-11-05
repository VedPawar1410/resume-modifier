# Roadmap & checklist

One place for everything planned, so nothing gets lost in long chats. Tick items as they're done
(`[x]`), strike ones we drop (`~~like this~~`), and add new ones at the bottom of their section.
Last updated: 2026-11-05.

---

## 👤 For Ved (you)

In rough order — the first three make the biggest difference to résumé quality.

- [ ] **Rotate the Claude API key.** It was pasted in chat. Revoke it in the Claude Console, create a
      new one, put it in `.env` as `ANTHROPIC_API_KEY=…`, restart the backend.
- [ ] **Add your projects to the knowledge base** (currently 0 — about a third of each page is empty).
      In a Claude Code session (any folder): *"add the projects from
      `~/ai/resume-knowledge-base/sources/` to my KB"*. Those files (your old base résumés + sample
      résumé) contain e.g. the long-term-memory AI agent and the real-time vision / surveillance project.
- [ ] **Link your GitHub repos.** *"add my GitHub repos to my KB"* → the skill lists your repos and asks
      which to ingest. Answer its questions about results/numbers — that's where the value is.
- [ ] **Fill the gaps the generator relies on:**
  - [ ] Results with numbers on each entry, tagged `exact` / `approx` / `estimate`.
  - [ ] Testing experience (your old base had Pytest bullets — the KB has none yet).
  - [ ] `Targeting` section: `roles_i_want`, `seniority`, `always_include`, `never_include`, `avoid_claiming`.
  - [ ] `summary` lines for the 3 certifications that have none (`python3 scripts/check_kb.py` lists them).
  - [ ] `Headlines` for each role you target (AI engineer, backend, …).
- [ ] **Tidy history.** Old entries are labelled "Sample JD attached below…" / "… · Nov 5 2026" (from
      before the AI titles existed) — rename or delete them in the sidebar.
- [ ] **Manual test pass** once projects are in: generate for 3–5 real JDs, check every bullet against
      the KB, and write anything odd under *Known issues* below.
- [ ] **Fix git push over SSH** for this repo (GitHub currently rejects your SSH key). Either add the key
      to GitHub, or switch to HTTPS once:
      `git remote set-url origin https://github.com/VedPawar1410/resume-modifier.git`
- [ ] **Decide on deployment** when you want to use the app away from this laptop (see *Build* §5).

---

## ✅ Done

- [x] Knowledge-base format (`TEMPLATE.md`) + private repo `VedPawar1410/resume-knowledge-base`
- [x] `kb-ingest` Claude Code skill (preview → approve → `check_kb.py` → commit → push)
- [x] v1 generator: whole KB + JD → Claude Haiku 5.5 → LaTeX → PDF, one page enforced, AI fix/trim
      passes with a guard against gutted output, `% kb-ids` traceability, Groq/OpenRouter fallbacks
- [x] Removed the base-résumé flow and its leftovers (code, deps, sample résumé moved to the private repo)
- [x] Prompt fixes: numbers stated once; "how you know" notes never printed
- [x] UI redesign: light "editorial paper" theme, no top bar, compose → result flow, staged loader
- [x] Sidebar: grouped by day, AI "Company — Role" titles, rename, delete with confirm, New résumé
- [x] Split editor: PDF left / LaTeX right, live preview, autosave + ⌘S, line-wrap toggle
- [x] Full Chrome PDF viewer (zoom, fit, print) in a framed pane
- [x] Generating screen: rotating motivation lines + Cancel (stops the streamed AI call, saves nothing)

---

## 🛠️ Build next (Claude) — in this order

1. [ ] **Quality pass once the KB has projects.** Re-run the 4 sample JDs; check Projects selection
       (2–4 relevant ones), skills ordering, headline choice. Tune `kb_generate_system.txt`.
2. [ ] **Match report** — phase 1 of the skill-gap idea: per résumé, which JD requirements you covered,
       had but left out, had weakly, or are missing. Full design:
       [docs/ideas/skill-gap-insights.md](docs/ideas/skill-gap-insights.md).
       Needs: store the **full JD** with each history entry (today only the first 100 chars are kept).
3. [ ] **v2 two-stage pipeline (select → write).**
       Stage 1 sends the JD + a compact index of KB entries (ID + one-line `summary` + tags) and returns
       JSON picks with reasons — you can tick/untick picks before writing. Stage 2 writes LaTeX from only
       the picked entries' full detail. Why: fewer tokens as the KB grows, you control what's selected,
       less chance of mixing facts between entries, and the match report falls out of Stage 1 for free.
4. [ ] **Open in Overleaf** button (from the old to-do list) — send the current LaTeX to Overleaf.
5. [ ] **Deployment** (free tier). Vercel can host only the frontend; the backend needs TeX Live, so it
       goes in a Docker container on Google Cloud Run / Render / HF Spaces. Also needed: a password gate
       (API spend + personal data), fetching `kb.md` from the private repo with a GitHub token, and a
       hosted Postgres (Supabase/Neon) for history because free hosts wipe SQLite.
6. [ ] **Skill-gap insights page** — phases 2–3 of the idea doc (top missing skills, trends, role types).
7. [ ] **LaTeX auto-formatting** (old to-do): normalise spacing between headings/subheadings/lines so every
       résumé has the same rhythm (could be a deterministic formatter, no AI needed).

---

## 💡 Ideas parking lot (not scheduled)

- **Browser-extension "apply" flow** (from the old to-do list): on a job page, grab the JD (scrape or
  paste) in a side panel, run our pipeline in the background, and drop the PDF into Downloads — no need
  to open the app. Explicitly *later*, after the basics are solid.
- **Auto-save PDFs** to a chosen local folder (e.g. `~/Documents/Resumes/<company>.pdf`).
- **Application tracker** — log company, role, date, résumé used (Google Sheets or an in-app table).
  Pairs naturally with the match report.
- **Model A/B** — Haiku 5.5 vs Sonnet 5.5 (~9¢/résumé) on the same JD when quality matters.
- **History search / filter** once the list grows.
- **Show the JD next to the résumé** in the result view (needs the full JD stored — see Build §2).
- **Local model (Ollama)** — rejected for now (M1 16 GB: slow, weaker, truncation risk). Revisit only if
  privacy becomes a hard requirement.
- ~~Dark mode~~ — light-only chosen on 2026-11-05.
- ~~Base résumés / tailor / refine~~ — replaced by the knowledge base on 2026-11-05.

---

## ⚠️ Known issues & notes

- Chrome's PDF viewer shows its grey background for ~1s while a new PDF loads.
- Cancel stops the output, but the input tokens (KB + JD) are already billed once the request starts.
- Long experience headings can run past the right margin (e.g. "Google Cloud Computing Foundations
  Program (via VIT, for college credit)" pushes its date off the page) — prompt should keep titles short.
- The generating steps advance on typical timings — the backend doesn't stream real progress.
- Groq's free tier (8k tokens/min) can't take a full-KB prompt, so the fallback only helps for short JDs.
- Haiku 5.5 rejects `temperature` and spends hidden thinking tokens (output cap is 16k) — see `CLAUDE.md`.
- Each history entry stores only the first 100 characters of its JD.

## 🧭 Decisions log

| Date | Decision | Why |
|---|---|---|
| 2026-11-05 | Knowledge base instead of base résumés | The AI can only choose what it can see |
| 2026-11-05 | KB in a separate **private** repo | This repo is public |
| 2026-11-05 | Claude Haiku 5.5 as primary model | ~½¢ per résumé, large context; quality checked on 4 JDs |
| 2026-11-05 | Single-call v1, two-stage later | Ship first, optimise once the KB is large |
| 2026-11-05 | Light theme, two-step layout (Option A), no top bar | Ved's choice after Canva wireframes |
