/**
 * Données pures du décor Three.js (routes, tirets, arbres) calculées à partir de `LAYOUT` (streets.ts / city_v1.json).
 * 1 case de grille = 1 unité monde ; (x, y) de grille -> (x, z) Three. Aucun état de jeu, aucun import three.
 */
import { rng } from "../art";
import type { MapLayout } from "../layout";

export interface RoadSeg {
  cx: number;
  cz: number;
  len: number;
  /** Rotation autour de Y (rad) pour aligner l'axe X local sur le segment. */
  angle: number;
}

export interface TreeSpot {
  x: number;
  z: number;
  scale: number;
  variant: number;
}

const DASH_LEN = 0.5;
const DASH_GAP = 0.7;

const angleOf = (dx: number, dz: number) => -Math.atan2(dz, dx);

/** Un segment par arête du graphe de rues (arêtes vers un nœud inconnu ignorées). */
export function roadSegments(layout: Pick<MapLayout, "streets">): RoadSeg[] {
  const pos = new Map(layout.streets.nodes.map((n) => [n.id, n.grid]));
  const out: RoadSeg[] = [];
  for (const [a, b] of layout.streets.edges) {
    const pa = pos.get(a);
    const pb = pos.get(b);
    if (!pa || !pb) continue;
    const dx = pb.x - pa.x;
    const dz = pb.y - pa.y;
    const len = Math.hypot(dx, dz);
    if (len === 0) continue;
    out.push({ cx: (pa.x + pb.x) / 2, cz: (pa.y + pb.y) / 2, len, angle: angleOf(dx, dz) });
  }
  return out;
}

/** Tirets centraux répartis sur chaque segment (centrés, jamais hors du segment). */
export function dashSegments(segs: readonly RoadSeg[]): RoadSeg[] {
  const out: RoadSeg[] = [];
  for (const s of segs) {
    const n = Math.floor((s.len + DASH_GAP) / (DASH_LEN + DASH_GAP));
    if (n < 1) continue;
    const span = n * DASH_LEN + (n - 1) * DASH_GAP;
    const ux = Math.cos(-s.angle);
    const uz = Math.sin(-s.angle);
    for (let i = 0; i < n; i++) {
      const t = -span / 2 + DASH_LEN / 2 + i * (DASH_LEN + DASH_GAP);
      out.push({ cx: s.cx + ux * t, cz: s.cz + uz * t, len: DASH_LEN, angle: s.angle });
    }
  }
  return out;
}

/** Arbres du parc : même graine et mêmes règles que la version Phaser (hors étang, hors allées). */
export function treeSpots(park: MapLayout["park"]): TreeSpot[] {
  const rand = rng(park.seed);
  const out: TreeSpot[] = [];
  for (let tries = 0; out.length < park.trees && tries < park.trees * 6; tries++) {
    const x = park.x + 0.6 + rand() * (park.w - 1.2);
    const z = park.y + 0.6 + rand() * (park.h - 1.2);
    const dx = (x - park.pond.x) / (park.pond.rx + 0.6);
    const dz = (z - park.pond.y) / (park.pond.ry + 0.6);
    if (dx * dx + dz * dz < 1) continue;
    if (Math.abs(x - (park.x + park.w / 2)) < 0.8 || Math.abs(z - (park.y + park.h / 2)) < 0.8) continue;
    out.push({ x, z, variant: Math.floor(rand() * 3), scale: 0.9 + rand() * 0.5 });
  }
  return out;
}
