import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import type { ToastItem } from "../utils/toast";
import { onToast } from "../utils/toast";

// Bottom-centre confirmation for quiet actions (status changed, copied, deleted).
// One at a time; a toast with an action (Undo) stays a little longer so there's time to press it.
export function Toaster() {
  const [item, setItem] = useState<ToastItem | null>(null);
  useEffect(() => onToast(setItem), []);
  useEffect(() => {
    if (!item) return;
    const t = setTimeout(() => setItem(null), item.action ? 6000 : 2600);
    return () => clearTimeout(t);
  }, [item]);

  return (
    <div className="toaster" role="status" aria-live="polite">
      <AnimatePresence>
        {item && (
          <motion.div
            key={item.id}
            className="toast"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2 }}
          >
            <span>{item.text}</span>
            {item.action && (
              <button
                className="toast__action"
                onClick={() => {
                  item.action?.run();
                  setItem(null);
                }}
              >
                {item.action.label}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
