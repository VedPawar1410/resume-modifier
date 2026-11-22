import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { resumeApi } from "../api/resumeApi";
import { AlertIcon, ChatIcon, CheckIcon, DocIcon, DotsIcon, DownloadIcon, MailIcon, SparkIcon } from "../components/Icons";
import { FitStep } from "../components/job/FitStep";
import { ResumeStep, Sheet } from "../components/job/ResumeStep";
import { ScoreBadge } from "../components/job/badges";
import { MatchReportPanel } from "../components/MatchReportPanel";
import { OutreachPanel } from "../components/OutreachPanel";
import { QAPanel } from "../components/QAPanel";
import type { GenerationApi } from "../hooks/useGeneration";
import { errorMessage } from "../hooks/useGeneration";
import { useJobResume } from "../hooks/useJobResume";
import type { JobsApi } from "../hooks/useJobs";
import type { Step } from "../hooks/useRoute";
import { jobPath, navigate } from "../hooks/useRoute";
import type { JobDetail, JobStatus } from "../types";
import { JOB_STATUSES } from "../types";
import { splitLabel } from "../utils/jobs";
import { parseDate } from "../utils/dates";
import { downloadName } from "../utils/download";

const EASE = [0.22, 1, 0.36, 1] as const;

const STEP_META: { id: Step; label: string; Icon: (p: { size?: number }) => React.ReactElement }[] = [
  { id: "fit", label: "Fit", Icon: CheckIcon },
  { id: "resume", label: "Résumé", Icon: DocIcon },
  { id: "match", label: "Match", Icon: SparkIcon },
  { id: "outreach", label: "Outreach", Icon: MailIcon },
  { id: "qa", label: "Q&A", Icon: ChatIcon },
];

interface Props {
  id: number;
  step: Step | null;
  jobsApi: JobsApi;
  generation: GenerationApi;
  version: number; // bumps when a new résumé lands for this job
}

export function JobPage({ id, step, jobsApi, generation, version }: Props) {
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

  const done: Record<Step, boolean> = {
    fit: !!current.fit_check,
    resume: hasResume,
    match: false,
    outreach: false,
    qa: false,
  };
  const locked = (s: Step) => !hasResume && (s === "match" || s === "outreach" || s === "qa");

  return (
    <div className="job">
      <Header
        job={current}
        pdfUrl={resume.pdfUrl}
        latex={resume.latex}
        onRename={(label) => jobsApi.rename(id, label).then(() => setJob((j) => (j ? { ...j, label } : j)))}
        onStatus={(s) => jobsApi.setStatus(id, s)}
        onDelete={async () => {
          await jobsApi.remove(id);
          navigate("/", { replace: true });
        }}
      />

      <nav className="steps-bar" aria-label="Steps for this job">
        {STEP_META.map((s, i) => (
          <a
            key={s.id}
            href={jobPath(id, s.id)}
            className={`step-tab ${active === s.id ? "is-active" : ""} ${locked(s.id) ? "is-locked" : ""}`}
            aria-current={active === s.id ? "step" : undefined}
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey) return;
              e.preventDefault();
              navigate(jobPath(id, s.id), { replace: true });
            }}
          >
            <span className="step-tab__num mono">{String(i + 1).padStart(2, "0")}</span>
            <s.Icon size={14} />
            <span>{s.label}</span>
            {done[s.id] && <span className="step-tab__done" aria-label="done"><CheckIcon size={12} /></span>}
            {s.id === "resume" && run && <span className="spinner-dot" aria-label="writing" />}
          </a>
        ))}
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
            <div className="step-narrow">
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
            />
          )}
          {(active === "match" || active === "outreach" || active === "qa") &&
            (locked(active) ? (
              <div className="empty">
                <p className="eyebrow">Step locked</p>
                <h2 className="heading">Generate the résumé first.</h2>
                <p className="muted">The {active === "qa" ? "answers" : active === "match" ? "match report" : "messages"} are written from this job's résumé.</p>
                <button className="btn btn--ink btn--lg" onClick={generate} disabled={generation.running !== null}>
                  <SparkIcon /> Generate résumé
                </button>
              </div>
            ) : (
              <Docked pdfUrl={resume.pdfUrl}>
                {active === "match" && <MatchReportPanel key={`m${id}-${version}`} recordId={id} />}
                {active === "outreach" && <OutreachPanel key={`o${id}`} recordId={id} />}
                {active === "qa" && <QAPanel key={`q${id}`} recordId={id} />}
              </Docked>
            ))}
        </motion.div>
      </AnimatePresence>
    </div>
  );

}

// Match / Outreach / Q&A get a readable column, with the résumé docked beside it on wide screens.
function Docked({ pdfUrl, children }: { pdfUrl: string | null; children: React.ReactNode }) {
  const [dock, setDock] = useState(() => {
    try {
      return localStorage.getItem("sourced-dock") !== "off";
    } catch {
      return true;
    }
  });
  const toggle = () =>
    setDock((d) => {
      try {
        localStorage.setItem("sourced-dock", d ? "off" : "on");
      } catch {
        /* not remembered */
      }
      return !d;
    });
  return (
    <div className={`docked ${dock ? "is-docked" : ""}`}>
      <div className="docked__main">{children}</div>
      <aside className="docked__sheet" aria-label="Résumé">
        <div className="docked__bar">
          <span className="eyebrow">Résumé</span>
          <button className="btn btn--ghost btn--xs" onClick={toggle} aria-pressed={dock}>{dock ? "Hide" : "Show résumé"}</button>
        </div>
        {dock && <Sheet url={pdfUrl} fit />}
      </aside>
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
        <ScoreBadge score={job.fit_score} verdict={job.fit_verdict} size="lg" />
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
