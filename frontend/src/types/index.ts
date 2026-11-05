// Response of POST /api/generate-from-kb.
export interface GenerateResponse {
  success: boolean;
  record_id?: number | null; // history entry it was saved as
  title?: string | null; // "Company — Role"
  modified_latex?: string;
  pdf_base64?: string;
  compilation_errors?: string;
  ai_error?: string;
  kb_ids: string[]; // knowledge-base entries the AI used
  page_count?: number | null;
  model?: string | null; // which model wrote it — shows when a fallback ran
  retry_count: number;
}

// The résumé open in the workspace (freshly generated or opened from history).
export interface CurrentResume {
  recordId: number | null;
  title: string;
  createdAt: string;
  latex: string;
  pdfUrl: string | null;
  kbIds: string[];
  pageCount?: number | null;
  model?: string | null;
  retryCount: number;
  compilationErrors?: string;
}

export interface CompileResponse {
  success: boolean;
  pdf_base64?: string;
  compilation_errors?: string;
}

export interface SaveLatexResponse {
  pdf_base64?: string | null; // null when the edit doesn't compile (code is still saved)
  compilation_errors?: string | null;
}

export type Phase = "compose" | "generating" | "opening" | "result";
export type SaveState = "idle" | "unsaved" | "saving" | "saved" | "error";

export interface HistoryRecord {
  id: number;
  created_at: string;
  mode: string;
  label: string;
  job_description_preview?: string;
  sections_modified: string[];
}

export interface HistoryListResponse {
  records: HistoryRecord[];
  total: number;
}

export interface KBStatus {
  path: string;
  found: boolean;
  entry_count: number;
  entries_by_section: Record<string, number>;
  last_updated?: string | null;
}
