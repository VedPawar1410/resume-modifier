import { useEffect, useState } from "react";
import { resumeApi } from "./api/resumeApi";
import { JobDescriptionInput } from "./components/JobDescriptionInput";
import { LaTeXInput } from "./components/LaTeXInput";
import { ModeSelector } from "./components/ModeSelector";
import { OutputPanel } from "./components/OutputPanel";
import { RefineForm } from "./components/RefineForm";
import { SectionCheckboxes } from "./components/SectionCheckboxes";
import { StatusBanner } from "./components/StatusBanner";
import { useModifyResume } from "./hooks/useModifyResume";
import type { AppMode, NewEntryPayload } from "./types";
import "./index.css";

const DEFAULT_SECTIONS = ["Experience", "Projects", "Technical Skills"];

export default function App() {
  const [mode, setMode] = useState<AppMode>("tailor");
  const [latexCode, setLatexCode] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [sectionsToModify, setSectionsToModify] = useState<string[]>(DEFAULT_SECTIONS);
  const [targetSection, setTargetSection] = useState("");
  const [newEntry, setNewEntry] = useState<NewEntryPayload>({});
  const [pdflatexAvailable, setPdflatexAvailable] = useState<boolean | null>(null);

  const { submit, result, status, error, pdfUrl, downloadPdf, recompile, recompileStatus } = useModifyResume();

  useEffect(() => {
    resumeApi
      .health()
      .then((h) => setPdflatexAvailable(h.pdflatex_available))
      .catch(() => setPdflatexAvailable(false));
  }, []);

  const handleSubmit = async () => {
    if (!latexCode.trim()) {
      alert("Please paste your LaTeX resume code first.");
      return;
    }
    if (mode === "tailor" && !jobDescription.trim()) {
      alert("Please paste a job description.");
      return;
    }
    if (mode === "refine" && !targetSection) {
      alert("Please select a section to update.");
      return;
    }

    await submit({
      latex_code: latexCode,
      mode,
      ...(mode === "tailor"
        ? { job_description: jobDescription, sections_to_modify: sectionsToModify }
        : { target_section: targetSection, new_entry: newEntry }),
    });
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>📄 Resume Modifier</h1>
        <p className="subtitle">AI-powered tailoring and refinement for your LaTeX resume</p>
        {pdflatexAvailable === false && (
          <div className="banner banner-warning" style={{ marginTop: "8px" }}>
            ⚠️ <strong>pdflatex not found</strong> — PDF download won't work. Modified LaTeX will still be returned.
            Install TeX Live: <code>brew install --cask mactex-no-gui</code>
          </div>
        )}
      </header>

      <main className="app-main">
        <section className="input-panel">
          <ModeSelector mode={mode} onChange={(m) => { setMode(m); setNewEntry({}); setTargetSection(""); }} />

          <LaTeXInput value={latexCode} onChange={setLatexCode} />

          {mode === "tailor" && (
            <>
              <JobDescriptionInput value={jobDescription} onChange={setJobDescription} />
              <SectionCheckboxes
                latexCode={latexCode}
                selected={sectionsToModify}
                onChange={setSectionsToModify}
              />
            </>
          )}

          {mode === "refine" && (
            <RefineForm
              latexCode={latexCode}
              targetSection={targetSection}
              onSectionChange={setTargetSection}
              entry={newEntry}
              onEntryChange={setNewEntry}
            />
          )}

          <StatusBanner status={status} error={error} />

          <button
            className="btn-primary btn-submit"
            onClick={handleSubmit}
            disabled={status === "loading"}
          >
            {status === "loading"
              ? "⏳ Working…"
              : mode === "tailor"
              ? "🎯 Tailor Resume"
              : "✏️ Update Resume"}
          </button>
        </section>

        <section className="output-column">
          {status === "success" && result ? (
            <OutputPanel
              result={result}
              pdfUrl={pdfUrl}
              onDownloadPdf={downloadPdf}
              recompile={recompile}
              recompileStatus={recompileStatus}
            />
          ) : (
            <div className="output-placeholder">
              <div className="placeholder-icon">📋</div>
              <p>Your modified resume will appear here after you submit.</p>
              {mode === "tailor" && (
                <ul className="placeholder-tips">
                  <li>Paste your LaTeX resume on the left</li>
                  <li>Add the job description</li>
                  <li>Choose which sections to tailor</li>
                  <li>Click <strong>Tailor Resume</strong></li>
                </ul>
              )}
              {mode === "refine" && (
                <ul className="placeholder-tips">
                  <li>Paste your LaTeX resume on the left</li>
                  <li>Select the section to update</li>
                  <li>Fill in the details</li>
                  <li>Click <strong>Update Resume</strong></li>
                </ul>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
