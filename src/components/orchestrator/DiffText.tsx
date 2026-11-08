import { diffWords } from "@/game/building/diff";

interface Props {
  before: string;
  after: string;
  label: string;
}

/** Diff lisible mot à mot : ajouts soulignés, suppressions barrées. Texte seul, jamais de HTML du modèle. */
export function DiffText({ before, after, label }: Props) {
  const tokens = diffWords(before, after);
  return (
    <p className="diff-text">
      <span className="sr-only">{label} : </span>
      {tokens.map((t, i) => {
        if (t.op === "same") return <span key={i}>{t.text}</span>;
        if (t.op === "add")
          return (
            <ins key={i} className="diff-add">
              {t.text}
            </ins>
          );
        return (
          <del key={i} className="diff-remove">
            {t.text}
          </del>
        );
      })}
    </p>
  );
}
