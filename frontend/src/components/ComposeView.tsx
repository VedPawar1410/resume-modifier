import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import type { KBStatus } from "../types";
import { AlertIcon, CheckIcon, CloseIcon, RefreshIcon, SparkIcon } from "./Icons";

interface Props {
  kb: KBStatus | null;
  onRefreshKb: () => void;
  jobDescription: string;
  onJobDescriptionChange: (v: string) => void;
  generating: boolean;
  error: string | null;
  onGenerate: () => void;
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

  return (
    <div className="card generating" role="status" aria-live="polite">
      <div className="generating__head">
        <h2 className="serif">Setting your résumé…</h2>
        <div className="generating__actions">
          <span className="mono muted">{elapsed}s</span>
          <button className="btn btn--ghost btn--sm" onClick={onCancel}>
            <CloseIcon size={14} /> Cancel
          </button>
        </div>
      </div>
      <ol className="steps">
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
            className="serif"
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

  return (
    <div className="compose">
      <motion.header
        className="compose__intro"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      >
        <p className="eyebrow">New résumé</p>
        <h1 className="serif display">Which job is this one for?</h1>
        <p className="lede">
          Paste the job description. The most relevant work from your knowledge base is picked and set
          into a one-page résumé.
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
          <div className="kb-line">
            {kb === null ? (
              <span className="muted">Checking knowledge base…</span>
            ) : kb.found ? (
              <>
                <span className="kb-line__dot" aria-hidden="true" />
                <span>
                  <strong>Knowledge base</strong>
                  <span className="muted"> · {kb.entry_count} entries · {counts.map(([s, n]) => `${n} ${s}`).join(" · ")}</span>
                  {kb.last_updated && <span className="muted"> · updated {kb.last_updated}</span>}
                </span>
                <button className="icon-btn icon-btn--sm" onClick={onRefreshKb} aria-label="Refresh knowledge base" title="Refresh">
                  <RefreshIcon size={14} />
                </button>
              </>
            ) : (
              <span className="text-danger">
                Knowledge base not found at <code>{kb.path}</code> — set <code>KB_PATH</code> in <code>.env</code>.
              </span>
            )}
          </div>
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
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && canGenerate) onGenerate();
              }}
              placeholder="Role, responsibilities, required and preferred skills…"
              spellCheck={false}
            />
            <div className="jd-card__foot">
              <span className="mono muted small">{words} words</span>
              <button className="btn btn--ink btn--lg" onClick={onGenerate} disabled={!canGenerate}>
                <SparkIcon /> Generate résumé <kbd>⌘↵</kbd>
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
