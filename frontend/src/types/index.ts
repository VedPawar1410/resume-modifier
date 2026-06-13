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
  mode: "tailor" | "refine";
  // Source: pasted LaTeX or a saved base resume (one is required)
  latex_code?: string;
  base_resume_id?: number;
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

// ── Base resumes ─────────────────────────────────────────────────────────────

export interface BaseResumeSummary {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface BaseResumeDetail extends BaseResumeSummary {
  latex_code: string;
}

export interface CreateBaseRequest {
  name: string;
  latex_code: string;
}

// ── Resume-from-scratch generation ───────────────────────────────────────────

export interface ExperienceEntry {
  company?: string;
  role?: string;
  location?: string;
  date_range?: string;
  raw_notes?: string;
}

export interface ProjectEntry {
  name?: string;
  tech?: string;
  links?: string;
  date?: string;
  raw_notes?: string;
}

export interface EducationEntry {
  school?: string;
  degree?: string;
  location?: string;
  date_range?: string;
  details?: string;
}

export interface CareerInfo {
  name?: string;
  email?: string;
  phone?: string;
  location?: string;
  linkedin?: string;
  github?: string;
  website?: string;
  summary?: string;
  education: EducationEntry[];
  experience: ExperienceEntry[];
  projects: ProjectEntry[];
  skills?: string;
}

export interface GenerateRequest {
  resume_name: string;
  career_info: CareerInfo;
}

export interface GenerateResponse {
  success: boolean;
  base_id?: number;
  name?: string;
  latex_code?: string;
  pdf_base64?: string;
  compilation_errors?: string;
  ai_error?: string;
}
