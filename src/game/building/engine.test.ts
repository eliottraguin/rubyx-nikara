import { describe, expect, it } from "vitest";
import { buildingEngine } from "./engine";
import { FLOORS } from "./floors";
import { BUILDING_HEIGHT, FLOOR_HEIGHT, ZONES } from "./three/layout";

describe("buildingEngine", () => {
  it("DOM par défaut (gate ADR 0002 non mesuré), Three.js seulement sur drapeau explicite", () => {
    expect(buildingEngine(undefined)).toBe("dom");
    expect(buildingEngine("")).toBe("dom");
    expect(buildingEngine("autre")).toBe("dom");
    expect(buildingEngine("three")).toBe("three");
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
