/**
 * Géométrie de la coupe d'immeuble (ADR 0003). Pur : ni React ni Three.js. Un étage = une pièce meublée empilée,
 * dans l'ordre de `FLOORS` (toit en haut). Affichage seulement : aucune règle de déblocage ici.
 */
import { FLOORS, type FloorId } from "../floors";

export const FLOOR_HEIGHT = 2.7;
export const FLOOR_WIDTH = 9;
export const FLOOR_DEPTH = 5.2;

export interface FloorZone {
  id: FloorId;
  /** Altitude du bas de la dalle (le dernier étage de la liste est au sol). */
  y: number;
  /** Couleur d'accent de l'étage (lueur de survol, étiquette). */
  color: string;
}

const COLORS: Record<FloorId, string> = {
  toit: "#4a90d9",
  pub: "#d9548f",
  courrier: "#e0a526",
  archives: "#7a62c9",
  accueil: "#2f9e6e",
};

export const BUILDING_HEIGHT = FLOORS.length * FLOOR_HEIGHT;

export const ZONES: readonly FloorZone[] = FLOORS.map((f, i) => ({
  id: f.id,
  y: (FLOORS.length - 1 - i) * FLOOR_HEIGHT,
  color: COLORS[f.id],
}));

/** Centre d'un étage (plan XZ = 0, 0 ; hauteur au milieu de la pièce) : cible de la caméra. */
export const floorCenterY = (id: FloorId): number => (ZONES.find((z) => z.id === id)?.y ?? 0) + FLOOR_HEIGHT / 2;
