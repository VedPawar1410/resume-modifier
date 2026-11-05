import { useCallback, useMemo, useRef } from "react";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { createTheme } from "@uiw/codemirror-themes";
import { StreamLanguage } from "@codemirror/language";
import { stex } from "@codemirror/legacy-modes/mode/stex";
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";
import { tags as t } from "@lezer/highlight";

interface Props {
  value: string;
  onChange: (value: string) => void;
  wrap: boolean; // soft-wrap long lines instead of scrolling sideways
}

// \section{Name}, optionally starred. Used for the jump chips and the line decoration.
const SECTION_RE = /\\section\*?\{([^}]+)\}/g;
const SECTION_LINE_RE = /^\s*\\section\*?\{/;

// ── Light theme matching the app's paper palette (index.css color vars) ──────
const latexTheme = createTheme({
  theme: "light",
  settings: {
    background: "#FFFFFF",
    foreground: "#1A1916", // --ink
    caret: "#2B4ACB", // --accent
    selection: "rgba(43,74,203,0.14)",
    selectionMatch: "rgba(43,74,203,0.08)",
    lineHighlight: "rgba(26,25,22,0.025)",
    gutterBackground: "#FBFAF7",
    gutterForeground: "#A39E93",
    gutterBorder: "transparent",
    fontFamily: "'Geist Mono', ui-monospace, monospace",
  },
  styles: [
    { tag: [t.keyword, t.tagName], color: "#2B4ACB" }, // LaTeX commands (\section, \textbf)
    { tag: [t.brace, t.bracket, t.punctuation], color: "#8A857B" },
    { tag: [t.string, t.literal], color: "#1E7B4F" },
    { tag: [t.comment], color: "#9A958A", fontStyle: "italic" }, // % comments
    { tag: [t.number, t.atom], color: "#B45309" },
    { tag: [t.variableName, t.attributeName], color: "#1A1916" },
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
        theme={latexTheme}
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
