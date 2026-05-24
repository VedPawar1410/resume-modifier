import { useState } from "react";

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export function LaTeXInput({ value, onChange }: Props) {
  const [loading, setLoading] = useState(false);

  const loadSample = async () => {
    setLoading(true);
    try {
      const res = await fetch("/sample.tex");
      const text = await res.text();
      onChange(text);
    } catch {
      alert("Could not load sample resume.");
    } finally {
      setLoading(false);
    }
  };

  const charCount = value.length;
  const isWarning = charCount > 10_000;

  return (
    <div className="field-group">
      <div className="field-header">
        <label className="field-label">Your Resume (LaTeX Code)</label>
        <button className="btn-ghost" onClick={loadSample} disabled={loading}>
          {loading ? "Loading…" : "Load my sample"}
        </button>
      </div>
      <textarea
        className="latex-textarea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={"Paste your full LaTeX resume code here…\n\nTip: Use 'Load my sample' to see an example."}
        spellCheck={false}
      />
      {charCount > 0 && (
        <p className={`char-count ${isWarning ? "warning" : ""}`}>
          {charCount.toLocaleString()} chars
          {isWarning && " — very long; consider shortening"}
        </p>
      )}
    </div>
  );
}
