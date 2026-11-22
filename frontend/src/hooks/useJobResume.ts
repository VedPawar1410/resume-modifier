import { useEffect, useRef, useState } from "react";
import { resumeApi } from "../api/resumeApi";
import type { SaveState } from "../types";
import { errorMessage } from "./useGeneration";

export function base64ToBlobUrl(b64: string): string {
  const bytes = atob(b64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return URL.createObjectURL(new Blob([arr], { type: "application/pdf" }));
}

// The AI writes "% kb-ids: a, b, c" at the top of the LaTeX.
export function extractKbIds(latex: string): string[] {
  const match = latex.match(/^%\s*kb-ids:\s*(.*)$/m);
  return match ? match[1].split(",").map((s) => s.trim()).filter(Boolean) : [];
}

/**
 * A job's résumé: its LaTeX, a blob URL for the PDF, and saving edits (each save recompiles).
 * `version` bumps when a new résumé is generated for this job, so it reloads.
 */
export function useJobResume(jobId: number, hasResume: boolean, version: number) {
  const [latex, setLatex] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(hasResume);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const saveSeq = useRef(0); // only the newest save's answer may win

  // Replace the PDF URL, freeing the old one.
  const swapPdf = (next: string | null) =>
    setPdfUrl((prev) => {
      if (prev && prev !== next) URL.revokeObjectURL(prev);
      return next;
    });

  useEffect(() => {
    if (!hasResume) return;
    let cancelled = false;
    Promise.all([
      resumeApi.getHistoryLatex(jobId),
      resumeApi.getHistoryPdf(jobId).catch(() => null), // a résumé that didn't compile has no PDF
    ])
      .then(([{ modified_latex }, pdf]) => {
        if (cancelled) return;
        setLatex(modified_latex);
        swapPdf(pdf ? URL.createObjectURL(pdf) : null);
      })
      .catch(() => !cancelled && setLatex(null))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [jobId, hasResume, version]);

  // Free the last PDF when leaving the job.
  useEffect(() => () => setPdfUrl((prev) => (prev && URL.revokeObjectURL(prev), null)), []);

  const save = async (next: string) => {
    const seq = ++saveSeq.current;
    setSaveState("saving");
    try {
      const r = await resumeApi.saveLatex(jobId, next);
      if (seq !== saveSeq.current) return;
      setLatex(next);
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

  return {
    latex,
    pdfUrl,
    loading: hasResume && loading,
    kbIds: latex ? extractKbIds(latex) : [],
    saveState,
    saveError,
    save,
    markUnsaved: () => setSaveState("unsaved"),
  };
}
