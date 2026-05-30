import { useEffect, useRef, useState } from "react";
import type { ModifyResponse, RecompileStatus } from "../types";

interface Props {
  result: ModifyResponse | null;
  pdfUrl: string | null;
  onDownloadPdf: () => void;
  recompile: (latex: string) => Promise<void>;
  recompileStatus: RecompileStatus;
}

const DEBOUNCE_MS = 1500;

export function OutputPanel({ result, pdfUrl, onDownloadPdf, recompile, recompileStatus }: Props) {
  const [editableLatex, setEditableLatex] = useState("");
  const [copied, setCopied] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // When a new AI result arrives, reset the editable latex to the fresh output
  useEffect(() => {
    if (result?.modified_latex) {
      setEditableLatex(result.modified_latex);
    }
  }, [result?.modified_latex]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleLatexChange = (value: string) => {
    setEditableLatex(value);
    // Debounce recompile: cancel previous timer, start a new one
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => recompile(value), DEBOUNCE_MS);
  };

  const copyLatex = async () => {
    if (!editableLatex) return;
    await navigator.clipboard.writeText(editableLatex);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!result) return null;

  return (
    <div className="output-panel">
      <h2 className="output-title">✅ Resume Updated</h2>

      {/* Stats row */}
      <div className="output-stats">
        <span>
          Sections modified:{" "}
          <strong>{result.sections_modified.join(", ") || "none"}</strong>
        </span>
        {result.retry_count > 0 && (
          <span className="retry-badge">
            🔄 {result.retry_count} retry{result.retry_count > 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Compilation warning */}
      {result.compilation_errors && (
        <div className="banner banner-warning">
          ⚠️ <strong>PDF compilation had issues:</strong> {result.compilation_errors}
        </div>
      )}

      {/* Recompilation error */}
      {recompileStatus === "error" && (
        <div className="banner banner-warning">
          ⚠️ Could not recompile after your edit — check the LaTeX for syntax errors.
        </div>
      )}

      {/* Download button */}
      {pdfUrl && (
        <button className="btn-primary btn-download" onClick={onDownloadPdf}>
          ⬇️ Download PDF
        </button>
      )}

      {/* ── PDF Preview ──────────────────────────────────────────────── */}
      {pdfUrl && (
        <div className="pdf-preview-container">
          <div className="pdf-preview-header">
            <span>Preview</span>
            {recompileStatus === "loading" && (
              <span className="recompile-indicator">
                <span className="spinner spinner-sm" /> Recompiling…
              </span>
            )}
          </div>
          {/*
            Native <embed> renders the PDF directly — no external library needed.
            key={pdfUrl} forces the embed to reload whenever the blob URL changes
            (a new blob URL is created after each recompilation).
          */}
          <embed
            key={pdfUrl}
            src={pdfUrl}
            type="application/pdf"
            className="pdf-embed"
          />
        </div>
      )}

      {/* ── Editable LaTeX ───────────────────────────────────────────── */}
      {editableLatex && (
        <div className="latex-output-block">
          <div className="latex-output-header">
            <span>LaTeX — edit to fine-tune, preview updates automatically</span>
            <button className="btn-ghost" onClick={copyLatex}>
              {copied ? "✓ Copied!" : "Copy"}
            </button>
          </div>
          <textarea
            className="latex-edit-textarea"
            value={editableLatex}
            onChange={(e) => handleLatexChange(e.target.value)}
            spellCheck={false}
            aria-label="Modified LaTeX code — editable"
          />
        </div>
      )}
    </div>
  );
}
