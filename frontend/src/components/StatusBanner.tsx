import type { AppStatus } from "../types";

interface Props {
  status: AppStatus;
  error: string | null;
}

export function StatusBanner({ status, error }: Props) {
  if (status === "idle") return null;

  if (status === "loading") {
    return (
      <div className="banner banner-loading">
        <span className="spinner" /> Generating your tailored resume… (AI + PDF compilation — up to 60s)
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="banner banner-error">
        ❌ <strong>Error:</strong> {error}
      </div>
    );
  }

  return null;
}
