/**
 * Graphe de rues cosmétique et géométrie de polylignes (pur, sans Phaser ; docs/VILLE-ET-BATIMENT.md §5).
 * Les bots à pied, à vélo ou en skate suivent le plus court chemin dans ce graphe : un seul tracé sert l'animation
 * et son test. Aucun état de jeu ici.
 */
import type { Pt } from "./iso";

export interface StreetNode {
  id: string;
  world: Pt;
}

export interface StreetGraph {
  nodes: Map<string, StreetNode>;
  /** Voisins triés par identifiant : le plus court chemin est déterministe. */
  adj: Map<string, { to: string; w: number }[]>;
}

export const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y);

/** Construit le graphe non orienté ; une arête vers un nœud inconnu est ignorée. */
export function buildGraph(nodes: readonly StreetNode[], edges: readonly (readonly [string, string])[]): StreetGraph {
  const map = new Map(nodes.map((n) => [n.id, n]));
  const adj = new Map<string, { to: string; w: number }[]>(nodes.map((n) => [n.id, []]));
  for (const [a, b] of edges) {
    const na = map.get(a);
    const nb = map.get(b);
    if (!na || !nb || a === b) continue;
    const w = dist(na.world, nb.world);
    adj.get(a)!.push({ to: b, w });
    adj.get(b)!.push({ to: a, w });
  }
  for (const list of adj.values()) list.sort((x, y) => (x.to < y.to ? -1 : x.to > y.to ? 1 : 0));
  return { nodes: map, adj };
}

/** Plus court chemin (Dijkstra) en identifiants de nœuds, départ et arrivée compris ; null si injoignable. */
export function shortestPath(graph: StreetGraph, from: string, to: string): string[] | null {
  if (!graph.nodes.has(from) || !graph.nodes.has(to)) return null;
  if (from === to) return [from];
  const d = new Map<string, number>([[from, 0]]);
  const prev = new Map<string, string>();
  const done = new Set<string>();
  for (;;) {
    let cur: string | null = null;
    let best = Infinity;
    for (const [id, v] of d) {
      if (done.has(id)) continue;
      if (v < best || (v === best && cur !== null && id < cur)) {
        best = v;
        cur = id;
      }
    }
    if (cur === null) return null;
    if (cur === to) break;
    done.add(cur);
    for (const { to: nb, w } of graph.adj.get(cur) ?? []) {
      const nd = best + w;
      if (nd < (d.get(nb) ?? Infinity) - 1e-9) {
        d.set(nb, nd);
        prev.set(nb, cur);
      }
    }
  }
  const path = [to];
  while (path[0] !== from) path.unshift(prev.get(path[0]!)!);
  return path;
}

export function polylineLength(pts: readonly Pt[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += dist(pts[i - 1]!, pts[i]!);
  return len;
}

/** Point à la fraction `u` (0..1, abscisse curviligne) d'une polyligne. */
export function polylinePoint(pts: readonly Pt[], u: number): Pt {
  if (pts.length === 0) return { x: 0, y: 0 };
  if (pts.length === 1) return { ...pts[0]! };
  const total = polylineLength(pts);
  let target = Math.min(1, Math.max(0, u)) * total;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const seg = dist(a, b);
    if (target <= seg || i === pts.length - 1) {
      const k = seg === 0 ? 1 : Math.min(1, target / seg);
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
    }
    target -= seg;
  }
  return { ...pts[pts.length - 1]! };
}

/** Direction unitaire de la polyligne à la fraction `u` : sert à orienter le bot. */
export function polylineTangent(pts: readonly Pt[], u: number): Pt {
  if (pts.length < 2) return { x: 1, y: 0 };
  const total = polylineLength(pts);
  let target = Math.min(1, Math.max(0, u)) * total;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const seg = dist(a, b);
    if ((target <= seg || i === pts.length - 1) && seg > 0) return { x: (b.x - a.x) / seg, y: (b.y - a.y) / seg };
    target -= seg;
  }
  return { x: 1, y: 0 };
}
