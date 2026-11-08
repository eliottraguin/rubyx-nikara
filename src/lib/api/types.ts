/**
 * Types du client API. Alignés sur docs/CONTRACTS.md (v0.1) et docs/DATA-MODEL.md.
 * Les champs absents du contrat (forme exacte de l'état, indices, etc.) sont des
 * HYPOTHÈSES documentées dans src/README.md : à confirmer avec BE01/P2.
 * L'interface n'invente jamais solde, score ni droit : tout vient de ces objets.
 */

export type Mode = "beginner" | "expert";
export type RoleId = "scout" | "triage" | "replier" | "ads";

export type ActionStatus =
  | "PENDING"
  | "RESERVED"
  | "RUNNING"
  | "SUCCEEDED"
  | "PARTIAL"
  | "FAILED"
  | "AWAITING_CONFIRMATION";
/** Codes d'erreur stables (docs/CONTRACTS.md) + codes locaux du client. */
export type ErrorCode =
  | "INSUFFICIENT_FUNDS"
  | "MESSAGE_LIMIT"
  | "ROLE_LOCKED"
  | "INVALID_STATE"
  | "VERSION_CONFLICT"
  | "INVALID_OUTPUT"
  | "LLM_UNAVAILABLE"
  | "VALIDATION"
  | "RATE_LIMITED"
  | "NO_SESSION"
  | "NOT_FOUND"
  | "NOT_IMPLEMENTED"
  | "INTERNAL_ERROR"
  | "NETWORK"
  | "UNKNOWN";

export interface Balance {
  /** Solde comptabilisé. */
  booked: number;
  /** Réservations actives. */
  reserved: number;
  /** Solde disponible = comptabilisé − réservations. Seule valeur à afficher comme « disponible ». */
  available: number;
}

export interface SessionInfo {
  id: string;
  mode: Mode;
  company: string;
  rules_version: string;
}

export type AgentSection = "prospection" | "clients" | "pub";

export interface AgentView {
  role: RoleId;
  /** Libellé français donné par le serveur (hangar) ; sinon `ROLE_LABEL`. */
  label?: string;
  /** Section du produit où le rôle travaille (hangar). */
  section?: AgentSection;
  /** Mode Réel : la condition de clients est levée (hangar). */
  clients_condition_waived?: boolean;
  /** Nombre de clients obtenus qui débloque le rôle ; null = disponible d'emblée. */
  unlock_clients?: number | null;
  owned: boolean;
  price: number;
  /** Condition de déblocage, en texte (ex. « Obtenez 2 clients pour débloquer ce rédacteur »). */
  unlock_condition: string;
  /** Débloqué = achetable. */
  unlocked: boolean;
  /** Rôle pédagogique en une phrase. */
  teaches: string;
}

/**
 * Lieu de la ville (ex-planète) : ouvert ou verrouillé, décidé par le serveur (`GET /api/state`, `planets`). La raison est
 * une phrase simple pour le joueur (« Trouvez d'abord 3 prospects qui correspondent à Annuaire »).
 */
export interface PlaceStateView {
  /** Identifiant technique (`annuaire`, `registre`, `carte-locale`…). */
  id: string;
  label: string;
  status: "AVAILABLE" | "LOCKED";
  reason: string | null;
}

export interface ActionView {
  id: string;
  /** Type d'action du serveur (`search`, `prospect_profile`, `prospect_message`, `ad_campaign`…). */
  type: string;
  /** Lieu de la recherche (voyage du bot) quand l'action est une recherche lancée depuis ce navigateur. */
  planet_id?: string;
  role: RoleId;
  status: ActionStatus;
  /** Étape en cours, en texte (« Le rédacteur prépare sa réponse »). */
  progress_label?: string;
  /** Vrai quand l'attente dépasse la normale (réponse longue). */
  slow?: boolean;
  reserved: number;
  debited: number;
  partial_result?: string;
  error?: { code: ErrorCode; message: string };
}

/**
 * Immeuble du joueur : niveau et clients obtenus, CALCULÉS PAR LE SERVEUR (`GET /api/state`, contrat additif).
 * Purement cosmétique : ne débloque aucun droit. Le navigateur ne le choisit jamais.
 */
export interface BuildingState {
  /** 1 à 10. */
  level: number;
  /** Clients obtenus (prospects devenus clients et payés). */
  clients_obtained: number;
  /** Nombre de clients obtenus qui ouvre le niveau suivant ; null au dernier niveau. */
  next_level_at: number | null;
}

export interface GameState {
  contract_version: string;
  session: SessionInfo | null;
  /** Fournisseur simulé : badge visible obligatoire. */
  simulated_provider: boolean;
  balance: Balance;
  /** Immeuble du joueur (absent tant que l'API ne le renvoie pas : niveau 1 par défaut côté interface). */
  building?: BuildingState;
  agents: AgentView[];
  /** Lieux de la ville : ouverts ou verrouillés (avec la raison), calculés par le serveur. */
  planets: PlaceStateView[];
  actions_in_progress: ActionView[];
}

export interface MutationResult {
  state: GameState;
  action?: ActionView;
}

export interface CreateSessionInput {
  company: string;
  mode: Mode;
}
export interface ApiClient {
  readonly mode: "mock" | "http";
  createSession(input: CreateSessionInput): Promise<MutationResult>;
  getState(): Promise<GameState | null>;
  getAction(actionId: string): Promise<ActionView>;
  purchaseAgent(role: RoleId): Promise<MutationResult>;
  deleteSession(): Promise<void>;
}

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  constructor(code: ErrorCode, message: string, status = 0) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}
