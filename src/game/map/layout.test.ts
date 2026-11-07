import { describe, expect, it } from "vitest";
import { buildLayout, LAYOUT } from "./layout";
import { PLANETS, planetDef } from "./planets";

describe("disposition cosmétique (data/map/layout_v1.json)", () => {
  it("place les 6 planètes du catalogue, chacune une fois, dans l'ordre de déblocage", () => {
    expect(LAYOUT.planets.map((p) => p.id)).toEqual(PLANETS.map((p) => p.id));
    expect(new Set(LAYOUT.planets.map((p) => p.id)).size).toBe(6);
  });

  it("aucune planète ne chevauche la base ni une autre planète", () => {
    const baseHalf = (LAYOUT.base.size * LAYOUT.tile.w) / 2;
    for (const p of LAYOUT.planets) {
      const r = planetDef(p.id)!.radius;
      // La base s'étend sur ~baseHalf en largeur ; on exige un dégagement net.
      expect(Math.hypot(p.world.x, p.world.y)).toBeGreaterThan(r + baseHalf * 0.8);
    }
    for (const a of LAYOUT.planets)
      for (const b of LAYOUT.planets) {
        if (a.id >= b.id) continue;
        const ra = planetDef(a.id)!.radius;
        const rb = planetDef(b.id)!.radius;
        expect(Math.hypot(a.world.x - b.world.x, a.world.y - b.world.y)).toBeGreaterThan((ra + rb) * 1.4);
      }
  });

  it("ignore un identifiant inconnu du catalogue", () => {
    const l = buildLayout({
      version: 1,
      tile: { w: 64, h: 32 },
      base: { grid: { x: 0, y: 0 }, size: 7 },
      planets: [
        { id: "annuaire", grid: { x: 1, y: 1 } },
        { id: "inconnue", grid: { x: 2, y: 2 } },
      ],
    });
    expect(l.planets.map((p) => p.id)).toEqual(["annuaire"]);
  });
});
