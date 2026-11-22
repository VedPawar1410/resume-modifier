# Roadmap & checklist

One place for everything planned, so nothing gets lost in long chats. Tick items as they're done
(`[x]`), strike ones we drop (`~~like this~~`), and add new ones at the bottom of their section.
Last updated: 2026-11-18.

**Your live version is protected:** only `main` deploys (Azure + Vercel production). All Track B work
happens on branches and pull requests, which get their own Vercel preview links and never touch
production. A branch merges into `main` only when you say so.

**Order from here:**
1. *Now:* apply for jobs with the live app. Use the match report on applications that matter.
2. *Soon, with you (~1 session):* **KB consistency session** (For Ved) — clears the wording conflicts.
3. *Track B, on branches, in this order:* landing page (§2) → in-app KB builder (§3) → accounts (§4)
   → usage limits (§6) → per-job controls (§5) → insights page (§7); v2 pipeline (§1b) when the
   prompt nears ~90K tokens; domain + repo rename before a public launch (§1).

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
- [x] **Let Vercel see this repo** — connected; pushes to `main` redeploy the frontend (2026-11-18).
- [x] **First real use on the live site** — signed in, generated a résumé in ~1 min (2026-11-18).
      Fixed on the way: the KB token needed **Contents: Read-only**.
- [x] **Manual test pass** (2026-11-18) — Claude generated Ziro Digital (AI/ML mentor) and Eveo AI
      (backend) and checked every bullet against the KB: all ~25 numbers traced to the right entry,
      nothing invented, both one page with no repairs, ~1.3–1.4¢ each.
- [x] **Set the Azure budget alert** (2 min): portal → Cost Management → Budgets → Add, $5/month with
      email alerts at $1 and $5. An alert, not a cap — it tells you before a surprise bill.
- [x] **Calendar reminder:** the GitHub KB token expires in a year — replace it then (DEPLOYMENT.md §2,
      and the `az containerapp secret set` command), or the live app will say the KB isn't found.
