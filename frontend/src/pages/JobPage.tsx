import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { resumeApi } from "../api/resumeApi";
import { AlertIcon, ArrowRightIcon, ChatIcon, CheckIcon, DocIcon, DotsIcon, DownloadIcon, MailIcon, SparkIcon } from "../components/Icons";
import { DockSplit } from "../components/job/DockSplit";
import { Tooltip } from "../components/Tooltip";
import { FitStep } from "../components/job/FitStep";
import { ResumeStep } from "../components/job/ResumeStep";
import { ScoreBadge } from "../components/job/badges";
import { MatchReportPanel } from "../components/MatchReportPanel";
import { OutreachPanel } from "../components/OutreachPanel";
import { QAPanel } from "../components/QAPanel";
import type { GenerationApi } from "../hooks/useGeneration";
import { errorMessage } from "../hooks/useGeneration";
import { useJobResume } from "../hooks/useJobResume";
import type { JobsApi } from "../hooks/useJobs";
import type { Step } from "../hooks/useRoute";
import { STEPS, jobPath, navigate } from "../hooks/useRoute";
import type { JobDetail, JobStatus } from "../types";
import { JOB_STATUSES } from "../types";
import { splitLabel, statusLabel } from "../utils/jobs";
import { toast } from "../utils/toast";
import { parseDate } from "../utils/dates";
import { downloadName } from "../utils/download";

const EASE = [0.22, 1, 0.36, 1] as const;

// What each step does, what it costs and how long it takes — shown in the tab tooltips, and as
// the "what you'll get" list when a step is locked.
const STEP_META: {
  id: Step;
  label: string;
  Icon: (p: { size?: number }) => React.ReactElement;
  tip: string;
  cost: string;
  gets: string[];
}[] = [
  {
    id: "fit", label: "Fit", Icon: CheckIcon,
    tip: "Reads the job against your knowledge base: apply / maybe / skip, a 0–100 score and every requirement it found.",
    cost: "Free · a few seconds",
    gets: ["Apply / maybe / skip, with a score", "Every requirement, matched to your KB", "Why — in plain words"],
  },
  {
    id: "resume", label: "Résumé", Icon: DocIcon,
    tip: "Writes a one-page résumé for this job from your knowledge base — nothing invented. Edit the LaTeX after if you like.",
    cost: "Claude · 25–40 seconds",
    gets: ["A one-page PDF tailored to this job", "Only facts from your KB", "A LaTeX editor with live preview"],
  },
  {
    id: "match", label: "Match", Icon: SparkIcon,
    tip: "Every requirement in the JD, sorted into on your résumé / in your KB but left out / weak / missing — with what to change.",
    cost: "~1¢ · under a minute, then saved",
    gets: ["Every JD requirement in 4 buckets", "How many must-haves the résumé shows", "What to swap in with the editor"],
  },
  {
    id: "outreach", label: "Outreach", Icon: MailIcon,
    tip: "Who to contact at the company, then a cold email, connection note, InMail or referral ask written from this résumé.",
    cost: "Free · a few seconds each",
    gets: ["Search links for recruiters, managers and alumni", "A message in the right length and tone", "Drafts saved with this job"],
  },
  {
    id: "qa", label: "Q&A", Icon: ChatIcon,
    tip: "Paste a screening question from the application portal and get an answer grounded in this résumé and your KB.",
    cost: "Free · a few seconds each",
    gets: ["Answers that fit the portal's word limit", "Only facts from your KB — it says when one's missing", "Earlier similar answers, one click to reuse"],
  },
];

const isTyping = (el: EventTarget | null) => {
  const t = el as HTMLElement | null;
  return !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || !!t.closest?.(".cm-editor"));
};

interface Props {
  id: number;
  step: Step | null;
  jobsApi: JobsApi;
  generation: GenerationApi;
  version: number; // bumps when a new résumé lands for this job
  kbCount?: number;
}

