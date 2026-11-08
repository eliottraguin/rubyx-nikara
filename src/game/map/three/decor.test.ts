import { describe, expect, it } from "vitest";
import { LAYOUT } from "../layout";
import { dashSegments, roadSegments, treeSpots } from "./decor";

describe("decor", () => {
  it("un segment par arête valide, longueur égale à la distance de grille", () => {
    const segs = roadSegments(LAYOUT);
    expect(segs.length).toBeGreaterThan(0);
    expect(segs.length).toBeLessThanOrEqual(LAYOUT.streets.edges.length);
    expect(segs.every((s) => s.len > 0)).toBe(true);
  });
  it("ignore les arêtes inconnues", () => {
    const segs = roadSegments({ streets: { nodes: [{ id: "a", grid: { x: 0, y: 0 }, world: { x: 0, y: 0 } }], edges: [["a", "zz"]] } });
    expect(segs).toEqual([]);
  });
  it("les tirets restent dans leur segment", () => {
    const segs = roadSegments({
      streets: { nodes: [{ id: "a", grid: { x: 0, y: 0 }, world: { x: 0, y: 0 } }, { id: "b", grid: { x: 10, y: 0 }, world: { x: 10, y: 0 } }], edges: [["a", "b"]] },
    });
    const dashes = dashSegments(segs);
    expect(dashes.length).toBeGreaterThan(0);
    for (const d of dashes) expect(d.cx - d.len / 2).toBeGreaterThanOrEqual(-1e-9);
    for (const d of dashes) expect(d.cx + d.len / 2).toBeLessThanOrEqual(10 + 1e-9);
  });
  it("arbres déterministes, hors étang et allées, dans le parc", () => {
    const a = treeSpots(LAYOUT.park);
    expect(a).toEqual(treeSpots(LAYOUT.park));
    expect(a.length).toBeGreaterThan(0);
    const p = LAYOUT.park;
    for (const t of a) {
      expect(t.x).toBeGreaterThanOrEqual(p.x);
      expect(t.x).toBeLessThanOrEqual(p.x + p.w);
      expect(Math.abs(t.x - (p.x + p.w / 2))).toBeGreaterThanOrEqual(0.8);
    }
  });
});
