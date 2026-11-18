# Roadmap & checklist

One place for everything planned, so nothing gets lost in long chats. Tick items as they're done
(`[x]`), strike ones we drop (`~~like this~~`), and add new ones at the bottom of their section.
Last updated: 2026-11-18.

**Two tracks, in this order:**
1. **Track A — Ved's personal tool.** Done = you can open it from any device, paste a JD and get a
   résumé you'd send without edits. Then you go apply for jobs and stop worrying about this.
2. **Track B — the product for everyone** (name, landing page, accounts, in-app knowledge base). Built
   on the side, after Track A is done.

---

## 👤 For Ved (you)

- [x] **Rotate the Claude API key.**
- [x] **Add your projects to the knowledge base** — 15 projects now (was 0).
- [x] **Link your GitHub repos** — every relevant repo ingested.
- [x] **Fill the gaps the generator relies on** — results, testing, Targeting, cert summaries, Headlines
      (Headlines + Targeting written by Claude from the KB on 2026-11-18, reviewed by you).
- [x] **Tidy history.**
- [x] **Fix `git push` for this repo** (now HTTPS).
- [x] **Decide on deployment** — option A (see *Track A* §4).
- [x] **Pick a product name** — **Sourced** (2026-11-18): it names what's different, the knowledge base.
- [x] **Set up the accounts for deployment** — Neon, GitHub KB token, Azure, Vercel (2026-11-18).
- [ ] **Let Vercel see this repo** (for frontend auto-deploys): GitHub → Settings → Applications →
      Vercel → Configure → Repository access → add `resume-modifier`. Then tell Claude to connect it.
- [ ] **First real use on the live site** — sign in, generate a résumé for a real JD. This is also the
      manual test pass: Claude can check every bullet against the KB afterwards.
- [ ] **Manual test pass** after v2 lands (Track A §2): generate for 3–5 real JDs you'd apply to, check
      every bullet against the KB, write anything odd under *Known issues*.
- [ ] Two open KB questions (optional): how many people you showed Narrate to; the VIT course name for
      the wearable-sensor project.

---

## 🅰️ Track A — your personal tool (do first)

1. [x] **Quality pass, round 1 (2026-11-18)** — measured the full-KB pipeline on 2 sample JDs and fixed
       what it showed (see *Metrics*): headline overflow, mixed date styles, wrong quote marks, a
       mis-stated eval result, `---` in history titles, output cap too close (16k → 32k), irrelevant
       experience now shrinks to one line, trim pass told to cut the minimum.
2. [ ] ~~Before deploying~~ → **deferred (2026-11-18)**: at ~1.5–2¢ per résumé and good selection in the
       quality pass, v1 is fine for personal use. **Build v2 when** the prompt nears ~90K tokens (the
       `AI usage:` log shows `input=`), or selection quality drops. Moved to Track B.
       **v2 two-stage pipeline (select → write)** — design kept here:
       - Stage 1 (pick): the model sees a compact index of every entry (ID, title, summary, tags, Results
         lines) plus the JD, and returns the entries to use with a reason each.
       - Stage 2 (write): the model writes the résumé from the **full text** of the picked entries — never
         from summaries — so no metric or detail can be lost.
       - Safety net for "summaries can miss things": Stage 1 sees every entry's Results lines, picks a few
         extra candidates, and always-include entries skip selection.
       - Proven, not assumed: run v1 and v2 on the same JDs and compare selection, page fill and cost
         before switching.
3. [x] **Store the full JD** with each history entry (new `job_description` column; older entries keep
       only their 100-character preview).
4. [x] **Deploy for yourself (option A)** — **live 2026-11-18** at https://sourced-orcin.vercel.app
       (API: sourced-api in `sourced-rg`, sharing `equiptrack-env`; GitHub → Azure deploys verified
       end to end). Left: let Vercel's GitHub app see this repo so frontend pushes auto-deploy. The setup:
       - API + TeX Live in one Docker image → Azure Container Apps (scale to zero, free monthly grant).
       - Frontend → Vercel. History → Neon Postgres (free hosts wipe SQLite).
       - `kb.md` fetched from your private repo with a read-only GitHub token.
       - A password gate (your API credit and personal data are behind it).
       - **Locked-down LaTeX compiling** first: no shell escape, no reading files outside the work
         folder, time and memory limits — the editor sends any LaTeX to the server.
       - CI/CD: deploy after tests pass, like EquipTrack.
