import type { FitVerdict, JobStatus } from "../../types";
import { statusLabel } from "../../utils/jobs";

// Small shared pieces: the verdict-coloured score and the status pill.
export function ScoreBadge({ score, verdict, size = "sm" }: { score?: number | null; verdict?: FitVerdict | null; size?: "sm" | "lg" }) {
  if (score == null || !verdict) return <span className={`score score--${size} score--none`} title="No fit check">—</span>;
  return (
    <span className={`score score--${size} score--${verdict}`} title={`Fit ${score}/100 · ${verdict}`}>
      {score}
    </span>
  );
}

export function StatusPill({ status }: { status?: JobStatus | null }) {
  const label = statusLabel(status);
  if (!label) return null;
  return <span className={`status status--${status}`}>{label}</span>;
}
