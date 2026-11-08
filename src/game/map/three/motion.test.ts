import { describe, expect, it } from "vitest";
import { LAYOUT } from "../layout";
import type { Trip } from "../trips";
import { botPose, clampDt, perimeterLoop, planWalkers, walkerPose } from "./motion";

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
  it("piétons : déterministes, sur le périmètre, rebond borné et nul en mouvement réduit", () => {
    const ws = planWalkers(LAYOUT);
    expect(ws).toEqual(planWalkers(LAYOUT));
    expect(ws.length).toBe((LAYOUT.places.length + 1) * 2);
    const loop = perimeterLoop({ x: 0, y: 0 }, 2, 2);
    expect(loop[0]).toEqual(loop[4]);
    for (const w of ws) {
      for (const t of [0, 777, 12345]) {
        const p = walkerPose(w, t, false);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThan(0.1);
        expect(walkerPose(w, t, true).y).toBe(0);
      }
    }
  });
});
