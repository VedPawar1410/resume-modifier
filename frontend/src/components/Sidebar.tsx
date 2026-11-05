import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { resumeApi } from "../api/resumeApi";
import type { HistoryRecord } from "../types";
import { parseDate } from "../utils/dates";
import { AlertIcon, CheckIcon, CloseIcon, PencilIcon, PlusIcon, SidebarIcon, TrashIcon } from "./Icons";

interface Props {
  activeId: number | null;
  version: number; // bump to reload the list
  pdflatexOk: boolean | null;
  onNew: () => void;
  onOpen: (record: HistoryRecord) => void;
  onDeleted: (id: number) => void;
  onRenamed: (id: number, label: string) => void;
  onCollapse: () => void;
}

function dayGroup(d: Date): string {
  const today = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(today) - startOf(d)) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return "This week";
  return d.toLocaleDateString([], { month: "long", year: "numeric" });
}

function groupRecords(records: HistoryRecord[]): [string, HistoryRecord[]][] {
  const groups = new Map<string, HistoryRecord[]>();
  for (const r of records) {
    const key = dayGroup(parseDate(r.created_at));
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return [...groups.entries()];
}

export function Sidebar({ activeId, version, pdflatexOk, onNew, onOpen, onDeleted, onRenamed, onCollapse }: Props) {
  const [records, setRecords] = useState<HistoryRecord[] | null>(null);
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draftLabel, setDraftLabel] = useState("");

  useEffect(() => {
    let cancelled = false;
    resumeApi
      .listHistory()
      .then((r) => !cancelled && setRecords(r.records))
      .catch(() => !cancelled && setRecords([]));
    return () => {
      cancelled = true;
    };
  }, [version]);

  const remove = async (id: number) => {
    await resumeApi.deleteHistory(id);
    setRecords((prev) => prev?.filter((r) => r.id !== id) ?? prev);
    setConfirmingId(null);
    onDeleted(id);
  };

  const startRename = (r: HistoryRecord) => {
    setEditingId(r.id);
    setDraftLabel(r.label);
  };

  const commitRename = async () => {
    const id = editingId;
    const label = draftLabel.trim();
    setEditingId(null);
    if (id === null || !label) return;
    const updated = await resumeApi.renameHistory(id, label);
    setRecords((prev) => prev?.map((r) => (r.id === id ? updated : r)) ?? prev);
    onRenamed(id, updated.label);
  };

  return (
    <aside className="sidebar">
      <div className="sidebar__top">
        <div className="brand">
          <span className="brand__serif">résumé</span>
          <span className="brand__mono">.modifier</span>
        </div>
        <button className="icon-btn" onClick={onCollapse} aria-label="Hide sidebar" title="Hide sidebar">
          <SidebarIcon />
        </button>
      </div>

      <button className="btn btn--ink btn--block" onClick={onNew}>
        <PlusIcon /> New résumé
      </button>

      <nav className="history" aria-label="Your résumés">
        {records === null && <p className="history__empty">Loading…</p>}
        {records?.length === 0 && (
          <p className="history__empty">Résumés you generate will appear here.</p>
        )}
        {records && records.length > 0 &&
          groupRecords(records).map(([group, items]) => (
            <section key={group} className="history__group">
              <h3 className="eyebrow">{group}</h3>
              <ul>
                <AnimatePresence initial={false}>
                  {items.map((r, i) => (
                    <motion.li
                      key={r.id}
                      layout
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0, transition: { delay: Math.min(i, 8) * 0.03 } }}
                      exit={{ opacity: 0, x: -8, transition: { duration: 0.18 } }}
                      className={`history-item ${r.id === activeId ? "is-active" : ""}`}
                    >
                      {confirmingId === r.id ? (
                        <div className="history-item__confirm">
                          <span>Delete this résumé?</span>
                          <button className="btn btn--danger btn--xs" onClick={() => remove(r.id)}>Delete</button>
                          <button className="btn btn--ghost btn--xs" onClick={() => setConfirmingId(null)}>Cancel</button>
                        </div>
                      ) : editingId === r.id ? (
                        <form
                          className="history-item__rename"
                          onSubmit={(e) => { e.preventDefault(); commitRename(); }}
                        >
                          <input
                            autoFocus
                            value={draftLabel}
                            onChange={(e) => setDraftLabel(e.target.value)}
                            onKeyDown={(e) => e.key === "Escape" && setEditingId(null)}
                            aria-label="Résumé name"
                          />
                          <button type="submit" className="icon-btn icon-btn--sm" aria-label="Save name"><CheckIcon size={14} /></button>
                          <button type="button" className="icon-btn icon-btn--sm" aria-label="Cancel" onClick={() => setEditingId(null)}>
                            <CloseIcon size={14} />
                          </button>
                        </form>
                      ) : (
                        <>
                          <button className="history-item__main" onClick={() => onOpen(r)} title={r.label}>
                            <span className="history-item__title">{r.label}</span>
                            <span className="history-item__meta">
                              {parseDate(r.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                            </span>
                          </button>
                          <span className="history-item__actions">
                            <button className="icon-btn icon-btn--sm" aria-label="Rename" title="Rename" onClick={() => startRename(r)}>
                              <PencilIcon size={14} />
                            </button>
                            <button className="icon-btn icon-btn--sm icon-btn--danger" aria-label="Delete" title="Delete" onClick={() => setConfirmingId(r.id)}>
                              <TrashIcon size={14} />
                            </button>
                          </span>
                        </>
                      )}
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            </section>
          ))}
      </nav>

      {pdflatexOk === false && (
        <div className="sidebar__warning">
          <AlertIcon size={14} />
          <span>pdflatex not found — PDFs can't be built. <code>brew install --cask mactex-no-gui</code></span>
        </div>
      )}
    </aside>
  );
}
