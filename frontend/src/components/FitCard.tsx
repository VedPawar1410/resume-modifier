import { motion } from "framer-motion";
import type { FitCheck } from "../types";

const VERDICT = {
  apply: { label: "Apply", line: "A good fit — worth a tailored résumé." },
  maybe: { label: "Maybe", line: "Possible, with gaps. Your call." },
  skip: { label: "Skip", line: "Probably not worth the application." },
} as const;

const MARK = { good: "✓", warn: "!", bad: "✕", info: "·" } as const;

const R = 30;
const CIRC = 2 * Math.PI * R;

// The score ring: the fit score (0-100) in the middle, the arc filled to match.
function ScoreRing({ score, verdict }: { score: number; verdict: FitCheck["verdict"] }) {
  return (
    <div className={`fit-ring fit-ring--${verdict}`} role="img" aria-label={`Fit score ${score} percent`}>
      <svg viewBox="0 0 76 76" width="76" height="76" aria-hidden="true">
        <circle className="fit-ring__track" cx="38" cy="38" r={R} />
        <motion.circle
          className="fit-ring__arc"
          cx="38"
          cy="38"
          r={R}
          strokeDasharray={CIRC}
          initial={{ strokeDashoffset: CIRC }}
          animate={{ strokeDashoffset: CIRC * (1 - score / 100) }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <span className="fit-ring__num mono">
        {score}
        <small>%</small>
      </span>
    </div>
  );
}

export function FitCard({ fit }: { fit: FitCheck }) {
  const v = VERDICT[fit.verdict];
  return (
    <motion.section
      className={`card fit fit--${fit.verdict}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      aria-live="polite"
    >
      <div className="fit__head">
        <ScoreRing score={fit.score} verdict={fit.verdict} />
        <div className="fit__title">
          <p className="eyebrow">Fit check{fit.job_title ? ` · ${fit.job_title}` : ""}</p>
          <h2 className="serif">{v.label}</h2>
          <p className="muted small">{fit.summary || v.line}</p>
        </div>
      </div>
      <ul className="fit__reasons">
        {fit.reasons.map((r, i) => (
          <li key={i} className={`fit__reason fit__reason--${r.kind}`}>
            <span className="fit__mark" aria-hidden="true">{MARK[r.kind]}</span>
            {r.text}
          </li>
        ))}
      </ul>
      <p className="fit__foot muted small">
        Must-haves covered: {fit.must_have_coverage}% · free check, nothing saved until you generate
      </p>
    </motion.section>
  );
}
