import { describe, expect, it } from "vitest";
import type { GameState, PlaceStateView } from "@/lib/api/types";
import { buildMapViewModel, modeLabel } from "./viewmodel";

const IDS = ["annuaire", "registre", "carte-locale", "linkedin", "glassdoor", "constellation"];

function place(i: number, status: PlaceStateView["status"], reason: string | null = null): PlaceStateView {
  return { id: IDS[i]!, label: `Lieu ${i + 1}`, status, reason };
}

function state(planets: PlaceStateView[], over: Partial<GameState> = {}): GameState {
  return {
    contract_version: "0.1",
    session: { id: "ses_1", mode: "beginner", company: "Atelier Test", rules_version: "rules_v1" },
    simulated_provider: true,
    balance: { booked: 30, reserved: 4, available: 26 },
    agents: [
      { role: "scout", owned: true, price: 0, unlock_condition: "", unlocked: true, teaches: "" },
      { role: "triage", owned: false, price: 20, unlock_condition: "", unlocked: false, teaches: "" },
    ],
    planets,
    actions_in_progress: [],
    ...over,
  };
}

describe("états de lieu lus dans /state (le serveur décide)", () => {
  it("lit l'état de chaque lieu et la raison du verrouillage dans /state", () => {
    const vm = buildMapViewModel(
      state([
        place(0, "AVAILABLE"),
        place(1, "AVAILABLE"),
        place(2, "LOCKED", "Trouvez d'abord 3 prospects qui correspondent à « Registre »."),
        place(3, "LOCKED"),
        place(4, "LOCKED"),
        place(5, "LOCKED"),
      ]),
    );
    expect(vm.source).toBe("serveur");
    expect(vm.planets.map((p) => p.status)).toEqual(["available", "available", "locked", "locked", "locked", "locked"]);
    const [annuaire, , carte] = vm.planets;
    expect(annuaire).toMatchObject({ id: "annuaire", status: "available", statusLabel: "Disponible" });
    expect(carte?.unlockText).toBe("Trouvez d'abord 3 prospects qui correspondent à « Registre »."); // texte serveur prioritaire
    expect(vm.planets[3]?.unlockText).toMatch(/Carte locale/); // repli : texte de la maquette
  });

  it("n'invente aucun déblocage : un lieu absent de /state reste verrouillé", () => {
    const vm = buildMapViewModel(state([place(0, "AVAILABLE")]));
    expect(vm.planets.map((p) => p.status)).toEqual(["available", "locked", "locked", "locked", "locked", "locked"]);
    expect(buildMapViewModel(state([])).planets.every((p) => p.status === "locked")).toBe(true);
  });

  it("expose trésorerie (solde disponible), hangar, société et badge simulé", () => {
    const vm = buildMapViewModel(state([place(0, "AVAILABLE")]));
    expect(vm.treasury).toBe(26);
    expect(vm.company).toBe("Atelier Test");
    expect(vm.simulated).toBe(true);
    expect(vm.base).toMatchObject({ agentsOwned: 1, agentsTotal: 2 });
  });

  it("chaque état a un libellé texte (jamais la couleur seule)", () => {
    const vm = buildMapViewModel(state([place(0, "AVAILABLE"), place(1, "LOCKED")]));
    for (const p of vm.planets) expect(p.statusLabel.length).toBeGreaterThan(3);
    expect(vm.planets.map((p) => p.statusLabel).slice(0, 2)).toEqual(["Disponible", "Verrouillée"]);
  });

  it("englobe tous les lieux et l'immeuble dans les bornes monde", () => {
    const vm = buildMapViewModel(null);
    for (const p of vm.planets) {
      expect(p.world.x).toBeGreaterThan(vm.bounds.minX);
      expect(p.world.x).toBeLessThan(vm.bounds.maxX);
      expect(p.world.y).toBeGreaterThan(vm.bounds.minY);
      expect(p.world.y).toBeLessThan(vm.bounds.maxY);
    }
    expect(vm.bounds.minX).toBeLessThan(0);
    expect(vm.bounds.maxX).toBeGreaterThan(0);
  });

  it("expose le lieu (nom, quartier), le véhicule de la donnée du lieu et le titre « lieu : plateforme »", () => {
    const vm = buildMapViewModel(null);
    expect(vm.places).toBe(vm.planets);
    const byId = Object.fromEntries(vm.places.map((p) => [p.id, p]));
    expect(byId.annuaire).toMatchObject({ placeName: "Bibliothèque publique", district: "Bryant Park", vehicle: "foot", vehicleManner: "à pied", title: "Bibliothèque publique : Annuaire" });
    expect(byId.registre).toMatchObject({ placeName: "Hôtel de ville", vehicle: "bike" });
    expect(byId["carte-locale"]).toMatchObject({ placeName: "SoHo", vehicle: "skate" });
    expect(byId.linkedin).toMatchObject({ title: "Midtown : LinkedIn", vehicle: "bike" });
    expect(byId.glassdoor).toMatchObject({ placeName: "Wall Street", vehicle: "skate" });
    expect(byId.constellation).toMatchObject({ placeName: "Times Square", vehicle: "helicopter", vehicleLabel: "Hélicoptère" });
    // Le véhicule ne dépend jamais de l'état serveur.
    const live = buildMapViewModel(state([place(0, "AVAILABLE"), place(1, "AVAILABLE")]));
    expect(live.places.map((p) => p.vehicle)).toEqual(vm.places.map((p) => p.vehicle));
  });
});

