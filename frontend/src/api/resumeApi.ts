import axios from "axios";
import type { CompileResponse, HistoryListResponse, ModifyRequest, ModifyResponse } from "../types";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000",
  timeout: 180_000, // 3 min — AI + LaTeX compilation can be slow
});

// Separate short-timeout client for the fast compile endpoint (no AI involved)
const compileApi = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000",
  timeout: 60_000, // 60s — pure pdflatex, no AI
});

export const resumeApi = {
  modify: (req: ModifyRequest): Promise<ModifyResponse> =>
    api.post<ModifyResponse>("/api/modify", req).then((r) => r.data),

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

  getHistoryPdfUrl: (id: number): string =>
    `${import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000"}/api/history/${id}/pdf`,
};
