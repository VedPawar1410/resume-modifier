import { motion } from "framer-motion";
import { useState } from "react";
import { resumeApi } from "../api/resumeApi";
import { GeneratingCard } from "../components/GeneratingCard";
import { AlertIcon, CheckIcon, RefreshIcon, SparkIcon } from "../components/Icons";
import { ScoreBadge, StatusPill } from "../components/job/badges";
import { splitLabel } from "../utils/jobs";
import type { GenerationApi } from "../hooks/useGeneration";
import { errorMessage } from "../hooks/useGeneration";
import { jobPath, navigate } from "../hooks/useRoute";
import type { Job, KBStatus } from "../types";

const EASE = [0.22, 1, 0.36, 1] as const;

interface Props {
  kb: KBStatus | null;
  onRefreshKb: () => void;
  jobs: Job[] | null;
  onJobsChanged: () => void;
  generation: GenerationApi;
}

// Home is the composer: paste a JD, then check the fit (free, saves a job) or go straight to
// a résumé. Recent jobs sit underneath so the last few are one click away.
export function Home({ kb, onRefreshKb, jobs, onJobsChanged, generation }: Props) {
  const [jd, setJd] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const words = jd.trim() ? jd.trim().split(/\s+/).length : 0;
  const busy = checking || generation.running !== null;
  const ready = !!kb?.found && !!jd.trim() && !busy;
  const homeRun = generation.running && generation.running.jobId === null ? generation.running : null;
  const genError = generation.error && generation.error.jobId === null ? generation.error.message : null;

  const checkFit = async () => {
    setChecking(true);
    setError(null);
    try {
      const fit = await resumeApi.fitCheck(jd);
      onJobsChanged();
      if (fit.record_id) {
        setJd("");
        navigate(jobPath(fit.record_id, "fit"));
      } else {
        setError("The check ran but couldn't be saved — try again.");
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setChecking(false);
    }
  };

  const generate = () => {
    setError(null);
    generation.clearError();
    void generation.start(jd, null, null);
  };

  const counts = kb?.found ? Object.entries(kb.entries_by_section).filter(([, n]) => n > 0) : [];
  const recent = (jobs ?? []).slice(0, 6);

  return (
    <div className="home">
      <motion.header className="home__intro" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }}>
        <div className="eyebrow home__kb">
          <span>New job</span>
          {kb === null ? (
            <span>· checking knowledge base…</span>
          ) : kb.found ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="kb-dot" aria-hidden="true" />
              <button className="linkish" onClick={() => navigate("/kb")} title={counts.map(([s, n]) => `${n} ${s}`).join(" · ")}>
                Knowledge base · {kb.entry_count} entries
              </button>
              <button className="icon-btn icon-btn--sm" onClick={onRefreshKb} aria-label="Refresh knowledge base" title="Refresh">
                <RefreshIcon size={13} />
              </button>
            </>
          ) : (
            <>
              <span aria-hidden="true">·</span>
              <span className="kb-dot kb-dot--off" aria-hidden="true" />
              <button className="linkish" onClick={() => navigate("/kb")}>Knowledge base not found</button>
            </>
          )}
        </div>
        <h1 className="heading display">Which job is this one for?</h1>
        <p className="lede">
          Paste the job description. Check the fit first — it's free and saves the job — or go
          straight to a one-page résumé from your knowledge base.
        </p>
      </motion.header>

      {homeRun ? (
        <GeneratingCard onCancel={generation.cancel} startedAt={homeRun.startedAt} />
      ) : (
        <motion.div className="home__body" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.05, ease: EASE }}>
          {(error || genError) && (
            <div className="notice notice--error" role="alert">
              <AlertIcon />
              <div>
                <strong>{genError ? "Couldn't generate the résumé." : "Couldn't check the fit."}</strong>
                <p>{genError ?? error}</p>
              </div>
            </div>
          )}
          <div className="card composer">
            <label className="field-label" htmlFor="jd">Job description</label>
            <textarea
              id="jd"
              value={jd}
              onChange={(e) => setJd(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && ready) generate();
              }}
              placeholder="Role, responsibilities, required and preferred skills…"
              spellCheck={false}
            />
            <div className="composer__foot">
              <span className="mono muted small">{words} words</span>
              <div className="composer__actions">
                <button className="btn btn--ghost btn--lg" onClick={checkFit} disabled={!ready}>
                  {checking ? <span className="spinner-dot" /> : <CheckIcon size={15} />}
                  {checking ? "Checking…" : "Check fit"}
                  <span className="composer__free">free</span>
                </button>
                <button className="btn btn--ink btn--lg" onClick={generate} disabled={!ready}>
                  <SparkIcon /> Generate résumé <kbd>⌘↵</kbd>
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {recent.length > 0 && (
        <section className="recent" aria-label="Recent jobs">
          <p className="eyebrow">Recent</p>
          <ul className="recent__grid">
            {recent.map((j) => {
              const [company, role] = splitLabel(j.label);
              return (
                <li key={j.id}>
                  <a
                    className="recent__card"
                    href={jobPath(j.id)}
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey) return;
                      e.preventDefault();
                      navigate(jobPath(j.id));
                    }}
                  >
                    <ScoreBadge score={j.fit_score} verdict={j.fit_verdict} size="lg" />
                    <span className="recent__role">{role ?? company}</span>
                    <span className="recent__company">{role ? company : " "}</span>
                    <span className="recent__foot">
                      <StatusPill status={j.status} />
                      {!j.has_resume && <span className="job-row__flag">no résumé</span>}
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
