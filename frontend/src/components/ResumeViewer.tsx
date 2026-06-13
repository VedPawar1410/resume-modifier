import { useEffect, useState } from "react";
import type { AppMode, AppStatus, ModifyResponse, RecompileStatus } from "../types";
import { CompareModal } from "./CompareModal";
import { OutputPanel } from "./OutputPanel";

type View = "main" | "create";
type ViewMode = "base" | "tailored";

interface Props {
  view: View;
  mode: AppMode;
  basesCount: number;
  selectedBaseId: number | null;
  basePdfUrl: string | null;
  baseName: string;
  baseLatex: string;
  result: ModifyResponse | null;
  tailoredPdfUrl: string | null;
  status: AppStatus;
  onDownloadPdf: () => void;
  recompile: (latex: string) => Promise<void>;
  recompileStatus: RecompileStatus;
}

export function ResumeViewer({
  view,
  mode,
  basesCount,
  selectedBaseId,
  basePdfUrl,
  baseName,
  baseLatex,
  result,
  tailoredPdfUrl,
  status,
  onDownloadPdf,
  recompile,
  recompileStatus,
}: Props) {
  const hasTailored = status === "success" && !!result;
  const [viewMode, setViewMode] = useState<ViewMode>("base");
  const [compareOpen, setCompareOpen] = useState(false);

  // Whenever a fresh tailored result arrives, show it first.
  useEffect(() => {
    if (hasTailored) setViewMode("tailored");
  }, [result, hasTailored]);

  // ── Nothing to show yet: keep the original placeholder ─────────────────────
  if (!selectedBaseId && !hasTailored) {
    return (
      <div className="output-placeholder">
        <div className="placeholder-icon">📋</div>
        <p className="placeholder-title">
          {view === "create"
            ? "Your generated résumé will appear here"
            : "Your modified résumé will appear here"}
        </p>
        <p style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
          {view === "create"
            ? "Fill in your career info and click Generate résumé."
            : basesCount === 0
            ? "Create a base résumé to get started."
            : mode === "tailor"
            ? "Pick a base, add a job description, and click Tailor Resume."
            : "Pick a base, choose a section, fill in the details, and click Update Base."}
        </p>
      </div>
    );
  }

  const canCompare = !!basePdfUrl && !!tailoredPdfUrl;

  return (
    <div className="resume-viewer">
      <div className="viewer-toolbar">
        <label className="viewer-toolbar__select">
          <span className="viewer-toolbar__label">Viewing</span>
          <select
            value={viewMode}
            onChange={(e) => setViewMode(e.target.value as ViewMode)}
          >
            <option value="base">Base résumé</option>
            {hasTailored && <option value="tailored">Tailored résumé</option>}
          </select>
        </label>

        {hasTailored && (
          <button
            className="btn-ghost"
            onClick={() => setCompareOpen(true)}
            disabled={!canCompare}
            title={canCompare ? "Compare base vs tailored" : "Both PDFs are needed to compare"}
          >
            ⇄ Compare
          </button>
        )}
      </div>

      {viewMode === "tailored" && hasTailored ? (
        <OutputPanel
          result={result}
          pdfUrl={tailoredPdfUrl}
          onDownloadPdf={onDownloadPdf}
          recompile={recompile}
          recompileStatus={recompileStatus}
        />
      ) : (
        <div className="pdf-preview-container">
          <div className="pdf-preview-header">
            <span>{baseName} · Base résumé</span>
          </div>
          {basePdfUrl ? (
            <embed
              key={basePdfUrl}
              src={basePdfUrl}
              type="application/pdf"
              className="pdf-embed"
            />
          ) : (
            <div className="compare-pane__empty">Preview unavailable for this base.</div>
          )}
        </div>
      )}

      {compareOpen && (
        <CompareModal
          basePdfUrl={basePdfUrl}
          tailoredPdfUrl={tailoredPdfUrl}
          baseLatex={baseLatex}
          tailoredLatex={result?.modified_latex ?? ""}
          baseName={baseName}
          onClose={() => setCompareOpen(false)}
        />
      )}
    </div>
  );
}