export function JobPage({ id, step, jobsApi, generation, version, kbCount }: Props) {
  const [job, setJob] = useState<JobDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);

  // Load the job (again when a new résumé lands). The list entry fills in instantly meanwhile.
  useEffect(() => {
    let cancelled = false;
    resumeApi
      .getJob(id)
      .then((j) => !cancelled && (setJob(j), setLoadError(null)))
      .catch((err) => !cancelled && setLoadError(errorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, [id, version]);

  const listed = jobsApi.jobs?.find((j) => j.id === id);
  const current = job && job.id === id ? { ...job, ...(listed ?? {}) } : null;
  const hasResume = current?.has_resume ?? listed?.has_resume ?? false;
  const resume = useJobResume(id, hasResume, version);

  // Counts that change while you're here (a report saved, a draft written) — the job's own
  // counts are the starting point.
  const [live, setLive] = useState<{ match?: boolean; outreach?: number; qa?: number }>({});

  // 1–5 jump between steps (not while typing, and not with a modifier — ⌘1 is the browser's).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented || isTyping(e.target)) return;
      const n = Number(e.key);
      if (n >= 1 && n <= STEPS.length) navigate(jobPath(id, STEPS[n - 1]), { replace: true });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [id]);

  const run = generation.running?.jobId === id ? generation.running : null;
  const genError = generation.error?.jobId === id ? generation.error.message : null;
  const active: Step = step ?? (hasResume || run ? "resume" : "fit");

  if (loadError && !current) {
    return (
      <div className="empty">
        <p className="eyebrow">Job #{id}</p>
        <h2 className="heading">This job couldn't be opened.</h2>
        <p className="muted">{loadError}</p>
        <button className="btn btn--ghost" onClick={() => navigate("/")}>Back to a new job</button>
      </div>
    );
  }
  if (!current) return <div className="page--center"><span className="spinner-dot" /> <span className="muted">Opening job…</span></div>;

  const generate = () => {
    generation.clearError();
    navigate(jobPath(id, "resume"));
    void generation.start(current.job_description ?? "", current.fit_check ?? null, id);
  };

  const recheck = async () => {
    if (!current.job_description) return setCheckError("This job has no saved job description to check.");
    setChecking(true);
    setCheckError(null);
    try {
      const fit = await resumeApi.fitCheck(current.job_description);
      setJob((j) => (j ? { ...j, fit_check: fit, fit_verdict: fit.verdict, fit_score: fit.score } : j));
      jobsApi.patch(id, { fit_verdict: fit.verdict, fit_score: fit.score });
    } catch (err) {
      setCheckError(errorMessage(err));
    } finally {
      setChecking(false);
    }
  };

  const counts = {
    outreach: live.outreach ?? current.outreach_count ?? 0,
    qa: live.qa ?? current.qa_count ?? 0,
  };
  const done: Record<Step, boolean> = {
    fit: !!current.fit_check,
    resume: hasResume,
    match: live.match ?? !!current.has_match_report,
    outreach: counts.outreach > 0,
    qa: counts.qa > 0,
  };
  const go = (s: Step) => navigate(jobPath(id, s), { replace: true });

  const setStatus = (s: JobStatus | null) => {
    const before = current.status ?? null;
    if (s === before) return;
    jobsApi.setStatus(id, s);
    toast(`Status: ${statusLabel(s) ?? "Not applied"}`, { label: "Undo", run: () => jobsApi.setStatus(id, before) });
  };

  // "Next: …" at the bottom of a finished step, following Fit → Résumé → Match → Outreach → Q&A.
  const nudge = (from: Step) => {
    if (!done[from]) return null;
    if (from === "qa") {
      if (current.status) return null;
      return (
        <div className="nudge">
          <span className="muted">Sent the application?</span>
          <button className="btn btn--ghost btn--sm" onClick={() => setStatus("applied")}>Mark as applied</button>
        </div>
      );
    }
    const next = STEPS[STEPS.indexOf(from) + 1];
    const meta = STEP_META.find((m) => m.id === next)!;
    return (
      <div className="nudge">
        <span className="muted">Next</span>
        <button className="btn btn--ghost btn--sm" onClick={() => go(next)}>
          {meta.label === "Match" ? "Match report" : meta.label} <ArrowRightIcon size={13} />
        </button>
        <span className="mono nudge__key" aria-hidden="true">{STEPS.indexOf(next) + 1}</span>
      </div>
    );
  };
  const locked = (s: Step) => !hasResume && (s === "match" || s === "outreach" || s === "qa");

  return (
    <div className="job">
      <Header
        job={current}
        pdfUrl={resume.pdfUrl}
        latex={resume.latex}
        onRename={(label) => jobsApi.rename(id, label).then(() => setJob((j) => (j ? { ...j, label } : j)))}
        onStatus={setStatus}
        onDelete={async () => {
          await jobsApi.remove(id);
          toast("Job deleted");
          navigate("/", { replace: true });
        }}
      />

      <nav className="steps-bar" aria-label="Steps for this job">
        {STEP_META.map((s, i) => {
          const count = s.id === "outreach" ? counts.outreach : s.id === "qa" ? counts.qa : 0;
          const state = locked(s.id)
            ? "Generate the résumé first."
            : s.id === "resume" && run
              ? "Writing now…"
              : done[s.id]
                ? count ? `${count} saved.` : "Done."
                : "Not started.";
          return (
            <Tooltip
              key={s.id}
              content={
                <>
                  <strong className="tip__title">{s.label} <kbd>{i + 1}</kbd></strong>
                  <span>{s.tip}</span>
                  <span className="tip__meta">{s.cost} · {state}</span>
                </>
              }
            >
              <a
                href={jobPath(id, s.id)}
                className={`step-tab ${active === s.id ? "is-active" : ""} ${locked(s.id) ? "is-locked" : ""}`}
                aria-current={active === s.id ? "step" : undefined}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey) return;
                  e.preventDefault();
                  go(s.id);
                }}
              >
                <span className="step-tab__num mono">{String(i + 1).padStart(2, "0")}</span>
                <s.Icon size={14} />
                <span>{s.label}</span>
                {count > 0 && <span className="step-tab__count mono" aria-label={`${count} saved`}>· {count}</span>}
                {done[s.id] && !count && <span className="step-tab__done" aria-label="done"><CheckIcon size={12} /></span>}
                {s.id === "resume" && run && <span className="spinner-dot" aria-label="writing" />}
              </a>
            </Tooltip>
          );
        })}
      </nav>

      {checkError && (
        <div className="notice notice--error job__notice" role="alert">
          <AlertIcon />
          <div><strong>Couldn't check the fit.</strong><p>{checkError}</p></div>
        </div>
      )}

      <AnimatePresence mode="wait">
        <motion.div
          key={active}
          className={`job__body job__body--${active}`}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: EASE }}
        >
          {active === "fit" && (
            <div className={current.fit_check ? "step-narrow step-narrow--fit" : "step-fill"}>
              <FitStep
                fit={current.fit_check}
                hasResume={hasResume}
                generating={generation.running !== null}
                checking={checking}
                onCheck={recheck}
                onGenerate={generate}
                onOpenResume={() => navigate(jobPath(id, "resume"), { replace: true })}
              />
            </div>
          )}
          {active === "resume" && (
            <ResumeStep
              hasResume={hasResume}
              resume={resume}
              run={run}
              genError={genError}
              generateBusy={generation.running !== null}
              onGenerate={generate}
              onCancel={generation.cancel}
              fit={current.fit_check ?? null}
              kbCount={kbCount}
              next={nudge("resume")}
            />
          )}
          {(active === "match" || active === "outreach" || active === "qa") &&
            (locked(active) ? (
              <LockedStep
                meta={STEP_META.find((m) => m.id === active)!}
                busy={generation.running !== null}
                onGenerate={generate}
              />
            ) : (
              <DockSplit pdfUrl={resume.pdfUrl}>
                {active === "match" && (
                  <MatchReportPanel key={`m${id}-${version}`} recordId={id} onReady={() => setLive((l) => ({ ...l, match: true }))} />
                )}
                {active === "outreach" && (
                  <OutreachPanel key={`o${id}`} recordId={id} onCount={(n) => setLive((l) => ({ ...l, outreach: n }))} />
                )}
                {active === "qa" && <QAPanel key={`q${id}`} recordId={id} onCount={(n) => setLive((l) => ({ ...l, qa: n }))} />}
                {nudge(active)}
              </DockSplit>
            ))}
        </motion.div>
      </AnimatePresence>
    </div>
  );

}

