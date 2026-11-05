import { useEffect, useState } from "react";
import { resumeApi } from "./api/resumeApi";
import { HistorySidebar } from "./components/HistorySidebar";
import { JobDescriptionInput } from "./components/JobDescriptionInput";
import { KbPanel } from "./components/KbPanel";
import { OutputPanel } from "./components/OutputPanel";
import { StatusBanner } from "./components/StatusBanner";
import { useGenerateResume } from "./hooks/useGenerateResume";
import type { KBStatus } from "./types";
import "./index.css";

export default function App() {
  const [jobDescription, setJobDescription] = useState("");
  const [kb, setKb] = useState<KBStatus | null>(null);

  const [pdflatexAvailable, setPdflatexAvailable] = useState<boolean | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyVersion, setHistoryVersion] = useState(0);

  const { generate, showLatex, result, status, error, pdfUrl, downloadPdf, recompile, recompileStatus } =
    useGenerateResume();

  const loadKb = () => {
    resumeApi
      .kbStatus()
      .then(setKb)
      .catch(() => setKb(null));
  };

  // ── Load health + knowledge-base status on mount ───────────────────────────
  useEffect(() => {
    resumeApi
      .health()
      .then((h) => setPdflatexAvailable(h.pdflatex_available))
      .catch(() => setPdflatexAvailable(false));
    loadKb();
  }, []);

  const handleGenerate = async () => {
    if (!jobDescription.trim()) {
      alert("Please paste a job description.");
      return;
    }
    await generate(jobDescription);
    setHistoryVersion((v) => v + 1);
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header__lights" aria-hidden="true">
          <span /><span /><span />
        </div>
        <div className="app-header__text">
          <h1>resume.<b>modifier</b></h1>
          <p className="subtitle">Job-tailored LaTeX résumés from your knowledge base</p>
        </div>
        {pdflatexAvailable !== null && (
          <span className={`status-pill ${pdflatexAvailable ? "status-pill--ok" : "status-pill--off"}`}>
            <span className="status-pill__dot" />
            {pdflatexAvailable ? "pdflatex ready" : "pdflatex offline"}
          </span>
        )}
      </header>

      {pdflatexAvailable === false && (
        <div className="header-warning">
          ⚠️ <strong>pdflatex not found</strong> — PDF download won't work. Generated LaTeX will still be returned.
          Install TeX Live: <code>brew install --cask mactex-no-gui</code>
        </div>
      )}

      <div className="app-body">
        <HistorySidebar
          isOpen={historyOpen}
          onToggle={() => setHistoryOpen((o) => !o)}
          onRestore={(latex) => { showLatex(latex); setHistoryOpen(false); }}
          version={historyVersion}
        />

        <div className="app-content">
          <main className="app-main">
            <div className="panel-card">
              <section className="input-panel">
                <KbPanel status={kb} onRefresh={loadKb} />

                <JobDescriptionInput value={jobDescription} onChange={setJobDescription} />

                <StatusBanner status={status} error={error} />

                <button
                  className="btn-primary btn-submit"
                  onClick={handleGenerate}
                  disabled={status === "loading" || !kb?.found}
                >
                  {status === "loading" ? (
                    <><span className="spinner" />Writing your résumé…</>
                  ) : (
                    "Generate Résumé"
                  )}
                </button>
              </section>
            </div>

            <div className="panel-card">
              <section className="output-column">
                {result ? (
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
                    <p className="placeholder-title">Your résumé will appear here</p>
                    <p style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
                      Paste a job description and click Generate Résumé. The AI picks the most relevant
                      entries from your knowledge base and writes a one-page résumé.
                    </p>
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
