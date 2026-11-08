/**
 * Construit un immeuble (étages empilés, retraits, corniches, toiture et équipements) dans un `StaticBatch`.
 * AFFICHAGE seulement ; la forme vient de `blocks.ts` (pur) ou des landmarks.
 */
import { BoxGeometry, ConeGeometry, CylinderGeometry, SphereGeometry } from "three";
import { mulberry32 } from "@/game/login/plan";
import { seedOf, type RoofKind, type TowerSpec } from "./blocks";
import { boxParts, mat4, StaticBatch } from "./geo";
import { TILE_U, TILE_V } from "./facade";
import type { Kit } from "./kit";
import { FLOOR } from "./scale";

const pyramid = (w: number, h: number, d: number) => {
  const g = new ConeGeometry(Math.SQRT1_2, h, 4);
  g.rotateY(Math.PI / 4);
  g.translate(0, h / 2, 0);
  g.scale(w, 1, d);
  return g;
};

const box = (w: number, h: number, d: number) => new BoxGeometry(w, h, d);
const cyl = (rt: number, rb: number, h: number, seg = 10) => new CylinderGeometry(rt, rb, h, seg);
const AWNING = ["#d9534f", "#2f7d6d", "#e0a526", "#3b6fb6"] as const;

/** Équipements et toiture au sommet du dernier retrait. */
export function addRoof(b: StaticBatch, kit: Kit, kind: RoofKind, x: number, y: number, z: number, w: number, d: number, roofColor: string, trim: string, rng: () => number): number {
  const roofMat = kit.lambert(roofColor);
  const trimMat = kit.lambert(trim);
  const steel = kit.lambert("#9aa3ad");
  let top = y;
  if (kind === "pyramid") {
    const h = Math.min(w, d) * 0.85;
    b.add(pyramid(w * 1.02, h, d * 1.02), kit.lambert(roofColor, { flat: true }), mat4(x, y, z));
    return y + h;
  }
  // acrotère
  const t = 0.07;
  b.add(box(w, 0.14, t), trimMat, mat4(x, y + 0.07, z - d / 2 + t / 2));
  b.add(box(w, 0.14, t), trimMat, mat4(x, y + 0.07, z + d / 2 - t / 2));
  b.add(box(t, 0.14, d), trimMat, mat4(x - w / 2 + t / 2, y + 0.07, z));
  b.add(box(t, 0.14, d), trimMat, mat4(x + w / 2 - t / 2, y + 0.07, z));
  top = y + 0.14;
  const units = 1 + Math.floor(rng() * 3);
  for (let i = 0; i < units; i++) {
    const ux = x + (rng() - 0.5) * (w - 0.7);
    const uz = z + (rng() - 0.5) * (d - 0.7);
    const uw = 0.28 + rng() * 0.22;
    b.add(box(uw, 0.2, 0.28), steel, mat4(ux, y + 0.1, uz, 1, 1, 1, rng() * 3));
    b.add(cyl(0.07, 0.07, 0.04, 8), kit.lambert("#4a5058"), mat4(ux, y + 0.22, uz));
  }
  if (kind === "tank") {
    const tx = x + w * 0.18;
    const tz = z - d * 0.15;
    for (const [lx, lz] of [[-0.14, -0.14], [0.14, -0.14], [-0.14, 0.14], [0.14, 0.14]] as const) b.add(cyl(0.02, 0.02, 0.36, 5), kit.lambert("#5b4a3a"), mat4(tx + lx, y + 0.18, tz + lz));
    b.add(cyl(0.22, 0.22, 0.4, 12), kit.lambert("#8a6a4a"), mat4(tx, y + 0.56, tz));
    b.add(new ConeGeometry(0.25, 0.2, 12), kit.lambert("#6a4f38"), mat4(tx, y + 0.86, tz));
    top = y + 1;
  } else if (kind === "spire" || kind === "crown") {
    const mast = kind === "crown" ? 1.7 : 1.3;
    b.add(cyl(0.02, 0.045, mast, 6), steel, mat4(x, y + mast / 2, z));
    b.add(new SphereGeometry(0.06, 8, 6), kit.basic("#ff5a4a"), mat4(x, y + mast + 0.04, z));
    if (kind === "crown") {
      b.add(box(w * 0.9, 0.16, d * 0.9), kit.basic("#ffd98a"), mat4(x, y + 0.2, z));
      b.add(box(w * 0.55, 0.3, d * 0.55), roofMat, mat4(x, y + 0.45, z));
    } else b.add(box(w * 0.5, 0.35, d * 0.5), roofMat, mat4(x, y + 0.31, z));
    top = y + mast;
  }
  return top;
}

/** Ajoute l'immeuble au lot ; renvoie sa hauteur totale (unités). */
export function addTower(b: StaticBatch, kit: Kit, spec: TowerSpec): number {
  const rng = mulberry32(seedOf(`${spec.x},${spec.z}`));
  const pal = spec.palette;
  const wall = kit.facade(pal);
  const roof = kit.lambert(pal.roof);
  const trim = kit.lambert(pal.trim);
  let y = 0;
  let last = spec.tiers[0]!;
  for (const t of spec.tiers) {
    const h = t.floors * FLOOR;
    const p = boxParts(t.w, h, t.d, { uTile: TILE_U, vTile: TILE_V, vOffset: y });
    b.add(p.sides, wall, mat4(spec.x, y, spec.z));
    b.add(p.top, roof, mat4(spec.x, y, spec.z));
    b.add(box(t.w + 0.1, 0.08, t.d + 0.1), trim, mat4(spec.x, y + h - 0.04, spec.z));
    y += h;
    last = t;
  }
  // soubassement + auvent de commerce
  b.add(box(spec.tiers[0]!.w + 0.06, 0.22, spec.tiers[0]!.d + 0.06), kit.lambert(pal.trim), mat4(spec.x, 0.11, spec.z));
  if (spec.awning) {
    const c = kit.lambert(AWNING[Math.floor(rng() * AWNING.length)]!);
    const t0 = spec.tiers[0]!;
    b.add(box(t0.w * 0.7, 0.06, 0.34), c, mat4(spec.x, 0.62, spec.z + t0.d / 2 + 0.12));
    b.add(box(0.34, 0.06, t0.d * 0.5), c, mat4(spec.x + t0.w / 2 + 0.12, 0.62, spec.z));
  }
  return addRoof(b, kit, spec.roof, spec.x, y, spec.z, last.w, last.d, pal.roof, pal.trim, rng);
}
