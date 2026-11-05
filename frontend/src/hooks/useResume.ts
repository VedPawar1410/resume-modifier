import axios from "axios";
import { useRef, useState } from "react";
import { resumeApi } from "../api/resumeApi";
import type { CurrentResume, HistoryRecord, Phase, SaveState } from "../types";

function base64ToBlobUrl(b64: string): string {
  const bytes = atob(b64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return URL.createObjectURL(new Blob([arr], { type: "application/pdf" }));
}

// The AI writes "% kb-ids: a, b, c" at the top; history entries carry it too.
function extractKbIds(latex: string): string[] {
  const match = latex.match(/^%\s*kb-ids:\s*(.*)$/m);
  return match ? match[1].split(",").map((s) => s.trim()).filter(Boolean) : [];
}

function errorMessage(err: unknown): string {
  return (
    (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
    (err as { message?: string })?.message ??
    "Unknown error"
  );
}

/**
 * Owns the workspace: which phase we're in (compose → generating → result), the résumé
 * that's open, and saving edits back to its history entry.
 */
export function useResume() {
  const [phase, setPhase] = useState<Phase>("compose");
  const [current, setCurrent] = useState<CurrentResume | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  // Edits fire saves faster than pdflatex answers; only the newest response may win.
  const saveSeq = useRef(0);
  // The in-flight generate request, so Cancel can abort it.
  const generation = useRef<AbortController | null>(null);

  const swapPdf = (next: string | null) => {
    setCurrent((prev) => {
      if (prev?.pdfUrl && prev.pdfUrl !== next) URL.revokeObjectURL(prev.pdfUrl);
      return prev ? { ...prev, pdfUrl: next } : prev;
    });
  };

  const clear = () => {
    setCurrent((prev) => {
      if (prev?.pdfUrl) URL.revokeObjectURL(prev.pdfUrl);
      return null;
    });
    setSaveState("idle");
    setSaveError(null);
  };

  const newResume = () => {
    clear();
    setError(null);
    setPhase("compose");
  };

  const cancel = () => generation.current?.abort();

  const generate = async (jobDescription: string): Promise<boolean> => {
    clear();
    setError(null);
    setPhase("generating");
    const controller = new AbortController();
    generation.current = controller;
    try {
      const r = await resumeApi.generateFromKb(jobDescription, controller.signal);
      if (!r.success || !r.modified_latex) {
        setError(r.ai_error ?? "Generation failed");
        setPhase("compose");
        return false;
      }
      setCurrent({
        recordId: r.record_id ?? null,
        title: r.title ?? "Résumé",
        createdAt: new Date().toISOString(),
        latex: r.modified_latex,
        pdfUrl: r.pdf_base64 ? base64ToBlobUrl(r.pdf_base64) : null,
        kbIds: r.kb_ids,
        pageCount: r.page_count,
        model: r.model,
        retryCount: r.retry_count,
        compilationErrors: r.compilation_errors,
      });
      setPhase("result");
      return true;
    } catch (err) {
      // A cancel isn't an error — just go back to the form with the JD still filled in.
      if (!axios.isCancel(err)) setError(errorMessage(err));
      setPhase("compose");
      return false;
    } finally {
      generation.current = null;
    }
  };

  const open = async (record: HistoryRecord) => {
    clear();
    setError(null);
    setPhase("opening");
    try {
      const [{ modified_latex }, pdf] = await Promise.all([
        resumeApi.getHistoryLatex(record.id),
        resumeApi.getHistoryPdf(record.id).catch(() => null), // older entries may have no PDF
      ]);
      setCurrent({
        recordId: record.id,
        title: record.label,
        createdAt: record.created_at,
        latex: modified_latex,
        pdfUrl: pdf ? URL.createObjectURL(pdf) : null,
        kbIds: extractKbIds(modified_latex),
        retryCount: 0,
      });
      setPhase("result");
    } catch (err) {
      setError(errorMessage(err));
      setPhase("compose");
    }
  };

  // Save edited LaTeX to the open history entry; the same call recompiles the preview.
  const save = async (latex: string) => {
    if (!current?.recordId) return;
    const seq = ++saveSeq.current;
    setSaveState("saving");
    try {
      const r = await resumeApi.saveLatex(current.recordId, latex);
      if (seq !== saveSeq.current) return; // a newer save is in flight
      setCurrent((prev) => (prev ? { ...prev, latex } : prev));
      if (r.pdf_base64) {
        swapPdf(base64ToBlobUrl(r.pdf_base64));
        setSaveError(null);
      } else {
        setSaveError(r.compilation_errors ?? "LaTeX didn't compile");
      }
      setSaveState("saved");
    } catch (err) {
      if (seq !== saveSeq.current) return;
      setSaveError(errorMessage(err));
      setSaveState("error");
    }
  };

  const markUnsaved = () => setSaveState("unsaved");

  const rename = (title: string) => setCurrent((prev) => (prev ? { ...prev, title } : prev));

  return { phase, current, error, saveState, saveError, generate, cancel, open, newResume, save, markUnsaved, rename };
}