- [ ] **KB consistency session (Claude + Ved, later).** Claude does an in-depth pass over `kb.md` for
      conflicting or awkward points; then we clear them one at a time and update the KB together.
      Found so far in the test pass:
  - [ ] `exp-stackular`: "Led a 4-member team (with our junior team)" is copied word for word and reads
        oddly → reword (e.g. "including junior developers") once Ved confirms the meaning.
  - [ ] `exp-general-motors`: a bullet says "Coded and maintained data pipelines" (LinkedIn) but its
        note says "frame as learning and assisting" → one résumé said *maintained*, another *helped*.
        Decide which is true and keep only that.
  - [ ] `exp-google-cloud`: role is "Cloud Computing Intern" but the note says present it as a training
        program → put "(training program)" in the role field so every résumé shows it.
  - [ ] Mentoring evidence: no teaching/mentoring line anywhere, so mentor roles can't be matched —
        add one if Ved guided the ATS team's juniors.
  - [ ] Small: AWS appears as a skill from a course only (borderline); "about a couple of months"
        hedges twice.
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
5. [x] **Match report** (2026-11-18) — a *Match report* button on each résumé: every JD requirement in
       one of four buckets (on the résumé / in KB, left out / weak / missing), must-haves marked, the JD
       quote and KB evidence per item, plus advice. On demand (~1.35¢, 30–60 s), then saved with the
       résumé. Invented KB IDs are dropped server-side. Phase 1 of
       [docs/ideas/skill-gap-insights.md](docs/ideas/skill-gap-insights.md).
   ~~Open in Overleaf button~~ → parked (no use case yet; see Ideas).

       Built so far: Dockerfile (TeX Live basic + template packages, 693 MB), password gate + login
       screen, Neon support, KB read from GitHub, LaTeX sandbox (leak test: blocked), CI + Deploy
       workflows, [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
6. [x] **Outreach** (2026-11-18) — an *Outreach* button on each résumé:
       - [x] **Who to contact:** ready-made LinkedIn and Google searches for the company (recruiters,
             hiring managers, people in the role, alumni from your school), plus tips. Links only:
             Sourced never logs in to or scrapes LinkedIn (against its terms).
       - [x] **Messages:** cold email, connection note (300 characters, free accounts 200),
             LinkedIn message / InMail, referral ask. Written from the JD, the résumé and the KB's
             Profile + Targeting only. Each draft is saved with the résumé, editable, copyable.
       - [x] **Free only:** Groq (gpt-oss-120b), then Gemini. Never Claude. ~3.5K tokens per message.
       - [ ] **You:** create a free Gemini key (aistudio.google.com), put `GEMINI_API_KEY` in `.env`,
             and add both keys to Azure ([DEPLOYMENT.md](docs/DEPLOYMENT.md) → *Outreach keys*).
             Until then the live app has no outreach provider.
       - [ ] **Writing standards pass** — tune `backend/prompts/outreach_system.txt` once you've sent
             a few and seen what gets replies.
       - [ ] Later: find work emails (pattern guess, or Hunter/Apollo with a key); mark drafts
             sent / replied (pairs with the application tracker idea).

**→ ✅ Track A is DONE (2026-11-18).** 1, 3 and 4 are ticked and the manual test pass came back
clean. What's left for you is optional (budget alert, KB consistency session, §5 extras).

---

## ⏭️ Next up for your version (noted 2026-11-18 — not started, plan each with Ved first)

1. [x] **Richer projects, denser page (2026-11-19).** Diagnosis: the KB already had the depth
       (64–105 lines per project); the prompt's one-page budget ("3-4 projects × 2-3 bullets") and
       space spent on grouped skills, Certifications and the Google Cloud program squeezed it out.
       - [x] `exp-google-cloud` hidden via `never_include` in the KB (training, not a job).
       - [x] No Certifications section, ever. Skills are one comma-separated run, no categories.
       - [x] Template: 10pt base, bullets 9.5pt on 11.5pt leading (`\bodysize` — the one knob).
       - [x] Prompt: exactly the best 3 projects × 4-5 end-to-end bullets (build → hard part →
             measured result → tested/deployed), relevant experience 4-6 bullets, fill the page,
             never pad. Trim pass keeps all 3 projects and the single skills run.
       - Result: Eveo AI went from Experience 4/1/1 + Projects 3/3/3 to **5/2 + 4/5/4**; Ziro
         **4/2 + 4/4/4**. Both one page, 0 repairs, no Google Cloud/Certifications.
       - [ ] Watch: some bullets wrap by 1-2 words (wasted line), and ML-heavy résumés can end ~10%
             short of the bottom when the KB has fewer facts for those projects.

2. [x] **Job-fit check before generating** (built 2026-11-19) — *Check fit* next to Generate on the
       compose screen: **apply / maybe / skip**, a 0-100 fit score in a ring, and short reasons.
       The JD stays in the box, so "apply" → Generate is one click; on "skip" the button says
       *Generate anyway* (you decide). Editing the JD clears the verdict.
       - **How:** code builds a ~3K-token KB digest (Profile without contact details, Targeting,
         Headlines, skills as "name (level, N uses)", one line per entry); free Groq → Gemini reads
         the JD against it and returns facts as JSON; **code** checks them and decides. ~4.5K input
         + ~0.5-1.3K output tokens, **$0**, 3-8 s. `POST /api/fit-check`, `services/fit_service.py`,
         `prompts/fit_check_system.txt`.
       - **Rules (in `score_fit`):** your experience is fixed at **1 year** (`CANDIDATE_YEARS`).
         Skip = 3+ years asked, a senior title (Senior/Lead/Staff/Principal/Manager/Architect/Head,
         matched in code), or < 40% of must-haves covered. Maybe = 2 years asked, a role outside
         `roles_i_want`, 40-70% coverage, or a screening red flag (degree, clearance…). Apply = ≥ 70
         and none of those. Score = coverage × 70 + role 20 + years 10, capped to agree with the
         verdict. Location never counts against a job (on-site / hybrid / remote all fine).
       - **Kept honest:** role type is judged by meaning (Gen AI = Generative AI); a years claim or
         red flag counts only if its quote is really in the JD; invented KB IDs downgrade a match.
       - **Saved:** nothing for skipped JDs; when you generate after a check, the result is stored
         with the résumé (`fit_check` column). The per-résumé Match report stays the deep audit.
       - Tested: Eveo backend → apply 90-96, "Gen AI Engineer" (2+ yrs) → maybe 69, Ziro mentor →
         maybe 50, a synthetic Staff ML role → skip 0-25.
       - [ ] Watch: two checks within a minute hit Groq's 8K/min limit; the second goes to Gemini
             (needs `GEMINI_API_KEY` on Azure — your Outreach to-do). The model only sees tags, so a
             skill buried in a project's text may show as missing — *Generate anyway* is there.
       - Optional later: paste a *public* careers-page URL (Greenhouse, Lever, Workday…) and Sourced
         fetches the JD — LinkedIn job pages need your login, so those stay copy-paste.
3. [ ] **Professional UI/UX pass** — make the whole app feel like a polished, smooth product:
       layout, typography, spacing, motion, empty/loading/error states, the side panels (editor,
       match report, outreach), and narrow-window behaviour (the result header squeezes when
       the sidebar and a side panel are both open in a narrow window).
4. [x] **Application Q&A** (Ved's idea, 2026-11-18; built 2026-11-22) — a **Q&A** button on each
       résumé (next to Outreach): paste a portal's screening / supplemental question, get an answer to
       copy straight in. Grounded in the JD, this résumé and the KB; if the KB lacks a fact it says so.
       - **How the prompt stays small (approach A):** code sorts the question (short field / why us /
         story / skill / other), picks the KB entries it's about (word overlap with each entry's title,
         tags and summary; ties go to the résumé's `% kb-ids:`; a project the question names always
         wins; or Ved picks one), and keeps only the subsections that type needs ("Bullets I like"
         never goes — it's on the résumé). One free call. ~2.5K tokens for a short field, ~4.5K for
         "why us", ~6-9K for a story / skill. **$0**, 1-20 s.
       - **Groq or Gemini first:** code estimates the prompt; if prompt + 1.5K cap won't fit Groq's
         8K/min it asks Gemini first (stories usually do) instead of spending a call on a sure 429.
         Gemini gets a 4K cap (its hidden thinking counts as output).
       - **Checks in code:** invented KB ids dropped; length counted against the limit (aims 80-95%,
         one rewrite if over); missing facts shown as a warning ("I haven't used Kubernetes yet" —
         tested). A short field whose KB Profile value is empty answers with **no AI call**.
       - **Controls:** type chips (Auto + 5), optional limit in words or characters, "About which
         project", Notes (facts taken as true). Each answer: edit (autosaves), Regenerate (in place),
         Copy, delete, live word/char count, "From your KB: …" sources.
       - **Reuse:** typing a question shows "You answered something similar" from **all** résumés
         (word overlap, no AI) with a Copy button.
       - **Saved:** `qa` column (JSON list). `GET/POST /api/history/{id}/qa`, `POST …/qa/similar`,
         `PATCH/DELETE …/qa/{answer_id}`. `services/qa_service.py`, `prompts/qa_system.txt`.
       - [ ] **You:** add to kb.md Profile (private repo, or via kb-ingest): `work_authorization`
             (still only the template comment), `notice_period`, `earliest_start`, `relocation`,
             `salary_expectation`. Until then those questions say "not in your KB" (or use Notes).
       - [ ] Watch: keyword matching can miss a project whose skill is buried deep in its text — use
             the project picker. Gemini answers took 8-60 s in testing (Groq ~1-3 s).
       - Later: a cover letter could live here.
5. [x] **Outreach: fill the form from a LinkedIn profile** (Ved's idea, 2026-11-18; built 2026-11-19). Two ways to fill
       the recipient fields: type them (today), or **paste the profile**. Open the person's LinkedIn
       profile in your own browser, select all and copy, paste into Sourced, and the AI pulls out
       name, current role and company, the relationship (recruiter / hiring manager / engineer /
       alum — e.g. "Talent Partner" → recruiter), shared school, and one or two true hooks (recent
       post, past company) for the Notes. Free providers; nothing saved but the draft.
       - **Not scraping, deliberately:** having Sourced fetch a profile URL with your logged-in
         LinkedIn session breaks LinkedIn's User Agreement (no bots, scripts or plugins that scrape),
         risks restricting your account (Premium included), and would mean storing your LinkedIn
         session cookie on the server. LinkedIn's official API doesn't give other people's profiles.
       - Later, maybe: a one-click browser extension that sends the profile page you're viewing.
         Still against LinkedIn's terms (they name browser plugins), so only if we accept that risk.
       - **Built:** Outreach → *Recipient: Type it · Paste a LinkedIn profile*.
         `POST /api/history/{id}/outreach/parse-profile`. Code trims LinkedIn's menus, buttons,
         repeated lines and the "People also viewed" sidebar (~8K-character cap), one free AI call
         reads name / current role / relationship / 1-2 hooks, then code checks the facts: your KB
         school in the paste → `alum` + "Also studied at …"; target company missing → a warning.
         Nothing is stored; only lengths are logged. ~800 input tokens per paste.
       - **Own rate-limit bucket, no second account:** free-tier limits are per model, so parsing uses
         `openai/gpt-oss-20b` → `gemini-3.5-flash-lite` (`PROFILE_GROQ_MODEL` / `PROFILE_GEMINI_MODEL`)
         while drafts stay on gpt-oss-120b → Flash. A second Groq account would break Groq's AI policy
         (it bans multiple accounts to exceed limits), and extra keys in one account share a bucket.
       - **DevTools copy considered, rejected:** outerHTML is 10-30× the tokens (hashed class names
         that change each deploy), the page is server-driven UI so the Network JSON describes widgets,
         and a console `copy(main.innerText)` is the same grey area as an extension. ⌘A ⌘C + trimming
         gets the same facts.
       - [ ] Try it on a few real profiles (recruiter, manager, alum) and tune the trim lists if noise
             gets through. LinkedIn's "More → Save to PDF" upload is a possible later input.

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
- **Open in Overleaf** — send the current LaTeX to Overleaf. Parked 2026-11-18: the built-in LaTeX
  editor covers editing; revisit if collaborative editing is ever needed.
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
- Test résumés from the quality pass are in your *local* history only (Ascendion ×2, Rippling ×2,
  Ziro, Eveo) — the live app uses Neon, which starts empty. Delete locally whenever.
- Match reports need the full JD, so résumés made before 2026-11-18 show "generate it again".
- Chrome's PDF viewer shows its grey background for ~1s while a new PDF loads.
- Cancel stops the output, but the input tokens (KB + JD) are already billed once the request starts.
- The generating steps advance on typical timings — the backend doesn't stream real progress.
- Groq's free tier (8K tokens/min) can't take a full-KB prompt, so the fallback can't cover Claude now.
- Haiku 5.5 rejects `temperature` and spends hidden thinking tokens (output cap 32K) — see `CLAUDE.md`.

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
| 2026-11-18 | Outreach on free providers only (Groq → Gemini, no Claude) | Messages need only the JD + résumé (~3.5K tokens), which free tiers handle |
| 2026-11-18 | Who-to-contact = search links, no LinkedIn scraping | LinkedIn's terms forbid automation; Ved picks the person |
