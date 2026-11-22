import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { resumeApi } from "../api/resumeApi";
import type { FitCheck, KBStatus } from "../types";
import { FitCard } from "./FitCard";
import { AlertIcon, CheckIcon, CloseIcon, RefreshIcon, SparkIcon } from "./Icons";

interface Props {
  kb: KBStatus | null;
  onRefreshKb: () => void;
  jobDescription: string;
  onJobDescriptionChange: (v: string) => void;
  generating: boolean;
  error: string | null;
  onGenerate: (fit: FitCheck | null) => void;
  onCancel: () => void;
}

// The backend doesn't stream progress, so the steps advance on typical timings
// (a full run is ~25–40s). The last step stays active until the response arrives.
const STEPS: { label: string; at: number }[] = [
  { label: "Reading your knowledge base", at: 0 },
  { label: "Matching it to the job", at: 3 },
  { label: "Writing the résumé", at: 8 },
  { label: "Typesetting the PDF", at: 24 },
];

// Shown one at a time while the résumé is being written.
const MOTIVATION = [
  "Every tailored résumé is one step closer to the right desk.",
  "Recruiters skim for about six seconds. Yours is being written for exactly those six.",
  "The work is already done — this just tells it well.",
  "A résumé doesn't get you the job. It gets you the conversation. You get the job.",
  "Each application teaches you something. Keep the ones that worked.",
  "Specific beats impressive. Numbers beat adjectives.",
  "You only need one yes.",
  "The closer the résumé fits the role, the shorter the distance to the interview.",
  "Rejections are data, not verdicts.",
  "Somewhere, a hiring manager is hoping someone like you applies today.",
  "Small, steady applications beat one perfect one you never send.",
  "Tailoring is how you show you read their job, not just any job.",
];
const MOTIVATION_MS = 5000;

function GeneratingCard({ onCancel }: { onCancel: () => void }) {
  const [elapsed, setElapsed] = useState(0);
  // Start on a random line so it doesn't feel scripted.
  const [quote, setQuote] = useState(() => Math.floor(Math.random() * MOTIVATION.length));
  useEffect(() => {
    const started = Date.now();
    const tick = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 500);
    const rotate = setInterval(() => setQuote((q) => (q + 1) % MOTIVATION.length), MOTIVATION_MS);
    return () => {
      clearInterval(tick);
      clearInterval(rotate);
    };
  }, []);
  const active = STEPS.filter((s) => elapsed >= s.at).length - 1;

  // A rough sense of progress: the steps' timings, capped so it never claims "done" early.
  const progress = Math.min(92, (elapsed / 40) * 100);
  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <div className="card generating">
      <div className="generating__head">
        <div>
          <p className="eyebrow">Setting your résumé</p>
          <p className="generating__timer" aria-label={`${elapsed} seconds`}>{mm}:{ss}</p>
        </div>
        <button className="btn btn--ghost btn--sm" onClick={onCancel}>
          <CloseIcon size={14} /> Cancel
        </button>
      </div>
      <div className="progress" aria-hidden="true">
        <div className="progress__bar" style={{ width: `${progress}%` }} />
      </div>
      <ol className="steps" role="status" aria-live="polite">
        {STEPS.map((s, i) => (
          <li key={s.label} className={i < active ? "is-done" : i === active ? "is-active" : ""}>
            <span className="steps__mark">{i < active ? <CheckIcon size={13} /> : <span className="steps__dot" />}</span>
            {s.label}
          </li>
        ))}
      </ol>
      <p className="muted small">Usually 25–40 seconds. Every line comes from your knowledge base — nothing is invented.</p>
      <div className="motivation" aria-live="off">
        <AnimatePresence mode="wait">
          <motion.p
            key={quote}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            “{MOTIVATION[quote]}”
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}