5. [ ] **Nice for applying (optional):** match report (which JD skills you covered / left out / lack —
       [docs/ideas/skill-gap-insights.md](docs/ideas/skill-gap-insights.md)), Open in Overleaf button.

       Built so far: Dockerfile (TeX Live basic + template packages, 693 MB), password gate + login
       screen, Neon support, KB read from GitHub, LaTeX sandbox (leak test: blocked), CI + Deploy
       workflows, [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

**→ Track A is done when 1, 3 and 4 are ticked and your manual test pass looks good.**

---

## 🅱️ Track B — the product for everyone (after Track A)

1. [ ] **Name: Sourced** (chosen 2026-11-18). Done: app brand, page title, API title, image name
       `sourced-api`. Left: buy a domain (sourcedcv.com was free on 2026-11-18 — your purchase), rename
       the GitHub repo (`resume-modifier` → e.g. `sourced`; update the OIDC subject in DEPLOYMENT.md §5
       if you do), a tagline for the landing page.
1b. [ ] **v2 two-stage pipeline** — see Track A §2 for the design and when to build it.
2. [ ] **Landing page** — same light editorial look, bolder: hero where KB cards fly into a résumé that sets
       itself line by line; 3-step "how it works"; feature blocks (no invented facts, always one page,
       LaTeX editor, match report); scroll animations; before/after résumé with **synthetic data only**.
       Decide then: route in this app vs separate Next.js site (SEO).
3. [ ] **In-app knowledge-base builder** — the biggest gap between "my tool" and "a product": other people
       have no `kb.md` or Claude Code. Upload an old résumé / LinkedIn export / GitHub link → AI drafts
       entries → user reviews and edits them in the app.
4. [ ] **Accounts** — sign-in, a KB and history per user, privacy policy (résumés are personal data).
5. [ ] **Per-job controls** — from Ved's idea: on each résumé, toggle an entry between *always include*,
       *one line only* and *hide*, instead of editing the KB.
6. [ ] **Usage limits, then billing** — per-user caps so API spend can't run away.
7. [ ] **Skill-gap insights page** — phases 2–3 of the idea doc (top missing skills, trends, role types).
8. [ ] **LaTeX auto-formatting** — normalise spacing so every résumé has the same rhythm.
9. [ ] **Scale hosting** when traffic needs it (more replicas / a bigger plan) — decide at that point.

---

## ✅ Done

- [x] Knowledge-base format (`TEMPLATE.md`) + private repo `VedPawar1410/resume-knowledge-base`
- [x] `kb-ingest` Claude Code skill (preview → approve → `check_kb.py` → commit → push)
- [x] v1 generator: whole KB + JD → Claude Haiku 5.5 → LaTeX → PDF, one page enforced, AI fix/trim
      passes with a guard against gutted output, `% kb-ids` traceability, Groq/OpenRouter fallbacks
- [x] Removed the base-résumé flow and its leftovers
- [x] Prompt fixes: numbers stated once; "how you know" notes never printed
- [x] UI redesign: light "editorial paper" theme, no top bar, compose → result flow, staged loader
- [x] Sidebar: grouped by day, AI "Company — Role" titles, rename, delete with confirm, New résumé
- [x] Split editor: PDF left / LaTeX right, live preview, autosave + ⌘S, line-wrap toggle
- [x] Full Chrome PDF viewer (zoom, fit, print) in a framed pane
- [x] Generating screen: rotating motivation lines + Cancel (stops the streamed AI call, saves nothing)
- [x] KB review pass (2026-11-18): Headlines incl. AI Agents, Targeting, cert dates, leadership entries
- [x] Token + cost logging on every AI call (`AI usage:` lines in the backend log)
- [x] Relevance-sized experience: always-include entries that don't fit the job shrink to one line

---

## 📏 Metrics

Quality pass round 1 — full KB (~68K tokens), Claude Haiku 5.5, 2026-11-18:

| Run | Input tokens | Output tokens | Cost | Time | Pages | Repairs |
|---|---|---|---|---|---|---|
| Ascendion AI Platform Eng. (before fixes) | 73,943 | 14,152 | $0.0145 | 56 s | 1 | 0 |
| Rippling SWE-1 (before fixes) | 74,286 | 9,041 | $0.0119 | 36 s | 1 | 0 |
| Ascendion (after fixes) | 74,126 + 4,890 trim | 14,975 + 5,127 | $0.0180 | 75 s | 1 | 1 trim |
| Rippling (after fixes) | 74,469 | 13,095 | $0.0140 | 51 s | 1 | 0 |

**About 1.5–2¢ per résumé.** Price: $0.10 / $0.50 per million input / output tokens for prompts up to
100K tokens, **5× more above 100K** — the prompt is ~74K today, so ~26K of KB growth hits that cliff.

---

## 💡 Ideas parking lot (not scheduled)

- **Browser-extension "apply" flow**: grab the JD on a job page, run the pipeline, drop the PDF in
  Downloads. Later, after the basics are solid.
- **Auto-save PDFs** to a chosen local folder (e.g. `~/Documents/Resumes/<company>.pdf`).
- **Application tracker** — company, role, date, résumé used. Pairs with the match report.
- **Model A/B** — Haiku 5.5 vs Sonnet 5.5 on the same JD when quality matters.
- **Prompt caching** — the KB is identical on every call, so caching it could cut input cost a lot;
  needs Anthropic's own SDK (a new dependency) instead of the OpenAI-compatible endpoint.
- **History search / filter** once the list grows.
- **Show the JD next to the résumé** (needs the full JD stored — Track A §3).
- **Local model (Ollama)** — rejected for now (M1 16 GB: slow, weaker, truncation risk).
- ~~Dark mode~~ — light-only chosen on 2026-11-05.
- ~~Base résumés / tailor / refine~~ — replaced by the knowledge base on 2026-11-05.

---

## ⚠️ Known issues & notes

- The trim pass over-cut once (dropped a project, left ~20% of the page empty); its prompt now asks for
  the minimum cut — not yet re-verified.
- Experience order slipped once (GM listed above the later Google program) — watch in the manual pass.
- Test résumés from the quality pass are in history (Ascendion ×2, Rippling ×2) — delete when done.
- Chrome's PDF viewer shows its grey background for ~1s while a new PDF loads.
- Cancel stops the output, but the input tokens (KB + JD) are already billed once the request starts.
- The generating steps advance on typical timings — the backend doesn't stream real progress.
- Groq's free tier (8K tokens/min) can't take a full-KB prompt, so the fallback can't cover Claude now.
- Haiku 5.5 rejects `temperature` and spends hidden thinking tokens (output cap 32K) — see `CLAUDE.md`.
- Each history entry stores only the first 100 characters of its JD.

## 🧭 Decisions log

| Date | Decision | Why |
|---|---|---|
| 2026-11-05 | Knowledge base instead of base résumés | The AI can only choose what it can see |
| 2026-11-05 | KB in a separate **private** repo | This repo is public |
| 2026-11-05 | Claude Haiku 5.5 as primary model | ~½¢ per résumé, large context; quality checked on 4 JDs |
| 2026-11-05 | Single-call v1, two-stage later | Ship first, optimise once the KB is large |
| 2026-11-05 | Light theme, two-step layout (Option A), no top bar | Ved's choice after Canva wireframes |
| 2026-11-18 | Personal tool first (Track A), product second (Track B) | Ved needs to start applying |
| 2026-11-18 | Deploy option A: Vercel + Azure Container Apps + Neon | Reuses the EquipTrack setup; $0 at personal use |
| 2026-11-18 | Always include Stackular + GM, sized by relevance | Keeps work history complete without wasting space |
| 2026-11-18 | Headlines include "AI Agents" | Common JD term; backed by the HireLens LangGraph multi-agent prototype |
| 2026-11-18 | ~~Build v2 next~~ → v2 deferred until the prompt nears ~90K tokens | 1.5–2¢/résumé is fine; Ved isn't adding many projects soon |
| 2026-11-18 | Product name: Sourced | Names the real difference — the knowledge base |
| 2026-11-18 | Login = signed bearer token, not a cookie | Vercel and Azure are different domains; cross-site cookies get blocked |
| 2026-11-18 | LaTeX sandboxed at the OS level (`nobody` + minimal env) | TeX's own paranoid mode didn't block absolute-path reads (tested) |
| 2026-11-18 | TeX Live from its installer, not Debian packages | fontawesome5 via Debian pulls ~1 GB of fonts; image is 693 MB |
