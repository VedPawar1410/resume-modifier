import { motion } from "framer-motion";
import { AlertIcon, CheckIcon, RefreshIcon } from "../components/Icons";
import type { KBStatus } from "../types";

const EASE = [0.22, 1, 0.36, 1] as const;
const STALE_DAYS = 30;

// Health checks computed here from the status the API already returns — no new endpoint.
function checks(kb: KBStatus): { ok: boolean; text: string }[] {
  const out: { ok: boolean; text: string }[] = [];
  const projects = kb.entries_by_section.projects ?? 0;
  out.push(
    projects > 0
      ? { ok: true, text: `${projects} projects — the résumé picks the best 3 for each job.` }
      : { ok: false, text: "No projects yet — add some with the kb-ingest skill to fill the page." },
  );
  if (kb.last_updated) {
    const days = Math.floor((Date.now() - new Date(kb.last_updated).getTime()) / 86_400_000);
    out.push(
      days > STALE_DAYS
        ? { ok: false, text: `Last updated ${days} days ago — anything new since then?` }
        : { ok: true, text: `Updated ${days === 0 ? "today" : `${days} day${days === 1 ? "" : "s"} ago`}.` },
    );
  }
  return out;
}

export function KBPage({ kb, onRefresh }: { kb: KBStatus | null; onRefresh: () => void }) {
  const sections = kb?.found ? Object.entries(kb.entries_by_section).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]) : [];
  const max = Math.max(1, ...sections.map(([, n]) => n));

  return (
    <motion.div className="kb-page" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: EASE }}>
      <div className="kb-page__head">
        <p className="eyebrow">Knowledge base{kb?.last_updated ? ` · updated ${kb.last_updated}` : ""}</p>
        <button className="btn btn--ghost btn--sm" onClick={onRefresh}>
          <RefreshIcon size={13} /> Refresh
        </button>
      </div>

      {kb === null ? (
        <p className="muted"><span className="spinner-dot" /> Reading your knowledge base…</p>
      ) : !kb.found ? (
        <>
          <h1 className="heading display">Not found.</h1>
          <div className="notice notice--error" role="alert">
            <AlertIcon />
            <div>
              <strong>Sourced can't read your knowledge base.</strong>
              <p>Looked at {kb.path}{kb.error ? ` — ${kb.error}` : ""}</p>
            </div>
          </div>
        </>
      ) : (
        <>
          <h1 className="kb-page__count">
            <span className="num">{kb.entry_count}</span>
            <span className="eyebrow">entries every résumé is built from</span>
          </h1>

          <section className="bars" aria-label="Entries by section">
            {sections.map(([name, n]) => (
              <div key={name} className="bar">
                <span className="bar__label eyebrow">{name}</span>
                <span className="bar__track" aria-hidden="true">
                  <motion.span className="bar__fill" initial={{ width: 0 }} animate={{ width: `${(n / max) * 100}%` }} transition={{ duration: 0.7, ease: EASE }} />
                </span>
                <span className="bar__value num">{n}</span>
              </div>
            ))}
          </section>

          <section className="health" aria-label="Health">
            <h2 className="eyebrow">Health</h2>
            <ul>
              {checks(kb).map((c) => (
                <li key={c.text} className={c.ok ? "is-ok" : "is-warn"}>
                  <span className="health__mark" aria-hidden="true">{c.ok ? <CheckIcon size={13} /> : "!"}</span>
                  {c.text}
                </li>
              ))}
            </ul>
            <p className="muted small">
              Edit it in your private knowledge-base repo (or with the kb-ingest skill). Sourced reads it fresh — refresh here after a change.
            </p>
          </section>
        </>
      )}
    </motion.div>
  );
}
