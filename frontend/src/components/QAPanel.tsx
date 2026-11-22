import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { resumeApi } from "../api/resumeApi";
import type { QAAnswer, QAKind, QARequest, QASimilar, QAState, QAUnit } from "../types";
import { AlertIcon, ChatIcon, CheckIcon, CloseIcon, RefreshIcon, TrashIcon } from "./Icons";
import { PanelIntro } from "./PanelIntro";
import { toast } from "../utils/toast";

interface Props {
  recordId: number;
  onClose?: () => void; // omitted when shown as a job step (steps don't close)
  onCount?: (n: number) => void; // answers saved (the step tab shows "Q&A · 3")
}

const EASE = [0.22, 1, 0.36, 1] as const;

// "Auto" lets the backend sort the question (code, not AI); the others force a shape.
const KINDS: { kind: QAKind | "auto"; label: string; hint: string }[] = [
  { kind: "auto", label: "Auto", hint: "Sourced picks the type from the question" },
  { kind: "short", label: "Short field", hint: "Authorization, notice, start date, relocation, salary, years" },
  { kind: "motivation", label: "Why us", hint: "Why this company / role — 100–150 words" },
  { kind: "story", label: "Story (STAR)", hint: "Describe a time / a project — 150–250 words" },
  { kind: "skill", label: "Skill", hint: "Your experience with X — 80–150 words" },
  { kind: "other", label: "Other", hint: "Anything else — about 100 words" },
];
const KIND_LABEL: Record<QAKind, string> = {
  short: "Short field", motivation: "Why us", story: "Story", skill: "Skill", other: "Other",
};

const EMPTY: QARequest = { question: "", kind: "auto", limit: null, unit: "words", entry_ids: [], notes: "" };

function errorText(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? fallback;
}

const words = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (key: string, text: string) =>
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      toast("Answer copied");
      setTimeout(() => setCopied(null), 1500);
    });
  return { copied, copy };
}

