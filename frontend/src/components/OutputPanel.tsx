import { motion } from "framer-motion";
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

  useEffect(() => {
    if (result?.modified_latex) {
      setEditableLatex(result.modified_latex);
    }
  }, [result?.modified_latex]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleLatexChange = (value: string) => {
    setEditableLatex(value);
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

  const sectionCount = result.sections_modified.length;

  return (
    <motion.div
      className="output-panel"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <h2 className="output-title">
          <span style={{ color: "var(--success)", fontSize: "1.1rem" }}>✓</span>
          Resume Updated
        </h2>
        <div className="output-stats">
          <span className="stat-chip stat-chip--success">
            {sectionCount} section{sectionCount !== 1 ? "s" : ""} modified
          </span>
          {result.retry_count > 0 && (
            <span className="stat-chip stat-chip--warning">
              ↻ {result.retry_count} retr{result.retry_count > 1 ? "ies" : "y"}
            </span>
          )}
        </div>
      </div>

      {result.compilation_errors && (
        <div className="banner banner-warning">
          <span>⚠</span>
          <span><strong>PDF compilation had issues:</strong> {result.compilation_errors}</span>
        </div>
      )}

      {recompileStatus === "error" && (
        <div className="banner banner-warning">
          <span>⚠</span>
          <span>Could not recompile after your edit — check the LaTeX for syntax errors.</span>
        </div>
      )}

      {pdfUrl && (
        <button className="btn-primary btn-download" onClick={onDownloadPdf}>
          ↓ Download PDF
        </button>
      )}

      {pdfUrl && (
        <div className="pdf-preview-container">
          <div className="pdf-preview-header">
            <span>Preview</span>
            {recompileStatus === "loading" && (
              <span className="recompile-indicator">
                <span className="spinner-sm" /> Recompiling…
              </span>
            )}
          </div>
          <embed
            key={pdfUrl}
            src={pdfUrl}
            type="application/pdf"
            className="pdf-embed"
          />
        </div>
      )}

      {editableLatex && (
        <div className="latex-output-block">
          <div className="latex-output-header">
            <span>LaTeX — edit to fine-tune, preview updates automatically</span>
            <button className="btn-ghost" onClick={copyLatex}>
              {copied ? "✓ Copied" : "Copy"}
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
    </motion.div>
  );
}
