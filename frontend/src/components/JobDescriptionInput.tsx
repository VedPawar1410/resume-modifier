interface Props {
  value: string;
  onChange: (v: string) => void;
}

export function JobDescriptionInput({ value, onChange }: Props) {
  return (
    <div className="field-group">
      <label className="field-label">Job description</label>
      <textarea
        className="jd-textarea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Paste the full job description here — requirements, responsibilities, preferred skills…"
        spellCheck
      />
      {value.length > 0 && (
        <p className="char-count">{value.length.toLocaleString()} chars</p>
      )}
    </div>
  );
}
