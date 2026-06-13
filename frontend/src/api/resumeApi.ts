import axios from "axios";
import type {
  BaseResumeDetail,
  BaseResumeSummary,
  CompileResponse,
  CreateBaseRequest,
  GenerateRequest,
  GenerateResponse,
  HistoryListResponse,
  HistoryRecord,
  ModifyRequest,
  ModifyResponse,
} from "../types";

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

  renameHistory: (id: number, label: string): Promise<HistoryRecord> =>
    api.patch<HistoryRecord>(`/api/history/${id}`, { label }).then((r) => r.data),

  getHistoryPdfUrl: (id: number): string =>
    `${import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000"}/api/history/${id}/pdf`,

  // ── Base resumes ───────────────────────────────────────────────────────────
  listBases: (): Promise<BaseResumeSummary[]> =>
    api.get<BaseResumeSummary[]>("/api/bases").then((r) => r.data),

  getBase: (id: number): Promise<BaseResumeDetail> =>
    api.get<BaseResumeDetail>(`/api/bases/${id}`).then((r) => r.data),

  createBase: (req: CreateBaseRequest): Promise<BaseResumeDetail> =>
    api.post<BaseResumeDetail>("/api/bases", req).then((r) => r.data),

  updateBase: (id: number, latex_code: string, name?: string): Promise<BaseResumeDetail> =>
    api.put<BaseResumeDetail>(`/api/bases/${id}`, { latex_code, name }).then((r) => r.data),

  deleteBase: (id: number): Promise<void> =>
    api.delete(`/api/bases/${id}`).then(() => undefined),

  getBasePdfUrl: (id: number): string =>
    `${import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000"}/api/bases/${id}/pdf`,

  // ── Generate from scratch ──────────────────────────────────────────────────
  generate: (req: GenerateRequest): Promise<GenerateResponse> =>
    api.post<GenerateResponse>("/api/generate", req).then((r) => r.data),
};
