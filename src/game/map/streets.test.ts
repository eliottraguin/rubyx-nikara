import { describe, expect, it } from "vitest";
import { buildGraph, dist, polylineLength, polylinePoint, polylineTangent, shortestPath } from "./streets";

// Grille 3x3 de côté 10 ; le nœud « m » (centre) est coupé pour forcer un détour.
const nodes = [
  { id: "a1", world: { x: 0, y: 0 } },
  { id: "b1", world: { x: 10, y: 0 } },
  { id: "c1", world: { x: 20, y: 0 } },
  { id: "a2", world: { x: 0, y: 10 } },
  { id: "c2", world: { x: 20, y: 10 } },
  { id: "a3", world: { x: 0, y: 20 } },
  { id: "b3", world: { x: 10, y: 20 } },
  { id: "c3", world: { x: 20, y: 20 } },
];
const edges: [string, string][] = [["a1", "b1"], ["b1", "c1"], ["a1", "a2"], ["a2", "a3"], ["a3", "b3"], ["b3", "c3"], ["c1", "c2"], ["c2", "c3"]];

describe("graphe de rues", () => {
  const g = buildGraph(nodes, edges);

  it("trouve le plus court chemin, départ et arrivée compris", () => {
    expect(shortestPath(g, "a1", "c1")).toEqual(["a1", "b1", "c1"]);
    expect(shortestPath(g, "a1", "a1")).toEqual(["a1"]);
    // a1 -> c3 : deux chemins de longueur 40 ; le choix est déterministe (même résultat à chaque appel).
    const p = shortestPath(g, "a1", "c3")!;
    expect(p[0]).toBe("a1");
    expect(p.at(-1)).toBe("c3");
    expect(shortestPath(g, "a1", "c3")).toEqual(p);
    expect(polylineLength(p.map((id) => g.nodes.get(id)!.world))).toBeCloseTo(40, 6);
  });

  it("renvoie null pour un nœud inconnu ou injoignable", () => {
    expect(shortestPath(g, "a1", "zz")).toBeNull();
    const g2 = buildGraph([...nodes, { id: "iso", world: { x: 99, y: 99 } }], edges);
    expect(shortestPath(g2, "a1", "iso")).toBeNull();
  });

  it("ignore une arête vers un nœud inconnu", () => {
    const g3 = buildGraph(nodes, [["a1", "nope"]]);
    expect(shortestPath(g3, "a1", "b1")).toBeNull();
  });
});

describe("polylignes", () => {
  const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];

  it("mesure et interpole à l'abscisse curviligne", () => {
    expect(polylineLength(pts)).toBe(20);
    expect(polylinePoint(pts, 0)).toEqual({ x: 0, y: 0 });
    expect(polylinePoint(pts, 0.25)).toEqual({ x: 5, y: 0 });
    expect(polylinePoint(pts, 0.5)).toEqual({ x: 10, y: 0 });
    expect(polylinePoint(pts, 0.75)).toEqual({ x: 10, y: 5 });
    expect(polylinePoint(pts, 1)).toEqual({ x: 10, y: 10 });
    expect(polylinePoint(pts, 9)).toEqual({ x: 10, y: 10 });
    expect(polylinePoint(pts, -1)).toEqual({ x: 0, y: 0 });
  });

  it("oriente le bot selon le tronçon courant", () => {
    expect(polylineTangent(pts, 0.1)).toEqual({ x: 1, y: 0 });
    expect(polylineTangent(pts, 0.9)).toEqual({ x: 0, y: 1 });
    expect(dist({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
});
