import { describe, expect, it } from "vitest";
import { diamond, gridToScreen, isoDepth, screenToGrid, TILE_H, TILE_W } from "./iso";

describe("projection isométrique 2:1", () => {
  it("l'origine reste à l'origine", () => {
    expect(gridToScreen({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });

  it("une case vers +x descend à droite, vers +y descend à gauche (tuile 64x32)", () => {
    expect(gridToScreen({ x: 1, y: 0 })).toEqual({ x: TILE_W / 2, y: TILE_H / 2 });
    expect(gridToScreen({ x: 0, y: 1 })).toEqual({ x: -TILE_W / 2, y: TILE_H / 2 });
  });

  it("screenToGrid est l'inverse exact de gridToScreen", () => {
    for (const g of [{ x: 3, y: -2 }, { x: -9.1, y: 5.3 }, { x: 0.5, y: 12 }]) {
      const back = screenToGrid(gridToScreen(g));
      expect(back.x).toBeCloseTo(g.x, 9);
      expect(back.y).toBeCloseTo(g.y, 9);
    }
  });

  it("l'ordre de dessin croît vers l'avant de l'écran", () => {
    expect(isoDepth({ x: 2, y: 2 })).toBeGreaterThan(isoDepth({ x: 1, y: 1 }));
    expect(gridToScreen({ x: 2, y: 2 }).y).toBeGreaterThan(gridToScreen({ x: 1, y: 1 }).y);
  });

  it("le losange d'une tuile a la bonne largeur et hauteur", () => {
    const [top, right, bottom, left] = diamond(10, 20);
    expect(right.x - left.x).toBe(TILE_W);
    expect(bottom.y - top.y).toBe(TILE_H);
    expect(top.x).toBe(10);
  });
});
