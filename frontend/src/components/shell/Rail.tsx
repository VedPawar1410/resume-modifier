import type { Route } from "../../hooks/useRoute";
import { navigate } from "../../hooks/useRoute";
import { BookIcon, CommandIcon, ListIcon, PlusIcon } from "../Icons";
import { ThemeToggle } from "../ThemeToggle";

interface Props {
  route: Route;
  paneOpen: boolean;
  onTogglePane: () => void;
  onPalette: () => void;
}

// The 56px rail: where you are in the app. On phones it becomes the bottom tab bar.
export function Rail({ route, paneOpen, onTogglePane, onPalette }: Props) {
  // Jobs is "on" while the list is showing: its own page (phones) or the pane beside a job/home.
  const jobsOn = route.name === "jobs" || (paneOpen && route.name !== "kb");
  return (
    <nav className="rail" aria-label="Main">
      <button className="rail__logo" onClick={() => navigate("/")} aria-label="Sourced — new job" title="Sourced">
        <span className="rail__mark" aria-hidden="true">S</span>
      </button>
      <div className="rail__group">
        <RailButton label="New job" active={route.name === "home"} onClick={() => navigate("/")}>
          <PlusIcon size={18} />
        </RailButton>
        <RailButton
          label="Jobs"
          active={jobsOn}
          className="rail__jobs"
          onClick={() => (window.innerWidth < 720 ? navigate("/jobs") : onTogglePane())}
        >
          <ListIcon size={18} />
        </RailButton>
        <RailButton label="Knowledge base" active={route.name === "kb"} onClick={() => navigate("/kb")}>
          <BookIcon size={18} />
        </RailButton>
      </div>
      <div className="rail__group rail__bottom">
        <RailButton label="Command palette (⌘K)" onClick={onPalette} className="rail__palette">
          <CommandIcon size={17} />
        </RailButton>
        <ThemeToggle className="rail__btn" />
      </div>
    </nav>
  );
}

function RailButton({
  label,
  active = false,
  className = "",
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  className?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      className={`rail__btn ${active ? "is-active" : ""} ${className}`}
      onClick={onClick}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      title={label}
    >
      {children}
      <span className="rail__label" aria-hidden="true">{label.split(" (")[0]}</span>
    </button>
  );
}
