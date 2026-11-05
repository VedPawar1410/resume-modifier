import { useState } from "react";
import { resumeApi } from "../api/resumeApi";
import type { AppStatus, RecompileStatus, ResumeResult } from "../types";

function base64ToBlobUrl(b64: string): string {
  const bytes = atob(b64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  const blob = new Blob([arr], { type: "application/pdf" });
  return URL.createObjectURL(blob);
}

// The AI writes "% kb-ids: a, b, c" as the first line; history entries carry it too.
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

interface UseGenerateResumeReturn {
  generate: (jobDescription: string) => Promise<void>;
  showLatex: (latex: string) => Promise<void>;
  result: ResumeResult | null;
  status: AppStatus;
  error: string | null;
  pdfUrl: string | null;
  downloadPdf: () => void;
  recompile: (latex: string) => Promise<void>;
  recompileStatus: RecompileStatus;
}

export function useGenerateResume(): UseGenerateResumeReturn {
  const [result, setResult] = useState<ResumeResult | null>(null);
  const [status, setStatus] = useState<AppStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [recompileStatus, setRecompileStatus] = useState<RecompileStatus>("idle");

  const updatePdfUrl = (b64: string) => {
    setPdfUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return base64ToBlobUrl(b64);
    });
  };

  const reset = () => {
    setStatus("loading");
    setError(null);
    setResult(null);
    setRecompileStatus("idle");
    // Revoke any existing blob URL before the new request
    setPdfUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  };

  const generate = async (jobDescription: string) => {
    reset();
    try {
      const response = await resumeApi.generateFromKb(jobDescription);
      if (!response.success) {
        setError(response.ai_error ?? "Generation failed");
        setStatus("error");
        return;
      }
      setResult(response);
      if (response.pdf_base64) updatePdfUrl(response.pdf_base64);
      setStatus("success");
    } catch (err: unknown) {
      setError(errorMessage(err));
      setStatus("error");
    }
  };

  // Display an arbitrary LaTeX doc (e.g. a history entry) in the output panel.
  const showLatex = async (latex: string) => {
    reset();
    try {
      const resp = await resumeApi.compile(latex);
      setResult({
        success: true,
        modified_latex: latex,
        pdf_base64: resp.pdf_base64,
        compilation_errors: resp.compilation_errors,
        kb_ids: extractKbIds(latex),
        retry_count: 0,
      });
      if (resp.pdf_base64) updatePdfUrl(resp.pdf_base64);
      setStatus("success");
    } catch (err: unknown) {
      setError(errorMessage(err));
      setStatus("error");
    }
  };

  const recompile = async (latex: string) => {
    setRecompileStatus("loading");
    try {
      const resp = await resumeApi.compile(latex);
      if (resp.pdf_base64) {
        updatePdfUrl(resp.pdf_base64);
        setRecompileStatus("idle");
      } else {
        setRecompileStatus("error");
      }
    } catch {
      setRecompileStatus("error");
    }
  };

  const downloadPdf = () => {
    if (!pdfUrl) return;
    const a = document.createElement("a");
    a.href = pdfUrl;
    a.download = "resume.pdf";
    a.click();
  };

  return { generate, showLatex, result, status, error, pdfUrl, downloadPdf, recompile, recompileStatus };
}
