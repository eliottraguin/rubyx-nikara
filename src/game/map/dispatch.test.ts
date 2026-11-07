import { describe, expect, it } from "vitest";
import type { AgentView, AttemptView, GameState, MissionStatus } from "@/lib/api/types";
import { DEFAULT_MESSAGE_LIMIT } from "@/lib/send-rules";
import { buildAgentSlots, checkDispatch, expeditionStep, planetAttempt } from "./dispatch";
import { TIMING, type Trip } from "./trips";
import { buildMapViewModel } from "./viewmodel";

const agents: AgentView[] = [
  { role: "writer", owned: true, price: 0, unlock_condition: "Disponible dès le départ", unlocked: true, teaches: "t" },
  { role: "prospector", owned: false, price: 20, unlock_condition: "Réussir M1", unlocked: true, teaches: "t" },
  { role: "researcher", owned: false, price: 35, unlock_condition: "Réussir M2", unlocked: false, teaches: "t" },
];

function stateWith(status: MissionStatus, over: Partial<GameState> = {}): GameState {
  return {
    contract_version: "0.1",
    session: { id: "s", mode: "beginner", company: "Test", stage: 1, rules_version: "r" },
    simulated_provider: true, demo_enabled: false,
    balance: { booked: 30, reserved: 0, available: 30 },
    stage: { index: 1, total: 6, label: "" }, next_action: "", agents,
    missions: [{ id: "m1", title: "M1", status, max_reward: 20, unit_price: 2, best_payment: 0 }],
    attempt: null, actions_in_progress: [], bilan: {} as GameState["bilan"], ...over,
  };
}
const planetOf = (s: GameState) => buildMapViewModel(s).planets[0]!;

function attempt(over: Partial<AttemptView> = {}): AttemptView {
  return {
    id: "att_1", mission_id: "m1", mission_title: "M1", attempt_no: 1, status: "ACTIVE", brief: { version: 1, text: "" }, documents: [], criteria: [],
    max_reward: 20, unit_price: 2, spend_cap: null, clarifications: { used: 0, max: 3, items: [] },
    roles: [
      { role: "writer", owned: true, used: 2, limit: 5, next_cost_max: 2 },
      { role: "prospector", owned: false, used: 0, limit: 5, next_cost_max: 2 },
    ],
    messages: [], artifacts: [], submission: null, hints_used: 0, ...over,
  };
}

describe("agents d'une planète", () => {
  it("avant toute expédition : quota d'affichage de repli et coût unitaire du serveur", () => {
    const s = stateWith("AVAILABLE");
    const slots = buildAgentSlots({ state: s, planet: planetOf(s), attempt: null, trips: [], now: 0, reduced: false });
    const writer = slots.find((x) => x.role === "writer")!;
    expect(writer).toMatchObject({ kind: "home", used: 0, limit: DEFAULT_MESSAGE_LIMIT, remaining: DEFAULT_MESSAGE_LIMIT, costMax: 2, stateLabel: "Au hangar" });
  });

  it("avec expédition : quota et coût viennent de la tentative ; l'agent déjà utilisé est « envoyé »", () => {
    const s = stateWith("ACTIVE");
    const a = attempt();
    const slots = buildAgentSlots({ state: s, planet: planetOf(s), attempt: a, trips: [], now: 0, reduced: false });
    expect(slots[0]).toMatchObject({ role: "writer", kind: "sent", used: 2, remaining: 3, stateLabel: "Rentré à la base" });
    expect(slots.map((x) => x.kind)).toEqual(["sent", "buyable", "locked"]);
  });

  it("l'état en route / sur place / retour suit le voyage visuel", () => {
    const s = stateWith("ACTIVE");
    const trip: Trip = { id: "t", planetId: "annuaire", role: "writer", startedAt: 1000, doneAt: null };
    const at = (now: number) => buildAgentSlots({ state: s, planet: planetOf(s), attempt: attempt(), trips: [trip], now, reduced: false }).find((x) => x.role === "writer")!;
    expect(at(1000).stateLabel).toBe("En route");
    expect(at(1000 + TIMING.outbound + 1).stateLabel).toBe("Sur place");
    expect(at(1000 + TIMING.outbound + 1).phase).toBe("dialogue");
  });

  it("un message gratuit (crédit exceptionnel) coûte 0", () => {
    const s = stateWith("ACTIVE");
    const a = attempt({ roles: [{ role: "writer", owned: true, used: 1, limit: 5, next_cost_max: 2, free_credit: 1 }] });
    const w = buildAgentSlots({ state: s, planet: planetOf(s), attempt: a, trips: [], now: 0, reduced: false }).find((x) => x.role === "writer")!;
    expect(w).toMatchObject({ free: true, costMax: 0 });
  });

  it("choisit la tentative de la planète : courante si elle correspond, sinon l'active récupérée", () => {
    const s = stateWith("ACTIVE");
    const p = planetOf(s);
    const cur = attempt();
    expect(planetAttempt(p, cur, [])).toBe(cur);
    const other = attempt({ id: "att_9", mission_id: "m2" });
    const fetched = attempt({ id: "att_2", status: "ACTIVE" });
    expect(planetAttempt(p, other, [fetched])).toBe(fetched);
    expect(planetAttempt(p, other, [attempt({ status: "COMPLETED" })])).toBeNull();
  });
});

