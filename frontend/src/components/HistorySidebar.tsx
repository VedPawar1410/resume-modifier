import { useEffect, useState } from "react";
import { resumeApi } from "../api/resumeApi";
import type { HistoryRecord } from "../types";

interface Props {
  isOpen: boolean;
  onToggle: () => void;
  onRestore: (latex: string) => void;
  version: number;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function HistorySidebar({ isOpen, onToggle, onRestore, version }: Props) {
  const [records, setRecords] = useState<HistoryRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await resumeApi.listHistory();
      setRecords(data.records);
    } catch {
      setError("Could not load history.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) load();
  }, [isOpen, version]);

  const handleDelete = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    try {
      await resumeApi.deleteHistory(id);
      setRecords((prev) => prev.filter((r) => r.id !== id));
    } catch {
      // silently ignore — record may have already been deleted
    }
  };

  const handleRestore = async (id: number) => {
    setRestoringId(id);
    try {
      const data = await resumeApi.getHistoryLatex(id);
      onRestore(data.modified_latex);
    } catch {
      setError("Failed to load this resume.");
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <aside className={`history-sidebar ${isOpen ? "history-sidebar--open" : "history-sidebar--closed"}`}>
      <button
        className="history-sidebar__toggle"
        onClick={onToggle}
        aria-label={isOpen ? "Close history sidebar" : "Open history sidebar"}
        title="Resume history"
      >
        <span className="history-sidebar__toggle-icon">{isOpen ? "◀" : "▶"}</span>
        {!isOpen && <span className="history-sidebar__toggle-label">History</span>}
      </button>

      {isOpen && (
        <div className="history-sidebar__body">
          <div className="history-sidebar__header">
            <h2>History</h2>
            <button className="btn-ghost" onClick={load} title="Refresh" aria-label="Refresh history">
              ↻
            </button>
          </div>

          {loading && (
            <div className="history-sidebar__state">
              Loading…
            </div>
          )}

          {error && (
            <div className="banner banner-error" style={{ margin: "12px" }}>
              {error}
            </div>
          )}

          {!loading && !error && records.length === 0 && (
            <div className="history-sidebar__state history-sidebar__empty">
              <p>No saved resumes yet.</p>
              <p>Submit a modification to start building history.</p>
            </div>
          )}

          <ul className="history-list">
            {records.map((record) => (
              <li key={record.id} className="history-card">
                <button
                  className="history-card__restore-btn"
                  onClick={() => handleRestore(record.id)}
                  disabled={restoringId === record.id}
                  aria-label={`Restore: ${record.label}`}
                >
                  <div className="history-card__label">
                    {restoringId === record.id ? "Loading…" : record.label}
                  </div>
                  <div className="history-card__meta">
                    <span className="history-card__date">{formatDate(record.created_at)}</span>
                    {record.sections_modified.length > 0 && (
                      <span className="history-card__sections">
                        {record.sections_modified.join(", ")}
                      </span>
                    )}
                  </div>
                  {record.job_description_preview && (
                    <div className="history-card__jd-preview">
                      {record.job_description_preview}
                    </div>
                  )}
                </button>

                <div className="history-card__actions">
                  <a
                    href={resumeApi.getHistoryPdfUrl(record.id)}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-ghost history-card__pdf-btn"
                    title="View PDF"
                    onClick={(e) => e.stopPropagation()}
                  >
                    PDF
                  </a>
                  <button
                    className="btn-ghost history-card__delete-btn"
                    onClick={(e) => handleDelete(e, record.id)}
                    title="Delete"
                    aria-label="Delete this history entry"
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}
