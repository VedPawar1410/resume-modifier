import { animate, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import type { FitCheck } from "../types";

const VERDICT = {
  apply: { label: "Apply", head: "A good fit.", line: "A good fit — worth a tailored résumé." },
  maybe: { label: "Maybe", head: "Possible, with gaps.", line: "Possible, with gaps. Your call." },
  skip: { label: "Skip", head: "Probably not worth it.", line: "Probably not worth the application." },
} as const;

const MARK = { good: "✓", warn: "!", bad: "✕", info: "·" } as const;
const EASE = [0.22, 1, 0.36, 1] as const;

// The score counts up once when the verdict appears (skipped with reduced motion).
function useCountUp(target: number) {
  const reduce = useReducedMotion();
  const [n, setN] = useState(reduce ? target : 0);
  useEffect(() => {
    if (reduce) return;
    const controls = animate(0, target, { duration: 0.9, ease: EASE, onUpdate: (v) => setN(Math.round(v)) });
    return () => controls.stop();
  }, [target, reduce]);
  return reduce ? target : n;
}

// Answer-first: the score is the biggest thing on the screen, the reasons sit under it.
export function FitCard({ fit }: { fit: FitCheck }) {
  const v = VERDICT[fit.verdict];
  const shown = useCountUp(fit.score);
  const must = fit.requirements.filter((r) => r.importance === "must-have");
  const mustMet = must.filter((r) => r.status === "strong").length;
  const strong = fit.requirements.filter((r) => r.status === "strong").length;
  const missing = fit.requirements.filter((r) => r.status === "missing").length;

  return (
    <motion.section
      className={`verdict verdict--${fit.verdict}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE }}
      aria-live="polite"
      aria-label={`Fit check: ${v.label}, score ${fit.score} out of 100`}
    >
      <div className="verdict__top">
        <div className="verdict__score">
          <p className="verdict__num">
            <span className="num" aria-hidden="true">{shown}</span>
            <span className="eyebrow">/100 fit</span>
          </p>
          <div className="meter" aria-hidden="true">
            <motion.div
              className="meter__fill"
              initial={{ width: 0 }}
              animate={{ width: `${fit.score}%` }}
              transition={{ duration: 0.9, ease: EASE }}
            />
          </div>
        </div>
        <div className="verdict__copy">
          <p className="eyebrow">
            Verdict · <span className="verdict__label">{v.label}</span>
            {fit.job_title ? ` · ${fit.job_title}` : ""}
          </p>
          <h2 className="heading">{v.head}</h2>
          <p>{fit.summary || v.line}</p>
        </div>
      </div>

      <div className="stats">
        <div className="stat">
          <p className="eyebrow">Must-haves</p>
          <p className="stat__value">{must.length ? `${mustMet}/${must.length}` : `${fit.must_have_coverage}%`}</p>
        </div>
        <div className="stat">
          <p className="eyebrow">Strong matches</p>
          <p className="stat__value">{strong}</p>
        </div>
        <div className="stat">
          <p className="eyebrow">Gaps</p>
          <p className="stat__value">{missing}</p>
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
      <p className="fit__foot muted small">Free check · saved with this job</p>
    </motion.section>
  );
}
