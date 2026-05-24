import { useMemo } from "react";

const DEFAULT_SECTIONS = ["Experience", "Projects", "Technical Skills"];

interface Props {
  latexCode: string;
  selected: string[];
  onChange: (sections: string[]) => void;
}

function parseSectionNames(latex: string): string[] {
  const pattern = /\\section\{([^}]+)\}/g;
  const names: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(latex)) !== null) {
    names.push(m[1].trim());
  }
  return names.length > 0 ? names : DEFAULT_SECTIONS;
}

export function SectionCheckboxes({ latexCode, selected, onChange }: Props) {
  const sections = useMemo(() => parseSectionNames(latexCode), [latexCode]);

  const toggle = (name: string) => {
    if (selected.includes(name)) {
      onChange(selected.filter((s) => s !== name));
    } else {
      onChange([...selected, name]);
    }
  };

  return (
    <div className="field-group">
      <label className="field-label">Sections to Tailor</label>
      <div className="checkbox-grid">
        {sections.map((name) => (
          <label key={name} className="checkbox-label">
            <input
              type="checkbox"
              checked={selected.includes(name)}
              onChange={() => toggle(name)}
            />
            {name}
          </label>
        ))}
      </div>
      <p className="hint">Select which sections AI should rewrite for this job.</p>
    </div>
  );
}
