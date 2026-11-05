// A generated (or restored-from-history) résumé shown in the output panel.
export interface ResumeResult {
  success: boolean;
  modified_latex?: string;
  pdf_base64?: string;
  compilation_errors?: string;
  ai_error?: string;
  kb_ids: string[]; // knowledge-base entries the AI used
  page_count?: number | null;
  model?: string | null; // which model wrote it — shows when a fallback ran
  retry_count: number;
}

export interface CompileResponse {
  success: boolean;
  pdf_base64?: string;
  compilation_errors?: string;
}

export type AppStatus = "idle" | "loading" | "success" | "error";
export type RecompileStatus = "idle" | "loading" | "error";

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

// ── Knowledge base ───────────────────────────────────────────────────────────

export interface KBStatus {
  path: string;
  found: boolean;
  entry_count: number;
  entries_by_section: Record<string, number>;
  last_updated?: string | null;
}
