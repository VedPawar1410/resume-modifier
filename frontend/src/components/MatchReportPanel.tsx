import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { resumeApi } from "../api/resumeApi";
import type { MatchReport, MatchStatus } from "../types";
import { AlertIcon, CloseIcon, RefreshIcon } from "./Icons";

interface Props {
  recordId: number;
  onClose: () => void;
}

const EASE = [0.22, 1, 0.36, 1] as const;

// Buckets in the order you act on them: what's covered, what you could swap in, what's thin, what's absent.
const BUCKETS: { status: MatchStatus; title: string; hint: string }[] = [
  { status: "on_resume", title: "On the résumé", hint: "In your KB and shown here" },
  { status: "left_out", title: "In your KB, left out", hint: "You have it — swap it in with the editor if it matters" },
  { status: "weak", title: "Weak evidence", hint: "Only a course, a mention, or a 'familiar' skill" },
  { status: "missing", title: "Missing", hint: "Not in your knowledge base" },
];

function errorText(err: unknown): string {
  return (
    (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
    "Couldn't build the match report."
  );
}

export function MatchReportPanel({ recordId, onClose }: Props) {
  const [report, setReport] = useState<MatchReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // State changes only when the answer arrives, so the effect below never sets state itself.
  const fetchReport = (refresh: boolean) =>
    resumeApi
      .matchReport(recordId, refresh)
      .then((r) => setReport(r))
      .catch((err) => setError(errorText(err)))
      .finally(() => setLoading(false));

  const rerun = () => {
    setLoading(true);
    setError(null);
    fetchReport(true);
  };

  // A saved report comes back instantly; a new one takes ~30–60 s (one AI call, ~1¢).
  useEffect(() => {
    fetchReport(false);
  }, [recordId]); // eslint-disable-line react-hooks/exhaustive-deps

  const s = report?.summary;

  return (
    <motion.section
      className="editor-pane match"
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ duration: 0.32, ease: EASE }}
      aria-label="Match report"
    >
      <div className="editor-pane__head">
        <span className="small"><strong>Match report</strong></span>
        <span className="save-status muted">{report?.model ?? ""}</span>
        <button
          className="btn btn--ghost btn--sm"
          onClick={rerun}
          disabled={loading}
          title="Analyse again (after editing the résumé)"
        >
          <RefreshIcon size={13} /> Re-run
        </button>
        <button className="icon-btn icon-btn--sm" onClick={onClose} aria-label="Close match report">
          <CloseIcon size={14} />
        </button>
      </div>

      <div className="match__body">
        {loading && (
          <div className="match__loading" role="status">
            <span className="spinner-dot" /> Reading the job description against your knowledge base…
            <p className="muted small">Under a minute the first time (about 1¢) — then it's saved with this résumé.</p>
          </div>
        )}

        {!loading && error && (
          <div className="notice notice--error" role="alert">
            <AlertIcon />
            <div><p>{error}</p></div>
          </div>
        )}

        {!loading && report && s && (
          <>
            <div className="match__summary">
              <p className="serif match__score">
                {s.must_have_covered}/{s.must_have_total} <span>must-haves on the résumé</span>
              </p>
              <p className="muted small">
                {s.counts.left_out} left out · {s.counts.weak} weak · {s.counts.missing} missing
              </p>
              {report.advice && <p className="match__advice">{report.advice}</p>}
            </div>

            {BUCKETS.map(({ status, title, hint }) => {
              const items = report.requirements.filter((r) => r.status === status);
              if (!items.length) return null;
              return (
                <div key={status} className={`match__group match__group--${status}`}>
                  <h3>
                    {title} <span className="muted">· {items.length}</span>
                  </h3>
                  <p className="muted small match__hint">{hint}</p>
                  <ul>
                    {items.map((r, i) => (
                      <li key={`${r.skill}-${i}`}>
                        <div className="match__line">
                          <span className="match__skill">{r.skill}</span>
                          {r.importance === "must-have" && <span className="chip chip--must">must-have</span>}
                        </div>
                        {r.note && <p className="small match__note">{r.note}</p>}
                        {r.jd_quote && <p className="small muted match__quote">“{r.jd_quote}”</p>}
                        {r.evidence.length > 0 && (
                          <p className="mono match__evidence">{r.evidence.join("  ·  ")}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </>
        )}
      </div>
    </motion.section>
  );
}