describe("immeuble du joueur (lu uniquement dans l'état serveur)", () => {
  it("sans champ `building`, niveau 1 par défaut", () => {
    const vm = buildMapViewModel(state([place(0, "AVAILABLE")]));
    expect(vm.building).toMatchObject({ level: 1, maxLevel: 10, source: "defaut", clientsObtained: 0 });
    expect(buildMapViewModel(null).building.level).toBe(1);
  });

  it("lit le niveau, les clients obtenus et le prochain palier dans /state, avec l'équivalent texte", () => {
    const vm = buildMapViewModel(state([place(0, "AVAILABLE")], { building: { level: 5, clients_obtained: 7, next_level_at: 11 } }));
    expect(vm.building).toMatchObject({ level: 5, clientsObtained: 7, nextLevelAt: 11, source: "serveur" });
    expect(vm.building.text).toBe("Immeuble niveau 5 sur 10, 7 clients obtenus, encore 4 clients pour le niveau suivant");
  });

  it("le niveau ne dépend ni du solde ni de l'état des lieux côté navigateur", () => {
    const rich = buildMapViewModel(state([place(0, "AVAILABLE"), place(1, "AVAILABLE")], { balance: { booked: 900, reserved: 0, available: 900 } }));
    expect(rich.building.level).toBe(1);
  });

  it("le dernier niveau n'a pas de prochain palier", () => {
    const vm = buildMapViewModel(state([], { building: { level: 10, clients_obtained: 40, next_level_at: 50 } }));
    expect(vm.building.nextLevelAt).toBeNull();
    expect(vm.building.text).toMatch(/niveau maximal atteint/);
  });
});

describe("aperçu maquette (aucune partie)", () => {
  it("fige la première planète disponible, les autres verrouillées, sans chiffres serveur", () => {
    for (const s of [null, undefined]) {
      const vm = buildMapViewModel(s);
      expect(vm.source).toBe("maquette");
      expect(vm.treasury).toBeNull();
      expect(vm.planets.map((p) => p.status)).toEqual(["available", "locked", "locked", "locked", "locked", "locked"]);
    }
  });
});

describe("barre d'état", () => {
  it("libellé de mode", () => {
    expect(modeLabel("beginner")).toBe("Tutoriel");
    expect(modeLabel("expert")).toBe("Réel");
    expect(modeLabel(undefined)).toBe("Aperçu");
  });
});
