import { useCallback, useEffect, useState } from "react";
import { resumeApi } from "../api/resumeApi";
import type { Job, JobStatus } from "../types";

// The jobs list: loaded once, reloaded after anything that adds a job, patched in place otherwise.
export function useJobs() {
  const [jobs, setJobs] = useState<Job[] | null>(null);

  const reload = useCallback(() => {
    resumeApi
      .listHistory()
      .then((r) => setJobs(r.records))
      .catch(() => setJobs((prev) => prev ?? []));
  }, []);

  useEffect(() => reload(), [reload]);

  const patch = useCallback((id: number, fields: Partial<Job>) => {
    setJobs((prev) => prev?.map((j) => (j.id === id ? { ...j, ...fields } : j)) ?? prev);
  }, []);

  const rename = async (id: number, label: string) => {
    const updated = await resumeApi.updateJob(id, { label });
    patch(id, { label: updated.label });
  };

  const setStatus = async (id: number, status: JobStatus | null) => {
    patch(id, { status }); // optimistic: the pill changes at once
    try {
      await resumeApi.updateJob(id, { status });
    } catch {
      reload();
    }
  };

  const remove = async (id: number) => {
    await resumeApi.deleteHistory(id);
    setJobs((prev) => prev?.filter((j) => j.id !== id) ?? prev);
  };

  return { jobs, reload, patch, rename, setStatus, remove };
}
export type JobsApi = ReturnType<typeof useJobs>;
