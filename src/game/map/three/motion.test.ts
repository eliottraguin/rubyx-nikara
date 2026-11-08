import { describe, expect, it } from "vitest";
import { LAYOUT } from "../layout";
import type { Trip } from "../trips";
import { botPose, clampDt } from "./motion";

const place = LAYOUT.places[0]!;
const trip = (over: Partial<Trip> = {}): Trip => ({ id: "t", planetId: place.id, role: "writer" as Trip["role"], startedAt: 1000, doneAt: null, legMs: 2000, ...over });

describe("motion", () => {
  it("clampDt plafonne et rejette les valeurs invalides", () => {
    expect(clampDt(5)).toBe(0.1);
    expect(clampDt(-1)).toBe(0);
    expect(clampDt(Number.NaN)).toBe(0);
  });
  it("le bot part du garage et arrive au lieu (en grille)", () => {
    const start = botPose(LAYOUT, trip(), 1000, false)!;
    const g = LAYOUT.hq.garageDoor.grid;
    if (start.vehicle !== "helicopter") expect(Math.hypot(start.x - g.x, start.z - g.y)).toBeLessThan(0.01);
    const mid = botPose(LAYOUT, trip(), 3500, false)!;
    expect(mid.phase).toBe("dialogue");
  });
  it("lieu inconnu ou voyage rentré : null", () => {
    expect(botPose(LAYOUT, trip({ planetId: "nope" }), 1000, false)).toBeNull();
    expect(botPose(LAYOUT, trip({ doneAt: 3000 }), 1_000_000, false)).toBeNull();
  });
  it("mouvement réduit : pas de rebond, bot à destination", () => {
    const p = botPose(LAYOUT, trip(), 1001, true)!;
    expect(p.y).toBeCloseTo(0, 5);
    expect(p.phase).toBe("dialogue");
  });
});
