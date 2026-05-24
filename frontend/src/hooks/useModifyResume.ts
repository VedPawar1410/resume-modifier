import { useState } from "react";
import { resumeApi } from "../api/resumeApi";
import type { AppStatus, ModifyRequest, ModifyResponse } from "../types";

interface UseModifyResumeReturn {
  submit: (request: ModifyRequest) => Promise<void>;
  result: ModifyResponse | null;
  status: AppStatus;
  error: string | null;
  downloadPdf: () => void;
}

export function useModifyResume(): UseModifyResumeReturn {
  const [result, setResult] = useState<ModifyResponse | null>(null);
  const [status, setStatus] = useState<AppStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  const submit = async (request: ModifyRequest) => {
    setStatus("loading");
    setError(null);
    setResult(null);

    // Clean up any previous blob URL
    if (pdfUrl) {
      URL.revokeObjectURL(pdfUrl);
      setPdfUrl(null);
    }

    try {
      const response = await resumeApi.modify(request);
      setResult(response);

      if (response.pdf_base64) {
        const bytes = atob(response.pdf_base64);
        const arr = new Uint8Array(bytes.length);
        for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
        const blob = new Blob([arr], { type: "application/pdf" });
        setPdfUrl(URL.createObjectURL(blob));
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

  const downloadPdf = () => {
    if (!pdfUrl) return;
    const a = document.createElement("a");
    a.href = pdfUrl;
    a.download = "tailored_resume.pdf";
    a.click();
  };

  return { submit, result, status, error, downloadPdf };
}
