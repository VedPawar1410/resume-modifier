import { useState } from "react";
import type { ModifyResponse } from "../types";

interface Props {
  result: ModifyResponse | null;
  onDownloadPdf: () => void;
}

export function OutputPanel({ result, onDownloadPdf }: Props) {
  const [copied, setCopied] = useState(false);

  if (!result) return null;

  const copyLatex = async () => {
    if (!result.modified_latex) return;
    await navigator.clipboard.writeText(result.modified_latex);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="output-panel">
      <h2 className="output-title">✅ Resume Updated</h2>

      {/* Stats */}
      <div className="output-stats">
        <span>Sections modified: <strong>{result.sections_modified.join(", ") || "none"}</strong></span>
        {result.retry_count > 0 && (
          <span className="retry-badge">🔄 {result.retry_count} retry{result.retry_count > 1 ? "s" : ""}</span>
        )}
      </div>

      {/* Compilation warning */}
      {result.compilation_errors && (
        <div className="banner banner-warning">
          ⚠️ <strong>PDF compilation had issues:</strong> {result.compilation_errors}
          <br />The modified LaTeX is shown below — you can copy it and fix manually.
        </div>
      )}

      {/* PDF Download */}
      {result.pdf_base64 && (
        <button className="btn-primary btn-download" onClick={onDownloadPdf}>
          ⬇️ Download PDF
        </button>
      )}

      {/* Modified LaTeX */}
      {result.modified_latex && (
        <div className="latex-output-block">
          <div className="latex-output-header">
            <span>Modified LaTeX</span>
            <button className="btn-ghost" onClick={copyLatex}>
              {copied ? "✓ Copied!" : "Copy"}
            </button>
          </div>
          <pre className="latex-output-pre">
            <code>{result.modified_latex}</code>
          </pre>
        </div>
      )}
    </div>
  );
}
