import type { Job, JobStatus } from "../types";
import { JOB_STATUSES } from "../types";

export const statusLabel = (s?: JobStatus | null) => JOB_STATUSES.find((x) => x.id === s)?.label ?? null;

// "Northwind Labs — Backend Engineer" → ["Northwind Labs", "Backend Engineer"]
export function splitLabel(label: string): [string, string | null] {
  const m = label.split(/\s+[—–]\s+|\s+-{2,3}\s+/);
  return m.length > 1 ? [m[0], m.slice(1).join(" — ")] : [label, null];
}

export const jobTitle = (j: Job) => splitLabel(j.label);
