import { describe, expect, it } from "vitest";
import { LAYOUT } from "../layout";
import type { Trip } from "../trips";
import { botPose, clampDt, LANE_SPREAD, laneOffset } from "./motion";

const place = LAYOUT.places[0]!;
const trip = (over: Partial<Trip> = {}): Trip => ({ id: "t", planetId: place.id, role: "writer" as Trip["role"], startedAt: 1000, doneAt: null, legMs: 2000, ...over });

describe("motion", () => {
  it("clampDt plafonne et rejette les valeurs invalides", () => {
    expect(clampDt(5)).toBe(0.1);
    expect(clampDt(-1)).toBe(0);
    expect(clampDt(Number.NaN)).toBe(0);
  });
  it("le bot part du garage (à un petit décalage de voie près) et arrive au lieu (en grille)", () => {
    const start = botPose(LAYOUT, trip(), 1000, false)!;
    const g = LAYOUT.hq.garageDoor.grid;
    // Le décalage de voie (anti-chevauchement, GR3-72) écarte légèrement le point exact du seuil, jamais plus que LANE_SPREAD/2.
    if (start.vehicle !== "helicopter") expect(Math.hypot(start.x - g.x, start.z - g.y)).toBeLessThan(LANE_SPREAD / 2 + 0.01);
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

  describe("plusieurs agents en parallèle ne se chevauchent pas (GR3-72)", () => {
    it("laneOffset est déterministe (même id => même décalage) et borné à LANE_SPREAD/2", () => {
      expect(laneOffset("t1")).toBe(laneOffset("t1"));
      expect(Math.abs(laneOffset("t1"))).toBeLessThanOrEqual(LANE_SPREAD / 2);
    });
    it("deux voyages distincts sur le même trajet au même instant ont des positions différentes", () => {
      const a = botPose(LAYOUT, trip({ id: "trip-a" }), 1500, false)!;
      const b = botPose(LAYOUT, trip({ id: "trip-b" }), 1500, false)!;
      expect(a.x !== b.x || a.z !== b.z).toBe(true);
    });
    it("le palier de l'agent choisit le véhicule (GR3-72), prioritaire sur celui du lieu", () => {
      const foot = botPose(LAYOUT, trip({ tier: 1 }), 1500, false)!;
      const car = botPose(LAYOUT, trip({ tier: 2 }), 1500, false)!;
      const drone = botPose(LAYOUT, trip({ tier: 3 }), 1500, false)!;
      expect(car.vehicle).toBe("car");
      expect(drone.vehicle).toBe("drone");
      expect(drone.airborne).toBe(true);
      expect(foot.airborne).toBe(false);
    });
    it("l'indicateur de retour (`cargo`) vient de `trip.resultCount`", () => {
      const t = trip({ doneAt: 1000, resultCount: 4 });
      const p = botPose(LAYOUT, t, 1000 + 2000 + 2000 + 100, false)!; // en phase retour
      expect(p.phase).toBe("return");
      expect(p.cargo).toBe(4);
      const none = botPose(LAYOUT, trip(), 1500, false)!;
      expect(none.cargo).toBeNull();
    });
  });
});
