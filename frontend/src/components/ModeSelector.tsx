import type { AppMode } from "../types";

interface Props {
  mode: AppMode;
  onChange: (mode: AppMode) => void;
}

export function ModeSelector({ mode, onChange }: Props) {
  return (
    <div className="mode-selector">
      <button
        className={`mode-btn ${mode === "tailor" ? "active" : ""}`}
        onClick={() => onChange("tailor")}
      >
        🎯 Tailor to Job Description
      </button>
      <button
        className={`mode-btn ${mode === "refine" ? "active" : ""}`}
        onClick={() => onChange("refine")}
      >
        ✏️ Add / Update Content
      </button>
    </div>
  );
}
