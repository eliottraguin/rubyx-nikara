import { describe, expect, it } from "vitest";
import { DEFAULT_VEHICLE, LEG_MAX_MS, LEG_MIN_MS, TIER_VEHICLE, VEHICLE_IDS, VEHICLE_MANNER, isVehicleId, legDurationMs, vehicleForAgent, vehicleOf } from "./vehicles";

describe("véhicules (donnée du lieu OU palier de l'agent, jamais le serveur)", () => {
  it("reconnaît les six véhicules et retombe sur « à pied » pour une valeur inconnue", () => {
    expect([...VEHICLE_IDS]).toEqual(["foot", "bike", "skate", "car", "drone", "helicopter"]);
    expect(vehicleOf("skate")).toBe("skate");
    expect(vehicleOf("car")).toBe("car");
    expect(vehicleOf("drone")).toBe("drone");
    expect(vehicleOf("jetpack")).toBe(DEFAULT_VEHICLE);
    expect(vehicleOf(undefined)).toBe("foot");
    expect(isVehicleId(42)).toBe(false);
    expect(VEHICLE_MANNER.bike).toBe("à vélo");
    expect(VEHICLE_MANNER.car).toBe("en voiture");
    expect(VEHICLE_MANNER.drone).toBe("en drone");
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

  it("vehicleForAgent : le palier de l'agent l'emporte sur le véhicule du lieu (GR3-72)", () => {
    expect(TIER_VEHICLE).toEqual(["foot", "car", "drone", "helicopter"]);
    expect(vehicleForAgent(1, "bike")).toBe("foot");
    expect(vehicleForAgent(2, "bike")).toBe("car");
    expect(vehicleForAgent(3, "skate")).toBe("drone");
    expect(vehicleForAgent(4, "foot")).toBe("helicopter");
    // au-delà du dernier palier connu : reste à l'hélicoptère (jamais d'erreur).
    expect(vehicleForAgent(9, "foot")).toBe("helicopter");
  });

  it("vehicleForAgent : sans palier connu (GR3-54 pas encore livré), le véhicule du lieu reste inchangé", () => {
    expect(vehicleForAgent(undefined, "bike")).toBe("bike");
    expect(vehicleForAgent(null, "skate")).toBe("skate");
    expect(vehicleForAgent(0, "bike")).toBe("bike");
    expect(vehicleForAgent(Number.NaN, "bike")).toBe("bike");
  });
});
