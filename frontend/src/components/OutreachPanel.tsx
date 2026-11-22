import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { resumeApi } from "../api/resumeApi";
import type {
  OutreachDraft, OutreachKind, OutreachRelationship, OutreachRequest, OutreachState, ProfileParse,
} from "../types";
import { AlertIcon, CheckIcon, CloseIcon, MailIcon, TrashIcon } from "./Icons";
import { PanelIntro } from "./PanelIntro";
import { toast } from "../utils/toast";

interface Props {
  recordId: number;
  onClose?: () => void; // omitted when shown as a job step (steps don't close)
  onCount?: (n: number) => void; // drafts saved (the step tab shows "Outreach · 2")
}

const EASE = [0.22, 1, 0.36, 1] as const;

const KINDS: { kind: OutreachKind; label: string; verb: string }[] = [
  { kind: "email", label: "Email", verb: "Write email" },
  { kind: "connection_note", label: "Connection note", verb: "Write connection note" },
  { kind: "linkedin_message", label: "Message / InMail", verb: "Write message" },
  { kind: "referral_ask", label: "Referral ask", verb: "Write referral ask" },
];
const KIND_LABEL = Object.fromEntries(KINDS.map((k) => [k.kind, k.label])) as Record<OutreachKind, string>;

const RELATIONSHIPS: { value: OutreachRelationship; label: string }[] = [
  { value: "recruiter", label: "Recruiter" },
  { value: "hiring_manager", label: "Hiring manager" },
  { value: "engineer", label: "Engineer on the team" },
  { value: "alum", label: "Alum (same school)" },
  { value: "other", label: "Other" },
];

// LinkedIn connection notes: 300 characters with Premium, 200 on a free account.
const NOTE_PREMIUM = 300;
const NOTE_FREE = 200;

function errorText(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? fallback;
}

