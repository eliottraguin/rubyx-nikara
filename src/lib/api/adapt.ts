/**
 * Adaptateur API réelle → modèle d'affichage du front.
 *
 * Le serveur (api/app/schemas/, api/openapi.json) fait foi : ses formes diffèrent de celles de la maquette
 * (`GameState` à plat, erreurs `{ error: { code, message } }`…). L'ancien moteur d'expédition (missions, tentatives,
 * livrables) est retiré : l'état ne porte plus que le hangar, les lieux, l'immeuble et les clients obtenus.
 * Tout ce qui est calculé ici est de l'AFFICHAGE : solde, prix, quotas et droits viennent toujours du serveur.
 * Fonctions pures, sans réseau : testées dans http.test.ts.
 */
import { ROLE_LABEL } from "../format";
import type { ActionStatus, ActionView, AgentView, BuildingState, ErrorCode, GameState, Mode, PlaceStateView, RoleId } from "./types";

// --- Formes du serveur (sous-ensemble utilisé) --------------------------------------------------------------------

export interface WireHangarAgent {
  role: RoleId;
  label: string;
  section: "prospection" | "clients" | "pub";
  price: number;
  owned: boolean;
  unlock_clients: number | null;
  unlock_condition: string | null;
  clients_condition_waived: boolean;
  unlocked: boolean;
}

export interface WireState {
  session: {
    id: string;
    mode: Mode;
    company: { name: string; profile: string | null };
    rules_version: string;
  };
  balance: { booked: number; reserved: number; available: number };
  /** Hangar du cap prospection : rôles, prix et déblocage décidés par le serveur. */
  hangar: WireHangarAgent[];
  /** Lieux de la ville : ouverts ou verrouillés, avec la raison (calculés par le serveur). */
  planets?: { id: string; label: string; status: "AVAILABLE" | "LOCKED"; reason?: string | null }[];
  active_actions: unknown[];
  /** Additif (API-Q1) : absent tant que le serveur ne le renvoie pas. */
  building?: { level?: number; clients_obtained?: number; next_level_at?: number | null } | null;
  clients_obtained?: number;
  llm: { provider: string; simulated: boolean };
  contracts_version: string;
}

export interface WireAction {
  id: string;
  type: string;
  status: ActionStatus;
  steps: { index: number; kind: string; role: string | null; status: string; cost: number }[];
  error: { code?: string; message?: string } | null;
  debited: number;
  reservations: { amount: number; status: string }[];
}

// --- Erreurs --------------------------------------------------------------------------------------------------------

/** Les 14 codes émis par api/app/errors.py. */
export const API_ERROR_CODES = [
  "INSUFFICIENT_FUNDS",
  "MESSAGE_LIMIT",
  "ROLE_LOCKED",
  "INVALID_STATE",
  "VERSION_CONFLICT",
  "INVALID_OUTPUT",
  "LLM_UNAVAILABLE",
  "INVALID_REQUEST",
  "RATE_LIMITED",
  "SESSION_REQUIRED",
  "INVALID_CREDENTIALS",
  "NOT_FOUND",
  "NOT_IMPLEMENTED",
  "INTERNAL_ERROR",
] as const;

/** Code du serveur → code du front (le front garde VALIDATION et NO_SESSION). */
export function mapErrorCode(code: string | undefined): ErrorCode | null {
  if (!code || !(API_ERROR_CODES as readonly string[]).includes(code)) return null;
  if (code === "INVALID_REQUEST") return "VALIDATION";
  if (code === "SESSION_REQUIRED") return "NO_SESSION";
  return code as ErrorCode;
}

// --- Libellés d'affichage -------------------------------------------------------------------------------------------

const ROLE_TEACHES: Record<RoleId, string> = {
  scout: "Chercher des prospects vérifiables à partir de votre fiche entreprise et cible.",
  triage: "Trier les messages reçus des prospects du carnet.",
  replier: "Rédiger des brouillons de réponse, que vous relisez avant tout envoi.",
  ads: "Préparer des contenus de pub prêts à publier, sans rien publier.",
};

