import { useEffect, useState } from "react";
import { resumeApi } from "./api/resumeApi";
import { HistorySidebar } from "./components/HistorySidebar";
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
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyVersion, setHistoryVersion] = useState(0);

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

    setHistoryVersion((v) => v + 1);
  };

  const handleRestoreFromHistory = (latex: string) => {
    setLatexCode(latex);
    setHistoryOpen(false);
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header__icon">📄</div>
        <div className="app-header__text">
          <h1>Resume Modifier</h1>
          <p className="subtitle">AI-powered tailoring and refinement for your LaTeX resume</p>
        </div>
      </header>

      {pdflatexAvailable === false && (
        <div className="header-warning">
          ⚠️ <strong>pdflatex not found</strong> — PDF download won't work. Modified LaTeX will still be returned.
          Install TeX Live: <code>brew install --cask mactex-no-gui</code>
        </div>
      )}

      <div className="app-body">
        <HistorySidebar
          isOpen={historyOpen}
          onToggle={() => setHistoryOpen((o) => !o)}
          onRestore={handleRestoreFromHistory}
          version={historyVersion}
        />

        <div className="app-content">
          <main className="app-main">
            <div className="panel-card">
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
                  {status === "loading" ? (
                    <><span className="spinner" />Working…</>
                  ) : mode === "tailor" ? (
                    "Tailor Resume"
                  ) : (
                    "Update Resume"
                  )}
                </button>
              </section>
            </div>

            <div className="panel-card">
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
                    <p className="placeholder-title">Your modified resume will appear here</p>
                    <p style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
                      {mode === "tailor"
                        ? "Paste your LaTeX, add a job description, and click Tailor Resume."
                        : "Paste your LaTeX, pick a section, fill in the details, and click Update Resume."}
                    </p>
                    {mode === "tailor" && (
                      <ul className="placeholder-tips">
                        <li>Paste your LaTeX resume on the left</li>
                        <li>Add the job description</li>
                        <li>Choose which sections to tailor</li>
                        <li>Click Tailor Resume</li>
                      </ul>
                    )}
                    {mode === "refine" && (
                      <ul className="placeholder-tips">
                        <li>Paste your LaTeX resume on the left</li>
                        <li>Select the section to update</li>
                        <li>Fill in the details</li>
                        <li>Click Update Resume</li>
                      </ul>
                    )}
                  </div>
                )}
              </section>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
