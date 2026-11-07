import { describe, expect, it } from "vitest";
import { DEFAULT_VEHICLE, LEG_MAX_MS, LEG_MIN_MS, VEHICLE_IDS, VEHICLE_MANNER, isVehicleId, legDurationMs, vehicleOf } from "./vehicles";

describe("véhicules (donnée du lieu, jamais le serveur)", () => {
  it("reconnaît les quatre véhicules et retombe sur « à pied » pour une valeur inconnue", () => {
    expect([...VEHICLE_IDS]).toEqual(["foot", "bike", "skate", "helicopter"]);
    expect(vehicleOf("skate")).toBe("skate");
    expect(vehicleOf("jetpack")).toBe(DEFAULT_VEHICLE);
    expect(vehicleOf(undefined)).toBe("foot");
    expect(isVehicleId(42)).toBe(false);
    expect(VEHICLE_MANNER.bike).toBe("à vélo");
  });

  it("un trajet dure de 2 à 4 s, plus vite à vélo qu'à pied sur la même distance", () => {
    expect(legDurationMs("foot", 10)).toBe(LEG_MIN_MS);
    expect(legDurationMs("foot", 100_000)).toBe(LEG_MAX_MS);
    expect(legDurationMs("bike", 600)).toBeLessThan(legDurationMs("foot", 600));
    for (const v of VEHICLE_IDS) for (const len of [0, 300, 900, 5000]) {
      const d = legDurationMs(v, len);
      expect(d).toBeGreaterThanOrEqual(LEG_MIN_MS);
      expect(d).toBeLessThanOrEqual(LEG_MAX_MS);
    }
  });
});
