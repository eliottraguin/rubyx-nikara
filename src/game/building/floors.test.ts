import { describe, expect, it } from "vitest";
import { FLOORS, buildingHref, floorFromSlug, stepFloor } from "./floors";

describe("étages de l'immeuble", () => {
  it("liste les 6 étages dans l'ordre de la coupe", () => {
    expect(FLOORS.map((f) => f.label)).toEqual(["Toit", "Orchestrateur", "Studio pub", "Salle du courrier", "Archives", "Accueil et garage"]);
  });
  it("retrouve un étage par son paramètre d'URL et ignore l'inconnu", () => {
    expect(floorFromSlug("courrier")?.label).toBe("Salle du courrier");
    expect(floorFromSlug("nimportequoi")).toBeNull();
    expect(floorFromSlug(undefined)).toBeNull();
  });
  it("borne la sélection", () => {
    expect(stepFloor(0, -1)).toBe(0);
    expect(stepFloor(5, 1)).toBe(5);
    expect(stepFloor(1, 1)).toBe(2);
  });
  it("construit les liens de raccourci", () => {
    expect(buildingHref("pub")).toBe("/immeuble?etage=pub");
    expect(buildingHref("courrier")).toBe("/immeuble?etage=courrier");
    expect(buildingHref()).toBe("/immeuble");
  });
});
