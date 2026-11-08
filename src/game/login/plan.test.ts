import { describe, expect, it } from "vitest";
import { mulberry32, planCity } from "./plan";

describe("planCity", () => {
  it("est reproductible pour une même graine", () => {
    expect(planCity(7)).toEqual(planCity(7));
    expect(planCity(7)).not.toEqual(planCity(8));
  });
  it("place les immeubles sur des cellules distinctes", () => {
    const keys = planCity(1, 30).buildings.map((b) => `${b.x},${b.z}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it("produit des nuages et des étages valides", () => {
    const p = planCity(3);
    expect(p.clouds.length).toBeGreaterThan(0);
    for (const b of p.buildings) expect(b.floors.length).toBeGreaterThan(0);
  });
  it("mulberry32 reste dans [0,1[", () => {
    const r = mulberry32(5);
    for (let i = 0; i < 100; i++) expect(r()).toBeLessThan(1);
  });
});
