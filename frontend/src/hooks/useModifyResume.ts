import { useState } from "react";
import { resumeApi } from "../api/resumeApi";
import type {
  AppStatus,
  GenerateRequest,
  GenerateResponse,
  ModifyRequest,
  ModifyResponse,
  RecompileStatus,
} from "../types";

function base64ToBlobUrl(b64: string): string {
  const bytes = atob(b64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  const blob = new Blob([arr], { type: "application/pdf" });
  return URL.createObjectURL(blob);
}

interface UseModifyResumeReturn {
  submit: (request: ModifyRequest) => Promise<void>;
  generate: (request: GenerateRequest) => Promise<GenerateResponse | null>;
  showLatex: (latex: string) => Promise<void>;
  result: ModifyResponse | null;
  status: AppStatus;
  error: string | null;
  pdfUrl: string | null;
  downloadPdf: () => void;
  recompile: (latex: string) => Promise<void>;
  recompileStatus: RecompileStatus;
}

export function useModifyResume(): UseModifyResumeReturn {
  const [result, setResult] = useState<ModifyResponse | null>(null);
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

  const submit = async (request: ModifyRequest) => {
    setStatus("loading");
    setError(null);
    setResult(null);
    setRecompileStatus("idle");

    // Revoke any existing blob URL before the new request
    setPdfUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });

    try {
      const response = await resumeApi.modify(request);
      setResult(response);
      if (response.pdf_base64) {
        updatePdfUrl(response.pdf_base64);
      }
      setStatus("success");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } }; message?: string })
          ?.response?.data?.detail ??
        (err as { message?: string })?.message ??
        "Unknown error";
      setError(msg);
      setStatus("error");
    }
  };

  const generate = async (request: GenerateRequest): Promise<GenerateResponse | null> => {
    setStatus("loading");
    setError(null);
    setResult(null);
    setRecompileStatus("idle");
    setPdfUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });

    try {
      const response = await resumeApi.generate(request);
      if (!response.success) {
        setError(response.ai_error ?? "Generation failed");
        setStatus("error");
        return response;
      }
      // Map GenerateResponse into the shared ModifyResponse-shaped result so
      // OutputPanel + live-edit recompile work unchanged.
      setResult({
        success: true,
        modified_latex: response.latex_code,
        pdf_base64: response.pdf_base64,
        compilation_errors: response.compilation_errors,
        sections_modified: [],
        retry_count: 0,
      });
      if (response.pdf_base64) updatePdfUrl(response.pdf_base64);
      setStatus("success");
      return response;
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } }; message?: string })
          ?.response?.data?.detail ??
        (err as { message?: string })?.message ??
        "Unknown error";
      setError(msg);
      setStatus("error");
      return null;
    }
  };

  // Display an arbitrary LaTeX doc (e.g. a history entry) in the output panel.
  const showLatex = async (latex: string) => {
    setStatus("loading");
    setError(null);
    setResult(null);
    setRecompileStatus("idle");
    setPdfUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    try {
      const resp = await resumeApi.compile(latex);
      setResult({
        success: true,
        modified_latex: latex,
        pdf_base64: resp.pdf_base64,
        compilation_errors: resp.compilation_errors,
        sections_modified: [],
        retry_count: 0,
      });
      if (resp.pdf_base64) updatePdfUrl(resp.pdf_base64);
      setStatus("success");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } }; message?: string })
          ?.response?.data?.detail ??
        (err as { message?: string })?.message ??
        "Unknown error";
      setError(msg);
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
    a.download = "tailored_resume.pdf";
    a.click();
  };

  return { submit, generate, showLatex, result, status, error, pdfUrl, downloadPdf, recompile, recompileStatus };
}
