/**
 * Étages de l'immeuble du joueur (docs/VILLE-ET-BATIMENT.md §7, §8). Pur : ni React ni Phaser.
 * L'ordre est celui de la coupe, du haut vers le bas.
 */
export type FloorId = "toit" | "pub" | "courrier" | "archives" | "accueil";

export interface Floor {
  id: FloorId;
  /** Paramètre d'URL `?etage=`. */
  slug: string;
  label: string;
  /** Section du produit à laquelle l'étage appartient. */
  section: "Prospection" | "Clients" | "Pub" | "Immeuble";
  summary: string;
}

export const FLOORS: readonly Floor[] = [
  { id: "toit", slug: "toit", label: "Toit", section: "Immeuble", summary: "Niveau de l'immeuble et total gagné." },
  { id: "pub", slug: "pub", label: "Studio pub", section: "Pub", summary: "Contenus de pub prêts à publier, par l'agent publicitaire." },
  { id: "courrier", slug: "courrier", label: "Salle du courrier", section: "Clients", summary: "Conversations avec vos prospects, gérées par vos agents." },
  { id: "archives", slug: "archives", label: "Archives", section: "Prospection", summary: "Votre carnet de prospection." },
  { id: "accueil", slug: "accueil", label: "Accueil et garage", section: "Immeuble", summary: "Vos agents et le coffre." },
];

export function floorFromSlug(slug: string | null | undefined): Floor | null {
  return FLOORS.find((f) => f.slug === slug) ?? null;
}

/** Déplace la sélection d'un cran (haut = -1, bas = +1) sans boucler. */
export function stepFloor(index: number, delta: -1 | 1): number {
  return Math.min(FLOORS.length - 1, Math.max(0, index + delta));
}

export const buildingHref = (id?: FloorId): string => {
  const f = FLOORS.find((x) => x.id === id);
  return f ? `/immeuble?etage=${f.slug}` : "/immeuble";
};
