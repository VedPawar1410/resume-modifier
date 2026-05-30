export interface NewEntryPayload {
  // Experience
  company?: string;
  role?: string;
  location?: string;
  date_range?: string;
  // Project
  project_name?: string;
  links?: string;
  date?: string;
  // Shared
  raw_notes?: string;
  // Skills
  new_skills?: string;
}

export interface ModifyRequest {
  latex_code: string;
  mode: "tailor" | "refine";
  // Tailor mode
  job_description?: string;
  sections_to_modify?: string[];
  // Refine mode
  target_section?: string;
  new_entry?: NewEntryPayload;
}

export interface ModifyResponse {
  success: boolean;
  modified_latex?: string;
  pdf_base64?: string;
  compilation_errors?: string;
  ai_error?: string;
  sections_modified: string[];
  retry_count: number;
}

export interface CompileResponse {
  success: boolean;
  pdf_base64?: string;
  compilation_errors?: string;
}

export type AppMode = "tailor" | "refine";
export type AppStatus = "idle" | "loading" | "success" | "error";
export type RecompileStatus = "idle" | "loading" | "error";

export interface HistoryRecord {
  id: number;
  created_at: string;
  mode: "tailor" | "refine";
  label: string;
  job_description_preview?: string;
  sections_modified: string[];
}

export interface HistoryListResponse {
  records: HistoryRecord[];
  total: number;
}
