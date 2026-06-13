import type { BaseResumeSummary } from "../types";

interface Props {
  bases: BaseResumeSummary[];
  selectedBaseId: number | null;
  onSelect: (id: number) => void;
  onNewBase: () => void;
  onDelete: (id: number) => void;
}

export function BaseSelector({ bases, selectedBaseId, onSelect, onNewBase, onDelete }: Props) {
  const selected = bases.find((b) => b.id === selectedBaseId);

  return (
    <div className="field-group">
      <div className="field-header">
        <label className="field-label">Base résumé</label>
        <button className="btn-text" onClick={onNewBase}>
          ＋ New base
        </button>
      </div>

      {bases.length === 0 ? (
        <p className="hint">
          No base résumé yet. Create one from scratch or paste your LaTeX — it becomes the
          master that every job-tailored version is built from.
        </p>
      ) : (
        <div className="base-selector-row">
          <select
            className="section-select"
            value={selectedBaseId ?? ""}
            onChange={(e) => onSelect(Number(e.target.value))}
          >
            {bases.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          {selected && (
            <button
              className="btn-ghost"
              title="Delete this base résumé"
              onClick={() => {
                if (confirm(`Delete base résumé "${selected.name}"? This cannot be undone.`)) {
                  onDelete(selected.id);
                }
              }}
            >
              Delete
            </button>
          )}
        </div>
      )}
      {selected && (
        <p className="hint">
          Tailoring reads from this base and saves a copy to history — the base stays untouched.
          “Update content” edits this base in place.
        </p>
      )}
    </div>
  );
}
