import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
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

export function GeneratingCard({ onCancel, startedAt }: { onCancel: () => void; startedAt: number }) {
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
