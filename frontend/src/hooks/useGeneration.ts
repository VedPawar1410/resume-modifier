import axios from "axios";
import { useRef, useState } from "react";
import { resumeApi } from "../api/resumeApi";
import type { FitCheck, GenerateResponse } from "../types";

export function errorMessage(err: unknown): string {
  return (
    (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
    (err as { message?: string })?.message ??
    "Unknown error"
  );
}

// One résumé is written at a time. It lives at app level (not in a page), so you can wander
// off to another job while it runs and the loader is still there when you come back.
// jobId is null when it started from Home (the backend creates the job when it finishes).
export interface Generation {
  jobId: number | null;
  startedAt: number;
}

export function useGeneration(onDone: (r: GenerateResponse, jobId: number | null) => void) {
  const [running, setRunning] = useState<Generation | null>(null);
  const [error, setError] = useState<{ jobId: number | null; message: string } | null>(null);
  const controller = useRef<AbortController | null>(null);

  const start = async (jd: string, fit: FitCheck | null, jobId: number | null) => {
    if (controller.current) return; // one at a time
    const c = new AbortController();
    controller.current = c;
    setError(null);
    setRunning({ jobId, startedAt: Date.now() });
    try {
      const r = await resumeApi.generateFromKb(jd, fit, jobId, c.signal);
      if (!r.success || !r.modified_latex) setError({ jobId, message: r.ai_error ?? "Generation failed" });
      else onDone(r, jobId);
    } catch (err) {
      if (!axios.isCancel(err)) setError({ jobId, message: errorMessage(err) }); // a cancel isn't an error
    } finally {
      controller.current = null;
      setRunning(null);
    }
  };

  const cancel = () => controller.current?.abort();

  return { running, error, start, cancel, clearError: () => setError(null) };
}
export type GenerationApi = ReturnType<typeof useGeneration>;
