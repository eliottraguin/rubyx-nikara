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

export interface DecorPiece {
  feature: string;
  /** Centre de la pièce, relatif au centre de la base de l'immeuble. */
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  /** `trim` = couleur de corniche ; `glass` = vitre ; sinon couleur fixe. */
  color: "trim" | "glass" | string;
  /** Pièce émissive (enseigne, couronne éclairée). */
  lit?: boolean;
}

/**
 * Détails visuels d'un niveau (champ `features` de building_v1.json) : auvent, plantes, terrasse, héliport, couronne…
 * Pur et déterministe ; les `features` viennent du niveau serveur via l'apparence, jamais d'un calcul de niveau ici.
 */
export function decorFor(features: readonly string[], plan: BuildingPlan): DecorPiece[] {
  const has = (f: string) => features.includes(f);
  const base = plan.tiers[0]!;
  const top = plan.tiers[plan.tiers.length - 1]!;
  const roofY = plan.height;
  const out: DecorPiece[] = [];
  const front = base.size / 2;
  if (has("awning")) out.push({ feature: "awning", x: 0, y: 0.45, z: front + 0.15, w: base.size * 0.6, h: 0.08, d: 0.35, color: "#c0392b" });
  if (has("plants")) {
    out.push({ feature: "plants", x: -base.size * 0.4, y: 0.15, z: front + 0.12, w: 0.25, h: 0.3, d: 0.25, color: "#3f8f4f" });
    out.push({ feature: "plants", x: base.size * 0.4, y: 0.15, z: front + 0.12, w: 0.25, h: 0.3, d: 0.25, color: "#3f8f4f" });
  }
  if (has("big_lobby")) out.push({ feature: "big_lobby", x: 0, y: 0.3, z: front + 0.02, w: base.size * 0.8, h: 0.6, d: 0.06, color: "glass" });
  if (has("rooftop_terrace") && plan.roof === "flat") out.push({ feature: "rooftop_terrace", x: 0, y: roofY + 0.07, z: 0, w: top.size * 0.7, h: 0.14, d: top.size * 0.7, color: "#8a6d4b" });
  if (has("heliport")) out.push({ feature: "heliport", x: 0, y: roofY + 0.04, z: 0, w: top.size * 0.6, h: 0.08, d: top.size * 0.6, color: "#4a4f57" });
  if (has("hanging_garden")) out.push({ feature: "hanging_garden", x: 0, y: base.height + 0.1, z: base.size / 2 + 0.1, w: base.size * 0.7, h: 0.2, d: 0.25, color: "#3f8f4f" });
  if (has("panoramic_elevator")) out.push({ feature: "panoramic_elevator", x: top.size / 2 + 0.08, y: roofY / 2, z: 0, w: 0.16, h: roofY, d: 0.3, color: "glass" });
  if (has("crown")) out.push({ feature: "crown", x: 0, y: roofY + 0.35, z: 0, w: top.size * 0.5, h: 0.7, d: top.size * 0.5, color: "#f2d45c", lit: true });
  if (has("grand_hall")) out.push({ feature: "grand_hall", x: 0, y: 0.45, z: front + 0.2, w: base.size * 0.9, h: 0.9, d: 0.4, color: "trim" });
  return out;
}
