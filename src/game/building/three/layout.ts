/**
 * Géométrie de la coupe d'immeuble (ADR 0003). Pur : ni React ni Three.js. Un étage = une dalle empilée,
 * dans l'ordre de `FLOORS` (toit en haut). Affichage seulement : aucune règle de déblocage ici.
 */
import { FLOORS, type FloorId } from "../floors";

export const FLOOR_HEIGHT = 1.6;
export const FLOOR_WIDTH = 9;
export const FLOOR_DEPTH = 6;

export interface FloorZone {
  id: FloorId;
  /** Altitude du bas de la dalle (le dernier étage de la liste est au sol). */
  y: number;
  color: string;
}

const COLORS: Record<FloorId, string> = {
  toit: "#9fb8d6",
  pub: "#e3a6c4",
  courrier: "#e8c46a",
  archives: "#a99bd0",
  accueil: "#8fc7a4",
};

export const BUILDING_HEIGHT = FLOORS.length * FLOOR_HEIGHT;

export const ZONES: readonly FloorZone[] = FLOORS.map((f, i) => ({
  id: f.id,
  y: (FLOORS.length - 1 - i) * FLOOR_HEIGHT,
  color: COLORS[f.id],
}));
