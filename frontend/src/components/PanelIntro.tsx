// The strip at the top of Outreach and Q&A: what this is in one sentence, then how it works
// in three numbered steps — so the screen explains itself before you touch the form.
export function PanelIntro({ lead, steps, meta }: { lead: string; steps: [string, string, string]; meta: string }) {
  return (
    <div className="panel-intro">
      <p className="panel-intro__lead">{lead}</p>
      <ol className="panel-intro__steps">
        {steps.map((s, i) => (
          <li key={s}>
            <span className="mono panel-intro__n">{String(i + 1).padStart(2, "0")}</span>
            {s}
          </li>
        ))}
      </ol>
      <p className="panel-intro__meta mono">{meta}</p>
    </div>
  );
}
