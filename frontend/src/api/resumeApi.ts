import axios from "axios";
import type {
  CompileResponse,
  HistoryListResponse,
  HistoryRecord,
  KBStatus,
  ResumeResult,
} from "../types";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000",
  timeout: 180_000, // 3 min — AI + LaTeX compilation (+ up to two repair passes) can be slow
});

// Separate short-timeout client for the fast compile endpoint (no AI involved)
const compileApi = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000",
  timeout: 60_000, // 60s — pure pdflatex, no AI
});

export const resumeApi = {
  kbStatus: (): Promise<KBStatus> =>
    api.get<KBStatus>("/api/kb").then((r) => r.data),

  generateFromKb: (job_description: string): Promise<ResumeResult> =>
    api.post<ResumeResult>("/api/generate-from-kb", { job_description }).then((r) => r.data),

  compile: (latex_code: string): Promise<CompileResponse> =>
    compileApi.post<CompileResponse>("/api/compile", { latex_code }).then((r) => r.data),

  health: (): Promise<{ status: string; pdflatex_available: boolean }> =>
    api.get("/api/health").then((r) => r.data),

  listHistory: (): Promise<HistoryListResponse> =>
    api.get<HistoryListResponse>("/api/history").then((r) => r.data),

  getHistoryLatex: (id: number): Promise<{ modified_latex: string }> =>
    api.get<{ modified_latex: string }>(`/api/history/${id}/latex`).then((r) => r.data),

  deleteHistory: (id: number): Promise<void> =>
    api.delete(`/api/history/${id}`).then(() => undefined),

  renameHistory: (id: number, label: string): Promise<HistoryRecord> =>
    api.patch<HistoryRecord>(`/api/history/${id}`, { label }).then((r) => r.data),

  getHistoryPdfUrl: (id: number): string =>
    `${import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000"}/api/history/${id}/pdf`,
};
