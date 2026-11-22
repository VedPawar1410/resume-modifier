import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CloseIcon, ExpandIcon } from "../Icons";
import { Sheet } from "./ResumeStep";

const DOCK_KEY = "sourced-dock";
const WIDTH_KEY = "sourced-dock-width";
const MIN = 30;
const MAX = 70;
const DEFAULT = 50;
const DOCK_MEDIA = "(min-width: 1100px)";

const clamp = (n: number) => Math.min(MAX, Math.max(MIN, n));
const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* not remembered — fine */
  }
};

// Match / Outreach / Q&A beside the résumé. The divider drags (or arrow keys move it) between
// 30% and 70%, default half; the width is remembered. Expand opens the résumé large; Hide folds
// it to a slim tab on the edge. Below 1100px there's no room to dock, so the tab opens it large.
export function DockSplit({ pdfUrl, children }: { pdfUrl: string | null; children: React.ReactNode }) {
  const [dock, setDock] = useState(() => read(DOCK_KEY) !== "off");
  const [sheetPct, setSheetPct] = useState(() => clamp(Number(read(WIDTH_KEY)) || DEFAULT));
  const [dragging, setDragging] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [wide, setWide] = useState(() => window.matchMedia(DOCK_MEDIA).matches);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mq = window.matchMedia(DOCK_MEDIA);
    const onChange = () => setWide(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const setWidth = (pct: number, save = true) => {
    const v = Math.round(clamp(pct));
    setSheetPct(v);
    if (save) write(WIDTH_KEY, String(v));
  };
  const toggleDock = (on: boolean) => {
    setDock(on);
    write(DOCK_KEY, on ? "on" : "off");
  };

  // Pointer capture keeps the drag going even over the PDF (an <embed> would swallow the events).
  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging || !root.current) return;
    const r = root.current.getBoundingClientRect();
    setWidth(((r.right - e.clientX) / r.width) * 100, false);
  };
  const onPointerUp = () => {
    if (!dragging) return;
    setDragging(false);
    write(WIDTH_KEY, String(sheetPct));
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 10 : 2;
    if (e.key === "ArrowLeft") setWidth(sheetPct + step);
    else if (e.key === "ArrowRight") setWidth(sheetPct - step);
    else if (e.key === "Home") setWidth(MAX);
    else if (e.key === "End") setWidth(MIN);
    else if (e.key === "Enter") setWidth(DEFAULT);
    else return;
    e.preventDefault();
  };

  const docked = dock && wide;

  return (
    <div
      ref={root}
      className={`dock ${docked ? "is-docked" : ""} ${dragging ? "is-dragging" : ""}`}
      style={{ ["--sheet" as string]: `${sheetPct}%` }}
    >
      <div className="dock__main">{children}</div>

      {docked ? (
        <>
          <div
            className="dock__divider"
            role="separator"
            aria-orientation="vertical"
            aria-label="Résumé width — drag, or use the arrow keys. Double-click or Enter resets to half."
            aria-valuenow={sheetPct}
            aria-valuemin={MIN}
            aria-valuemax={MAX}
            tabIndex={0}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onDoubleClick={() => setWidth(DEFAULT)}
            onKeyDown={onKeyDown}
            title="Drag to resize · double-click resets"
          >
            <span className="dock__grip" aria-hidden="true" />
          </div>
          <aside className="dock__sheet" aria-label="Résumé">
            <div className="dock__bar">
              <span className="eyebrow">Résumé</span>
              <span className="mono dock__pct" aria-hidden="true">{sheetPct}%</span>
              <button className="btn btn--ghost btn--xs" onClick={() => setExpanded(true)}>
                <ExpandIcon size={12} /> Expand
              </button>
              <button className="btn btn--ghost btn--xs" onClick={() => toggleDock(false)}>Hide</button>
            </div>
            <Sheet url={pdfUrl} fit />
          </aside>
        </>
      ) : (
        <button
          className="dock__tab"
          onClick={() => (wide ? toggleDock(true) : setExpanded(true))}
          aria-label={wide ? "Show the résumé beside this step" : "Open the résumé"}
        >
          <span>Résumé</span> <span aria-hidden="true">⟨</span>
        </button>
      )}

      <ResumeOverlay open={expanded} pdfUrl={pdfUrl} onClose={() => setExpanded(false)} />
    </div>
  );
}

// The résumé large, over everything: 90vw × 90vh. Esc or the backdrop closes it, and focus goes
// back to whatever opened it.
function ResumeOverlay({ open, pdfUrl, onClose }: { open: boolean; pdfUrl: string | null; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      before?.focus?.();
    };
  }, [open]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            className="overlay__panel"
            role="dialog"
            aria-modal="true"
            aria-label="Résumé"
            initial={{ scale: 0.98, y: 8 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.98, y: 8 }}
            transition={{ duration: 0.2 }}
          >
            <div className="overlay__bar">
              <span className="eyebrow">Résumé</span>
              <span className="muted small">Esc to close</span>
              <button ref={closeRef} className="btn btn--ghost btn--sm" onClick={onClose}>
                <CloseIcon size={13} /> Close
              </button>
            </div>
            <Sheet url={pdfUrl} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
