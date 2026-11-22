import { useEffect, useState } from "react";

// A tiny router on the browser history API — four routes don't need a library.
// URLs: /  ·  /jobs  ·  /jobs/7  ·  /jobs/7/outreach  ·  /kb
export type Step = "fit" | "resume" | "match" | "outreach" | "qa";
export const STEPS: Step[] = ["fit", "resume", "match", "outreach", "qa"];

export type Route =
  | { name: "home" }
  | { name: "jobs" } // the jobs list as its own page (phones)
  | { name: "job"; id: number; step: Step | null }
  | { name: "kb" };

export function parse(path: string): Route {
  const parts = path.split("/").filter(Boolean);
  if (parts[0] === "kb") return { name: "kb" };
  if (parts[0] === "jobs" && parts[1] && /^\d+$/.test(parts[1])) {
    const step = STEPS.includes(parts[2] as Step) ? (parts[2] as Step) : null;
    return { name: "job", id: Number(parts[1]), step };
  }
  if (parts[0] === "jobs") return { name: "jobs" };
  return { name: "home" };
}

const NAV_EVENT = "sourced:navigate";

export function navigate(path: string, opts: { replace?: boolean } = {}) {
  if (path === window.location.pathname) return;
  if (opts.replace) window.history.replaceState(null, "", path);
  else window.history.pushState(null, "", path);
  window.dispatchEvent(new Event(NAV_EVENT));
}

export const jobPath = (id: number, step?: Step | null) => `/jobs/${id}${step ? `/${step}` : ""}`;

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parse(window.location.pathname));
  useEffect(() => {
    const sync = () => setRoute(parse(window.location.pathname));
    window.addEventListener("popstate", sync); // back / forward
    window.addEventListener(NAV_EVENT, sync); // navigate()
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener(NAV_EVENT, sync);
    };
  }, []);
  return route;
}
