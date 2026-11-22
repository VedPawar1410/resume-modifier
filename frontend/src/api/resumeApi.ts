import axios from "axios";
import type {
  CompileResponse,
  FitCheck,
  GenerateResponse,
  HistoryListResponse,
  HistoryRecord,
  JobDetail,
  JobStatus,
  KBStatus,
  MatchReport,
  OutreachDraft,
  OutreachRequest,
  OutreachState,
  ProfileParse,
  QAAnswer,
  QARequest,
  QASimilar,
  QAState,
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

// ── Password gate (deployed only) ────────────────────────────────────────────
// The API trades the password for a 30-day token; we keep the token, never the password.
// Storage can throw (private mode, blocked site data), so every access is guarded.
const TOKEN_KEY = "sourced.token";
export const AUTH_REQUIRED_EVENT = "sourced:auth-required";

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* the token then lasts only until reload — fine */
  }
}

for (const client of [api, compileApi]) {
  client.interceptors.request.use((config) => {
    const token = getToken();
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  });
  // A 401 anywhere (token expired or revoked) sends the app back to the password screen.
  client.interceptors.response.use(undefined, (error) => {
    if (error?.response?.status === 401 && !error.config?.url?.endsWith("/api/login")) {
      setToken(null);
      window.dispatchEvent(new Event(AUTH_REQUIRED_EVENT));
    }
    return Promise.reject(error);
  });
}

export const resumeApi = {
  session: (): Promise<{ required: boolean; valid: boolean }> =>
    api.get("/api/session").then((r) => r.data),

  login: async (password: string): Promise<void> => {
    const r = await api.post<{ token: string | null }>("/api/login", { password });
    setToken(r.data.token);
  },

  kbStatus: (): Promise<KBStatus> =>
    api.get<KBStatus>("/api/kb").then((r) => r.data),

  // Aborting `signal` drops the connection; the backend notices and stops the AI call.
  // The fit check (if one was run on this JD) is saved with the résumé.
  // record_id fills that existing job (made by a fit check) instead of creating a new one.
  generateFromKb: (
    job_description: string,
    fit_check: FitCheck | null,
    record_id: number | null,
    signal?: AbortSignal,
  ): Promise<GenerateResponse> =>
    api
      .post<GenerateResponse>("/api/generate-from-kb", { job_description, fit_check, record_id }, { signal })
      .then((r) => r.data),

  // Apply / maybe / skip before generating: free providers, a few seconds. Saved as a job
  // (no résumé yet) — the result carries its record_id.
  fitCheck: (job_description: string): Promise<FitCheck> =>
    api.post<FitCheck>("/api/fit-check", { job_description }).then((r) => r.data),

  getJob: (id: number): Promise<JobDetail> =>
    api.get<JobDetail>(`/api/history/${id}`).then((r) => r.data),

  // Rename and/or set the status; status null clears it.
  updateJob: (id: number, patch: { label?: string; status?: JobStatus | null }): Promise<HistoryRecord> =>
    api.patch<HistoryRecord>(`/api/history/${id}`, patch).then((r) => r.data),

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

  // Saved with the résumé after the first run; refresh=true analyses it again (~1¢, 30–60 s).
  matchReport: (id: number, refresh = false): Promise<MatchReport> =>
    api.post<MatchReport>(`/api/history/${id}/match-report`, null, { params: { refresh } }).then((r) => r.data),

  // Outreach: free providers only (Groq → Gemini), a few seconds per message, saved with the résumé.
  outreach: (id: number): Promise<OutreachState> =>
    api.get<OutreachState>(`/api/history/${id}/outreach`).then((r) => r.data),

  createOutreach: (id: number, req: OutreachRequest): Promise<OutreachDraft> =>
    api.post<OutreachDraft>(`/api/history/${id}/outreach`, req).then((r) => r.data),

  updateOutreach: (id: number, draftId: string, patch: { subject?: string; body?: string }): Promise<OutreachDraft> =>
    api.patch<OutreachDraft>(`/api/history/${id}/outreach/${draftId}`, patch).then((r) => r.data),

  deleteOutreach: (id: number, draftId: string): Promise<void> =>
    api.delete(`/api/history/${id}/outreach/${draftId}`).then(() => undefined),

  // Paste a LinkedIn profile (copied by Ved from his own browser) → recipient fields. Not saved.
  parseProfile: (id: number, profileText: string): Promise<ProfileParse> =>
    api.post<ProfileParse>(`/api/history/${id}/outreach/parse-profile`, { profile_text: profileText })
      .then((r) => r.data),

  // Application Q&A: free providers (Groq / Gemini), answers saved with the résumé.
  qa: (id: number): Promise<QAState> =>
    api.get<QAState>(`/api/history/${id}/qa`).then((r) => r.data),

  createQA: (id: number, req: QARequest): Promise<QAAnswer> =>
    api.post<QAAnswer>(`/api/history/${id}/qa`, req).then((r) => r.data),

  // Saved answers to similar questions across every résumé — word overlap in code, no AI.
  similarQA: (id: number, question: string): Promise<QASimilar[]> =>
    api.post<QASimilar[]>(`/api/history/${id}/qa/similar`, { question }).then((r) => r.data),

  updateQA: (id: number, answerId: string, answer: string): Promise<QAAnswer> =>
    api.patch<QAAnswer>(`/api/history/${id}/qa/${answerId}`, { answer }).then((r) => r.data),

  deleteQA: (id: number, answerId: string): Promise<void> =>
    api.delete(`/api/history/${id}/qa/${answerId}`).then(() => undefined),

  deleteHistory: (id: number): Promise<void> =>
    api.delete(`/api/history/${id}`).then(() => undefined),

};
