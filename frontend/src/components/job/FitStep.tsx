import type { FitCheck } from "../../types";
import { FitCard } from "../FitCard";
import { CheckIcon, SparkIcon } from "../Icons";

const MATCH_LABEL = { strong: "Strong", weak: "Weak", missing: "Missing" } as const;

interface Props {
  fit: FitCheck | null | undefined;
  hasResume: boolean;
  generating: boolean;
  checking: boolean;
  onCheck: () => void;
  onGenerate: () => void;
  onOpenResume: () => void;
}

// The fit check, answer first: the verdict hero, then every requirement it found as a table.
export function FitStep({ fit, hasResume, generating, checking, onCheck, onGenerate, onOpenResume }: Props) {
  if (!fit) {
    return (
      <div className="empty">
        <p className="eyebrow">No fit check yet</p>
        <h2 className="heading">Is this one worth it?</h2>
        <p className="muted">A free check reads the job against your knowledge base in a few seconds.</p>
        <button className="btn btn--ink btn--lg" onClick={onCheck} disabled={checking}>
          {checking ? <span className="spinner-dot" /> : <CheckIcon size={15} />} {checking ? "Checking…" : "Check fit"}
        </button>
      </div>
    );
  }

  const musts = fit.requirements.filter((r) => r.importance === "must-have");
  const nices = fit.requirements.filter((r) => r.importance !== "must-have");

  return (
    <div className="fit-step">
      <FitCard fit={fit} />

      <div className="next-action">
        {hasResume ? (
          <button className="btn btn--ink btn--lg" onClick={onOpenResume}>Open the résumé</button>
        ) : (
          <button className="btn btn--ink btn--lg" onClick={onGenerate} disabled={generating}>
            <SparkIcon /> {fit.verdict === "skip" ? "Generate anyway" : "Generate résumé"}
          </button>
        )}
        <button className="btn btn--ghost btn--lg" onClick={onCheck} disabled={checking}>
          {checking ? <span className="spinner-dot" /> : null} {checking ? "Checking…" : "Re-check"}
        </button>
      </div>

      {fit.requirements.length > 0 && (
        <section className="req">
          <h3 className="eyebrow">Requirements · {fit.requirements.length}</h3>
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Skill</th>
                <th scope="col">Importance</th>
                <th scope="col">Match</th>
                <th scope="col">Evidence in your KB</th>
              </tr>
            </thead>
            <tbody>
              {[...musts, ...nices].map((r, i) => (
                <tr key={`${r.skill}-${i}`}>
                  <td className="table__strong">{r.skill}</td>
                  <td className="mono small">{r.importance === "must-have" ? "Must-have" : "Nice-to-have"}</td>
                  <td>
                    <span className={`match-tag match-tag--${r.status}`}>
                      <span className="dot" aria-hidden="true" />
                      {MATCH_LABEL[r.status]}
                    </span>
                  </td>
                  <td className="mono table__evidence">{r.evidence.length ? r.evidence.join(" · ") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
