import axios from "axios";
import type {
  CompileResponse,
  GenerateResponse,
  HistoryListResponse,
  HistoryRecord,
  KBStatus,
  SaveLatexResponse,
} from "../types";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 180_000, // 3 min — AI + LaTeX compilation (+ up to two repair passes) can be slow
});

// Separate short-timeout client for compile/save calls (pdflatex only, no AI)
const compileApi = axios.create({
  baseURL: BASE_URL,
  timeout: 60_000,
});

export const resumeApi = {
  kbStatus: (): Promise<KBStatus> =>
    api.get<KBStatus>("/api/kb").then((r) => r.data),

  // Aborting `signal` drops the connection; the backend notices and stops the AI call.
  generateFromKb: (job_description: string, signal?: AbortSignal): Promise<GenerateResponse> =>
    api.post<GenerateResponse>("/api/generate-from-kb", { job_description }, { signal }).then((r) => r.data),

  compile: (latex_code: string): Promise<CompileResponse> =>
    compileApi.post<CompileResponse>("/api/compile", { latex_code }).then((r) => r.data),

  health: (): Promise<{ status: string; pdflatex_available: boolean }> =>
    api.get("/api/health").then((r) => r.data),

  listHistory: (): Promise<HistoryListResponse> =>
    api.get<HistoryListResponse>("/api/history").then((r) => r.data),

  getHistoryLatex: (id: number): Promise<{ modified_latex: string }> =>
    api.get<{ modified_latex: string }>(`/api/history/${id}/latex`).then((r) => r.data),

  getHistoryPdf: (id: number): Promise<Blob> =>
    api.get(`/api/history/${id}/pdf`, { responseType: "blob" }).then((r) => r.data),

  // Saves the edited LaTeX and recompiles it in one call (editor autosave + live preview).
  saveLatex: (id: number, latex_code: string): Promise<SaveLatexResponse> =>
    compileApi.put<SaveLatexResponse>(`/api/history/${id}/latex`, { latex_code }).then((r) => r.data),

  deleteHistory: (id: number): Promise<void> =>
    api.delete(`/api/history/${id}`).then(() => undefined),

  renameHistory: (id: number, label: string): Promise<HistoryRecord> =>
    api.patch<HistoryRecord>(`/api/history/${id}`, { label }).then((r) => r.data),
};
