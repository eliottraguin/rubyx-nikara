import { describe, expect, it } from "vitest";
import type { GameState, MissionStatus, MissionView } from "@/lib/api/types";
import { buildMapViewModel, instructionsRemaining, modeLabel, planetStatusFromMission, starsFromPayment } from "./viewmodel";

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
      { role: "scout", owned: true, price: 0, unlock_condition: "", unlocked: true, teaches: "" },
      { role: "triage", owned: false, price: 20, unlock_condition: "", unlocked: false, teaches: "" },
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
    const live = buildMapViewModel(state([mission(0, "COMPLETED"), mission(1, "ACTIVE")]));
    expect(live.places.map((p) => p.vehicle)).toEqual(vm.places.map((p) => p.vehicle));
  });
});

describe("immeuble du joueur (lu uniquement dans l'état serveur)", () => {
  it("sans champ `building`, niveau 1 par défaut", () => {
    const vm = buildMapViewModel(state([mission(0, "AVAILABLE")]));
    expect(vm.building).toMatchObject({ level: 1, maxLevel: 10, source: "defaut", totalEarned: 0 });
    expect(buildMapViewModel(null).building.level).toBe(1);
  });

  it("lit le niveau, le total gagné et le prochain palier dans /state, avec l'équivalent texte", () => {
    const vm = buildMapViewModel(state([mission(0, "AVAILABLE")], { building: { level: 5, total_earned: 112, next_level_at: 125 } }));
    expect(vm.building).toMatchObject({ level: 5, totalEarned: 112, nextLevelAt: 125, source: "serveur" });
    expect(vm.building.text).toBe("Immeuble niveau 5 sur 10, 112\u00a0$ gagnés au total, prochain niveau à 125\u00a0$");
  });

  it("le niveau ne dépend ni du solde ni des missions réussies côté navigateur", () => {
    const rich = buildMapViewModel(state([mission(0, "COMPLETED", { best_payment: 500 })], { balance: { booked: 900, reserved: 0, available: 900 } }));
    expect(rich.building.level).toBe(1);
  });

  it("le dernier niveau n'a pas de prochain palier", () => {
    const vm = buildMapViewModel(state([], { building: { level: 10, total_earned: 640, next_level_at: 700 } }));
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

describe("barre d'état", () => {
  it("instructions restantes : somme sur les bots possédés de l'expédition active, null sinon", () => {
    expect(instructionsRemaining(null)).toBeNull();
    expect(instructionsRemaining(state([]))).toBeNull();
    const attempt = { status: "ACTIVE", roles: [{ role: "scout", used: 2, limit: 5 }, { role: "triage", used: 0, limit: 5 }] } as unknown as GameState["attempt"];
    expect(instructionsRemaining(state([], { attempt }))).toBe(3); // « prospector » n'est pas possédé
    const done = { status: "COMPLETED", roles: [] } as unknown as GameState["attempt"];
    expect(instructionsRemaining(state([], { attempt: done }))).toBeNull();
  });

  it("libellé de mode", () => {
    expect(modeLabel("beginner")).toBe("Tutoriel");
    expect(modeLabel("expert")).toBe("Réel");
    expect(modeLabel(undefined)).toBe("Aperçu");
  });
});