// A locked step says what it will give you, so it's a preview — not a dead end.
function LockedStep({ meta, busy, onGenerate }: { meta: (typeof STEP_META)[number]; busy: boolean; onGenerate: () => void }) {
  return (
    <div className="step-center">
      <div className="card preview-card">
        <p className="eyebrow">{meta.label} · needs the résumé</p>
        <h2 className="heading preview-card__title">Generate the résumé first.</h2>
        <p className="muted">{meta.tip}</p>
        <p className="eyebrow preview-card__label">What you'll get</p>
        <ul className="preview-card__list">
          {meta.gets.map((g) => (
            <li key={g}><CheckIcon size={14} /> {g}</li>
          ))}
        </ul>
        <div className="preview-card__actions">
          <button className="btn btn--ink btn--lg" onClick={onGenerate} disabled={busy}>
            <SparkIcon /> Generate résumé
          </button>
          <span className="muted small">{busy ? "Another résumé is being written — one at a time." : "25–40 seconds, then this step opens."}</span>
        </div>
      </div>
    </div>
  );
}

function Header({
  job,
  pdfUrl,
  latex,
  onRename,
  onStatus,
  onDelete,
}: {
  job: JobDetail;
  pdfUrl: string | null;
  latex: string | null;
  onRename: (label: string) => Promise<unknown>;
  onStatus: (s: JobStatus | null) => void;
  onDelete: () => Promise<void>;
}) {
  const [company, role] = splitLabel(job.label);
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [draft, setDraft] = useState(job.label);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close the ⋯ menu on an outside click or Esc.
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => !menuRef.current?.contains(e.target as Node) && setMenu(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  const created = parseDate(job.created_at);

  return (
    <header className="job__head">
      <div className="job__titles">
        <p className="eyebrow">
          Job · {created.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
          {job.has_resume ? " · résumé ready" : " · no résumé yet"}
        </p>
        {renaming ? (
          <form
            className="job__rename"
            onSubmit={(e) => {
              e.preventDefault();
              const label = draft.trim();
              setRenaming(false);
              if (label && label !== job.label) void onRename(label);
            }}
          >
            <input
              className="input"
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setRenaming(false)}
              aria-label="Job name"
            />
            <button className="btn btn--ink btn--sm" type="submit">Save</button>
          </form>
        ) : (
          <h1 className="heading job__title" title={job.label}>
            {role ?? company}
            {role && <span className="job__company">{company}</span>}
          </h1>
        )}
      </div>

      <div className="job__actions">
        <Tooltip
          content={
            job.fit_score != null && job.fit_verdict
              ? <>Fit {job.fit_score}/100 · {job.fit_verdict}<span className="tip__meta">Open Fit (1) for why.</span></>
              : <>No fit check yet<span className="tip__meta">Open Fit (1) — it's free.</span></>
          }
        >
          <button className="score-btn" onClick={() => navigate(jobPath(job.id, "fit"), { replace: true })} aria-label="Fit score — open Fit">
            <ScoreBadge score={job.fit_score} verdict={job.fit_verdict} size="lg" />
          </button>
        </Tooltip>
        <Tooltip content={<>Where this application stands<span className="tip__meta">Shows in the jobs list and its filters.</span></>}>
        <label className="status-select">
          <span className="sr-only">Application status</span>
          <select
            aria-label="Application status"
            value={job.status ?? ""}
            onChange={(e) => onStatus((e.target.value || null) as JobStatus | null)}
            className={job.status ? `is-set status--${job.status}` : ""}
          >
            <option value="">Not applied</option>
            {JOB_STATUSES.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </label>
        </Tooltip>
        {pdfUrl && (
          <a className="btn btn--ink" href={pdfUrl} download={downloadName(latex ?? "", job.label)} title="Download PDF">
            <DownloadIcon /> <span className="btn__label">Download</span>
          </a>
        )}
        <div className="menu" ref={menuRef}>
          <button className="icon-btn" onClick={() => setMenu((m) => !m)} aria-haspopup="menu" aria-expanded={menu} aria-label="More actions">
            <DotsIcon />
          </button>
          {menu && (
            <div className="menu__list" role="menu">
              <button role="menuitem" onClick={() => { setMenu(false); setDraft(job.label); setRenaming(true); }}>Rename</button>
              <button role="menuitem" className="text-danger" onClick={() => { setMenu(false); setConfirming(true); }}>Delete job…</button>
            </div>
          )}
        </div>
      </div>

      {confirming && (
        <div className="notice notice--error job__confirm" role="alertdialog" aria-label="Delete this job?">
          <AlertIcon />
          <div>
            <strong>Delete this job?</strong>
            <p>Its résumé, match report, drafts and answers go too. This can't be undone.</p>
          </div>
          <div className="job__confirm-actions">
            <button className="btn btn--danger btn--sm" onClick={() => void onDelete()}>Delete</button>
            <button className="btn btn--ghost btn--sm" onClick={() => setConfirming(false)}>Cancel</button>
          </div>
        </div>
      )}
    </header>
  );
}
