import { AnimatePresence, motion } from "framer-motion";
import type { AppStatus } from "../types";

interface Props {
  status: AppStatus;
  error: string | null;
}

export function StatusBanner({ status, error }: Props) {
  const show = status === "loading" || status === "error";

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key={status}
          initial={{ opacity: 0, y: -6, height: 0 }}
          animate={{ opacity: 1, y: 0, height: "auto" }}
          exit={{ opacity: 0, y: -6, height: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          style={{ overflow: "hidden" }}
        >
          {status === "loading" && (
            <div className="banner banner-loading">
              <span className="spinner" />
              Generating your resume… AI + PDF compilation can take up to 60s.
            </div>
          )}
          {status === "error" && (
            <div className="banner banner-error">
              <span style={{ fontSize: "1rem" }}>⚠</span>
              <span><strong>Error:</strong> {error}</span>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
