import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { resumeApi } from "./api/resumeApi";
import { ComposeView } from "./components/ComposeView";
import { SidebarIcon } from "./components/Icons";
import { ResultView } from "./components/ResultView";
import { Sidebar } from "./components/Sidebar";
import { useResume } from "./hooks/useResume";
import type { HistoryRecord, KBStatus } from "./types";
import "./index.css";

const PAGE = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
  transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] as const },
};

export default function App() {
  const ws = useResume();
  const [jobDescription, setJobDescription] = useState("");
  const [kb, setKb] = useState<KBStatus | null>(null);
  const [pdflatexOk, setPdflatexOk] = useState<boolean | null>(null);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);

  const loadKb = () => {
    resumeApi
      .kbStatus()
      .then(setKb)
      .catch(() => setKb({ path: "(backend unreachable)", found: false, entry_count: 0, entries_by_section: {} }));
  };

  useEffect(() => {
    resumeApi
      .health()
      .then((h) => setPdflatexOk(h.pdflatex_available))
      .catch(() => setPdflatexOk(false));
    loadKb();
  }, []);

  // The split editor wants the full width, so opening it tucks the sidebar away.
  const changeEditorOpen = (open: boolean) => {
    setEditorOpen(open);
    setSidebarOpen(!open);
  };

  const handleGenerate = async () => {
    const ok = await ws.generate(jobDescription);
    setHistoryVersion((v) => v + 1);
    if (ok) setJobDescription("");
  };

  const handleNew = () => {
    changeEditorOpen(false);
    ws.newResume();
  };

  const handleOpen = (record: HistoryRecord) => {
    changeEditorOpen(false);
    ws.open(record);
  };

  const handleDeleted = (id: number) => {
    if (ws.current?.recordId === id) handleNew();
  };

  const handleRenamed = (id: number, label: string) => {
    if (ws.current?.recordId === id) ws.rename(label);
  };

  const showResult = ws.phase === "result" && ws.current;

  return (
    <div className={`shell ${sidebarOpen ? "" : "shell--collapsed"}`}>
      <Sidebar
        activeId={ws.current?.recordId ?? null}
        version={historyVersion}
        pdflatexOk={pdflatexOk}
        onNew={handleNew}
        onOpen={handleOpen}
        onDeleted={handleDeleted}
        onRenamed={handleRenamed}
        onCollapse={() => setSidebarOpen(false)}
      />

      <main className="workspace">
        {!sidebarOpen && !showResult && (
          <button className="icon-btn workspace__toggle" onClick={() => setSidebarOpen(true)} aria-label="Show sidebar">
            <SidebarIcon />
          </button>
        )}

        <AnimatePresence mode="wait">
          {showResult ? (
            <motion.div key={`result-${ws.current!.recordId}`} className="page" {...PAGE}>
              <ResultView
                key={ws.current!.recordId ?? "unsaved"}
                resume={ws.current!}
                editorOpen={editorOpen}
                onEditorOpenChange={changeEditorOpen}
                saveState={ws.saveState}
                saveError={ws.saveError}
                onSave={ws.save}
                onEdit={ws.markUnsaved}
                onNew={handleNew}
                sidebarOpen={sidebarOpen}
                onShowSidebar={() => setSidebarOpen(true)}
              />
            </motion.div>
          ) : ws.phase === "opening" ? (
            <motion.div key="opening" className="page page--center" {...PAGE}>
              <span className="spinner-dot" /> <span className="muted">Opening résumé…</span>
            </motion.div>
          ) : (
            <motion.div key="compose" className="page" {...PAGE}>
              <ComposeView
                kb={kb}
                onRefreshKb={loadKb}
                jobDescription={jobDescription}
                onJobDescriptionChange={setJobDescription}
                generating={ws.phase === "generating"}
                error={ws.error}
                onGenerate={handleGenerate}
                onCancel={ws.cancel}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