describe("ouverture d'une expédition", () => {
  it("disponible -> ouvrir ; à retenter ou réussie -> reprendre ; verrouillée -> bloquée ; active -> envoyer", () => {
    expect(expeditionStep(planetOf(stateWith("AVAILABLE")), null)).toBe("start");
    expect(expeditionStep(planetOf(stateWith("FAILED")), null)).toBe("retry");
    expect(expeditionStep(planetOf(stateWith("COMPLETED")), null)).toBe("retry");
    expect(expeditionStep(planetOf(stateWith("LOCKED")), null)).toBe("blocked");
    expect(expeditionStep(planetOf(stateWith("ACTIVE")), attempt())).toBe("send");
  });
});

describe("envois impossibles : toujours expliqués", () => {
  const run = (s: GameState, role: string | null, text: string, a: AttemptView | null = null, extra: { maxChars?: number; busyRole?: boolean } = {}) => {
    const planet = planetOf(s);
    const slots = buildAgentSlots({ state: s, planet, attempt: a, trips: [], now: 0, reduced: false });
    return checkDispatch({ planet, attempt: a, slot: slots.find((x) => x.role === role) ?? null, balance: s.balance, text, ...extra });
  };

  it("autorise un envoi valide", () => {
    expect(run(stateWith("AVAILABLE"), "writer", "Trouve 5 restaurants à Lyon").allowed).toBe(true);
  });

  it("planète verrouillée : cause et condition de déblocage", () => {
    const r = run(stateWith("LOCKED"), "writer", "x");
    expect(r.allowed).toBe(false);
    expect(r.reasons[0]).toMatch(/verrouillée/i);
  });

  it("agent non choisi, non acheté, verrouillé", () => {
    const s = stateWith("AVAILABLE");
    expect(run(s, null, "x").reasons).toEqual(["Choisissez d'abord un agent."]);
    expect(run(s, "prospector", "x").reasons.join(" ")).toMatch(/pas encore acheté : 20\u00a0\$/);
    expect(run(s, "researcher", "x").reasons.join(" ")).toMatch(/verrouillé : Réussir M2/);
  });

  it("quota atteint et fonds insuffisants", () => {
    const s = stateWith("ACTIVE", { balance: { booked: 1, reserved: 0, available: 1 } });
    const full = attempt({ roles: [{ role: "writer", owned: true, used: 5, limit: 5, next_cost_max: 2 }] });
    const r = run(s, "writer", "x", full);
    expect(r.reasons.join(" ")).toMatch(/5 instructions de cet agent sont utilisées/);
    expect(r.reasons.join(" ")).toMatch(/Fonds insuffisants : coût maximal 2\u00a0\$, solde disponible 1\u00a0\$/);
  });

  it("texte vide ou trop long, agent déjà en route, évaluation en cours", () => {
    const s = stateWith("ACTIVE");
    expect(run(s, "writer", "  ", attempt()).reasons).toContain("Écrivez la mission de l'agent.");
    expect(run(s, "writer", "a".repeat(11), attempt(), { maxChars: 10 }).reasons.join(" ")).toMatch(/10 caractères maximum/);
    expect(run(s, "writer", "x", attempt(), { busyRole: true }).reasons.join(" ")).toMatch(/déjà en route/);
    const ev = attempt({ status: "EVALUATING", submission: { id: "s", status: "EVALUATING", artifact_version_id: "a", brief_version: 1 } });
    expect(run(stateWith("EVALUATING"), "writer", "x", ev).reasons.join(" ")).toMatch(/en cours d'évaluation/);
  });
});
