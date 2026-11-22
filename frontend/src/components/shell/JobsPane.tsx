import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import { jobPath, navigate } from "../../hooks/useRoute";
import type { FitVerdict, Job, JobStatus } from "../../types";
import { JOB_STATUSES } from "../../types";
import { splitLabel } from "../../utils/jobs";
import { parseDate } from "../../utils/dates";
import { ScoreBadge, StatusPill } from "../job/badges";
import { SearchIcon } from "../Icons";

type Filter = { kind: "verdict"; value: FitVerdict } | { kind: "status"; value: JobStatus } | null;

const VERDICT_FILTERS: { value: FitVerdict; label: string }[] = [
  { value: "apply", label: "Apply" },
  { value: "maybe", label: "Maybe" },
  { value: "skip", label: "Skip" },
];

function dayGroup(d: Date): string {
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(new Date()) - startOf(d)) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return "This week";
  return d.toLocaleDateString([], { month: "long", year: "numeric" });
}

function groupJobs(jobs: Job[]): [string, Job[]][] {
  const groups = new Map<string, Job[]>();
  for (const j of jobs) {
    const key = dayGroup(parseDate(j.created_at));
    groups.set(key, [...(groups.get(key) ?? []), j]);
  }
  return [...groups.entries()];
}

interface Props {
  jobs: Job[] | null;
  activeId: number | null;
  generatingId: number | null;
  page?: boolean; // shown as its own page on phones
}

export function JobsPane({ jobs, activeId, generatingId, page = false }: Props) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>(null);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (jobs ?? []).filter((j) => {
      if (q && !j.label.toLowerCase().includes(q) && !(j.job_description_preview ?? "").toLowerCase().includes(q)) return false;
      if (filter?.kind === "verdict" && j.fit_verdict !== filter.value) return false;
      if (filter?.kind === "status" && j.status !== filter.value) return false;
      return true;
    });
  }, [jobs, query, filter]);

  const toggle = (f: NonNullable<Filter>) =>
    setFilter((cur) => (cur?.kind === f.kind && cur.value === f.value ? null : f));
  const isOn = (f: NonNullable<Filter>) => filter?.kind === f.kind && filter.value === f.value;

  return (
    <aside className={`pane ${page ? "pane--page" : ""}`} aria-label="Your jobs">
      <div className="pane__head">
        <h2 className="pane__title">Jobs</h2>
        <span className="eyebrow">{jobs ? jobs.length : ""}</span>
      </div>

      <label className="search">
        <SearchIcon size={15} />
        <input
          type="search"
          placeholder="Search jobs"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search jobs"
        />
      </label>

      <div className="filters" role="group" aria-label="Filter jobs">
        {VERDICT_FILTERS.map((f) => (
          <button
            key={f.value}
            className={`filter filter--${f.value} ${isOn({ kind: "verdict", value: f.value }) ? "is-on" : ""}`}
            onClick={() => toggle({ kind: "verdict", value: f.value })}
            aria-pressed={isOn({ kind: "verdict", value: f.value })}
          >
            <span className="dot" aria-hidden="true" />
            {f.label}
          </button>
        ))}
        {JOB_STATUSES.map((s) => (
          <button
            key={s.id}
            className={`filter ${isOn({ kind: "status", value: s.id }) ? "is-on" : ""}`}
            onClick={() => toggle({ kind: "status", value: s.id })}
            aria-pressed={isOn({ kind: "status", value: s.id })}
          >
            {s.label}
          </button>
        ))}
      </div>

      <nav className="jobs">
        {jobs === null && <p className="jobs__empty">Loading…</p>}
        {jobs?.length === 0 && <p className="jobs__empty">Jobs you check or generate appear here.</p>}
        {jobs && jobs.length > 0 && shown.length === 0 && <p className="jobs__empty">No jobs match.</p>}
        {groupJobs(shown).map(([group, items]) => (
          <section key={group} className="jobs__group">
            <h3 className="eyebrow">{group}</h3>
            <ul>
              <AnimatePresence initial={false}>
                {items.map((j) => {
                  const [company, role] = splitLabel(j.label);
                  return (
                    <motion.li
                      key={j.id}
                      layout="position"
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -8, transition: { duration: 0.15 } }}
                    >
                      <a
                        href={jobPath(j.id)}
                        className={`job-row ${j.id === activeId ? "is-active" : ""}`}
                        aria-current={j.id === activeId ? "page" : undefined}
                        onClick={(e) => {
                          if (e.metaKey || e.ctrlKey) return; // let ⌘-click open a new tab
                          e.preventDefault();
                          navigate(jobPath(j.id));
                        }}
                      >
                        <ScoreBadge score={j.fit_score} verdict={j.fit_verdict} />
                        <span className="job-row__text">
                          <span className="job-row__title">{role ?? company}</span>
                          <span className="job-row__meta">
                            {role ? company : parseDate(j.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                          </span>
                        </span>
                        <span className="job-row__end">
                          {j.id === generatingId ? (
                            <span className="spinner-dot" aria-label="Writing the résumé" />
                          ) : j.status ? (
                            <StatusPill status={j.status} />
                          ) : !j.has_resume ? (
                            <span className="job-row__flag" title="No résumé yet">no résumé</span>
                          ) : null}
                        </span>
                      </a>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
          </section>
        ))}
      </nav>
    </aside>
  );
}