/** Condition de déblocage d'un rôle du hangar, en texte clair (le serveur décide ; ceci n'est que l'affichage). */
export function hangarUnlockText(h: Pick<WireHangarAgent, "unlock_clients" | "unlock_condition" | "clients_condition_waived">): string {
  if (h.unlock_clients === null || h.unlock_clients === undefined) return "Disponible dès le départ";
  if (h.clients_condition_waived) return "Mode Réel : aucun client à obtenir au préalable";
  if (h.unlock_condition) return h.unlock_condition;
  return `Obtenez ${h.unlock_clients} client${h.unlock_clients > 1 ? "s" : ""} pour débloquer cet agent`;
}

/** Progression vers un déblocage : « 1 client sur 2 ». */
export function clientsProgressText(obtained: number, required: number): string {
  const n = Math.max(0, Math.min(obtained, required));
  return `${n} client${n > 1 ? "s" : ""} sur ${required}`;
}

// --- Actions --------------------------------------------------------------------------------------------------------

export function mapAction(w: WireAction): ActionView {
  const stepRole = (w.steps.find((s) => s.role)?.role ?? "scout") as RoleId;
  const running = w.steps.find((s) => s.status === "RUNNING" || s.status === "PENDING");
  const active = w.status === "PENDING" || w.status === "RESERVED" || w.status === "RUNNING";
  const code = mapErrorCode(w.error?.code ?? undefined) ?? (w.error ? "UNKNOWN" : null);
  const view: ActionView = {
    id: w.id,
    type: w.type,
    role: stepRole,
    status: w.status,
    reserved: w.reservations.filter((r) => r.status === "RESERVED").reduce((n, r) => n + r.amount, 0),
    debited: w.debited,
  };
  if (active) {
    const role = (running?.role ?? stepRole) as RoleId;
    view.progress_label = `${ROLE_LABEL[role] ?? "L'agent"} prépare sa réponse`;
  }
  if (w.error && code) view.error = { code, message: w.error.message ?? "" };
  return view;
}

// --- État -----------------------------------------------------------------------------------------------------------

export interface StateContext {
  /** Actions ouvertes (mutations en cours), déjà adaptées. */
  actions: ActionView[];
}

/** Lieux de la ville lus dans /state (absents tant que le serveur ne les renvoie pas : liste vide, carte « verrouillée »). */
export function mapPlaces(p: WireState["planets"]): PlaceStateView[] {
  return (p ?? []).map((x) => ({ id: x.id, label: x.label, status: x.status, reason: x.reason ?? null }));
}

/** Immeuble lu dans /state ; niveau 1 par défaut tant que l'API ne le renvoie pas ou si la valeur est invalide. */
export function mapBuilding(b: WireState["building"]): BuildingState {
  const int = (v: unknown, min: number, max: number, dflt: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.floor(v))) : dflt);
  const level = int(b?.level, 1, 10, 1);
  const next = b?.next_level_at;
  return {
    level,
    clients_obtained: int(b?.clients_obtained, 0, Number.MAX_SAFE_INTEGER, 0),
    next_level_at: level >= 10 ? null : typeof next === "number" && Number.isFinite(next) ? Math.max(0, Math.floor(next)) : null,
  };
}

export function mapState(w: WireState, ctx: StateContext): GameState {
  const agents: AgentView[] = w.hangar.map((h) => ({
    role: h.role,
    label: h.label,
    section: h.section,
    owned: h.owned,
    price: h.price,
    unlock_condition: hangarUnlockText(h),
    unlock_clients: h.unlock_clients,
    clients_condition_waived: h.clients_condition_waived,
    unlocked: h.unlocked,
    teaches: ROLE_TEACHES[h.role],
  }));
  return {
    contract_version: w.contracts_version,
    session: { id: w.session.id, mode: w.session.mode, company: w.session.company.name, rules_version: w.session.rules_version },
    simulated_provider: w.llm.simulated,
    balance: w.balance,
    building: mapBuilding(w.building),
    agents,
    planets: mapPlaces(w.planets),
    actions_in_progress: ctx.actions,
  };
}
