import { useEffect, useState } from "react";
import { resumeApi } from "./api/resumeApi";
import { BaseSelector } from "./components/BaseSelector";
import { CareerInfoForm } from "./components/CareerInfoForm";
import { HistorySidebar } from "./components/HistorySidebar";
import { JobDescriptionInput } from "./components/JobDescriptionInput";
import { LaTeXInput } from "./components/LaTeXInput";
import { ModeSelector } from "./components/ModeSelector";
import { ResumeViewer } from "./components/ResumeViewer";
import { RefineForm } from "./components/RefineForm";
import { SectionCheckboxes } from "./components/SectionCheckboxes";
import { StatusBanner } from "./components/StatusBanner";
import { useModifyResume } from "./hooks/useModifyResume";
import type { AppMode, BaseResumeSummary, CareerInfo, NewEntryPayload } from "./types";
import "./index.css";

const DEFAULT_SECTIONS = ["Experience", "Projects", "Technical Skills"];
const EMPTY_CAREER: CareerInfo = { education: [{}], experience: [{}], projects: [{}] };

type View = "main" | "create";
type CreateTab = "scratch" | "paste";

export default function App() {
  const [view, setView] = useState<View>("main");
  const [mode, setMode] = useState<AppMode>("tailor");

  // Base resumes (the master source for tailoring)
  const [bases, setBases] = useState<BaseResumeSummary[]>([]);
  const [selectedBaseId, setSelectedBaseId] = useState<number | null>(null);
  const [latexCode, setLatexCode] = useState(""); // selected base's LaTeX (source for tailor/refine)

  // Tailor / refine inputs
  const [jobDescription, setJobDescription] = useState("");
  const [sectionsToModify, setSectionsToModify] = useState<string[]>(DEFAULT_SECTIONS);
  const [targetSection, setTargetSection] = useState("");
  const [newEntry, setNewEntry] = useState<NewEntryPayload>({});

  // Create-base inputs
  const [createTab, setCreateTab] = useState<CreateTab>("scratch");
  const [newBaseName, setNewBaseName] = useState("");
  const [careerInfo, setCareerInfo] = useState<CareerInfo>(EMPTY_CAREER);
  const [pasteLatex, setPasteLatex] = useState("");

  const [pdflatexAvailable, setPdflatexAvailable] = useState<boolean | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyVersion, setHistoryVersion] = useState(0);

  const { submit, generate, showLatex, result, status, error, pdfUrl, downloadPdf, recompile, recompileStatus } =
    useModifyResume();

  // Base PDF URL for the right-hand preview. The `?t=updated_at` cache-busts so a refine
  // (which updates the base in place) reloads the embed instead of serving a stale PDF.
  const selectedBase = bases.find((b) => b.id === selectedBaseId);
  const basePdfUrl =
    selectedBaseId && selectedBase
      ? `${resumeApi.getBasePdfUrl(selectedBaseId)}?t=${encodeURIComponent(selectedBase.updated_at)}`
      : null;

  // ── Load health + bases on mount ───────────────────────────────────────────
  useEffect(() => {
    resumeApi
      .health()
      .then((h) => setPdflatexAvailable(h.pdflatex_available))
      .catch(() => setPdflatexAvailable(false));
    loadBases(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadBases = async (selectFirst = false) => {
    try {
      const list = await resumeApi.listBases();
      setBases(list);
      if (selectFirst && list.length > 0) {
        await selectBase(list[0].id);
      }
      return list;
    } catch {
      return [];
    }
  };

  const selectBase = async (id: number) => {
    try {
      const detail = await resumeApi.getBase(id);
      setSelectedBaseId(id);
      setLatexCode(detail.latex_code);
    } catch {
      alert("Could not load that base résumé.");
    }
  };

  const handleDeleteBase = async (id: number) => {
    await resumeApi.deleteBase(id);
    const list = await loadBases();
    if (id === selectedBaseId) {
      if (list.length > 0) await selectBase(list[0].id);
      else {
        setSelectedBaseId(null);
        setLatexCode("");
      }
    }
  };

  // ── Tailor / refine against the selected base ──────────────────────────────
  const handleSubmit = async () => {
    if (!selectedBaseId) {
      alert("Create or select a base résumé first.");
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
      mode,
      base_resume_id: selectedBaseId,
      ...(mode === "tailor"
        ? { job_description: jobDescription, sections_to_modify: sectionsToModify }
        : { target_section: targetSection, new_entry: newEntry }),
    });

    if (mode === "tailor") {
      setHistoryVersion((v) => v + 1);
    } else {
      // Refine updates the base in place — reload it so the source reflects the change.
      await selectBase(selectedBaseId);
      await loadBases();
      setNewEntry({});
    }
  };

  // ── Create base: from scratch ──────────────────────────────────────────────
  const handleGenerate = async () => {
    if (!newBaseName.trim()) {
      alert("Give your base résumé a name first.");
      return;
    }
    const resp = await generate({ resume_name: newBaseName, career_info: careerInfo });
    if (resp?.success && resp.base_id) {
      await loadBases();
      setSelectedBaseId(resp.base_id);
      setLatexCode(resp.latex_code ?? "");
      setView("main");
    }
  };

  // ── Create base: paste LaTeX ───────────────────────────────────────────────
  const handleCreatePaste = async () => {
    if (!newBaseName.trim()) {
      alert("Give your base résumé a name first.");
      return;
    }
    if (!pasteLatex.trim()) {
      alert("Paste your LaTeX résumé first.");
      return;
    }
    try {
      const detail = await resumeApi.createBase({ name: newBaseName, latex_code: pasteLatex });
      await loadBases();
      setSelectedBaseId(detail.id);
      setLatexCode(detail.latex_code);
      setView("main");
    } catch {
      alert("Could not save base résumé. Check your LaTeX and try again.");
    }
  };

  const openCreate = () => {
    setNewBaseName("");
    setCareerInfo(EMPTY_CAREER);
    setPasteLatex("");
    setCreateTab("scratch");
    setView("create");
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header__lights" aria-hidden="true">
          <span /><span /><span />
        </div>
        <div className="app-header__text">
          <h1>resume.<b>modifier</b></h1>
          <p className="subtitle">AI tailoring & refinement for LaTeX résumés</p>
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
          ⚠️ <strong>pdflatex not found</strong> — PDF download won't work. Modified LaTeX will still be returned.
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
                {view === "create" ? (
                  <>
                    <div className="field-header">
                      <h2 className="output-title">Create base résumé</h2>
                      <button className="btn-text" onClick={() => setView("main")}>
                        ← Cancel
                      </button>
                    </div>

                    <div className="mode-selector">
                      <button
                        className={`mode-btn ${createTab === "scratch" ? "active" : ""}`}
                        onClick={() => setCreateTab("scratch")}
                      >
                        <span className="mode-btn-label"><span>✨</span>From scratch</span>
                      </button>
                      <button
                        className={`mode-btn ${createTab === "paste" ? "active" : ""}`}
                        onClick={() => setCreateTab("paste")}
                      >
                        <span className="mode-btn-label"><span>⌶</span>Paste LaTeX</span>
                      </button>
                    </div>

                    <div className="field-group">
                      <label className="field-label">Base name</label>
                      <input
                        type="text"
                        value={newBaseName}
                        placeholder="e.g. Backend Engineer, Data Scientist"
                        onChange={(e) => setNewBaseName(e.target.value)}
                      />
                    </div>

                    {createTab === "scratch" ? (
                      <>
                        <CareerInfoForm value={careerInfo} onChange={setCareerInfo} />
                        <StatusBanner status={status} error={error} />
                        <button
                          className="btn-primary btn-submit"
                          onClick={handleGenerate}
                          disabled={status === "loading"}
                        >
                          {status === "loading" ? (
                            <><span className="spinner" />Generating…</>
                          ) : (
                            "Generate résumé"
                          )}
                        </button>
                      </>
                    ) : (
                      <>
                        <LaTeXInput value={pasteLatex} onChange={setPasteLatex} />
                        <button className="btn-primary btn-submit" onClick={handleCreatePaste}>
                          Save as base
                        </button>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <BaseSelector
                      bases={bases}
                      selectedBaseId={selectedBaseId}
                      onSelect={selectBase}
                      onNewBase={openCreate}
                      onDelete={handleDeleteBase}
                    />

                    {selectedBaseId && (
                      <>
                        <ModeSelector
                          mode={mode}
                          onChange={(m) => { setMode(m); setNewEntry({}); setTargetSection(""); }}
                        />

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
                            "Update Base"
                          )}
                        </button>
                      </>
                    )}
                  </>
                )}
              </section>
            </div>

            <div className="panel-card">
              <section className="output-column">
                <ResumeViewer
                  view={view}
                  mode={mode}
                  basesCount={bases.length}
                  selectedBaseId={selectedBaseId}
                  basePdfUrl={basePdfUrl}
                  baseName={selectedBase?.name ?? "Base"}
                  baseLatex={latexCode}
                  result={result}
                  tailoredPdfUrl={pdfUrl}
                  status={status}
                  onDownloadPdf={downloadPdf}
                  recompile={recompile}
                  recompileStatus={recompileStatus}
                />
              </section>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
