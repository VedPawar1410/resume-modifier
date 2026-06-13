import { useCallback, useMemo, useRef } from "react";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { createTheme } from "@uiw/codemirror-themes";
import { StreamLanguage } from "@codemirror/language";
import { stex } from "@codemirror/legacy-modes/mode/stex";
import { Decoration, ViewPlugin, type DecorationSet, type EditorView, type ViewUpdate } from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";
import { tags as t } from "@lezer/highlight";

interface Props {
  value: string;
  onChange: (value: string) => void;
}

// Matches the backend SECTION_PATTERN shape (latex_service.py): \section{Name},
// optionally starred. Used both for the chip bar and the line decoration.
const SECTION_RE = /\\section\*?\{([^}]+)\}/g;
const SECTION_LINE_RE = /^\s*\\section\*?\{/;

// ── Dark theme matching the app's IDE panel (index.css color vars) ───────────
const latexTheme = createTheme({
  theme: "dark",
  settings: {
    background: "#1C1F22", // --surface-2
    foreground: "#E6E7E9", // --text
    caret: "#C6F24E", // --accent
    selection: "rgba(198,242,78,0.22)", // --accent-glow
    selectionMatch: "rgba(198,242,78,0.14)",
    lineHighlight: "rgba(255,255,255,0.03)",
    gutterBackground: "#1C1F22",
    gutterForeground: "#5A5F66", // --text-faint
    gutterBorder: "transparent",
  },
  styles: [
    { tag: [t.keyword, t.tagName], color: "#C6F24E" }, // LaTeX commands (\section, \textbf)
    { tag: [t.brace, t.bracket, t.punctuation], color: "#8A8F98" }, // braces / args delimiters
    { tag: [t.string, t.literal], color: "#7FD1C0" },
    { tag: [t.comment], color: "#5A5F66", fontStyle: "italic" }, // % comments
    { tag: [t.number, t.atom], color: "#FBBF24" },
    { tag: [t.variableName, t.attributeName], color: "#E6E7E9" },
  ],
});

const latexLang = StreamLanguage.define(stex);

// ── Decoration: give every \section{} line a bold, accent-banded treatment ───
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

const extensions = [latexLang, sectionHighlight];

export function LatexEditor({ value, onChange }: Props) {
  const cmRef = useRef<ReactCodeMirrorRef>(null);

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
        <div className="latex-section-chips" role="navigation" aria-label="Jump to section">
          <span className="latex-section-chips__label">Jump to</span>
          {sections.map((s, i) => (
            <button
              key={`${s.name}-${i}`}
              type="button"
              className="latex-section-chip"
              onClick={() => jumpTo(s.offset)}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
      <CodeMirror
        ref={cmRef}
        value={value}
        onChange={onChange}
        theme={latexTheme}
        extensions={extensions}
        minHeight="250px"
        maxHeight="500px"
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
