import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "../../hooks/useTheme";
import type { Route, Step } from "../../hooks/useRoute";
import { jobPath, navigate } from "../../hooks/useRoute";
import type { Job } from "../../types";
import { ScoreBadge } from "../job/badges";
import { SearchIcon } from "../Icons";

interface Item {
  id: string;
  group: "Actions" | "This job" | "Jobs";
  label: string;
  hint?: string;
  job?: Job;
  run: () => void;
}

const STEP_LABELS: [Step, string][] = [
  ["fit", "Fit check"],
  ["resume", "Résumé"],
  ["match", "Match report"],
  ["outreach", "Outreach"],
  ["qa", "Application Q&A"],
];

// Every letter of the query, in order, somewhere in the text ("nwbe" finds "Northwind — Backend").
// Earlier, tighter matches rank higher.
function fuzzyScore(text: string, query: string): number | null {
  const t = text.toLowerCase();
  let pos = -1;
  let gaps = 0;
  for (const ch of query.toLowerCase()) {
    if (ch === " ") continue;
    const next = t.indexOf(ch, pos + 1);
    if (next === -1) return null;
    gaps += next - pos - 1;
    pos = next;
  }
  return gaps + (t.startsWith(query.toLowerCase()) ? -100 : 0);
}

interface Props {
  open: boolean;
  onClose: () => void;
  jobs: Job[] | null;
  route: Route;
}

export function CommandPalette({ open, onClose, jobs, route }: Props) {
  const { toggle: toggleTheme, theme } = useTheme();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  const items = useMemo<Item[]>(() => {
    const go = (path: string) => () => navigate(path);
    const all: Item[] = [
      { id: "new", group: "Actions", label: "New job", hint: "paste a JD", run: go("/") },
      { id: "kb", group: "Actions", label: "Knowledge base", run: go("/kb") },
      { id: "theme", group: "Actions", label: `Switch to ${theme === "dark" ? "light" : "dark"} theme`, run: toggleTheme },
    ];
    if (route.name === "job") {
      for (const [step, label] of STEP_LABELS)
        all.push({ id: `step-${step}`, group: "This job", label, run: go(jobPath(route.id, step)) });
    }
    for (const j of jobs ?? []) all.push({ id: `job-${j.id}`, group: "Jobs", label: j.label, job: j, run: go(jobPath(j.id)) });

    const q = query.trim();
    if (!q) return all.slice(0, 14);
    return all
      .map((it) => ({ it, s: fuzzyScore(it.label, q) }))
      .filter((x) => x.s !== null)
      .sort((a, b) => a.s! - b.s!)
      .slice(0, 14)
      .map((x) => x.it);
  }, [jobs, query, route, theme, toggleTheme]);

  // Opening: remember what had focus, reset, focus the input. Closing: give focus back.
  useEffect(() => {
    if (open) {
      returnFocus.current = document.activeElement as HTMLElement | null;
      setTimeout(() => inputRef.current?.focus(), 0);
    } else {
      returnFocus.current?.focus?.();
    }
  }, [open]);

  const close = () => {
    setQuery("");
    setCursor(0);
    onClose();
  };
  const run = (it: Item | undefined) => {
    if (!it) return;
    close();
    it.run();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      run(items[cursor]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="palette-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          onMouseDown={(e) => e.target === e.currentTarget && close()}
        >
          <motion.div
            className="palette"
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            initial={{ opacity: 0, scale: 0.97, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.12 }}
          >
            <label className="palette__search">
              <SearchIcon size={16} />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setCursor(0);
                }}
                onKeyDown={onKey}
                placeholder="Type a command or search jobs…"
                aria-label="Command or job"
                aria-controls="palette-list"
                aria-activedescendant={items[cursor] ? `pal-${items[cursor].id}` : undefined}
                role="combobox"
                aria-expanded="true"
              />
            </label>
            <ul className="palette__list" id="palette-list" role="listbox">
              {items.length === 0 && <li className="palette__empty">Nothing matches.</li>}
              {items.map((it, i) => {
                const header = i === 0 || items[i - 1].group !== it.group ? it.group : null;
                return (
                  <li key={it.id} role="presentation">
                    {header && <p className="eyebrow palette__group">{header}</p>}
                    <div
                      id={`pal-${it.id}`}
                      role="option"
                      aria-selected={i === cursor}
                      className={`palette__item ${i === cursor ? "is-on" : ""}`}
                      onMouseEnter={() => setCursor(i)}
                      onClick={() => run(it)}
                    >
                      {it.job && <ScoreBadge score={it.job.fit_score} verdict={it.job.fit_verdict} />}
                      <span className="palette__label">{it.label}</span>
                      {it.hint && <span className="palette__hint">{it.hint}</span>}
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="palette__foot mono">↑↓ move · ↵ open · esc close</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