export function ComposeView({ kb, onRefreshKb, jobDescription, onJobDescriptionChange, generating, error, onGenerate, onCancel }: Props) {
  const words = jobDescription.trim() ? jobDescription.trim().split(/\s+/).length : 0;
  const counts = kb?.found ? Object.entries(kb.entries_by_section).filter(([, n]) => n > 0) : [];
  const canGenerate = !!kb?.found && !!jobDescription.trim() && !generating;

  // The fit check belongs to the exact JD it was run on: edit the JD and it disappears
  // (a stale verdict is worse than none). Kept here, not in useResume — nothing else needs it.
  const [fit, setFit] = useState<{ jd: string; result: FitCheck } | null>(null);
  const [fitError, setFitError] = useState<{ jd: string; message: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const currentFit = fit?.jd === jobDescription ? fit.result : null;
  const currentFitError = fitError?.jd === jobDescription ? fitError.message : null;

  const checkFit = async () => {
    const jd = jobDescription;
    setChecking(true);
    setFitError(null);
    try {
      setFit({ jd, result: await resumeApi.fitCheck(jd) });
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setFitError({ jd, message: detail ?? "Couldn't check the fit." });
    } finally {
      setChecking(false);
    }
  };
  const generate = () => onGenerate(currentFit);

  return (
    <div className="compose">
      <motion.header
        className="compose__intro"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="eyebrow">
          <span>New résumé</span>
          {kb === null ? (
            <span>· Checking knowledge base…</span>
          ) : kb.found ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="kb-dot" aria-hidden="true" />
              <span title={counts.map(([s, n]) => `${n} ${s}`).join(" · ")}>
                Knowledge base {kb.entry_count} entries
                {kb.last_updated && ` · updated ${kb.last_updated}`}
              </span>
              <button className="icon-btn icon-btn--sm" onClick={onRefreshKb} aria-label="Refresh knowledge base" title="Refresh">
                <RefreshIcon size={13} />
              </button>
            </>
          ) : (
            <>
              <span aria-hidden="true">·</span>
              <span className="kb-dot kb-dot--off" aria-hidden="true" />
              <span>No knowledge base</span>
            </>
          )}
        </div>
        <h1 className="heading display">Which job is this one for?</h1>
        <p className="lede">
          Paste the job description. Check the fit first if you're unsure, then the most relevant work
          from your knowledge base is set into a one-page résumé.
        </p>
      </motion.header>

      {generating ? (
        <GeneratingCard onCancel={onCancel} />
      ) : (
        <motion.div
          className="compose__body"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.06, ease: [0.22, 1, 0.36, 1] }}
        >
          {kb && !kb.found && (
            <p className="kb-error">
              Knowledge base not found at <code>{kb.path}</code>{kb.error ? ` — ${kb.error}` : ""}
            </p>
          )}
          {kb?.found && !kb.entries_by_section.projects && (
            <p className="hint-note">No projects in your knowledge base yet — add some with the kb-ingest skill to fill the page.</p>
          )}

          {error && (
            <div className="notice notice--error" role="alert">
              <AlertIcon />
              <div>
                <strong>Couldn't generate the résumé.</strong>
                <p>{error}</p>
              </div>
            </div>
          )}

          <div className="card jd-card">
            <label className="field-label" htmlFor="jd">Job description</label>
            <textarea
              id="jd"
              value={jobDescription}
              onChange={(e) => onJobDescriptionChange(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && canGenerate) generate();
              }}
              placeholder="Role, responsibilities, required and preferred skills…"
              spellCheck={false}
            />
            <div className="jd-card__foot">
              <span className="mono muted small">{words} words</span>
              <div className="jd-card__actions">
                <button
                  className="btn btn--ghost btn--lg"
                  onClick={checkFit}
                  disabled={!canGenerate || checking || !!currentFit}
                  title="Apply / maybe / skip in a few seconds, before spending on a résumé"
                >
                  <CheckIcon size={15} /> {checking ? "Checking…" : "Check fit"}
                </button>
                <button className="btn btn--ink btn--lg" onClick={generate} disabled={!canGenerate}>
                  <SparkIcon /> {currentFit?.verdict === "skip" ? "Generate anyway" : "Generate résumé"} <kbd>⌘↵</kbd>
                </button>
              </div>
            </div>
          </div>

          {currentFitError && (
            <div className="notice notice--error" role="alert">
              <AlertIcon />
              <div>
                <strong>Couldn't check the fit.</strong>
                <p>{currentFitError}</p>
              </div>
            </div>
          )}
          {currentFit && <FitCard fit={currentFit} />}
        </motion.div>
      )}
    </div>
  );
}
