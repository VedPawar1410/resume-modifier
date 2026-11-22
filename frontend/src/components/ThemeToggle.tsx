import { useTheme } from "../hooks/useTheme";
import { MoonIcon, SunIcon } from "./Icons";

// Sun in dark mode (click → light), moon in light mode (click → dark).
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const label = theme === "dark" ? "Switch to light theme" : "Switch to dark theme";
  return (
    <button className={`icon-btn ${className}`} onClick={toggle} aria-label={label} title={label}>
      {theme === "dark" ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
