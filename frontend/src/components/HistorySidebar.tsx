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
      // silently ignore
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
      {/* Collapsed toggle — icon only */}
      <button
        className="history-sidebar__toggle"
        onClick={onToggle}
        aria-label={isOpen ? "Close history" : "Open history"}
        title="Resume history"
      >
        <div className="history-sidebar__toggle-icon">
          {isOpen ? "←" : "☰"}
        </div>
      </button>

      {isOpen && (
        <div className="history-sidebar__body">
          <div className="history-sidebar__header">
            <h2>Recent</h2>
            <button
              className="btn-text"
              onClick={load}
              title="Refresh"
              aria-label="Refresh history"
              style={{ padding: "4px 8px", height: "auto", fontSize: "0.75rem" }}
            >
              ↻ Refresh
            </button>
          </div>

          {loading && (
            <div className="history-sidebar__state">
              <span className="spinner" style={{ width: 14, height: 14 }} /> Loading…
            </div>
          )}

          {error && (
            <div className="banner banner-error" style={{ margin: "8px 12px", fontSize: "0.8rem" }}>
              {error}
            </div>
          )}

          {!loading && !error && records.length === 0 && (
            <div className="history-sidebar__state history-sidebar__empty">
              <span style={{ fontSize: "1.5rem" }}>📂</span>
              <p style={{ fontWeight: 500, color: "var(--text)" }}>No history yet</p>
              <p style={{ fontSize: "0.8125rem" }}>Submit a modification to start building history.</p>
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
                    <span>{formatDate(record.created_at)}</span>
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
