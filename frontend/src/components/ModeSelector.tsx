import { motion } from "framer-motion";
import type { AppMode } from "../types";

interface Props {
  mode: AppMode;
  onChange: (mode: AppMode) => void;
}

const modes: { id: AppMode; label: string; icon: string }[] = [
  { id: "tailor", label: "Tailor to Job", icon: "✦" },
  { id: "refine", label: "Update Base", icon: "✎" },
];

export function ModeSelector({ mode, onChange }: Props) {
  return (
    <div className="mode-selector">
      {modes.map((m) => (
        <button
          key={m.id}
          className={`mode-btn ${mode === m.id ? "active" : ""}`}
          onClick={() => onChange(m.id)}
        >
          {mode === m.id && (
            <motion.div
              layoutId="mode-pill"
              className="mode-pill"
              transition={{ type: "spring", stiffness: 400, damping: 35 }}
            />
          )}
          <span className="mode-btn-label">
            <span>{m.icon}</span>
            {m.label}
          </span>
        </button>
      ))}
    </div>
  );
}
