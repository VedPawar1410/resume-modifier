import axios from "axios";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { resumeApi } from "../api/resumeApi";
import type { MatchReport, MatchStatus } from "../types";
import { AlertIcon, CloseIcon, RefreshIcon, SparkIcon } from "./Icons";

interface Props {
  recordId: number;
  onClose?: () => void; // omitted when shown as a job step (steps don't close)
  onReady?: () => void; // a new report was saved (the step tab shows it as done)
}

const EASE = [0.22, 1, 0.36, 1] as const;

// Buckets in the order you act on them: what's covered, what you could swap in, what's thin, what's absent.
const BUCKETS: { status: MatchStatus; title: string; stat: string; hint: string }[] = [
  { status: "on_resume", title: "On the résumé", stat: "On résumé", hint: "In your KB and shown here" },
  { status: "left_out", title: "In your KB, left out", stat: "Left out", hint: "You have it — swap it in with the editor if it matters" },
  { status: "weak", title: "Weak evidence", stat: "Weak", hint: "Only a course, a mention, or a 'familiar' skill" },
  { status: "missing", title: "Missing", stat: "Missing", hint: "Not in your knowledge base" },
];

function errorText(err: unknown): string {
  return (
    (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
    "Couldn't build the match report."
  );
}

type Phase = "loading" | "intro" | "running" | "ready";

export function MatchReportPanel({ recordId, onClose, onReady }: Props) {
  const [report, setReport] = useState<MatchReport | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [startedAt, setStartedAt] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const controller = useRef<AbortController | null>(null);

  // Opening the step only reads what's saved (free). Nothing is spent until you press Run.
  useEffect(() => {
    let gone = false;
    resumeApi
      .getMatchReport(recordId)
      .then((r) => {
        if (gone) return;
        setReport(r);
        setPhase(r ? "ready" : "intro");
      })
      .catch((err) => {
        if (gone) return;
        setError(errorText(err));
        setPhase("intro");
      });
    return () => {
      gone = true;
      controller.current?.abort(); // leaving the step mid-run cancels it, like Cancel
    };
  }, [recordId]);

  // A live timer while it runs — a long wait feels shorter when you can see it moving.
  useEffect(() => {
    if (phase !== "running") return;
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 500);
    return () => clearInterval(t);
  }, [phase, startedAt]);

  const run = (refresh: boolean) => {
    const c = new AbortController();
    controller.current = c;
    const before = report;
    setConfirming(false);
    setError(null);
    setStartedAt(Date.now());
    setElapsed(0);
    setPhase("running");
    resumeApi
      .matchReport(recordId, refresh, c.signal)
      .then((r) => {
        setReport(r);
        setPhase("ready");
        onReady?.();
      })
      .catch((err) => {
        // A cancel isn't an error: go back to what was there before.
        if (!axios.isCancel(err)) setError(errorText(err));
        setPhase(before ? "ready" : "intro");
      })
      .finally(() => {
        if (controller.current === c) controller.current = null;
      });
  };
  const cancel = () => controller.current?.abort();

  const s = report?.summary;
  const loading = phase === "running";

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
        <h2 className="pane-title">Match report</h2>
        <span className="save-status muted">{phase === "ready" ? report?.model ?? "" : ""}</span>
        {phase === "ready" && !confirming && (
          <button className="btn btn--ghost btn--sm" onClick={() => setConfirming(true)} title="Analyse again (after editing the résumé)">
            <RefreshIcon size={13} /> Re-run
          </button>
        )}
        {confirming && (
          <span className="confirm-inline" role="group" aria-label="Run the match report again?">
            <span className="small">Run again? ~1¢</span>
            <button className="btn btn--ink btn--sm" onClick={() => run(true)} autoFocus>Run again</button>
            <button className="btn btn--ghost btn--sm" onClick={() => setConfirming(false)}>Keep this one</button>
          </span>
        )}
        {onClose && (
          <button className="icon-btn icon-btn--sm" onClick={onClose} aria-label="Close match report">
            <CloseIcon size={14} />
          </button>
        )}
      </div>

      <div className="match__body">
        {phase === "loading" && (
          <div className="match__loading" role="status"><span className="spinner-dot" /> Opening…</div>
        )}

        {error && (
          <div className="notice notice--error match__error" role="alert">
            <AlertIcon />
            <div><p>{error}</p></div>
          </div>
        )}

        {phase === "intro" && (
          <div className="card intro-card">
            <p className="eyebrow">Not run yet</p>
            <h3 className="intro-card__title">See exactly how this résumé covers the job.</h3>
            <ul className="intro-card__list">
              <li><span className="dot" aria-hidden="true" />Every requirement in the job description, sorted into <strong>on your résumé</strong>, <strong>in your KB but left out</strong>, <strong>weak</strong> and <strong>missing</strong>.</li>
              <li><span className="dot" aria-hidden="true" />How many must-haves the résumé shows.</li>
              <li><span className="dot" aria-hidden="true" />What to swap in with the editor, in plain words.</li>
            </ul>
            <div className="intro-card__actions">
              <button className="btn btn--ink btn--lg" onClick={() => run(false)}>
                <SparkIcon /> Run match report
              </button>
              <span className="muted small">About 1¢ · under a minute · then saved with this job, free to reopen.</span>
            </div>
          </div>
        )}

        {loading && (
          <div role="status" className="match__running">
            <div className="match__running-head">
              <div className="match__loading">
                <span className="spinner-dot" /> Reading the job description against your knowledge base…
              </div>
              <span className="mono match__timer" aria-label={`${elapsed} seconds`}>
                {String(Math.floor(elapsed / 60)).padStart(2, "0")}:{String(elapsed % 60).padStart(2, "0")}
              </span>
              <button className="btn btn--ghost btn--sm" onClick={cancel}>
                <CloseIcon size={13} /> Cancel
              </button>
            </div>
            <p className="muted small">Usually 30–60 seconds. Cancel stops it — nothing is saved or charged further.</p>
            <div className="skeleton" aria-hidden="true"><i /><i /><i /><i /><i /></div>
          </div>
        )}

        {phase === "ready" && report && s && (
          <>
            <div className="match__summary">
              <p className="match__hero">
                <span className="num">{s.must_have_covered}/{s.must_have_total}</span>
                <span className="eyebrow">Must-haves on the résumé</span>
              </p>
              <div className="stats">
                {BUCKETS.map(({ status, stat }) => (
                  <div key={status} className={`stat stat--${status}`}>
                    <p className="eyebrow"><span className="dot" aria-hidden="true" />{stat}</p>
                    <p className="stat__value">{report.requirements.filter((r) => r.status === status).length}</p>
                  </div>
                ))}
              </div>
              {report.advice && <p className="match__advice">{report.advice}</p>}
            </div>

            {BUCKETS.map(({ status, title, hint }) => {
              const items = report.requirements.filter((r) => r.status === status);
              if (!items.length) return null;
              return (
                <div key={status} className={`match__group match__group--${status}`}>
                  <h3 className="eyebrow">
                    <span className="dot" aria-hidden="true" />
                    {title} <span>· {items.length}</span>
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
