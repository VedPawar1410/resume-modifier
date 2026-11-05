# Idea: Job-match report & skill-gap insights

> Status: **idea — not built.** Captured 2026-11-05 from Ved. Tracked in [ROADMAP.md](../../ROADMAP.md).
> Why it matters: the generator already reads every job description against the full knowledge
> base. Today that comparison is thrown away after the résumé is written. Keeping it turns the app
> from "a résumé writer" into "a career radar": it shows what each company wanted that you
> couldn't show, and over many applications it shows what to learn next.

## 1. The problem

When a JD asks for **Python, JavaScript and Docker** and the knowledge base has Python and
JavaScript but no Docker, the generated résumé silently leaves Docker out. That is correct (we
never invent skills), but you never find out that Docker was the gap. Across 30 applications,
the same missing skill might block you again and again without you noticing.

## 2. The feature, in two parts

### Part A — Match report (per résumé)

After a résumé is generated, a **"Match report"** button sits next to *View LaTeX* / *Download
PDF*. It opens a panel listing every requirement extracted from the JD, each in one bucket:

| Bucket | Meaning | Example (JD: Python, JavaScript, Docker, Kubernetes, CI/CD) |
|---|---|---|
| ✅ **On the résumé** | In the KB *and* used on this résumé | Python (→ `exp-stackular`), JavaScript |
| 🟡 **In KB, left out** | You have it, but it was cut (space, relevance) | CI/CD (→ `exp-example-co`), cut to fit one page |
| 🟠 **Weak evidence** | In the Skills table as `familiar`, or no evidence IDs | Kubernetes (familiar, no project) |
| ❌ **Missing** | Not in the KB at all | Docker |

Each requirement also carries:
- **importance**: `must-have` (under "Requirements", "You will need") vs `nice-to-have`
  ("Preferred", "Bonus", "Desirable");
- **category**: language / framework / cloud / tool / domain / soft skill / education / years;
- **evidence**: the KB entry IDs that back it (empty for missing);
- **JD quote**: the exact phrase it came from, so you can check the extraction.

A one-line summary on top: *"Must-haves: 6/8 covered · Missing: Docker, Kubernetes"*.

Useful side effect: 🟡 items show where the one-page limit hurt — maybe swap a weaker bullet in
the live editor.

### Part B — Insights across all applications

Every match report is stored. An **Insights** page aggregates them:

- **Top missing skills** — bar chart, weighted (must-have = 2, nice-to-have = 1).
  e.g. *Docker: missing in 11 of 18 JDs (9 as must-have)* → "learn Docker" is the highest-leverage move.
- **Coverage over time** — average must-have coverage per week/month. It should rise as you learn
  things and add them to the KB.
- **By role type** — group JDs by target role (backend / AI / data / mentor). Gaps differ: backend
  roles miss Docker/Go; AI roles miss PyTorch.
- **"Have it but never show it"** — skills in the KB that keep getting cut (🟡). These are a hint
  to add a project that shows them better, or to write stronger "Bullets I like".
- **Weak evidence to fix** — `familiar` skills that JDs keep asking for: the cheapest wins
  (build one small project → upgrade to `proficient` with evidence).

Example insight card:
> **Docker** — asked in 11 of your last 18 JDs (9 must-have). Not in your KB.
> Roles: Backend (7), AI Platform (3), Data (1). → Suggested: a small project that containerises
> an existing FastAPI app, then add it with kb-ingest.

## 3. How it would work

### Where the analysis comes from (two options)

1. **Same call as the résumé** — ask the model to also output a JSON match report after the LaTeX.
   Cheapest (no extra request), but makes the single prompt longer and the output harder to parse.
2. **Separate cheap call (recommended)** — after generation, one more Haiku call:
   input = JD + KB Skills table + entry summaries + the `% kb-ids` used; output = strict JSON.
   Clean separation, easy to retry, can run in parallel with PDF compile.

In the planned **v2 select → write pipeline** (see ROADMAP), Stage 1 already decides which entries
to use for which requirements — the match report becomes a by-product of Stage 1 for free.

### Output schema (sketch)

```json
{
  "summary": {"must_have_total": 8, "must_have_covered": 6},
  "requirements": [
    {"skill": "Docker", "canonical": "docker", "category": "tool",
     "importance": "must-have", "status": "missing", "evidence": [],
     "jd_quote": "containerization tools (Docker/Kubernetes)"},
    {"skill": "Python", "canonical": "python", "category": "language",
     "importance": "must-have", "status": "on_resume", "evidence": ["exp-stackular"],
     "jd_quote": "1+ years of experience in backend development, particularly in Python"}
  ]
}
```

### Storage (sketch)

- `match_reports` — `id, resume_record_id (FK), created_at, company, role, role_type, summary_json`
- `jd_requirements` — `id, match_report_id (FK), skill, canonical, category, importance, status,
  evidence (json), jd_quote`

Insights are plain SQL `GROUP BY canonical` queries over `jd_requirements`.

### Hard parts to get right

- **Synonyms / normalisation** — "K8s" = Kubernetes, "Postgres" = PostgreSQL, "RESTful APIs" =
  REST APIs. Keep a small canonical-name map (and let the model propose a `canonical` it must
  pick from the map or mark as new).
- **Over-matching** — the model may claim "FastAPI covers Django". Rule: a match needs the *same*
  skill or an explicit KB fact; related skills go in a "transferable" note, not ✅.
- **Soft / vague requirements** — "problem-solving mindset", "strong CS fundamentals". Keep them,
  but in a separate `soft` category that's excluded from the gap charts by default.
- **Years of experience / degree** — treat as their own category, compared against KB dates.
- **Duplicate JDs** — same posting pasted twice should not double-count in insights (hash the JD).
- **Honesty** — the report is only as good as the KB. A "missing" skill may just be missing from
  the KB, so each missing item gets an "Actually I know this → add to KB" action (opens kb-ingest
  instructions).

## 4. Phases

1. **Match report only** (per résumé, stored, no charts). Validate extraction quality on 10 JDs.
2. **Insights page** — top missing skills + "have it but never show it".
3. **Trends & role grouping**, suggested next projects.
4. Optional: feed insights back into the generator ("this JD's must-haves: Docker missing →
   lead with transferable containerisation-adjacent experience if any").

## 5. Success looks like

- After 10+ applications you can name your top 3 gaps without guessing.
- Must-have coverage goes up over time as you learn and add things to the KB.
- Nothing in the report is a hallucinated match (spot-check against `jd_quote` + `evidence`).
