/**
 * Client API simulé (mode NEXT_PUBLIC_API_MODE=mock). Il conserve un état minimal en mémoire (persisté dans localStorage) :
 * partie, solde, agents achetés. Il n'implémente PAS les règles économiques réelles ; les seuls contrôles reproduits sont
 * les réponses d'erreur du contrat (rôle verrouillé, fonds). Les recherches du bot sont dans `./searches` ; un lieu s'ouvre
 * quand le précédent a rapporté 3 prospects retenus (maquette de la règle serveur).
 */
import { ApiError, type ActionView, type ApiClient, type GameState, type MutationResult, type RoleId } from "@/lib/api/types";
import { hangarUnlockText } from "@/lib/api/adapt";
import { ERROR_MESSAGE } from "@/lib/format";
import { AGENTS, CONTRACT_VERSION, INITIAL_BALANCE, PLACES, RULES_VERSION } from "./fixtures";
import { resetMockSearches, retainedCount } from "./searches";

const STORE_KEY = "rubix-mock-server-v2";
const UNLOCK_AT = 3;

interface Srv {
  session: { id: string; mode: "beginner" | "expert"; company: string } | null;
  booked: number;
  owned: RoleId[];
}

/** `NEXT_PUBLIC_MOCK_SESSION=1` : le mode simulé démarre avec une partie ouverte (aperçu carte / immeuble sans formulaire). */
const demoSession = (): Srv["session"] => (process.env.NEXT_PUBLIC_MOCK_SESSION === "1" ? { id: "sess_mock", mode: "beginner", company: "Atelier Démo" } : null);
const fresh = (): Srv => ({ session: demoSession(), booked: 0, owned: [] });

let srv: Srv = fresh();
let loaded = false;

function load() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (raw) srv = { ...fresh(), ...(JSON.parse(raw) as Srv) };
  } catch {
    /* stockage indisponible : état en mémoire seulement */
  }
}
function save() {
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(srv));
  } catch {
    /* ignoré */
  }
}
const delay = (ms = 120) => new Promise((r) => setTimeout(r, ms));
const err = (code: keyof typeof ERROR_MESSAGE, message?: string, status = 409) => new ApiError(code, message ?? ERROR_MESSAGE[code], status);

/** Seuils de clients obtenus par niveau de l'immeuble (comme les règles du serveur). */
const LEVEL_AT = [0, 1, 2, 4, 7, 11, 16, 22, 30, 40];
/** Maquette : un lieu qui a rapporté 3 prospects retenus compte pour un client (le vrai compte vient du serveur). */
const clientsNow = () => PLACES.filter((p) => retainedCount(p.id) >= UNLOCK_AT).length;

/** Mode Réel : la condition de clients des rôles payants est levée, comme sur le serveur. */
const waived = (a: { unlock_clients: number | null }) => srv.session?.mode === "expert" && a.unlock_clients !== null;
const unlocked = (a: { unlock_clients: number | null }) => a.unlock_clients === null || waived(a) || clientsNow() >= a.unlock_clients;

function stateView(): GameState {
  const s = srv.session;
  return {
    contract_version: CONTRACT_VERSION,
    session: s ? { id: s.id, mode: s.mode, company: s.company, rules_version: RULES_VERSION } : null,
    simulated_provider: true,
    balance: { booked: srv.booked, reserved: 0, available: srv.booked },
    building: { level: LEVEL_AT.filter((t) => clientsNow() >= t).length, clients_obtained: clientsNow(), next_level_at: LEVEL_AT.find((t) => t > clientsNow()) ?? null },
    agents: AGENTS.map((a) => ({
      role: a.role,
      owned: srv.owned.includes(a.role),
      price: a.price,
      label: a.label,
      section: a.section,
      unlock_clients: a.unlock_clients,
      clients_condition_waived: waived(a),
      unlock_condition: hangarUnlockText({ unlock_clients: a.unlock_clients, unlock_condition: null, clients_condition_waived: waived(a) }),
      unlocked: unlocked(a),
      teaches: a.teaches,
    })),
    planets: PLACES.map((p) => {
      const prev = p.prev === null ? null : PLACES.find((x) => x.id === p.prev);
      const open = !prev || retainedCount(prev.id) >= UNLOCK_AT;
      return {
        id: p.id,
        label: p.label,
        status: open ? ("AVAILABLE" as const) : ("LOCKED" as const),
        reason: open || !prev ? null : `Trouvez d'abord ${UNLOCK_AT} prospects qui correspondent à « ${prev.label} ».`,
      };
    }),
    actions_in_progress: [],
  };
}

function result(): MutationResult {
  save();
  return { state: stateView() };
}

function needSession() {
  load();
  if (!srv.session) throw err("NO_SESSION", undefined, 401);
}

export function createMockClient(): ApiClient {
  return {
    mode: "mock",
    async createSession(input) {
      load();
      await delay();
      const company = input.company.trim();
      if (company.length < 2 || company.length > 60) throw err("VALIDATION", "Le nom de l'entreprise doit faire entre 2 et 60 caractères.", 422);
      srv = fresh();
      resetMockSearches();
      srv.session = { id: "sess_mock", mode: input.mode, company };
      srv.booked = INITIAL_BALANCE;
      srv.owned = ["scout"];
      return result();
    },
    async getState() {
      load();
      await delay(60);
      return srv.session ? stateView() : null;
    },
    async getAction(): Promise<ActionView> {
      needSession();
      throw err("INVALID_STATE", "Action inconnue.", 404);
    },
    async purchaseAgent(role) {
      needSession();
      await delay();
      const ag = AGENTS.find((a) => a.role === role);
      if (!ag) throw err("ROLE_LOCKED");
      if (srv.owned.includes(role)) throw err("INVALID_STATE", "Cet agent est déjà possédé.");
      if (!unlocked(ag)) throw err("ROLE_LOCKED");
      if (ag.price > srv.booked) throw err("INSUFFICIENT_FUNDS");
      srv.booked -= ag.price;
      srv.owned.push(role);
      return result();
    },
    async deleteSession() {
      load();
      srv = fresh();
      resetMockSearches();
      save();
    },
  };
}
