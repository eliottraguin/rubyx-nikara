import type { Conversation } from "@/lib/api/conversations";

/** Statut de négociation affiché dans la liste (docs/CONTRACTS-V2.md §10, GR3-71). Pur : pas de dépendance React. */
export type NegotiationLabel = "a_traiter" | "en_negociation" | "accepte" | "abandonne";

export const NEGOTIATION_LABELS: Record<NegotiationLabel, string> = {
  a_traiter: "À traiter",
  en_negociation: "En négociation",
  accepte: "Accepté",
  abandonne: "Abandonné",
};

/**
 * Dérivé côté interface, jamais stocké : `acceptee`/`refusee` du serveur sont fiables, le reste distingue seulement
 * « pas encore répondu » (nouveau message du client) de « en négociation » (le joueur a déjà répondu).
 */
export function negotiationLabel(c: Pick<Conversation, "negotiation_status" | "tours_client" | "bac">): NegotiationLabel {
  if (c.negotiation_status === "acceptee") return "accepte";
  if (c.negotiation_status === "refusee") return "abandonne";
  return c.bac === "a_traiter" ? "a_traiter" : "en_negociation";
}

/** Vrai si le client a répondu sans que le joueur ait encore réagi : pastille « nouveau ». */
export function isNegotiationNew(c: Pick<Conversation, "negotiation_status" | "bac">): boolean {
  return c.negotiation_status !== "acceptee" && c.negotiation_status !== "refusee" && c.bac === "a_traiter";
}

export function initials(name: string | null): string {
  const n = (name ?? "?").trim();
  return n ? n[0]!.toUpperCase() : "?";
}