export function OutreachPanel({ recordId, onClose, onCount }: Props) {
  const [state, setState] = useState<OutreachState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [form, setForm] = useState<OutreachRequest>({
    kind: "email",
    recipient_name: "",
    recipient_role: "",
    relationship: "recruiter",
    position: "",
    notes: "",
  });
  // Two ways to fill the recipient: type it, or paste their LinkedIn profile and let the AI read it.
  const [fillMode, setFillMode] = useState<"type" | "paste">("type");
  const [pasted, setPasted] = useState("");
  const [parsing, setParsing] = useState(false);
  const [filled, setFilled] = useState<ProfileParse | null>(null);

  // Guide + saved drafts. Instant: the guide is built from the résumé title, no AI.
  useEffect(() => {
    resumeApi
      .outreach(recordId)
      .then((s) => {
        setState(s);
        setForm((f) => ({ ...f, position: f.position || s.guide.role }));
      })
      .catch((err) => setError(errorText(err, "Couldn't load outreach.")))
      .finally(() => setLoading(false));
  }, [recordId]);

  // Tell the job page how many drafts there are, whenever that changes.
  const countRef = useRef(onCount);
  useEffect(() => {
    countRef.current = onCount;
  });
  const draftCount = state?.drafts.length;
  useEffect(() => {
    if (draftCount !== undefined) countRef.current?.(draftCount);
  }, [draftCount]);

  const set = <K extends keyof OutreachRequest>(key: K, value: OutreachRequest[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const generate = () => {
    setGenerating(true);
    setError(null);
    resumeApi
      .createOutreach(recordId, form)
      .then((d) => setState((s) => (s ? { ...s, drafts: [...s.drafts, d] } : s)))
      .catch((err) => setError(errorText(err, "Couldn't write the message.")))
      .finally(() => setGenerating(false));
  };

  const fillFromProfile = () => {
    setParsing(true);
    setError(null);
    resumeApi
      .parseProfile(recordId, pasted)
      .then((p) => {
        setForm((f) => ({
          ...f,
          recipient_name: p.recipient_name,
          recipient_role: p.recipient_role,
          relationship: p.relationship,
          // Keep anything already typed in Notes; the hooks go underneath.
          notes: [f.notes.trim(), p.notes].filter(Boolean).join("\n").slice(0, 1000),
        }));
        setFilled(p);
        setPasted(""); // don't keep someone's profile around once it's been read
        setFillMode("type"); // back to the normal form, every field editable
      })
      .catch((err) => setError(errorText(err, "Couldn't read the profile.")))
      .finally(() => setParsing(false));
  };

  const replaceDraft = (d: OutreachDraft) =>
    setState((s) => (s ? { ...s, drafts: s.drafts.map((x) => (x.id === d.id ? d : x)) } : s));

  const removeDraft = (id: string) =>
    resumeApi
      .deleteOutreach(recordId, id)
      .then(() => {
        setState((s) => (s ? { ...s, drafts: s.drafts.filter((x) => x.id !== id) } : s));
        toast("Draft deleted");
      })
      .catch((err) => setError(errorText(err, "Couldn't delete the draft.")));

  const drafts = state ? [...state.drafts].reverse() : []; // newest first

  return (
    <motion.section
      className="editor-pane match outreach"
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ duration: 0.32, ease: EASE }}
      aria-label="Outreach"
    >
      <div className="editor-pane__head">
        <h2 className="pane-title">Outreach</h2>
        <span className="save-status muted">{state?.guide.company ?? ""}</span>
        {onClose && (
          <button className="icon-btn icon-btn--sm" onClick={onClose} aria-label="Close outreach">
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
            <div><p>{error}</p></div>
          </div>
        )}

        {state && (
          <>
            <PanelIntro
              lead={`Reach a real person at ${state.guide.company} — a short, specific message written from this résumé.`}
              steps={["Find the person", "Write the message", "Copy & send"]}
              meta="Free · Groq / Gemini · saved with this job"
            />

            <div className="workspace">
              <div className="workspace__compose">
                <section className="outreach__section">
                  <h3 className="outreach__h"><span>01 ·</span> Who to contact</h3>
                  <p className="help">Searches for {state.guide.company}, opened in LinkedIn or Google. You pick the person.</p>
                  <ul className="contact-grid">
                    {state.guide.links.map((l) => (
                      <li key={l.url}>
                        <a className="contact-card" href={l.url} target="_blank" rel="noopener noreferrer">
                          <span className="contact-card__title">{l.label} <span aria-hidden="true">↗</span></span>
                          <span className="help">{l.hint}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                  <details className="tips">
                    <summary>Tips that get replies</summary>
                    <ul>{state.guide.tips.map((t) => <li key={t}>{t}</li>)}</ul>
                  </details>
                </section>

                <section className="outreach__section">
                  <h3 className="outreach__h"><span>02 ·</span> Write a message</h3>
                  <div className="field">
                    <span className="field-label" id="kind-label">Type</span>
                    <div className="segmented" role="radiogroup" aria-labelledby="kind-label">
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
                  </div>
                  <div className="field">
                    <span className="field-label" id="fill-label">Recipient</span>
                    <div className="segmented" role="radiogroup" aria-labelledby="fill-label">
                      {(["type", "paste"] as const).map((m) => (
                        <button
                          key={m}
                          role="radio"
                          aria-checked={fillMode === m}
                          className={fillMode === m ? "is-on" : ""}
                          onClick={() => setFillMode(m)}
                        >
                          {m === "type" ? "Type it" : "Paste a LinkedIn profile"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {fillMode === "paste" ? (
                    <div className="outreach__paste">
                      <textarea
                        className="outreach__input outreach__paste-box"
                        value={pasted}
                        maxLength={100000}
                        onChange={(e) => setPasted(e.target.value)}
                        placeholder="Open their LinkedIn profile in your browser, press ⌘A then ⌘C, and paste it here."
                        aria-label="Pasted LinkedIn profile"
                        autoFocus
                      />
                      <div className="actions">
                        <button className="btn btn--ink" onClick={fillFromProfile} disabled={parsing || pasted.trim().length < 20}>
                          {parsing ? <><span className="spinner-dot" /> Reading…</> : "Fill from profile"}
                        </button>
                        <span className="help">Free. The paste is read once and not saved — only a draft you write is.</span>
                      </div>
                    </div>
                  ) : (
                    <>
                      {filled && (
                        <div className={`notice ${filled.warning ? "notice--warn" : "outreach__filled"}`} role="status">
                          {filled.warning ? <AlertIcon /> : <CheckIcon />}
                          <div>
                            <p>Filled from the profile — check before writing.</p>
                            {filled.warning && <p>{filled.warning}</p>}
                          </div>
                        </div>
                      )}
                      <div className="outreach__grid">
                        <label className="field">
                          <span className="field-label">Their name</span>
                          <input className="outreach__input" value={form.recipient_name}
                            onChange={(e) => set("recipient_name", e.target.value)} placeholder="Priya Sharma" maxLength={100} />
                        </label>
                        <label className="field">
                          <span className="field-label">Their role</span>
                          <input className="outreach__input" value={form.recipient_role}
                            onChange={(e) => set("recipient_role", e.target.value)} placeholder="Engineering Manager" maxLength={150} />
                        </label>
                        <label className="field">
                          <span className="field-label">They are a…</span>
                          <select className="outreach__input" value={form.relationship}
                            onChange={(e) => set("relationship", e.target.value as OutreachRelationship)}>
                            {RELATIONSHIPS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                          </select>
                        </label>
                        <label className="field">
                          <span className="field-label">Position</span>
                          <input className="outreach__input" value={form.position}
                            onChange={(e) => set("position", e.target.value)} maxLength={150} />
                        </label>
                      </div>
                      <label className="field">
                        <span className="field-label">Notes <span className="field-label__opt">optional</span></span>
                        <textarea className="outreach__input outreach__notes" value={form.notes} maxLength={1000}
                          onChange={(e) => set("notes", e.target.value)}
                          placeholder="Anything true that helps: a talk of theirs you saw, a mutual contact, the job link…" />
                      </label>
                      <div className="actions">
                        <button className="btn btn--ink btn--lg" onClick={generate} disabled={generating}>
                          {generating ? <><span className="spinner-dot" /> Writing…</> : <><MailIcon /> {KINDS.find((k) => k.kind === form.kind)?.verb}</>}
                        </button>
                        <span className="help">A few seconds. It appears under Drafts.</span>
                      </div>
                    </>
                  )}
                </section>
              </div>

              <section className="workspace__results" aria-label="Drafts">
                <h3 className="outreach__h"><span>03 ·</span> Drafts {drafts.length > 0 && <span>· {drafts.length}</span>}</h3>
                {drafts.length === 0 ? (
                  <div className="example" aria-hidden="false">
                    <p className="example__note">Your drafts appear here, newest first — edit them in place, then copy.</p>
                    <div className="outreach__draft example__card" aria-hidden="true">
                      <div className="outreach__draft-head">
                        <span className="chip">Email</span>
                        <span className="result-title">Priya Sharma, Engineering Manager</span>
                      </div>
                      <div className="example__line example__line--subject">Backend Engineer — FastAPI + Postgres work you might find relevant</div>
                      <div className="example__line" />
                      <div className="example__line" />
                      <div className="example__line example__line--short" />
                      <div className="outreach__draft-foot">
                        <span className="outreach__count">612 chars</span>
                        <span className="outreach__model" />
                        <span className="btn btn--ghost btn--sm">Copy message</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  drafts.map((d) => (
                    <DraftCard key={d.id} recordId={recordId} draft={d} onSaved={replaceDraft} onDelete={() => removeDraft(d.id)} />
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

function DraftCard({ recordId, draft, onSaved, onDelete }: {
  recordId: number;
  draft: OutreachDraft;
  onSaved: (d: OutreachDraft) => void;
  onDelete: () => void;
}) {
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const [copied, setCopied] = useState<"subject" | "body" | null>(null);
  const [saveError, setSaveError] = useState(false);
  const isNote = draft.kind === "connection_note";

  // Edits save when you leave the field — only if something changed.
  const save = () => {
    if (subject === draft.subject && body === draft.body) return;
    resumeApi
      .updateOutreach(recordId, draft.id, { subject, body })
      .then((d) => { setSaveError(false); onSaved(d); })
      .catch(() => setSaveError(true));
  };

  const copy = (what: "subject" | "body") => {
    navigator.clipboard.writeText(what === "subject" ? subject : body).then(() => {
      setCopied(what);
      toast(what === "subject" ? "Subject copied" : "Message copied");
      setTimeout(() => setCopied(null), 1500);
    });
  };

  const to = [draft.recipient_name, draft.recipient_role].filter(Boolean).join(", ") || "No name given";
  const len = body.length;
  const lenClass = len > NOTE_PREMIUM ? "is-over" : len > NOTE_FREE ? "is-near" : "";

  return (
    <article className="outreach__draft">
      <div className="outreach__draft-head">
        <span className="chip">{KIND_LABEL[draft.kind]}</span>
        <span className="result-title">{to}</span>
        <button className="icon-btn icon-btn--sm" onClick={onDelete} aria-label="Delete draft" title="Delete draft">
          <TrashIcon size={14} />
        </button>
      </div>
      {!isNote && (
        <div className="outreach__subject">
          <input className="outreach__input" value={subject} onChange={(e) => setSubject(e.target.value)}
            onBlur={save} aria-label="Subject" />
          <button className="btn btn--ghost btn--sm" onClick={() => copy("subject")}>
            {copied === "subject" ? <><CheckIcon size={13} /> Copied</> : "Copy"}
          </button>
        </div>
      )}
      <textarea className="outreach__input outreach__body" value={body} onChange={(e) => setBody(e.target.value)}
        onBlur={save} aria-label="Message" rows={isNote ? 4 : 10} />
      <div className="outreach__draft-foot">
        {isNote ? (
          <span className={`outreach__count ${lenClass}`}>
            {len}/{NOTE_PREMIUM} · free accounts {NOTE_FREE}
          </span>
        ) : (
          <span className="outreach__count">{body.trim() ? body.trim().split(/\s+/).length : 0} words · {len} chars</span>
        )}
        {saveError && <span className="small outreach__count is-over">Couldn't save the edit</span>}
        <span className="muted small outreach__model">{draft.model}</span>
        <button className="btn btn--ghost btn--sm" onClick={() => copy("body")}>
          {copied === "body" ? <><CheckIcon size={13} /> Copied</> : "Copy message"}
        </button>
      </div>
      {draft.warning && len > NOTE_PREMIUM && <p className="small outreach__count is-over">{draft.warning}</p>}
    </article>
  );
}
