import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import type { CurrentResume, SaveState } from "../types";
import { AlertIcon, CheckIcon, CloseIcon, CodeIcon, DownloadIcon, PlusIcon, SidebarIcon } from "./Icons";
import { parseDate } from "../utils/dates";
import { LatexEditor } from "./LatexEditor";

interface Props {
  resume: CurrentResume;
  editorOpen: boolean;
  onEditorOpenChange: (open: boolean) => void;
  saveState: SaveState;
  saveError: string | null;
  onSave: (latex: string) => void;
  onEdit: () => void;
  onNew: () => void;
  sidebarOpen: boolean;
  onShowSidebar: () => void;
}

const AUTOSAVE_MS = 900;
const EASE = [0.22, 1, 0.36, 1] as const;

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60) || "resume";
}

function SaveStatus({ state, error }: { state: SaveState; error: string | null }) {
  if (state === "saving") return <span className="save-status"><span className="spinner-dot" /> Saving…</span>;
  if (state === "unsaved") return <span className="save-status muted">Unsaved changes</span>;
  if (state === "error") return <span className="save-status text-danger"><AlertIcon size={13} /> Couldn't save</span>;
  if (state === "saved" && error)
    return (
      <span className="save-status text-warn" title={error}>
        <AlertIcon size={13} /> Saved · doesn't compile, showing last good PDF
      </span>
    );
  if (state === "saved") return <span className="save-status text-ok"><CheckIcon size={13} /> Saved</span>;
  return <span className="save-status muted">Edits save automatically</span>;
}

export function ResultView({
  resume,
  editorOpen,
  onEditorOpenChange,
  saveState,
  saveError,
  onSave,
  onEdit,
  onNew,
  sidebarOpen,
  onShowSidebar,
}: Props) {
  // App keys this component by record id, so the draft starts fresh for each résumé.
  const [draft, setDraft] = useState(resume.latex);
  const [wrap, setWrap] = useState(true);
  const draftRef = useRef(draft);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Timers fire after re-renders, so they call the latest onSave through a ref.
  const onSaveRef = useRef(onSave);
  useEffect(() => {
    onSaveRef.current = onSave;
  });

  const flush = () => {
    if (!timer.current) return;
    clearTimeout(timer.current);
    timer.current = null;
    onSaveRef.current(draftRef.current);
  };

  const handleChange = (value: string) => {
    setDraft(value);
    draftRef.current = value;
    onEdit();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      onSaveRef.current(draftRef.current);
    }, AUTOSAVE_MS);
  };

  const saveNow = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    onSaveRef.current(draftRef.current);
  };

  // Never lose a pending edit when switching résumés or leaving the editor.
  useEffect(() => () => flush(), []);

  // ⌘S / Ctrl+S saves immediately while the editor is open.
  useEffect(() => {
    if (!editorOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        saveNow();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editorOpen]);

  const closeEditor = () => {
    flush();
    onEditorOpenChange(false);
  };

  const created = parseDate(resume.createdAt);
  const pageOk = resume.pageCount == null || resume.pageCount === 1;

  return (
    <div className={`result ${editorOpen ? "result--editing" : ""}`}>
      <header className="result__head">
        <div className="result__titles">
          {!sidebarOpen && (
            <button className="icon-btn" onClick={onShowSidebar} aria-label="Show sidebar" title="Show sidebar">
              <SidebarIcon />
            </button>
          )}
          <div>
            <p className="eyebrow">
              {created.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })} ·{" "}
              {created.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            </p>
            <h1 className="serif result__title" title={resume.title}>{resume.title}</h1>
          </div>
        </div>

        <div className="toolbar">
          {editorOpen ? (
            <button className="btn btn--ghost" onClick={closeEditor}>
              <CloseIcon /> Close editor
            </button>
          ) : (
            <button className="btn btn--ghost" onClick={() => onEditorOpenChange(true)} disabled={!resume.recordId}>
              <CodeIcon /> View LaTeX
            </button>
          )}
          {resume.pdfUrl && (
            <a className="btn btn--ink" href={resume.pdfUrl} download={`${slug(resume.title)}.pdf`}>
              <DownloadIcon /> Download PDF
            </a>
          )}
          <button className="btn btn--ghost" onClick={onNew}>
            <PlusIcon /> New résumé
          </button>
        </div>
      </header>

      <div className="result__meta">
        {resume.pageCount != null && (
          <span className={`chip ${pageOk ? "chip--ok" : "chip--warn"}`}>
            {resume.pageCount} page{resume.pageCount !== 1 ? "s" : ""}
          </span>
        )}
        {resume.kbIds.length > 0 && (
          <span className="chip" title={resume.kbIds.join(", ")}>
            Built from {resume.kbIds.length} KB entr{resume.kbIds.length !== 1 ? "ies" : "y"}
          </span>
        )}
        {resume.model && <span className="chip chip--mono">{resume.model}</span>}
        {resume.retryCount > 0 && <span className="chip chip--warn">{resume.retryCount} auto-repair{resume.retryCount > 1 ? "s" : ""}</span>}
        {resume.kbIds.length > 0 && <span className="result__sources mono">{resume.kbIds.join("  ·  ")}</span>}
      </div>

      {resume.compilationErrors && (
        <div className="notice notice--warn">
          <AlertIcon />
          <div>
            <strong>The PDF didn't compile.</strong>
            <p>Open the LaTeX editor to fix it — the preview updates as you type.</p>
          </div>
        </div>
      )}

      <div className="result__body">
        <div className="desk">
          {resume.pdfUrl ? (
            <motion.div
              className="sheet"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: EASE }}
            >
              {/* Chrome's full viewer (zoom, fit, print). While editing, view=Fit keeps the
                  whole page in view so each live reload doesn't jump back to the top. */}
              <embed
                key={`${resume.pdfUrl}-${editorOpen}`}
                src={`${resume.pdfUrl}#navpanes=0${editorOpen ? "&view=Fit" : ""}`}
                type="application/pdf"
              />
            </motion.div>
          ) : (
            <div className="sheet sheet--empty">No PDF yet — fix the LaTeX to build one.</div>
          )}
        </div>

        <AnimatePresence>
          {editorOpen && (
            <motion.section
              className="editor-pane"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 24 }}
              transition={{ duration: 0.32, ease: EASE }}
              aria-label="LaTeX editor"
            >
              <div className="editor-pane__head">
                <span className="mono small">resume.tex</span>
                <SaveStatus state={saveState} error={saveError} />
                <button
                  className={`btn btn--ghost btn--sm ${wrap ? "is-on" : ""}`}
                  onClick={() => setWrap((w) => !w)}
                  aria-pressed={wrap}
                  title="Wrap long lines"
                >
                  Wrap
                </button>
                <button className="btn btn--ghost btn--sm" onClick={saveNow} title="Save (⌘S)">
                  Save <kbd>⌘S</kbd>
                </button>
              </div>
              <LatexEditor value={draft} onChange={handleChange} wrap={wrap} />
            </motion.section>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
