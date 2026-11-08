import { describe, expect, it } from "vitest";
import type { AgentView, GameState } from "@/lib/api/types";
import { agentBlocker, buildAgentSlots } from "./dispatch";
import { TIMING, type Trip } from "./trips";
import { buildMapViewModel } from "./viewmodel";

const agents: AgentView[] = [
  { role: "scout", owned: true, price: 0, unlock_condition: "Disponible dès le départ", unlocked: true, teaches: "t" },
  { role: "triage", owned: false, price: 20, unlock_condition: "Réussir M1", unlocked: true, teaches: "t" },
  { role: "replier", owned: false, price: 35, unlock_condition: "Réussir M2", unlocked: false, teaches: "t" },
];

function stateWith(status: "AVAILABLE" | "LOCKED", over: Partial<GameState> = {}): GameState {
  return {
    contract_version: "0.1",
    session: { id: "s", mode: "beginner", company: "Test", rules_version: "r" },
    simulated_provider: true,
    balance: { booked: 30, reserved: 0, available: 30 },
    agents,
    planets: [{ id: "annuaire", label: "Annuaire", status, reason: null }],
    actions_in_progress: [], ...over,
  };
}
const planetOf = (s: GameState) => buildMapViewModel(s).planets[0]!;

describe("agents d'un lieu", () => {
  it("sans voyage : l'agent possédé est au garage, les autres sont à acheter ou verrouillés", () => {
    const s = stateWith("AVAILABLE");
    const slots = buildAgentSlots({ state: s, planet: planetOf(s), trips: [], now: 0, reduced: false });
    expect(slots.find((x) => x.role === "scout")).toMatchObject({ kind: "home", phase: null, stateLabel: "Au garage" });
    expect(slots.map((x) => x.kind)).toEqual(["home", "buyable", "locked"]);
    expect(slots.some((x) => "used" in x || "limit" in x || "costMax" in x)).toBe(false); // plus de quota par expédition
  });

  it("l'état en route / sur place / retour suit le voyage visuel", () => {
    const s = stateWith("AVAILABLE");
    const trip: Trip = { id: "t", planetId: "annuaire", role: "scout", startedAt: 1000, doneAt: null };
    const at = (now: number) => buildAgentSlots({ state: s, planet: planetOf(s), trips: [trip], now, reduced: false }).find((x) => x.role === "scout")!;
    expect(at(1000).stateLabel).toBe("En route");
    expect(at(1000 + TIMING.outbound + 1).stateLabel).toBe("Sur place");
    expect(at(1000 + TIMING.outbound + 1).phase).toBe("dialogue");
  });
});

describe("achat d'un agent : toujours expliqué", () => {
  it("déjà possédé, verrouillé, fonds insuffisants, achetable", () => {
    const s = stateWith("AVAILABLE");
    const slots = buildAgentSlots({ state: s, planet: planetOf(s), trips: [], now: 0, reduced: false });
    const by = (r: string) => slots.find((x) => x.role === r)!;
    expect(agentBlocker(by("scout"), 30)).toMatch(/Déjà possédé/);
    expect(agentBlocker(by("replier"), 30)).toMatch(/Verrouillé : Réussir M2/);
    expect(agentBlocker(by("triage"), 10)).toMatch(/Fonds insuffisants/);
    expect(agentBlocker(by("triage"), 30)).toBeNull();
  });
});
