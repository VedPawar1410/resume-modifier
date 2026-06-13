import type {
  CareerInfo,
  EducationEntry,
  ExperienceEntry,
  ProjectEntry,
} from "../types";

interface Props {
  value: CareerInfo;
  onChange: (info: CareerInfo) => void;
}

const CONTACT_FIELDS: { key: keyof CareerInfo; label: string; placeholder: string }[] = [
  { key: "name", label: "Full name", placeholder: "e.g. Ved Pawar" },
  { key: "email", label: "Email", placeholder: "e.g. ved@example.com" },
  { key: "phone", label: "Phone", placeholder: "e.g. +91-7829438056" },
  { key: "location", label: "Location", placeholder: "e.g. Bangalore, India" },
  { key: "linkedin", label: "LinkedIn URL", placeholder: "e.g. linkedin.com/in/ved" },
  { key: "github", label: "GitHub URL", placeholder: "e.g. github.com/VedPawar1410" },
  { key: "website", label: "Website / Portfolio", placeholder: "optional" },
];

export function CareerInfoForm({ value, onChange }: Props) {
  const set = (patch: Partial<CareerInfo>) => onChange({ ...value, ...patch });

  // Generic list helpers ------------------------------------------------------
  const updateRow = <T,>(list: T[], i: number, patch: Partial<T>): T[] =>
    list.map((row, idx) => (idx === i ? { ...row, ...patch } : row));
  const removeRow = <T,>(list: T[], i: number): T[] => list.filter((_, idx) => idx !== i);

  return (
    <div className="career-form">
      {/* ── Contact ─────────────────────────────────────────────── */}
      <div className="field-group">
        <label className="field-label">Contact</label>
        <div className="sub-fields">
          {CONTACT_FIELDS.map((f) => (
            <div className="sub-field" key={f.key}>
              <label className="sub-label">{f.label}</label>
              <input
                type="text"
                value={(value[f.key] as string) ?? ""}
                placeholder={f.placeholder}
                onChange={(e) => set({ [f.key]: e.target.value } as Partial<CareerInfo>)}
              />
            </div>
          ))}
        </div>
      </div>

      {/* ── Summary ─────────────────────────────────────────────── */}
      <div className="field-group">
        <label className="field-label">Headline / Summary (optional)</label>
        <textarea
          value={value.summary ?? ""}
          placeholder="e.g. Software Engineer — Full Stack | Java | Cloud | LLMs"
          onChange={(e) => set({ summary: e.target.value })}
          rows={2}
        />
      </div>

      {/* ── Education ───────────────────────────────────────────── */}
      <div className="field-group">
        <div className="field-header">
          <label className="field-label">Education</label>
          <button
            className="btn-text"
            onClick={() => set({ education: [...value.education, {}] })}
          >
            ＋ Add
          </button>
        </div>
        {value.education.map((ed: EducationEntry, i) => (
          <div className="entry-card" key={i}>
            <div className="sub-fields">
              <div className="sub-field">
                <label className="sub-label">School</label>
                <input
                  value={ed.school ?? ""}
                  placeholder="e.g. Vellore Institute of Technology"
                  onChange={(e) =>
                    set({ education: updateRow(value.education, i, { school: e.target.value }) })
                  }
                />
              </div>
              <div className="sub-field">
                <label className="sub-label">Degree</label>
                <input
                  value={ed.degree ?? ""}
                  placeholder="e.g. B.Tech in Computer Science"
                  onChange={(e) =>
                    set({ education: updateRow(value.education, i, { degree: e.target.value }) })
                  }
                />
              </div>
              <div className="sub-field">
                <label className="sub-label">Dates</label>
                <input
                  value={ed.date_range ?? ""}
                  placeholder="e.g. Sep 2021 – Jul 2025"
                  onChange={(e) =>
                    set({ education: updateRow(value.education, i, { date_range: e.target.value }) })
                  }
                />
              </div>
              <div className="sub-field">
                <label className="sub-label">Details (GPA, honors)</label>
                <input
                  value={ed.details ?? ""}
                  placeholder="e.g. CGPA: 8.69/10.0"
                  onChange={(e) =>
                    set({ education: updateRow(value.education, i, { details: e.target.value }) })
                  }
                />
              </div>
            </div>
            <button
              className="btn-ghost entry-remove"
              onClick={() => set({ education: removeRow(value.education, i) })}
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      {/* ── Experience ──────────────────────────────────────────── */}
      <div className="field-group">
        <div className="field-header">
          <label className="field-label">Experience</label>
          <button
            className="btn-text"
            onClick={() => set({ experience: [...value.experience, {}] })}
          >
            ＋ Add
          </button>
        </div>
        {value.experience.map((ex: ExperienceEntry, i) => (
          <div className="entry-card" key={i}>
            <div className="sub-fields">
              <div className="sub-field">
                <label className="sub-label">Company</label>
                <input
                  value={ex.company ?? ""}
                  placeholder="e.g. General Motors"
                  onChange={(e) =>
                    set({ experience: updateRow(value.experience, i, { company: e.target.value }) })
                  }
                />
              </div>
              <div className="sub-field">
                <label className="sub-label">Role</label>
                <input
                  value={ex.role ?? ""}
                  placeholder="e.g. Machine Learning Intern"
                  onChange={(e) =>
                    set({ experience: updateRow(value.experience, i, { role: e.target.value }) })
                  }
                />
              </div>
              <div className="sub-field">
                <label className="sub-label">Location</label>
                <input
                  value={ex.location ?? ""}
                  placeholder="e.g. Bangalore / Remote"
                  onChange={(e) =>
                    set({ experience: updateRow(value.experience, i, { location: e.target.value }) })
                  }
                />
              </div>
              <div className="sub-field">
                <label className="sub-label">Dates</label>
                <input
                  value={ex.date_range ?? ""}
                  placeholder="e.g. Aug 2023 – Nov 2023"
                  onChange={(e) =>
                    set({ experience: updateRow(value.experience, i, { date_range: e.target.value }) })
                  }
                />
              </div>
            </div>
            <div className="sub-field">
              <label className="sub-label">What did you do? (raw notes)</label>
              <textarea
                value={ex.raw_notes ?? ""}
                placeholder="Rough notes on responsibilities and achievements — AI turns these into bullets."
                onChange={(e) =>
                  set({ experience: updateRow(value.experience, i, { raw_notes: e.target.value }) })
                }
                rows={4}
              />
            </div>
            <button
              className="btn-ghost entry-remove"
              onClick={() => set({ experience: removeRow(value.experience, i) })}
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      {/* ── Projects ────────────────────────────────────────────── */}
      <div className="field-group">
        <div className="field-header">
          <label className="field-label">Projects</label>
          <button
            className="btn-text"
            onClick={() => set({ projects: [...value.projects, {}] })}
          >
            ＋ Add
          </button>
        </div>
        {value.projects.map((p: ProjectEntry, i) => (
          <div className="entry-card" key={i}>
            <div className="sub-fields">
              <div className="sub-field">
                <label className="sub-label">Project name</label>
                <input
                  value={p.name ?? ""}
                  placeholder="e.g. AI Resume Modifier"
                  onChange={(e) =>
                    set({ projects: updateRow(value.projects, i, { name: e.target.value }) })
                  }
                />
              </div>
              <div className="sub-field">
                <label className="sub-label">Tech stack</label>
                <input
                  value={p.tech ?? ""}
                  placeholder="e.g. React, FastAPI, Claude API"
                  onChange={(e) =>
                    set({ projects: updateRow(value.projects, i, { tech: e.target.value }) })
                  }
                />
              </div>
              <div className="sub-field">
                <label className="sub-label">Links</label>
                <input
                  value={p.links ?? ""}
                  placeholder="e.g. github.com/you/proj | demo.io"
                  onChange={(e) =>
                    set({ projects: updateRow(value.projects, i, { links: e.target.value }) })
                  }
                />
              </div>
              <div className="sub-field">
                <label className="sub-label">Date</label>
                <input
                  value={p.date ?? ""}
                  placeholder="e.g. Dec 2025"
                  onChange={(e) =>
                    set({ projects: updateRow(value.projects, i, { date: e.target.value }) })
                  }
                />
              </div>
            </div>
            <div className="sub-field">
              <label className="sub-label">What did you build? (raw notes)</label>
              <textarea
                value={p.raw_notes ?? ""}
                placeholder="What you built, key features, metrics — AI turns these into bullets."
                onChange={(e) =>
                  set({ projects: updateRow(value.projects, i, { raw_notes: e.target.value }) })
                }
                rows={4}
              />
            </div>
            <button
              className="btn-ghost entry-remove"
              onClick={() => set({ projects: removeRow(value.projects, i) })}
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      {/* ── Skills ──────────────────────────────────────────────── */}
      <div className="field-group">
        <label className="field-label">Technical skills</label>
        <textarea
          value={value.skills ?? ""}
          placeholder={
            "Group by category, one per line, e.g.\n" +
            "Languages: Python, Java, TypeScript\n" +
            "Frameworks: React, FastAPI, Spring Boot\n" +
            "Cloud: GCP, AWS, Docker, Kubernetes"
          }
          onChange={(e) => set({ skills: e.target.value })}
          rows={4}
        />
      </div>
    </div>
  );
}
