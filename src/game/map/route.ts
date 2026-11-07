/**
 * Géométrie des routes base -> planète (pur, sans Phaser). Une seule définition sert le tracé des routes en pointillés
 * ET le déplacement des navettes : une navette suit toujours la route dessinée.
 */
import type { Pt } from "./iso";

/** Point de départ des routes : devant le hangar de la base (pixels monde). */
export const BASE_ANCHOR: Pt = { x: 0, y: 20 };

/** Point de contrôle de la courbe de Bézier quadratique de la route vers `end`. */
export function routeControl(end: Pt, start: Pt = BASE_ANCHOR): Pt {
  return { x: (start.x + end.x) / 2, y: Math.min(start.y, end.y) - 70 };
}

/** Position sur la route : t = 0 à la base, t = 1 au centre de la planète. */
export function routePoint(end: Pt, t: number, start: Pt = BASE_ANCHOR): Pt {
  const c = routeControl(end, start);
  const u = Math.min(1, Math.max(0, t));
  const a = (1 - u) * (1 - u);
  const b = 2 * (1 - u) * u;
  const d = u * u;
  return { x: a * start.x + b * c.x + d * end.x, y: a * start.y + b * c.y + d * end.y };
}

/** Direction (unitaire) de la route en t : sert à orienter la navette. */
export function routeTangent(end: Pt, t: number, start: Pt = BASE_ANCHOR): Pt {
  const c = routeControl(end, start);
  const u = Math.min(1, Math.max(0, t));
  const dx = 2 * (1 - u) * (c.x - start.x) + 2 * u * (end.x - c.x);
  const dy = 2 * (1 - u) * (c.y - start.y) + 2 * u * (end.y - c.y);
  const n = Math.hypot(dx, dy) || 1;
  return { x: dx / n, y: dy / n };
}

/** Longueur approchée de la route (échantillonnage). */
export function routeLength(end: Pt, start: Pt = BASE_ANCHOR, steps = 48): number {
  let len = 0;
  let prev = routePoint(end, 0, start);
  for (let i = 1; i <= steps; i++) {
    const p = routePoint(end, i / steps, start);
    len += Math.hypot(p.x - prev.x, p.y - prev.y);
    prev = p;
  }
  return len;
}

/**
 * Paramètre t où la navette se pose : à `standoff` × rayon du centre de la planète, sur la route.
 * (Elle atterrit devant la planète, pas à son centre.)
 */
export function landingT(end: Pt, radius: number, standoff = 1.35, start: Pt = BASE_ANCHOR): number {
  const target = radius * standoff;
  let lo = 0;
  let hi = 1;
  // La distance au centre décroît le long de la route : dichotomie sur le dernier franchissement du seuil.
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    const p = routePoint(end, mid, start);
    if (Math.hypot(p.x - end.x, p.y - end.y) > target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
