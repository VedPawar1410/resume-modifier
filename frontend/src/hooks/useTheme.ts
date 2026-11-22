import { useEffect, useState } from "react";

export type Theme = "light" | "dark";

const KEY = "sourced-theme";
const media = () => window.matchMedia("(prefers-color-scheme: dark)");

// index.html already set data-theme before first paint; React just reads it.
const current = (): Theme => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");

function saved(): Theme | null {
  try {
    const t = localStorage.getItem(KEY);
    return t === "light" || t === "dark" ? t : null;
  } catch {
    return null; // private mode / blocked storage: just follow the OS
  }
}

// Every useTheme() shares this one value, so the toggle and the LaTeX editor stay in step.
const listeners = new Set<(t: Theme) => void>();
function apply(t: Theme) {
  document.documentElement.dataset.theme = t;
  listeners.forEach((fn) => fn(t));
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(current);

  useEffect(() => {
    listeners.add(setTheme);
    // Follow the OS while you haven't picked a theme yourself.
    const m = media();
    const onSystem = () => !saved() && apply(m.matches ? "dark" : "light");
    m.addEventListener("change", onSystem);
    return () => {
      listeners.delete(setTheme);
      m.removeEventListener("change", onSystem);
    };
  }, []);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* not remembered, still applied */
    }
    apply(next);
  };

  return { theme, toggle };
}