export function QAPanel({ recordId, onClose, onCount }: Props) {
  const [state, setState] = useState<QAState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [form, setForm] = useState<QARequest>(EMPTY);
  const [similar, setSimilar] = useState<QASimilar[]>([]);
  const { copied, copy } = useCopy();

  useEffect(() => {
    resumeApi
      .qa(recordId)
      .then(setState)
      .catch((err) => setError(errorText(err, "Couldn't load Q&A.")))
      .finally(() => setLoading(false));
  }, [recordId]);

  // "You answered something similar" — word overlap on the server, no AI. Debounced while typing.
  useEffect(() => {
    const q = form.question.trim();
    if (q.length < 15) return;
    const t = setTimeout(() => {
      resumeApi.similarQA(recordId, q).then(setSimilar).catch(() => setSimilar([]));
    }, 600);
    return () => clearTimeout(t);
  }, [form.question, recordId]);
  const shownSimilar = form.question.trim().length < 15 ? [] : similar;

  // Tell the job page how many answers there are, whenever that changes.
  const countRef = useRef(onCount);
  useEffect(() => {
    countRef.current = onCount;
  });
  const answerCount = state?.answers.length;
  useEffect(() => {
    if (answerCount !== undefined) countRef.current?.(answerCount);
  }, [answerCount]);

  const set = <K extends keyof QARequest>(key: K, value: QARequest[K]) => setForm((f) => ({ ...f, [key]: value }));

  const ask = (req: QARequest, onDone?: () => void) => {
    setGenerating(true);
    setError(null);
    resumeApi
      .createQA(recordId, req)
      .then((a) =>
        setState((s) => {
          if (!s) return s;
          const replaced = req.replace_id && s.answers.some((x) => x.id === req.replace_id);
          return {
            ...s,
            answers: replaced ? s.answers.map((x) => (x.id === req.replace_id ? a : x)) : [...s.answers, a],
          };
        }),
      )
      .then(() => onDone?.())
      .catch((err) => setError(errorText(err, "Couldn't write the answer.")))
      .finally(() => setGenerating(false));
  };

  const generate = () =>
    ask(form, () => {
      setForm((f) => ({ ...EMPTY, limit: f.limit, unit: f.unit })); // portals often reuse one limit
      setSimilar([]);
    });

  const regenerate = (a: QAAnswer) =>
    ask({
      question: a.question, kind: a.kind, limit: a.limit, unit: a.unit,
      entry_ids: a.entry_ids, notes: a.notes, replace_id: a.id,
    });

  const replaceAnswer = (a: QAAnswer) =>
    setState((s) => (s ? { ...s, answers: s.answers.map((x) => (x.id === a.id ? a : x)) } : s));

  const removeAnswer = (id: string) =>
    resumeApi
      .deleteQA(recordId, id)
      .then(() => {
        setState((s) => (s ? { ...s, answers: s.answers.filter((x) => x.id !== id) } : s));
        toast("Answer deleted");
      })
      .catch((err) => setError(errorText(err, "Couldn't delete the answer.")));

  const answers = state ? [...state.answers].reverse() : []; // newest first
  const titleOf = (id: string) => state?.entries.find((e) => e.id === id)?.title.split(/\s+[—–-]\s+/)[0] ?? id;
  const onResume = state?.entries.filter((e) => e.on_resume) ?? [];
  const others = state?.entries.filter((e) => !e.on_resume) ?? [];

  return (
    <motion.section
      className="editor-pane match outreach qa"
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ duration: 0.32, ease: EASE }}
      aria-label="Application Q&A"
    >
      <div className="editor-pane__head">
        <h2 className="pane-title">Application Q&amp;A</h2>
        <span className="save-status muted">{answers.length ? `${answers.length} saved` : ""}</span>
        {onClose && (
          <button className="icon-btn icon-btn--sm" onClick={onClose} aria-label="Close Q&A">
            <CloseIcon size={14} />
          </button>
        )}
      </div>

      <div className="match__body">
        {loading && (
          <div className="match__loading" role="status">
            <span className="spinner-dot" /> Loading…
          </div>
        )}

        {error && (
          <div className="notice notice--error" role="alert">
            <AlertIcon />
            <div><p style={{ whiteSpace: "pre-line" }}>{error}</p></div>
          </div>
        )}

        {state && (
          <>
            <PanelIntro
              lead="Answers for the application portal's screening questions, from this job's résumé and your KB — it says so when a fact is missing."
              steps={["Paste the question", "Set a limit (optional)", "Copy the answer"]}
              meta="Free · Groq / Gemini · saved with this job"
            />

            <div className="workspace">
              <section className="workspace__compose outreach__section">
                <h3 className="outreach__h"><span>01 ·</span> Answer a question</h3>
                <label className="field">
                  <span className="field-label">Question from the portal</span>
                  <textarea
                    className="outreach__input qa__question"
                    value={form.question}
                    maxLength={2000}
                    onChange={(e) => set("question", e.target.value)}
                    placeholder="e.g. Describe a project where you used LLMs in production. What was the hardest part?"
                    autoFocus
                  />
                </label>

                {shownSimilar.length > 0 && (
                  <div className="qa__similar" role="status">
                    <p className="result-title">You answered something similar</p>
                    {shownSimilar.map((s) => (
                      <div key={`${s.record_id}-${s.answer.id}`} className="qa__similar-item">
                        <p className="qa__similar-q">{s.answer.question}</p>
                        <p className="help">
                          {s.record_id === recordId ? "This résumé" : s.resume_title} · {words(s.answer.answer)} words
                        </p>
                        <p className="qa__similar-a">{s.answer.answer}</p>
                        <button className="btn btn--ghost btn--sm" onClick={() => copy(`sim-${s.answer.id}`, s.answer.answer)}>
                          {copied === `sim-${s.answer.id}` ? <><CheckIcon size={13} /> Copied</> : "Copy this answer"}
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="field">
                  <span className="field-label" id="qa-kind-label">Type</span>
                  <div className="segmented" role="radiogroup" aria-labelledby="qa-kind-label">
                    {KINDS.map((k) => (
                      <button
                        key={k.kind}
                        role="radio"
                        aria-checked={form.kind === k.kind}
                        className={form.kind === k.kind ? "is-on" : ""}
                        onClick={() => set("kind", k.kind)}
                      >
                        {k.label}
                      </button>
                    ))}
                  </div>
                  <p className="help">{KINDS.find((k) => k.kind === form.kind)?.hint}</p>
                </div>

                <div className="outreach__grid">
                  <div className="field">
                    <span className="field-label" id="qa-limit-label">Limit <span className="field-label__opt">optional</span></span>
                    <div className="qa__limit" role="group" aria-labelledby="qa-limit-label">
                      <input
                        className="outreach__input"
                        type="number"
                        min={1}
                        max={10000}
                        value={form.limit ?? ""}
                        onChange={(e) => set("limit", e.target.value ? Math.max(1, Number(e.target.value)) : null)}
                        placeholder="None"
                        aria-label="Limit"
                      />
                      <select className="outreach__input" value={form.unit}
                        onChange={(e) => set("unit", e.target.value as QAUnit)} aria-label="Limit unit">
                        <option value="words">words</option>
                        <option value="characters">characters</option>
                      </select>
                    </div>
                  </div>
                  <label className="field">
                    <span className="field-label">About which project</span>
                    <select
                      className="outreach__input"
                      value={form.entry_ids[0] ?? ""}
                      onChange={(e) => set("entry_ids", e.target.value ? [e.target.value] : [])}
                    >
                      <option value="">Pick for me</option>
                      <optgroup label="On this résumé">
                        {onResume.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
                      </optgroup>
                      <optgroup label="Rest of your KB">
                        {others.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
                      </optgroup>
                    </select>
                  </label>
                </div>

                <label className="field">
                  <span className="field-label">Notes <span className="field-label__opt">optional</span></span>
                  <textarea
                    className="outreach__input outreach__notes"
                    value={form.notes}
                    maxLength={1000}
                    onChange={(e) => set("notes", e.target.value)}
                    placeholder="Facts the KB doesn't have, taken as true: notice period, why you like this company…"
                  />
                </label>

                <div className="actions">
                  <button className="btn btn--ink btn--lg" onClick={generate} disabled={generating || form.question.trim().length < 3}>
                    {generating ? <><span className="spinner-dot" /> Writing…</> : <><ChatIcon /> Answer question</>}
                  </button>
                  <span className="help">A few seconds. It appears under Answers.</span>
                </div>
              </section>

              <section className="workspace__results" aria-label="Answers">
                <h3 className="outreach__h"><span>02 ·</span> Answers {answers.length > 0 && <span>· {answers.length}</span>}</h3>
                {answers.length === 0 ? (
                  <div className="example">
                    <p className="example__note">Your answers appear here, newest first — with a word count against the limit, ready to copy.</p>
                    <div className="outreach__draft example__card" aria-hidden="true">
                      <div className="outreach__draft-head">
                        <span className="chip">Story</span>
                        <span className="result-title">Describe a project where you used LLMs in production.</span>
                      </div>
                      <div className="example__line" />
                      <div className="example__line" />
                      <div className="example__line" />
                      <div className="example__line example__line--short" />
                      <div className="outreach__draft-foot">
                        <span className="outreach__count">186 words · limit 200 words</span>
                        <span className="outreach__model" />
                        <span className="btn btn--ghost btn--sm">Copy</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  answers.map((a) => (
                    <AnswerCard
                      key={a.id}
                      recordId={recordId}
                      answer={a}
                      titleOf={titleOf}
                      busy={generating}
                      onSaved={replaceAnswer}
                      onRegenerate={() => regenerate(a)}
                      onDelete={() => removeAnswer(a.id)}
                    />
                  ))
                )}
              </section>
            </div>
          </>
        )}
      </div>
    </motion.section>
  );
}

function AnswerCard({ recordId, answer, titleOf, busy, onSaved, onRegenerate, onDelete }: {
  recordId: number;
  answer: QAAnswer;
  titleOf: (id: string) => string;
  busy: boolean;
  onSaved: (a: QAAnswer) => void;
  onRegenerate: () => void;
  onDelete: () => void;
}) {
  // A regenerated answer gets a new id, so its card remounts with the new text.
  const [text, setText] = useState(answer.answer);
  const [saveError, setSaveError] = useState(false);
  const { copied, copy } = useCopy();

  // Edits save when you leave the field — only if something changed.
  const save = () => {
    if (text === answer.answer) return;
    resumeApi
      .updateQA(recordId, answer.id, text)
      .then((a) => { setSaveError(false); onSaved(a); })
      .catch(() => setSaveError(true));
  };

  const size = answer.unit === "words" ? words(text) : text.length;
  const over = answer.limit != null && size > answer.limit;
  const near = answer.limit != null && !over && size > answer.limit * 0.95;

  return (
    <article className="outreach__draft">
      <div className="outreach__draft-head">
        <span className="chip">{KIND_LABEL[answer.kind]}</span>
        <span className="result-title qa__q" title={answer.question}>{answer.question}</span>
        <button className="icon-btn icon-btn--sm" onClick={onDelete} aria-label="Delete answer" title="Delete answer">
          <TrashIcon size={14} />
        </button>
      </div>

      {answer.not_in_kb && (
        <div className="notice notice--warn" role="status">
          <AlertIcon />
          <div><p>{answer.not_in_kb}</p></div>
        </div>
      )}

      <textarea
        className="outreach__input outreach__body"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={save}
        aria-label="Answer"
        rows={answer.kind === "short" ? 2 : 9}
        placeholder={answer.answer ? "" : "No answer — add the missing fact to your KB or Notes and regenerate, or type one here."}
      />

      <div className="outreach__draft-foot">
        <span className={`outreach__count ${over ? "is-over" : near ? "is-near" : ""}`}>
          {words(text)} words · {text.length} chars
          {answer.limit != null && ` · limit ${answer.limit} ${answer.unit}`}
        </span>
        {saveError && <span className="small outreach__count is-over">Couldn't save the edit</span>}
        <span className="muted small outreach__model">{answer.model}</span>
        <button className="btn btn--ghost btn--sm" onClick={onRegenerate} disabled={busy} title="Write it again">
          <RefreshIcon size={13} /> Regenerate
        </button>
        <button className="btn btn--ghost btn--sm" onClick={() => copy("answer", text)} disabled={!text}>
          {copied === "answer" ? <><CheckIcon size={13} /> Copied</> : "Copy"}
        </button>
      </div>

      {answer.used_ids.length > 0 && (
        <p className="muted small qa__sources">From your KB: {answer.used_ids.map(titleOf).join(" · ")}</p>
      )}
    </article>
  );
}
