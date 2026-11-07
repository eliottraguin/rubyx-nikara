import { SafeMarkdown } from "@/lib/markdown";
import { formatDate } from "@/lib/format";
import type { BriefVersion, CriterionView, DocumentView } from "@/lib/api";
import { Pill } from "./ui";

/** Brief versionné ; après un événement, la nouvelle version s'affiche avec son diff. */
export function BriefBlock({ brief }: { brief: BriefVersion }) {
  return (
    <div>
      <p>
        <Pill tone={brief.version > 1 ? "warn" : "neutral"}>Version {brief.version} du brief</Pill>
      </p>
      {brief.diff ? (
        <div className="card card-warn" role="status">
          <h3>Le brief a changé</h3>
          {brief.change_reason ? <p>{brief.change_reason}</p> : null}
          <ul className="diff" aria-label="Différences avec la version précédente">
            {brief.diff.map((l, i) => (
              <li key={i} className={`diff-${l.type}`}>
                <span className="diff-mark">{l.type === "add" ? "Ajouté : " : l.type === "remove" ? "Supprimé : " : "Inchangé : "}</span>
                {l.text.replace(/\*\*/g, "")}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <SafeMarkdown text={brief.text} />
    </div>
  );
}

export function CriteriaList({ criteria }: { criteria: CriterionView[] }) {
  return (
    <ul className="plain">
      {criteria.map((c) => (
        <li key={c.id}>
          <strong>{c.label}</strong> {c.essential ? <Pill tone="warn">Essentiel</Pill> : <Pill>Secondaire</Pill>}{" "}
          {c.weight > 0 ? <span className="muted">({c.weight} points)</span> : null}
          <span className="help block">{c.description}</span>
        </li>
      ))}
    </ul>
  );
}

export function DocumentList({ documents, children }: { documents: DocumentView[]; children?: (d: DocumentView) => React.ReactNode }) {
  if (documents.length === 0) return <p>Aucun document fourni avec cette commande.</p>;
  return (
    <ul className="plain">
      {documents.map((d) => (
        <li key={d.id} className="doc">
          <h3 className="h4">
            {d.title} <span className="muted">· daté du {formatDate(d.date)}</span>
          </h3>
          <SafeMarkdown text={d.content} />
          {children?.(d)}
        </li>
      ))}
    </ul>
  );
}
