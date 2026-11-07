import { describe, expect, it } from "vitest";
import type { GameState, MissionStatus, MissionView } from "@/lib/api/types";
import { buildMapViewModel, planetStatusFromMission, starsFromPayment } from "./viewmodel";

function mission(i: number, status: MissionStatus, extra: Partial<MissionView> = {}): MissionView {
  return { id: `m${i + 1}`, title: `M${i + 1}`, status, max_reward: 20 + i * 10, unit_price: i === 0 ? 0 : 1, best_payment: 0, ...extra };
}

function state(missions: MissionView[], over: Partial<GameState> = {}): GameState {
  return {
    contract_version: "0.1",
    session: { id: "ses_1", mode: "beginner", company: "Atelier Test", stage: 1, rules_version: "rules_v1" },
    simulated_provider: true,
    demo_enabled: false,
    balance: { booked: 30, reserved: 4, available: 26 },
    stage: { index: 1, total: 6, label: "Étape 1" },
    next_action: "",
    agents: [
      { role: "writer", owned: true, price: 0, unlock_condition: "", unlocked: true, teaches: "" },
      { role: "prospector", owned: false, price: 20, unlock_condition: "", unlocked: false, teaches: "" },
    ],
    missions,
    attempt: null,
    actions_in_progress: [],
    bilan: {} as GameState["bilan"],
    ...over,
  };
}

describe("états de planète dérivés des missions (le serveur décide)", () => {
  it("correspond statut serveur -> état de planète", () => {
    const m: Record<MissionStatus, string> = { LOCKED: "locked", AVAILABLE: "available", ACTIVE: "in_progress", EVALUATING: "in_progress", COMPLETED: "visited", FAILED: "available" };
    for (const [s, expected] of Object.entries(m)) expect(planetStatusFromMission(s as MissionStatus)).toBe(expected);
  });

  it("lit les états, gains, prix et condition de déblocage dans /state", () => {
    const vm = buildMapViewModel(
      state([
        mission(0, "COMPLETED", { best_payment: 20 }),
        mission(1, "AVAILABLE"),
        mission(2, "LOCKED", { unavailable_reason: "Réussissez d'abord Registre." }),
        mission(3, "LOCKED"),
        mission(4, "LOCKED"),
        mission(5, "LOCKED"),
      ]),
    );
    expect(vm.source).toBe("serveur");
    expect(vm.planets.map((p) => p.status)).toEqual(["visited", "available", "locked", "locked", "locked", "locked"]);
    const [annuaire, registre, carte] = vm.planets;
    expect(annuaire).toMatchObject({ id: "annuaire", maxReward: 20, unitPrice: 0, bestPayment: 20, stars: 3, missionId: "m1" });
    expect(registre).toMatchObject({ maxReward: 30, unitPrice: 1, stars: 0 });
    expect(carte?.unlockText).toBe("Réussissez d'abord Registre."); // texte serveur prioritaire
    expect(vm.planets[3]?.unlockText).toMatch(/Carte locale/); // repli : texte de la maquette
  });

  it("n'invente aucun déblocage : sans mission correspondante, la planète reste verrouillée", () => {
    const vm = buildMapViewModel(state([mission(0, "AVAILABLE")]));
    expect(vm.planets.map((p) => p.status)).toEqual(["available", "locked", "locked", "locked", "locked", "locked"]);
  });

  it("ignore la mission de secours", () => {
    const vm = buildMapViewModel(state([mission(0, "AVAILABLE", { id: "rescue", is_rescue: true }), mission(1, "LOCKED")]));
    expect(vm.planets[0]?.missionId).toBe("m2");
  });

  it("une mission non réussie reste jouable et le dit en texte", () => {
    const vm = buildMapViewModel(state([mission(0, "FAILED")]));
    expect(vm.planets[0]).toMatchObject({ status: "available", statusLabel: "À retenter" });
  });

  it("expose trésorerie (solde disponible), hangar, société et badge simulé", () => {
    const vm = buildMapViewModel(state([mission(0, "AVAILABLE")]));
    expect(vm.treasury).toBe(26);
    expect(vm.company).toBe("Atelier Test");
    expect(vm.simulated).toBe(true);
    expect(vm.base).toMatchObject({ agentsOwned: 1, agentsTotal: 2 });
  });

  it("chaque état a un libellé texte (jamais la couleur seule)", () => {
    const vm = buildMapViewModel(state([mission(0, "COMPLETED"), mission(1, "ACTIVE"), mission(2, "AVAILABLE"), mission(3, "LOCKED")]));
    for (const p of vm.planets) expect(p.statusLabel.length).toBeGreaterThan(3);
    expect(vm.planets.map((p) => p.statusLabel).slice(0, 4)).toEqual(["Visitée", "Expédition en cours", "Disponible", "Verrouillée"]);
  });

  it("englobe toutes les planètes dans les bornes monde", () => {
    const vm = buildMapViewModel(null);
    for (const p of vm.planets) {
      expect(p.world.x - p.radius).toBeGreaterThan(vm.bounds.minX);
      expect(p.world.x + p.radius).toBeLessThan(vm.bounds.maxX);
      expect(p.world.y - p.radius).toBeGreaterThan(vm.bounds.minY);
      expect(p.world.y + p.radius).toBeLessThan(vm.bounds.maxY);
    }
  });
});

describe("aperçu maquette (aucune partie)", () => {
  it("fige la première planète disponible, les autres verrouillées, sans chiffres serveur", () => {
    for (const s of [null, undefined]) {
      const vm = buildMapViewModel(s);
      expect(vm.source).toBe("maquette");
      expect(vm.treasury).toBeNull();
      expect(vm.planets.map((p) => p.status)).toEqual(["available", "locked", "locked", "locked", "locked", "locked"]);
      expect(vm.planets.every((p) => p.maxReward === null && p.unitPrice === null)).toBe(true);
    }
  });
});

describe("étoiles de score (cosmétique)", () => {
  it("part du gain maximal déjà payé ; visitée vaut au moins une étoile", () => {
    expect(starsFromPayment(0, 20, false)).toBe(0);
    expect(starsFromPayment(0, 20, true)).toBe(1);
    expect(starsFromPayment(10, 20, true)).toBe(1);
    expect(starsFromPayment(13, 20, true)).toBe(2);
    expect(starsFromPayment(19, 20, true)).toBe(3);
    expect(starsFromPayment(5, null, true)).toBe(1);
  });
});
