import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import type { Generation } from "../../hooks/useGeneration";
import type { useJobResume } from "../../hooks/useJobResume";
import type { FitCheck, SaveState } from "../../types";
import { Tooltip } from "../Tooltip";
import { GeneratingCard } from "../GeneratingCard";
import { AlertIcon, CheckIcon, CloseIcon, CodeIcon, SparkIcon } from "../Icons";
import { LatexEditor } from "../LatexEditor";

const AUTOSAVE_MS = 900;
const EASE = [0.22, 1, 0.36, 1] as const;

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

// The PDF in Chrome's own viewer. view=Fit while editing keeps the whole page in view, so each
// live reload doesn't jump back to the top.
export function Sheet({ url, fit = false }: { url: string | null; fit?: boolean }) {
  if (!url) return <div className="sheet sheet--empty">No PDF yet — fix the LaTeX to build one.</div>;
  return (
    <motion.div className="sheet" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }}>
      <embed key={`${url}-${fit}`} src={`${url}#navpanes=0${fit ? "&view=Fit" : ""}`} type="application/pdf" />
    </motion.div>
  );
}

interface Props {
  hasResume: boolean;
  resume: ReturnType<typeof useJobResume>;
  run: Generation | null; // the generation running for this job, if any
  genError: string | null;
  generateBusy: boolean; // another job is generating
  onGenerate: () => void;
  onCancel: () => void;
  fit?: FitCheck | null; // the loader shows the must-haves it's matching
  kbCount?: number;
  next?: React.ReactNode; // the "Next: Match report" nudge
}

export function ResumeStep({ hasResume, resume, run, genError, generateBusy, onGenerate, onCancel, fit, kbCount, next }: Props) {
  const [editing, setEditing] = useState(false);
  const [wrap, setWrap] = useState(true);
  const [draft, setDraft] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useRef<string | null>(null);
  const saveRef = useRef(resume.save);
  useEffect(() => {
    saveRef.current = resume.save;
  });

  const text = draft ?? resume.latex ?? "";

  const flush = () => {
    if (!timer.current) return;
    clearTimeout(timer.current);
    timer.current = null;
    if (draftRef.current !== null) saveRef.current(draftRef.current);
  };
  const saveNow = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (draftRef.current !== null) saveRef.current(draftRef.current);
  };
  const onChange = (value: string) => {
    setDraft(value);
    draftRef.current = value;
    resume.markUnsaved();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      saveRef.current(value);
    }, AUTOSAVE_MS);
  };

  // Never lose a pending edit when leaving the step or the job.
  useEffect(() => () => flush(), []);

  // ⌘S saves at once; Esc closes the editor (not while CodeMirror's own search is open).
  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        saveNow();
      } else if (e.key === "Escape" && !e.defaultPrevented && !(e.target as HTMLElement | null)?.closest?.(".cm-search")) {
        flush();
        setEditing(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (run) {
    return (
      <div className="step-center">
        <GeneratingCard onCancel={onCancel} startedAt={run.startedAt} fit={fit} kbCount={kbCount} />
      </div>
    );
  }

  if (!hasResume) {
    return (
      <div className="step-center">
        <div className="card preview-card">
          {genError && (
            <div className="notice notice--error" role="alert">
              <AlertIcon />
              <div><strong>Couldn't generate the résumé.</strong><p>{genError}</p></div>
            </div>
          )}
          <p className="eyebrow">No résumé yet</p>
          <h2 className="heading preview-card__title">Set a one-page résumé for this job.</h2>
          <p className="muted">Every line comes from your knowledge base — nothing is invented.</p>
          <p className="eyebrow preview-card__label">What you'll get</p>
          <ul className="preview-card__list">
            <li><CheckIcon size={14} /> A one-page PDF tailored to this job</li>
            <li><CheckIcon size={14} /> The KB entries it used, listed above the sheet</li>
            <li><CheckIcon size={14} /> A LaTeX editor with live preview, if you want to tweak it</li>
          </ul>
          <div className="preview-card__actions">
            <button className="btn btn--ink btn--lg" onClick={onGenerate} disabled={generateBusy}>
              <SparkIcon /> Generate résumé
            </button>
            <span className="muted small">{generateBusy ? "Another résumé is being written — one at a time." : "25–40 seconds."}</span>
          </div>
        </div>
      </div>
    );
  }

  if (resume.loading) return <div className="page--center step-loading"><span className="spinner-dot" /> <span className="muted">Opening résumé…</span></div>;

  return (
    <div className={`resume-step ${editing ? "is-editing" : ""}`}>
      <div className="resume-step__bar">
        {resume.kbIds.length > 0 && (
          <Tooltip
            content={
              <>
                <strong className="tip__title">Used from your knowledge base</strong>
                <span className="tip__list mono">{resume.kbIds.map((k) => <span key={k}>{k}</span>)}</span>
                <span className="tip__meta">Written as line 1 of the LaTeX, so it's kept with the résumé.</span>
              </>
            }
          >
            <span className="chip" tabIndex={0}>{resume.kbIds.length} KB entries</span>
          </Tooltip>
        )}
        <span className="resume-step__sources mono">{resume.kbIds.join("  ·  ")}</span>
        {!editing && next}
        <button
          className={`btn btn--ghost btn--sm ${editing ? "is-on" : ""}`}
          onClick={() => {
            if (editing) flush();
            setEditing((e) => !e);
          }}
          aria-pressed={editing}
        >
          <CodeIcon size={14} /> {editing ? "Close editor" : "Edit LaTeX"}
        </button>
      </div>
      <div className="resume-step__body">
        <div className="desk"><Sheet url={resume.pdfUrl} fit={editing} /></div>
        <AnimatePresence>
          {editing && (
            <motion.section
              key="editor"
              className="editor-pane"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 24 }}
              transition={{ duration: 0.25, ease: EASE }}
              aria-label="LaTeX editor"
            >
              <div className="editor-pane__head">
                <h2 className="pane-title">LaTeX</h2>
                <SaveStatus state={resume.saveState} error={resume.saveError} />
                <button className={`btn btn--ghost btn--sm ${wrap ? "is-on" : ""}`} onClick={() => setWrap((w) => !w)} aria-pressed={wrap} title="Wrap long lines">
                  Wrap
                </button>
                <button className="btn btn--ghost btn--sm" onClick={saveNow} title="Save (⌘S)">
                  Save <kbd>⌘S</kbd>
                </button>
                <button className="icon-btn icon-btn--sm" onClick={() => { flush(); setEditing(false); }} aria-label="Close editor" title="Close (Esc)">
                  <CloseIcon size={14} />
                </button>
              </div>
              <LatexEditor value={text} onChange={onChange} wrap={wrap} />
            </motion.section>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
