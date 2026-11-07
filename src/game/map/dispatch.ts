/**
 * Agents d'une planète et envoi d'un agent (pur). Le serveur reste maître : prix, quotas, droits et solde viennent de
 * /state et de la tentative ; ici on les PRÉSENTE et on explique les envois impossibles (jamais masqués).
 */
import { ROLE_LABEL, money } from "@/lib/format";
import { DEFAULT_MESSAGE_LIMIT, DEFAULT_PROMPT_MAX_CHARS } from "@/lib/send-rules";
import type { AttemptView, GameState, RoleId } from "@/lib/api/types";
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
  /** Instructions utilisées sur l'expédition de cette planète (0 si aucune). */
  used: number;
  limit: number;
  remaining: number;
  /** Coût maximal de la prochaine instruction (0 si message gratuit). */
  costMax: number;
  free: boolean;
  /** Phase du voyage visuel en cours, le cas échéant. */
  phase: TripPhase | null;
  /** État en texte (jamais la couleur seule). */
  stateLabel: string;
}

/** Tentative d'une planète : la tentative courante si elle appartient à la planète, sinon la dernière active récupérée. */
export function planetAttempt(planet: PlanetVM, current: AttemptView | null | undefined, fetched: readonly AttemptView[]): AttemptView | null {
  if (!planet.missionId) return null;
  if (current && current.mission_id === planet.missionId) return current;
  const active = [...fetched].reverse().find((a) => a.status === "ACTIVE" || a.status === "EVALUATING");
  return active ?? null;
}

export function buildAgentSlots(opts: {
  state: GameState;
  planet: PlanetVM;
  attempt: AttemptView | null;
  trips: readonly Trip[];
  now: number;
  reduced: boolean;
}): AgentSlot[] {
  const { state, planet, attempt, trips, now, reduced } = opts;
  const slots = state.agents.map<AgentSlot>((ag) => {
    const quota = attempt?.roles.find((r) => r.role === ag.role);
    const used = quota?.used ?? 0;
    const limit = quota?.limit ?? DEFAULT_MESSAGE_LIMIT;
    const trip = trips.find((t) => t.planetId === planet.id && t.role === ag.role);
    const phase = trip ? tripFrame(trip, now, reduced).phase : null;
    const activePhase = phase && phase !== "home" ? phase : null;
    const free = !!quota?.free_credit;
    const costMax = free ? 0 : (quota?.next_cost_max ?? planet.unitPrice ?? 0);
    let kind: SlotKind;
    if (!ag.owned) kind = ag.unlocked ? "buyable" : "locked";
    else if (used > 0 || activePhase) kind = "sent";
    else kind = "home";
    let stateLabel: string;
    if (activePhase) stateLabel = TRIP_PHASE_SHORT[activePhase];
    else if (kind === "sent") stateLabel = "Rentré à la base";
    else if (kind === "home") stateLabel = "Au hangar";
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
      used,
      limit,
      remaining: Math.max(0, limit - used),
      costMax,
      free,
      phase: activePhase,
      stateLabel,
    };
  });
  const rank: Record<SlotKind, number> = { sent: 0, home: 1, buyable: 2, locked: 3 };
  return slots.sort((a, b) => rank[a.kind] - rank[b.kind]);
}

/** Étape à franchir avant la première instruction : ouvrir l'expédition (disponible) ou la reprendre (réussie / à retenter). */
export function expeditionStep(planet: PlanetVM, attempt: AttemptView | null): "send" | "start" | "retry" | "blocked" {
  if (attempt && attempt.status === "ACTIVE") return "send";
  switch (planet.missionStatus) {
    case "AVAILABLE":
      return "start";
    case "FAILED":
    case "COMPLETED":
      return "retry";
    case "ACTIVE":
      return "send";
    default:
      return "blocked";
  }
}

export interface DispatchCheck {
  allowed: boolean;
  reasons: string[];
}

/** Prévérification d'affichage de l'envoi : explique la cause de chaque blocage. Le serveur garde le dernier mot. */
export function checkDispatch(opts: {
  planet: PlanetVM;
  attempt: AttemptView | null;
  slot: AgentSlot | null;
  balance: GameState["balance"];
  text: string;
  maxChars?: number;
  busyRole?: boolean;
}): DispatchCheck {
  const { planet, attempt, slot, balance, text } = opts;
  const reasons: string[] = [];
  if (planet.status === "locked") {
    reasons.push(`Planète verrouillée : ${planet.unlockText}`);
    return { allowed: false, reasons };
  }
  if (!slot) {
    reasons.push("Choisissez d'abord un agent.");
    return { allowed: false, reasons };
  }
  const step = expeditionStep(planet, attempt);
  if (attempt?.status === "EVALUATING" || planet.missionStatus === "EVALUATING" || attempt?.submission?.status === "EVALUATING")
    reasons.push("Le rapport de cette planète est en cours d'évaluation : attendez le résultat avant d'envoyer un agent.");
  else if (step === "blocked") reasons.push("Cette planète n'est pas ouvrable pour le moment.");
  if (slot.kind === "buyable") reasons.push(`${slot.label} n'est pas encore acheté : ${money(slot.price)} (voir le hangar de la base).`);
  if (slot.kind === "locked") reasons.push(`${slot.label} est verrouillé : ${slot.unlockCondition}.`);
  if (slot.owned && slot.remaining <= 0)
    reasons.push(`Les ${slot.limit} instructions de cet agent sont utilisées pour cette expédition. Vous pouvez livrer le résultat ou en lancer une nouvelle.`);
  if (slot.owned && slot.costMax > balance.available)
    reasons.push(`Fonds insuffisants : coût maximal ${money(slot.costMax)}, solde disponible ${money(balance.available)}.`);
  if (opts.busyRole) reasons.push("Cet agent est déjà en route : attendez son retour.");
  if (text.trim().length === 0) reasons.push("Écrivez la mission de l'agent.");
  const max = opts.maxChars ?? DEFAULT_PROMPT_MAX_CHARS;
  if (text.length > max) reasons.push(`Mission trop longue (${max} caractères maximum).`);
  return { allowed: reasons.length === 0, reasons };
}

/** Pourquoi un agent ne peut pas être acheté maintenant (null = achat possible). Le serveur reste maître. */
export function agentBlocker(agent: Pick<AgentSlot, "owned" | "unlocked" | "unlockCondition" | "price">, available: number): string | null {
  if (agent.owned) return "Déjà possédé.";
  if (!agent.unlocked) return `Verrouillé : ${agent.unlockCondition}.`;
  if (agent.price > available) return `Fonds insuffisants : prix ${money(agent.price)}, solde disponible ${money(available)}.`;
  return null;
}
