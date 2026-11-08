import { describe, expect, it } from "vitest";
import { FLOOR_H, planBuilding, seedFromId } from "./buildingPlan";

describe("planBuilding", () => {
  it("est déterministe pour une même graine", () => {
    const a = planBuilding({ seed: 7, size: 4, floors: 12 });
    expect(planBuilding({ seed: 7, size: 4, floors: 12 })).toEqual(a);
  });
  it("conserve le nombre d'étages demandé", () => {
    for (const floors of [1, 3, 5, 11, 26]) {
      const p = planBuilding({ seed: 3, size: 3.2, floors });
      expect(p.tiers.reduce((n, t) => n + t.floors, 0)).toBe(floors);
      expect(p.height).toBeCloseTo(floors * FLOOR_H);
    }
  });
  it("empile des volumes contigus qui rétrécissent", () => {
    const p = planBuilding({ seed: 1, size: 4, floors: 20 });
    expect(p.tiers.length).toBeGreaterThan(1);
    p.tiers.forEach((t, i) => {
      if (i > 0) {
        expect(t.y).toBeCloseTo(p.tiers[i - 1]!.y + p.tiers[i - 1]!.height);
        expect(t.size).toBeLessThan(p.tiers[i - 1]!.size);
      }
    });
  });
  it("tolère des entrées invalides", () => {
    const p = planBuilding({ seed: 1, size: Number.NaN, floors: Number.NaN });
    expect(p.tiers).toHaveLength(1);
    expect(p.height).toBeCloseTo(FLOOR_H);
  });
  it("seedFromId est stable et distingue les ids", () => {
    expect(seedFromId("a")).toBe(seedFromId("a"));
    expect(seedFromId("a")).not.toBe(seedFromId("b"));
  });
});
