import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import { AUTH_REQUIRED_EVENT, resumeApi } from "./api/resumeApi";
import { AlertIcon } from "./components/Icons";
import { LoginView } from "./components/LoginView";
import { CommandPalette } from "./components/shell/CommandPalette";
import { JobsPane } from "./components/shell/JobsPane";
import { Rail } from "./components/shell/Rail";
import { Toaster } from "./components/Toast";
import { useGeneration } from "./hooks/useGeneration";
import { useJobs } from "./hooks/useJobs";
import { jobPath, navigate, useRoute } from "./hooks/useRoute";
import { Home } from "./pages/Home";
import { JobPage } from "./pages/JobPage";
import { KBPage } from "./pages/KBPage";
import type { GenerateResponse, KBStatus } from "./types";
import "./index.css";

// "checking" until /api/session answers; "required" shows the password screen (deployed only).
type AuthState = "checking" | "required" | "ok";

export default function App() {
  const [auth, setAuth] = useState<AuthState>("checking");

  useEffect(() => {
    resumeApi
      .session()
      .then((s) => setAuth(s.required && !s.valid ? "required" : "ok"))
      .catch(() => setAuth("ok")); // backend unreachable: the workspace shows that itself
    const onAuthRequired = () => setAuth("required");
    window.addEventListener(AUTH_REQUIRED_EVENT, onAuthRequired);
    return () => window.removeEventListener(AUTH_REQUIRED_EVENT, onAuthRequired);
  }, []);

  // reducedMotion="user": framer-motion skips movement when the OS asks for less motion.
  return (
    <MotionConfig reducedMotion="user">
      {auth === "checking" ? (
        <div className="page--center login">
          <span className="spinner-dot" /> <span className="muted">Connecting…</span>
        </div>
      ) : auth === "required" ? (
        <LoginView onSignedIn={() => setAuth("ok")} />
      ) : (
        <Workspace />
      )}
    </MotionConfig>
  );
}

const PANE_KEY = "sourced-pane";
const readPane = () => {
  try {
    return localStorage.getItem(PANE_KEY) !== "closed";
  } catch {
    return true;
  }
};

// Mounted only once signed in, so its first requests already carry the token.
function Workspace() {
  const route = useRoute();
  const jobsApi = useJobs();
  const [kb, setKb] = useState<KBStatus | null>(null);
  const [pdflatexOk, setPdflatexOk] = useState<boolean | null>(null);
  const [paneOpen, setPaneOpen] = useState(readPane);
  const [palette, setPalette] = useState(false);
  // Bumped per job when a new résumé lands, so an open job page reloads it.
  const [versions, setVersions] = useState<Record<number, number>>({});

  const loadKb = useCallback(() => {
    resumeApi
      .kbStatus()
      .then(setKb)
      .catch(() => setKb({ path: "(backend unreachable)", found: false, entry_count: 0, entries_by_section: {} }));
  }, []);

  useEffect(() => {
    resumeApi
      .health()
      .then((h) => setPdflatexOk(h.pdflatex_available))
      .catch(() => setPdflatexOk(false));
    loadKb();
  }, [loadKb]);

  const onGenerated = (r: GenerateResponse, jobId: number | null) => {
    jobsApi.reload();
    const id = r.record_id ?? jobId;
    if (id == null) return;
    setVersions((v) => ({ ...v, [id]: (v[id] ?? 0) + 1 }));
    // Started from Home: open the new job. Started on a job: show its résumé if you're still there.
    if (jobId === null) navigate(jobPath(id, "resume"));
  };
  const generation = useGeneration(onGenerated);

  const togglePane = () =>
    setPaneOpen((open) => {
      try {
        localStorage.setItem(PANE_KEY, open ? "closed" : "open");
      } catch {
        /* not remembered */
      }
      return !open;
    });

  // ⌘K / Ctrl+K opens the palette from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const activeId = route.name === "job" ? route.id : null;
  const showPane = paneOpen && route.name !== "kb";
  const viewKey = route.name === "job" ? `job-${route.id}` : route.name;

  return (
    <div className={`app ${showPane ? "app--pane" : ""}`}>
      <Rail route={route} paneOpen={paneOpen} onTogglePane={togglePane} onPalette={() => setPalette(true)} />
      {showPane && <JobsPane jobs={jobsApi.jobs} activeId={activeId} generatingId={generation.running?.jobId ?? null} />}

      <main className="content">
        {pdflatexOk === false && (
          <div className="notice notice--warn content__banner">
            <AlertIcon size={14} />
            <span>pdflatex not found — PDFs can't be built. <code>brew install --cask mactex-no-gui</code></span>
          </div>
        )}
        <AnimatePresence mode="wait">
          <motion.div
            key={viewKey}
            className="view"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {route.name === "home" && (
              <Home kb={kb} onRefreshKb={loadKb} jobs={jobsApi.jobs} onJobsChanged={jobsApi.reload} generation={generation} />
            )}
            {route.name === "jobs" && (
              <JobsPane jobs={jobsApi.jobs} activeId={null} generatingId={generation.running?.jobId ?? null} page />
            )}
            {route.name === "job" && (
              <JobPage id={route.id} step={route.step} jobsApi={jobsApi} generation={generation} version={versions[route.id] ?? 0} kbCount={kb?.entry_count} />
            )}
            {route.name === "kb" && <KBPage kb={kb} onRefresh={loadKb} />}
          </motion.div>
        </AnimatePresence>
      </main>

      <Toaster />
      <CommandPalette open={palette} onClose={() => setPalette(false)} jobs={jobsApi.jobs} route={route} />
    </div>
  );
}
