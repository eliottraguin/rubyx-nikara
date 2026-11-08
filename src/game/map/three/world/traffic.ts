/**
 * Circulation et piétons de la ville (pur : aucun import three, aucun état de jeu). Les voitures roulent à droite sur
 * les lignes de rues de `data/map/city_v1.json` (ponts compris), tournent aux carrefours et se suivent sans se
 * traverser ; les piétons font le tour des trottoirs. Purement visuel.
 */
import type { MapLayout } from "../../layout";
import { LANE } from "./scale";

/** `axis` 0 : la ligne court le long de X (z = fixed) ; 1 : le long de Z (x = fixed). */
export interface Line {
  axis: 0 | 1;
  fixed: number;
  min: number;
  max: number;
  /** Carrefours : position le long de la ligne et indice de la ligne croisée. */
  junctions: { at: number; to: number }[];
}

export function buildLines(layout: Pick<MapLayout, "streets" | "bridges">): Line[] {
  const byKey = new Map<string, Line>();
  const touch = (axis: 0 | 1, fixed: number, a: number, b: number) => {
    const key = `${axis}:${fixed}`;
    const l = byKey.get(key) ?? { axis, fixed, min: Infinity, max: -Infinity, junctions: [] };
    l.min = Math.min(l.min, a, b);
    l.max = Math.max(l.max, a, b);
    byKey.set(key, l);
  };
  const nodes = new Map(layout.streets.nodes.map((n) => [n.id, n.grid]));
  for (const [ia, ib] of layout.streets.edges) {
    const a = nodes.get(ia);
    const b = nodes.get(ib);
    if (!a || !b) continue;
    if (a.y === b.y) touch(0, a.y, a.x, b.x);
    else if (a.x === b.x) touch(1, a.x, a.y, b.y);
  }
  for (const br of layout.bridges) {
    if (br.from.y === br.to.y) touch(0, br.from.y, br.from.x, br.to.x);
    else if (br.from.x === br.to.x) touch(1, br.from.x, br.from.y, br.to.y);
  }
  const lines = [...byKey.values()].sort((p, q) => p.axis - q.axis || p.fixed - q.fixed);
  lines.forEach((l, i) => {
    lines.forEach((o, j) => {
      if (o.axis === l.axis || i === j) return;
      if (o.fixed > l.min && o.fixed < l.max && l.fixed > o.min && l.fixed < o.max) l.junctions.push({ at: o.fixed, to: j });
    });
    l.junctions.sort((p, q) => p.at - q.at);
  });
  return lines;
}

export interface Car {
  line: number;
  t: number;
  dir: 1 | -1;
  speed: number;
  /** Famille de véhicule (0 berline, 1 taxi, 2 fourgon, 3 bus) : choisie par la vue. */
  kind: number;
  /** Position et cap lissés (ce que la vue dessine). */
  x: number;
  z: number;
  yaw: number;
}

const sign = (n: number): 1 | -1 => (n < 0 ? -1 : 1);

/** Cible (position de voie + cap) d'une voiture : conduite à droite. */
export function carTarget(c: Pick<Car, "line" | "t" | "dir">, lines: readonly Line[]): { x: number; z: number; yaw: number } {
  const l = lines[c.line]!;
  if (l.axis === 0) return { x: c.t, z: l.fixed + LANE * c.dir, yaw: c.dir > 0 ? 0 : Math.PI };
  return { x: l.fixed - LANE * c.dir, z: c.t, yaw: c.dir > 0 ? -Math.PI / 2 : Math.PI / 2 };
}

export function planCars(lines: readonly Line[], rng: () => number, count: number): Car[] {
  const cars: Car[] = [];
  for (let i = 0; i < count; i++) {
    const li = Math.floor(rng() * lines.length);
    const l = lines[li]!;
    const car: Car = { line: li, t: l.min + 1 + rng() * Math.max(1, l.max - l.min - 2), dir: rng() < 0.5 ? 1 : -1, speed: 2.2 + rng() * 1.6, kind: rng() < 0.12 ? 3 : rng() < 0.25 ? 2 : rng() < 0.45 ? 1 : 0, x: 0, z: 0, yaw: 0 };
    const tg = carTarget(car, lines);
    car.x = tg.x;
    car.z = tg.z;
    car.yaw = tg.yaw;
    cars.push(car);
  }
  return cars;
}

