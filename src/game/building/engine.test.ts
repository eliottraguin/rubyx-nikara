import { describe, expect, it } from "vitest";
import { buildingEngine } from "./engine";
import { FLOORS } from "./floors";
import { BUILDING_HEIGHT, FLOOR_HEIGHT, ZONES } from "./three/layout";

describe("buildingEngine", () => {
  it("Three.js par défaut, le DOM seulement sur drapeau explicite (et en repli automatique)", () => {
    expect(buildingEngine(undefined)).toBe("three");
    expect(buildingEngine("")).toBe("three");
    expect(buildingEngine("autre")).toBe("three");
    expect(buildingEngine("three")).toBe("three");
    expect(buildingEngine("dom")).toBe("dom");
  });
});

describe("ZONES", () => {
  it("une zone par étage, dans l'ordre de FLOORS, toit en haut", () => {
    expect(ZONES.map((z) => z.id)).toEqual(FLOORS.map((f) => f.id));
    expect(ZONES[0]!.y).toBeGreaterThan(ZONES[ZONES.length - 1]!.y);
    expect(ZONES[ZONES.length - 1]!.y).toBe(0);
    expect(ZONES[0]!.y + FLOOR_HEIGHT).toBeCloseTo(BUILDING_HEIGHT);
  });
});
