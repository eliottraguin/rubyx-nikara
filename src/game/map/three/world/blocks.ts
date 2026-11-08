/**
 * Plan déterministe des immeubles d'un bloc 4×4 (pur : aucun import three). Même graine => même ville.
 * Les `floors` du bloc (data) fixent le gabarit ; la graine ne fait que varier découpe, retraits et toitures.
 */
import { mulberry32 } from "@/game/login/plan";
import type { BlockLayout } from "../../layout";
import { BUILDABLE, CAMERA_DIR, PALETTES, type Palette } from "./scale";

export type RoofKind = "flat" | "tank" | "pyramid" | "spire" | "crown";

export interface Tier {
  w: number;
  d: number;
  floors: number;
}

export interface TowerSpec {
  /** Centre de l'immeuble (plan XZ, unités). */
  x: number;
  z: number;
  tiers: Tier[];
  roof: RoofKind;
  palette: Palette;
  /** Auvent de commerce au rez-de-chaussée (petits immeubles). */
  awning: boolean;
}

/** Nombre total d'étages d'un plan. */
export const totalFloors = (t: TowerSpec): number => t.tiers.reduce((n, x) => n + x.floors, 0);

export function seedOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Empile des retraits : plus l'immeuble est haut, plus il a de paliers. */
function stack(rng: () => number, w: number, d: number, floors: number): Tier[] {
  const f = Math.max(1, Math.round(floors));
  if (f < 8 || rng() < 0.25) return [{ w, d, floors: f }];
  if (f < 14) {
    const a = Math.max(3, Math.round(f * (0.6 + rng() * 0.1)));
    return [
      { w, d, floors: a },
      { w: w * 0.72, d: d * 0.72, floors: f - a },
    ];
  }
  const a = Math.round(f * 0.5);
  const b = Math.round(f * 0.3);
  return [
    { w, d, floors: a },
    { w: w * 0.78, d: d * 0.78, floors: b },
    { w: w * 0.52, d: d * 0.52, floors: Math.max(1, f - a - b) },
  ];
}

function roofFor(rng: () => number, floors: number, style: string): RoofKind {
  if (floors >= 14) return rng() < 0.5 ? "spire" : "crown";
  if (floors >= 8) return rng() < 0.45 ? "pyramid" : "flat";
  if (style === "brick" && rng() < 0.5) return "tank";
  return rng() < 0.2 ? "pyramid" : "flat";
}

/**
 * Facteur de hauteur d'un bloc : le siège doit rester visible. Les blocs voisins (surtout ceux qui sont entre le siège
 * et la caméra isométrique, côté +X +Z) sont plafonnés bas ; plus on s'éloigne, plus les gratte-ciel reprennent leur
 * hauteur de donnée. Purement cosmétique.
 */
export function heightScale(block: Pick<BlockLayout, "x" | "y" | "w" | "h" | "floors">, hq = { x: 0, y: 0 }): number {
  const dx = block.x + block.w / 2 - hq.x;
  const dz = block.y + block.h / 2 - hq.y;
  const d = Math.hypot(dx, dz);
  const front = dx * CAMERA_DIR.x + dz * CAMERA_DIR.z > -2;
  const cap = front ? 4 + Math.max(0, d - 8.6) * 0.42 : 5 + Math.max(0, d - 8.6) * 0.95;
  return Math.min(1, cap / Math.max(1, block.floors));
}

export function planBlock(block: BlockLayout, seed = 0, scale = 1): TowerSpec[] {
  const rng = mulberry32(seedOf(block.id) ^ seed);
  const cx = block.x + block.w / 2;
  const cz = block.y + block.h / 2;
  const pals = PALETTES[block.style];
  const pick = () => pals[Math.floor(rng() * pals.length)]!;
  const B = BUILDABLE;
  const f = Math.max(2, Math.round(block.floors * scale));
  // gabarit : grand immeuble seul, deux moitiés, ou quatre petits
  const layout: "one" | "two" | "four" = f >= 12 ? "one" : f >= 7 ? (rng() < 0.55 ? "one" : "two") : f >= 4 ? (rng() < 0.5 ? "two" : "four") : "four";
  const cells: { x: number; z: number; w: number; d: number; floors: number }[] = [];
  if (layout === "one") cells.push({ x: 0, z: 0, w: B * 0.92, d: B * 0.92, floors: f });
  else if (layout === "two") {
    const vertical = rng() < 0.5;
    const half = (B - 0.15) / 2;
    const [a, b] = [f, Math.max(2, Math.round(f * (0.55 + rng() * 0.35)))];
    if (vertical) cells.push({ x: -half / 2 - 0.075, z: 0, w: half, d: B, floors: a }, { x: half / 2 + 0.075, z: 0, w: half, d: B, floors: b });
    else cells.push({ x: 0, z: -half / 2 - 0.075, w: B, d: half, floors: a }, { x: 0, z: half / 2 + 0.075, w: B, d: half, floors: b });
  } else {
    const q = (B - 0.15) / 2;
    const o = q / 2 + 0.075;
    const hs = [f, Math.max(2, Math.round(f * (0.6 + rng() * 0.5))), Math.max(2, Math.round(f * (0.5 + rng() * 0.6))), Math.max(2, Math.round(f * (0.7 + rng() * 0.4)))];
    cells.push({ x: -o, z: -o, w: q, d: q, floors: hs[0]! }, { x: o, z: -o, w: q, d: q, floors: hs[1]! }, { x: -o, z: o, w: q, d: q, floors: hs[2]! }, { x: o, z: o, w: q, d: q, floors: hs[3]! });
  }
  return cells.map((c) => {
    const tiers = stack(rng, c.w, c.d, c.floors);
    const total = tiers.reduce((n, t) => n + t.floors, 0);
    return { x: cx + c.x, z: cz + c.z, tiers, roof: roofFor(rng, total, block.style), palette: pick(), awning: total <= 5 && rng() < 0.7 };
  });
}
