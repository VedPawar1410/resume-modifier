import type { KBStatus } from "../types";

interface Props {
  status: KBStatus | null;
  onRefresh: () => void;
}

export function KbPanel({ status, onRefresh }: Props) {
  if (!status) {
    return <p className="hint">Loading knowledge base…</p>;
  }

  if (!status.found) {
    return (
      <div className="banner banner-warning">
        <span>⚠</span>
        <span>
          <strong>Knowledge base not found</strong> at <code>{status.path}</code>. Set <code>KB_PATH</code> in{" "}
          <code>.env</code> and refresh.
        </span>
      </div>
    );
  }

  const counts = Object.entries(status.entries_by_section).filter(([, n]) => n > 0);
  const noProjects = !status.entries_by_section.projects;

  return (
    <div className="field-group">
      <div className="field-header">
        <label className="field-label">Knowledge base</label>
        <button className="btn-text" onClick={onRefresh}>↻ Refresh</button>
      </div>
      <p className="hint">
        {status.entry_count} entries · {counts.map(([section, n]) => `${n} ${section}`).join(" · ")}
        {status.last_updated && <> · updated {status.last_updated}</>}
      </p>
      {noProjects && (
        <p className="hint">
          No projects yet — résumés will have no Projects section. Add some with the kb-ingest skill.
        </p>
      )}
    </div>
  );
}
