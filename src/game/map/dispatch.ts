/**
 * Agents d'un lieu (ex-planète) (pur). Le serveur reste maître : prix, droits et solde viennent de /state ; ici on les
 * PRÉSENTE et on explique les achats impossibles (jamais masqués). Plus de quota par expédition : la recherche est libre.
 */
import { ROLE_LABEL, money } from "@/lib/format";
import type { GameState, RoleId } from "@/lib/api/types";
import { TRIP_PHASE_SHORT, tripFrame, type Trip, type TripPhase } from "./trips";
import type { PlanetVM } from "./viewmodel";

export type SlotKind = "sent" | "home" | "buyable" | "locked";

export interface AgentSlot {
  role: RoleId;
  label: string;
  teaches: string;
  owned: boolean;
  unlocked: boolean;
  price: number;
  unlockCondition: string;
  kind: SlotKind;
  /** Phase du voyage visuel en cours, le cas échéant. */
  phase: TripPhase | null;
  /** État en texte (jamais la couleur seule). */
  stateLabel: string;
}

export function buildAgentSlots(opts: {
  state: GameState;
  planet: PlanetVM;
  trips: readonly Trip[];
  now: number;
  reduced: boolean;
}): AgentSlot[] {
  const { state, planet, trips, now, reduced } = opts;
  const slots = state.agents.map<AgentSlot>((ag) => {
    const trip = trips.find((t) => t.planetId === planet.id && t.role === ag.role);
    const phase = trip ? tripFrame(trip, now, reduced).phase : null;
    const failed = phase === "failed";
    const activePhase = phase && phase !== "home" && !failed ? phase : null;
    let kind: SlotKind;
    if (!ag.owned) kind = ag.unlocked ? "buyable" : "locked";
    else if (activePhase || failed) kind = "sent";
    else kind = "home";
    let stateLabel: string;
    if (activePhase) stateLabel = TRIP_PHASE_SHORT[activePhase];
    else if (failed) stateLabel = TRIP_PHASE_SHORT.failed;
    else if (kind === "sent") stateLabel = "Rentré au garage";
    else if (kind === "home") stateLabel = "Au garage";
    else if (kind === "buyable") stateLabel = "À acheter";
    else stateLabel = "Verrouillé";
    return {
      role: ag.role,
      label: ROLE_LABEL[ag.role] ?? ag.role,
      teaches: ag.teaches,
      owned: ag.owned,
      unlocked: ag.unlocked,
      price: ag.price,
      unlockCondition: ag.unlock_condition,
      kind,
      phase: activePhase,
      stateLabel,
    };
  });
  const rank: Record<SlotKind, number> = { sent: 0, home: 1, buyable: 2, locked: 3 };
  return slots.sort((a, b) => rank[a.kind] - rank[b.kind]);
}

/** Pourquoi un agent ne peut pas être acheté maintenant (null = achat possible). Le serveur reste maître. */
export function agentBlocker(agent: Pick<AgentSlot, "owned" | "unlocked" | "unlockCondition" | "price">, available: number): string | null {
  if (agent.owned) return "Déjà possédé.";
  if (!agent.unlocked) return `Verrouillé : ${agent.unlockCondition}.`;
  if (agent.price > available) return `Fonds insuffisants : prix ${money(agent.price)}, solde disponible ${money(available)}.`;
  return null;
}
