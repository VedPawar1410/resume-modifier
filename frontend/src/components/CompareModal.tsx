import { useEffect, useState } from "react";
import ReactDiffViewer, { DiffMethod } from "react-diff-viewer-continued";

interface Props {
  basePdfUrl: string | null;
  tailoredPdfUrl: string | null;
  baseLatex: string;
  tailoredLatex: string;
  baseName: string;
  onClose: () => void;
}

type CompareTab = "pdf" | "diff";

export function CompareModal({
  basePdfUrl,
  tailoredPdfUrl,
  baseLatex,
  tailoredLatex,
  baseName,
  onClose,
}: Props) {
  const [tab, setTab] = useState<CompareTab>("pdf");

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="compare-overlay" onClick={onClose}>
      <div className="compare-modal" onClick={(e) => e.stopPropagation()}>
        <div className="compare-modal__header">
          <h2 className="output-title">Compare résumés</h2>
          <div className="compare-tabs">
            <button
              className={`compare-tab ${tab === "pdf" ? "active" : ""}`}
              onClick={() => setTab("pdf")}
            >
              PDF
            </button>
            <button
              className={`compare-tab ${tab === "diff" ? "active" : ""}`}
              onClick={() => setTab("diff")}
            >
              LaTeX diff
            </button>
          </div>
          <button className="btn-ghost" onClick={onClose} aria-label="Close compare view">
            ✕ Close
          </button>
        </div>

        {tab === "pdf" ? (
          <div className="compare-grid">
            <div className="compare-pane">
              <div className="compare-pane__label">{baseName} · Base</div>
              {basePdfUrl ? (
                <embed src={basePdfUrl} type="application/pdf" className="pdf-embed" />
              ) : (
                <div className="compare-pane__empty">Preview unavailable</div>
              )}
            </div>
            <div className="compare-pane">
              <div className="compare-pane__label">Tailored</div>
              {tailoredPdfUrl ? (
                <embed src={tailoredPdfUrl} type="application/pdf" className="pdf-embed" />
              ) : (
                <div className="compare-pane__empty">Preview unavailable</div>
              )}
            </div>
          </div>
        ) : (
          <div className="compare-diff">
            <ReactDiffViewer
              oldValue={baseLatex}
              newValue={tailoredLatex}
              splitView
              useDarkTheme
              compareMethod={DiffMethod.LINES}
              leftTitle="Base"
              rightTitle="Tailored"
            />
          </div>
        )}
      </div>
    </div>
  );
}
