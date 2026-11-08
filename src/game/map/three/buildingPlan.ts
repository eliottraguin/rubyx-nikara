/**
 * Plan procédural d'un immeuble (données pures, sans Three.js ; ADR 0002).
 * AFFICHAGE seulement : le nombre d'étages vient du viewmodel (niveau lu côté serveur pour l'immeuble du joueur,
 * `floors` du layout pour les lieux). Même graine + mêmes entrées => même immeuble (mulberry32).
 */
import { mulberry32 } from "@/game/login/plan";

/** Hauteur d'un étage en unités de scène. */
export const FLOOR_H = 0.6;
/** Au plus 3 volumes empilés : lisible de loin, peu de draw calls. */
const MAX_TIERS = 3;
/** Un retrait de volume n'a lieu qu'à partir de ce nombre d'étages. */
const TIER_MIN_FLOORS = 5;

export type RoofKind = "flat" | "pyramid";

export interface TierPlan {
  /** Côté (largeur = profondeur) du volume. */
  size: number;
  floors: number;
  /** Altitude de la base du volume. */
  y: number;
  height: number;
}

export interface BuildingPlan {
  tiers: TierPlan[];
  roof: RoofKind;
  /** Hauteur totale du corps (sans toit). */
  height: number;
  /** Hauteur du toit pyramide (0 si toit plat). */
  roofHeight: number;
  /** Fenêtres par face et par étage : sert à la répétition de la texture de façade. */
  baysPerSide: number;
}

export interface PlanInput {
  seed: number;
  /** Côté de l'emprise au sol. */
  size: number;
  floors: number;
  /** Force un toit (sinon tiré de la graine : pyramide pour les petits immeubles, plat pour les tours). */
  roof?: RoofKind;
}

/** Graine stable d'après un identifiant (FNV-1a) : l'immeuble d'un lieu ne change pas d'un rendu à l'autre. */
export function seedFromId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function planBuilding({ seed, size, floors, roof }: PlanInput): BuildingPlan {
  const rand = mulberry32(seed);
  const total = Number.isFinite(floors) ? Math.max(1, Math.floor(floors)) : 1;
  const side = Number.isFinite(size) && size > 0 ? size : 1;
  const wantTiers = total >= TIER_MIN_FLOORS ? Math.min(MAX_TIERS, 1 + Math.floor(total / 6) + (rand() < 0.4 ? 1 : 0)) : 1;
  const tiers: TierPlan[] = [];
  let remaining = total;
  let y = 0;
  let s = side;
  for (let i = 0; i < wantTiers; i++) {
    const last = i === wantTiers - 1;
    // le socle porte la moitié des étages, les volumes suivants se partagent le reste.
    const f = last ? remaining : Math.max(1, Math.round(remaining * (i === 0 ? 0.5 : 0.6)));
    const height = f * FLOOR_H;
    tiers.push({ size: s, floors: f, y, height });
    y += height;
    remaining -= f;
    s *= 0.78;
  }
  const kind: RoofKind = roof ?? (total <= 6 && rand() < 0.7 ? "pyramid" : "flat");
  const top = tiers[tiers.length - 1]!;
  return {
    tiers,
    roof: kind,
    height: y,
    roofHeight: kind === "pyramid" ? Math.max(0.6, top.size * 0.45) : 0,
    baysPerSide: Math.max(1, Math.round(side / 0.9)),
  };
}