const wrapPi = (a: number): number => ((((a + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;

/** Fait avancer une voiture : freine derrière la précédente, tourne parfois aux carrefours, fait demi-tour en bout de ligne. */
export function stepCar(c: Car, cars: readonly Car[], lines: readonly Line[], dt: number, rng: () => number): void {
  const l = lines[c.line]!;
  let f = 1;
  for (const o of cars) {
    if (o === c || o.line !== c.line || o.dir !== c.dir) continue;
    const gap = (o.t - c.t) * c.dir;
    if (gap > 0 && gap < 1.9) f = Math.min(f, Math.max(0, (gap - 0.95) / 0.95));
  }
  const prev = c.t;
  c.t += c.dir * c.speed * f * dt;
  if (c.t >= l.max || c.t <= l.min) {
    c.t = Math.min(l.max, Math.max(l.min, c.t));
    c.dir = (c.dir * -1) as 1 | -1; // demi-tour au bout de la ligne
  } else {
    for (const j of l.junctions) {
      if (!((prev < j.at && c.t >= j.at) || (prev > j.at && c.t <= j.at))) continue;
      if (rng() < 0.3) {
        const to = lines[j.to]!;
        const fromFixed = l.fixed;
        c.line = j.to;
        c.t = fromFixed;
        c.dir = fromFixed <= to.min + 0.01 ? 1 : fromFixed >= to.max - 0.01 ? -1 : rng() < 0.5 ? 1 : -1;
      }
      break;
    }
  }
  const tg = carTarget(c, lines);
  const k = 1 - Math.exp(-9 * dt);
  c.x += (tg.x - c.x) * k;
  c.z += (tg.z - c.z) * k;
  c.yaw += wrapPi(tg.yaw - c.yaw) * (1 - Math.exp(-10 * dt));
  void sign;
}

export interface Walker {
  /** Centre de la boucle et demi-dimensions (unités). */
  cx: number;
  cz: number;
  hw: number;
  hd: number;
  s: number;
  dir: 1 | -1;
  speed: number;
  phase: number;
  shirt: number;
  skin: number;
}

/** Position le long d'un rectangle (périmètre `s`, sens horaire vu de dessus). */
export function rectPoint(w: Pick<Walker, "cx" | "cz" | "hw" | "hd">, s: number): { x: number; z: number; dx: number; dz: number } {
  const W = 2 * w.hw;
  const D = 2 * w.hd;
  const P = 2 * (W + D);
  const u = ((s % P) + P) % P;
  if (u < W) return { x: w.cx - w.hw + u, z: w.cz - w.hd, dx: 1, dz: 0 };
  if (u < W + D) return { x: w.cx + w.hw, z: w.cz - w.hd + (u - W), dx: 0, dz: 1 };
  if (u < 2 * W + D) return { x: w.cx + w.hw - (u - W - D), z: w.cz + w.hd, dx: -1, dz: 0 };
  return { x: w.cx - w.hw, z: w.cz + w.hd - (u - 2 * W - D), dx: 0, dz: -1 };
}

export const walkerLength = (w: Pick<Walker, "hw" | "hd">): number => 4 * (w.hw + w.hd);

/** Piétons sur le trottoir de chaque case de grille (+ le parc), nombre et phase tirés par la graine. */
export function planWalkers(layout: Pick<MapLayout, "gridRect" | "park">, rng: () => number, per = 2): Walker[] {
  const out: Walker[] = [];
  const mk = (cx: number, cz: number, hw: number, hd: number) => {
    const w: Walker = { cx, cz, hw, hd, s: 0, dir: rng() < 0.5 ? 1 : -1, speed: 0.45 + rng() * 0.5, phase: rng() * 6.28, shirt: Math.floor(rng() * 8), skin: Math.floor(rng() * 4) };
    w.s = rng() * walkerLength(w);
    out.push(w);
  };
  const g = layout.gridRect;
  void g;
  for (let x = -20; x <= 16; x += 6) {
    for (let y = -20; y <= 16; y += 6) {
      const inPark = x + 2 > layout.park.x && x + 2 < layout.park.x + layout.park.w && y + 2 > layout.park.y && y + 2 < layout.park.y + layout.park.h;
      if (inPark) continue;
      const n = rng() < 0.35 ? per + 1 : rng() < 0.6 ? per : 1;
      for (let i = 0; i < n; i++) mk(x + 2, y + 2, 1.78, 1.78);
    }
  }
  const p = layout.park;
  for (let i = 0; i < 7; i++) mk(p.x + p.w / 2, p.y + p.h / 2, p.w / 2 - 1.2 - (i % 3) * 1.3, p.h / 2 - 1.2 - (i % 3) * 0.9);
  return out;
}

export function stepWalker(w: Walker, dt: number): { x: number; z: number; yaw: number } {
  w.s += w.dir * w.speed * dt;
  const p = rectPoint(w, w.s);
  return { x: p.x, z: p.z, yaw: Math.atan2(-p.dz * w.dir, p.dx * w.dir) };
}
