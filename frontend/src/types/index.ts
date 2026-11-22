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

export type JobStatus = "applied" | "interviewing" | "offer" | "rejected";
export const JOB_STATUSES: { id: JobStatus; label: string }[] = [
  { id: "applied", label: "Applied" },
  { id: "interviewing", label: "Interviewing" },
  { id: "offer", label: "Offer" },
  { id: "rejected", label: "Rejected" },
];

// One job in the list (the backend still calls them history records). A job exists from its
// fit check; has_resume says whether a résumé has been generated for it yet.
export interface HistoryRecord {
  id: number;
  created_at: string;
  mode: string;
  label: string;
  job_description_preview?: string;
  sections_modified: string[];
  status?: JobStatus | null;
  has_resume: boolean;
  fit_verdict?: FitVerdict | null;
  fit_score?: number | null;
}
export type Job = HistoryRecord;

export interface JobDetail extends HistoryRecord {
  job_description?: string | null;
  fit_check?: FitCheck | null;
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
  error?: string | null;
}

// Match report (backend services/match_service.py)
export type MatchStatus = "on_resume" | "left_out" | "weak" | "missing";

export interface MatchRequirement {
  skill: string;
  category: string;
  importance: "must-have" | "nice-to-have";
  status: MatchStatus;
  evidence: string[];
  jd_quote: string;
  note: string;
}

export interface MatchReport {
  requirements: MatchRequirement[];
  advice: string;
  summary: { must_have_total: number; must_have_covered: number; counts: Record<MatchStatus, number> };
  model: string;
}

// ── Job-fit check (before generating) — mirrors backend services/fit_service.py ──
export type FitVerdict = "apply" | "maybe" | "skip";

export interface FitCheck {
  verdict: FitVerdict;
  score: number; // 0-100
  summary: string;
  job_title: string;
  reasons: { kind: "good" | "warn" | "bad" | "info"; text: string }[];
  requirements: {
    skill: string;
    importance: "must-have" | "nice-to-have";
    status: "strong" | "weak" | "missing";
    evidence: string[];
  }[];
  must_have_coverage: number;
  model: string;
  record_id?: number | null; // the job this check was saved as
}

// ── Outreach (cold email / LinkedIn) — mirrors backend services/outreach_service.py ──
export type OutreachKind = "email" | "connection_note" | "linkedin_message" | "referral_ask";
export type OutreachRelationship = "recruiter" | "hiring_manager" | "engineer" | "alum" | "other";

export interface OutreachRequest {
  kind: OutreachKind;
  recipient_name: string;
  recipient_role: string;
  relationship: OutreachRelationship;
  position: string;
  notes: string;
}

export interface OutreachDraft extends OutreachRequest {
  id: string;
  created_at: string;
  subject: string;
  body: string;
  model: string;
  warning: string;
}

export interface OutreachGuide {
  company: string;
  role: string;
  links: { label: string; url: string; hint: string }[];
  tips: string[];
}

export interface OutreachState {
  guide: OutreachGuide;
  drafts: OutreachDraft[];
}

// A pasted LinkedIn profile → the recipient fields. Nothing about the person is stored.
export interface ProfileParse {
  recipient_name: string;
  recipient_role: string;
  relationship: OutreachRelationship;
  notes: string;
  warning: string;
  model: string;
}

// ── Application Q&A — mirrors backend services/qa_service.py ──
export type QAKind = "short" | "motivation" | "story" | "skill" | "other";
export type QAUnit = "words" | "characters";

export interface QARequest {
  question: string;
  kind: QAKind | "auto";
  limit: number | null;
  unit: QAUnit;
  entry_ids: string[];
  notes: string;
  replace_id?: string | null;
}

export interface QAAnswer {
  id: string;
  created_at: string;
  question: string;
  kind: QAKind;
  limit: number | null;
  unit: QAUnit;
  entry_ids: string[];
  notes: string;
  answer: string;
  used_ids: string[];
  not_in_kb: string;
  model: string;
  warning: string;
}

export interface QAState {
  answers: QAAnswer[];
  entries: { id: string; title: string; on_resume: boolean }[];
}

export interface QASimilar {
  record_id: number;
  resume_title: string;
  answer: QAAnswer;
  score: number;
}
