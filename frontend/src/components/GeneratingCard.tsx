import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import type { FitCheck } from "../types";
import { CheckIcon, CloseIcon } from "./Icons";

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
const MAX_CHIPS = 8;

interface Props {
  onCancel: () => void;
  startedAt: number;
  fit?: FitCheck | null; // its must-haves show as "what it's matching"
  kbCount?: number; // "Picking from N KB entries"
}

// A fixed-size card: two columns (progress | while you wait) and a quote box with a set height,
// so nothing inside can change the card's size — a 1-line quote and a 3-line quote look the same.
export function GeneratingCard({ onCancel, startedAt, fit, kbCount }: Props) {
  // Counted from when it started (not when this card mounted), so leaving and coming back
  // to the job shows the true elapsed time.
  const [elapsed, setElapsed] = useState(() => Math.floor((Date.now() - startedAt) / 1000));
  // Start on a random line so it doesn't feel scripted.
  const [quote, setQuote] = useState(() => Math.floor(Math.random() * MOTIVATION.length));
  useEffect(() => {
    const tick = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 500);
    const rotate = setInterval(() => setQuote((q) => (q + 1) % MOTIVATION.length), MOTIVATION_MS);
    return () => {
      clearInterval(tick);
      clearInterval(rotate);
    };
  }, [startedAt]);
  const active = STEPS.filter((s) => elapsed >= s.at).length - 1;

  // A rough sense of progress: the steps' timings, capped so it never claims "done" early.
  const progress = Math.min(92, (elapsed / 40) * 100);
  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  const musts = (fit?.requirements ?? []).filter((r) => r.importance === "must-have").map((r) => r.skill);
  const skills = musts.length ? musts : (fit?.requirements ?? []).map((r) => r.skill);
  const shown = skills.slice(0, MAX_CHIPS);

  return (
    <div className="generating-wrap">
    <div className="card generating">
      <div className="generating__main">
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
        <p className="muted small generating__note">Usually 25–40 seconds. Cancel stops it — nothing is saved.</p>
      </div>

      <aside className="generating__side" aria-label="While you wait">
        <p className="eyebrow">While you wait</p>
        <div className="generating__facts">
          {shown.length > 0 ? (
            <div>
              <p className="generating__fact-label">{musts.length ? "Matching the must-haves" : "Matching the requirements"}</p>
              <ul className="generating__chips">
                {shown.map((sk) => <li key={sk} className="chip">{sk}</li>)}
                {skills.length > shown.length && <li className="chip chip--mono">+{skills.length - shown.length}</li>}
              </ul>
            </div>
          ) : (
            <p className="generating__fact-label">Reading the job description for what matters most.</p>
          )}
          <p className="generating__fact">
            {kbCount ? <>Picking from <strong>{kbCount}</strong> knowledge-base entries — only what fits one page.</> : "Picking only what fits one page from your knowledge base."}
          </p>
          <p className="generating__fact">Every line comes from your KB — nothing is invented.</p>
        </div>
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
      </aside>
    </div>
    </div>
  );
}
