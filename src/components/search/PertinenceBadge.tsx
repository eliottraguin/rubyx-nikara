import { PERTINENCE } from "@/content/recherche";
import type { Pertinence } from "@/lib/api/searches";

const TONE: Record<Pertinence, string> = { correspond: "ok", a_verifier: "warn", hors_cible: "bad" };

/** Étiquette de pertinence : couleur ET texte (jamais la couleur seule). */
export function PertinenceBadge({ value }: { value: Pertinence }) {
  const p = PERTINENCE[value];
  return (
    <span className={`pill pill-${TONE[value]}`} title={p.hint}>
      <span aria-hidden="true">{p.mark} </span>
      {p.label}
    </span>
  );
}
