import { useCallback, useMemo, useRef } from "react";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { createTheme } from "@uiw/codemirror-themes";
import { StreamLanguage } from "@codemirror/language";
import { stex } from "@codemirror/legacy-modes/mode/stex";
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";
import { tags as t } from "@lezer/highlight";
import { useTheme } from "../hooks/useTheme";

interface Props {
  value: string;
  onChange: (value: string) => void;
  wrap: boolean; // soft-wrap long lines instead of scrolling sideways
}

// \section{Name}, optionally starred. Used for the jump chips and the line decoration.
const SECTION_RE = /\\section\*?\{([^}]+)\}/g;
const SECTION_LINE_RE = /^\s*\\section\*?\{/;

// ── Two editor themes matching the app's tokens (styles/tokens.css) ──────────
// CodeMirror themes are JS objects, not CSS variables, so the hexes mirror the tokens.
const font = "'IBM Plex Mono', ui-monospace, monospace";

const lightTheme = createTheme({
  theme: "light",
  settings: {
    background: "#FFFFFF",
    foreground: "#0F172A", // --ink
    caret: "#1E40AF", // --accent
    selection: "rgba(30,64,175,0.14)",
    selectionMatch: "rgba(30,64,175,0.08)",
    lineHighlight: "rgba(15,23,42,0.03)",
    gutterBackground: "#FFFFFF",
    gutterForeground: "#94A3B8",
    gutterBorder: "transparent",
    fontFamily: font,
  },
  styles: [
    { tag: [t.keyword, t.tagName], color: "#1E40AF" }, // LaTeX commands (\section, \textbf)
    { tag: [t.brace, t.bracket, t.punctuation], color: "#64748B" },
    { tag: [t.string, t.literal], color: "#0F766E" },
    { tag: [t.comment], color: "#64748B", fontStyle: "italic" }, // % comments
    { tag: [t.number, t.atom], color: "#A15C07" },
    { tag: [t.variableName, t.attributeName], color: "#0F172A" },
  ],
});

const darkTheme = createTheme({
  theme: "dark",
  settings: {
    background: "#17171A", // --surface
    foreground: "#E4E4E7",
    caret: "#6B95FF",
    selection: "rgba(107,149,255,0.24)",
    selectionMatch: "rgba(107,149,255,0.12)",
    lineHighlight: "rgba(255,255,255,0.03)",
    gutterBackground: "#17171A",
    gutterForeground: "#5C5C66",
    gutterBorder: "transparent",
    fontFamily: font,
  },
  styles: [
    { tag: [t.keyword, t.tagName], color: "#8FB0FF" },
    { tag: [t.brace, t.bracket, t.punctuation], color: "#85858F" },
    { tag: [t.string, t.literal], color: "#2DD4BF" },
    { tag: [t.comment], color: "#85858F", fontStyle: "italic" },
    { tag: [t.number, t.atom], color: "#F5B454" },
    { tag: [t.variableName, t.attributeName], color: "#E4E4E7" },
  ],
});

const latexLang = StreamLanguage.define(stex);

// ── Decoration: give every \section{} line a subtle banded treatment ─────────
const sectionLineDeco = Decoration.line({ class: "cm-section-line" });

function buildSectionDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to; ) {
      const line = view.state.doc.lineAt(pos);
      if (SECTION_LINE_RE.test(line.text)) {
        builder.add(line.from, line.from, sectionLineDeco);
      }
      pos = line.to + 1;
    }
  }
  return builder.finish();
}

const sectionHighlight = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildSectionDecorations(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildSectionDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

const baseExtensions = [latexLang, sectionHighlight];
const wrappedExtensions = [...baseExtensions, EditorView.lineWrapping];

export function LatexEditor({ value, onChange, wrap }: Props) {
  const cmRef = useRef<ReactCodeMirrorRef>(null);
  const { theme } = useTheme();

  // Section names + their character offsets, for the jump chips.
  const sections = useMemo(() => {
    const found: { name: string; offset: number }[] = [];
    for (const m of value.matchAll(SECTION_RE)) {
      found.push({ name: m[1].trim(), offset: m.index ?? 0 });
    }
    return found;
  }, [value]);

  const jumpTo = useCallback((offset: number) => {
    const view = cmRef.current?.view;
    if (!view) return;
    view.dispatch({ selection: { anchor: offset }, scrollIntoView: true });
    view.focus();
  }, []);

  return (
    <div className="latex-editor">
      {sections.length > 0 && (
        <div className="latex-chips" role="navigation" aria-label="Jump to section">
          {sections.map((s, i) => (
            <button key={`${s.name}-${i}`} type="button" className="latex-chip" onClick={() => jumpTo(s.offset)}>
              {s.name}
            </button>
          ))}
        </div>
      )}
      <CodeMirror
        ref={cmRef}
        className="latex-editor__cm"
        value={value}
        onChange={onChange}
        theme={theme === "dark" ? darkTheme : lightTheme}
        extensions={wrap ? wrappedExtensions : baseExtensions}
        height="100%"
        spellCheck={false}
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          highlightActiveLine: true,
          autocompletion: false,
        }}
      />
    </div>
  );
}
