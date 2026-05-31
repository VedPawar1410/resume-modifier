import { useMemo } from "react";
import type { NewEntryPayload } from "../types";

const DEFAULT_SECTIONS = ["Experience", "Projects", "Technical Skills", "Education", "Certifications"];

interface Props {
  latexCode: string;
  targetSection: string;
  onSectionChange: (s: string) => void;
  entry: NewEntryPayload;
  onEntryChange: (e: NewEntryPayload) => void;
}

function parseSectionNames(latex: string): string[] {
  const pattern = /\\section\{([^}]+)\}/g;
  const names: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(latex)) !== null) names.push(m[1].trim());
  return names.length > 0 ? names : DEFAULT_SECTIONS;
}

function field(label: string, value: string, key: keyof NewEntryPayload, placeholder: string, onChange: (e: NewEntryPayload) => void, entry: NewEntryPayload) {
  return (
    <div className="sub-field" key={key}>
      <label className="sub-label">{label}</label>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(ev) => onChange({ ...entry, [key]: ev.target.value })}
      />
    </div>
  );
}

export function RefineForm({ latexCode, targetSection, onSectionChange, entry, onEntryChange }: Props) {
  const sections = useMemo(() => parseSectionNames(latexCode), [latexCode]);

  return (
    <div className="field-group">
      <label className="field-label">Section to update</label>
      <select
        value={targetSection}
        onChange={(e) => onSectionChange(e.target.value)}
        className="section-select"
      >
        <option value="">-- Select a section --</option>
        {sections.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>

      {targetSection === "Experience" && (
        <div className="sub-fields">
          <p className="hint">Fill in the details for your new job/internship.</p>
          {field("Company / Organization", entry.company ?? "", "company", "e.g. Anthropic", onEntryChange, entry)}
          {field("Role / Title", entry.role ?? "", "role", "e.g. Software Engineer Intern", onEntryChange, entry)}
          {field("Location", entry.location ?? "", "location", "e.g. San Francisco, CA / Remote", onEntryChange, entry)}
          {field("Date Range", entry.date_range ?? "", "date_range", "e.g. June 2025 – August 2025", onEntryChange, entry)}
          <div className="sub-field">
            <label className="sub-label">What did you do? (raw notes)</label>
            <textarea
              value={entry.raw_notes ?? ""}
              placeholder={"Paste raw notes, bullet points, or a rough description of your responsibilities and achievements.\nAI will turn these into professional resume bullets."}
              onChange={(e) => onEntryChange({ ...entry, raw_notes: e.target.value })}
              rows={5}
            />
          </div>
        </div>
      )}

      {targetSection === "Projects" && (
        <div className="sub-fields">
          <p className="hint">Fill in the details for your new project.</p>
          {field("Project Name", entry.project_name ?? "", "project_name", "e.g. AI Resume Modifier", onEntryChange, entry)}
          {field("Links (GitHub, Live Demo)", entry.links ?? "", "links", "e.g. github.com/you/project | live-demo.io", onEntryChange, entry)}
          {field("Date", entry.date ?? "", "date", "e.g. May'2025", onEntryChange, entry)}
          <div className="sub-field">
            <label className="sub-label">What did you build? (raw notes)</label>
            <textarea
              value={entry.raw_notes ?? ""}
              placeholder={"Describe what you built, the tech stack, key features, and any metrics.\nAI will generate professional bullet points."}
              onChange={(e) => onEntryChange({ ...entry, raw_notes: e.target.value })}
              rows={5}
            />
          </div>
        </div>
      )}

      {targetSection === "Technical Skills" && (
        <div className="sub-fields">
          <p className="hint">List new skills to add. AI will integrate them into the appropriate categories.</p>
          <div className="sub-field">
            <label className="sub-label">New Skills</label>
            <input
              type="text"
              value={entry.new_skills ?? ""}
              placeholder="e.g. Go, Rust, LangChain, Terraform, Kafka"
              onChange={(e) => onEntryChange({ ...entry, new_skills: e.target.value })}
            />
          </div>
        </div>
      )}

      {targetSection && !["Experience", "Projects", "Technical Skills"].includes(targetSection) && (
        <div className="sub-fields">
          <p className="hint">Describe what you want to add to the {targetSection} section.</p>
          <div className="sub-field">
            <label className="sub-label">Details / Notes</label>
            <textarea
              value={entry.raw_notes ?? ""}
              placeholder={`Describe the new ${targetSection} entry you want to add…`}
              onChange={(e) => onEntryChange({ ...entry, raw_notes: e.target.value })}
              rows={5}
            />
          </div>
        </div>
      )}
    </div>
  );
}
