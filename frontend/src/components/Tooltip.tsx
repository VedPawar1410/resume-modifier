import { Children, cloneElement, useEffect, useId, useRef, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { createPortal } from "react-dom";

type Side = "bottom" | "right" | "top";

interface Props {
  content: ReactNode;
  side?: Side;
  delay?: number;
  children: ReactElement;
}

const GAP = 8;
const HALF_MAX = 150; // half the tooltip's max width — keeps it on screen near the edges

// A small popover on hover AND keyboard focus (title= only works with a mouse, and slowly).
// Rendered in a portal with fixed coordinates, so a scrolling strip (the step tabs) can't clip it.
// The trigger points at it with aria-describedby, so a screen reader reads it too. Esc closes it.
export function Tooltip({ content, side = "bottom", delay = 300, children }: Props) {
  const id = useId();
  const anchor = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number; arrow: number } | null>(null);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const hide = () => {
    clear();
    setPos(null);
  };
  const show = () => {
    clear();
    timer.current = setTimeout(() => {
      const r = anchor.current?.getBoundingClientRect();
      if (!r) return;
      if (side === "right") return setPos({ x: r.right + GAP, y: r.top + r.height / 2, arrow: 0 });
      const cx = r.left + r.width / 2;
      const x = Math.min(Math.max(cx, HALF_MAX + 8), window.innerWidth - HALF_MAX - 8);
      setPos({ x, y: side === "top" ? r.top - GAP : r.bottom + GAP, arrow: cx - x });
    }, delay);
  };

  useEffect(() => {
    if (!pos) return;
    const close = () => setPos(null);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
    };
  }, [pos]);
  useEffect(() => clear, []);

  const child = Children.only(children) as ReactElement<Record<string, unknown>>;
  return (
    <span
      ref={anchor}
      className="tip-anchor"
      // Hover only where there's a real pointer (a tap on a phone fires mouseenter too), and
      // focus only when it's keyboard focus (:focus-visible), not a click.
      onMouseEnter={() => window.matchMedia("(hover: hover)").matches && show()}
      onMouseLeave={hide}
      onFocus={(e) => (e.target as HTMLElement).matches?.(":focus-visible") && show()}
      onBlur={hide}
      onPointerDown={hide}
    >
      {cloneElement(child, { "aria-describedby": pos ? id : undefined })}
      {pos &&
        createPortal(
          <div
            role="tooltip"
            id={id}
            className={`tip tip--${side}`}
            style={{ left: pos.x, top: pos.y, ["--arrow" as string]: `${pos.arrow}px` }}
          >
            {content}
          </div>,
          document.body,
        )}
    </span>
  );
}
