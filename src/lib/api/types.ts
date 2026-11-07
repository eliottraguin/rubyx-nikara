/**
 * Types du client API. Alignés sur docs/CONTRACTS.md (v0.1) et docs/DATA-MODEL.md.
 * Les champs absents du contrat (forme exacte de l'état, indices, etc.) sont des
 * HYPOTHÈSES documentées dans src/README.md : à confirmer avec BE01/P2.
 * L'interface n'invente jamais solde, score ni droit : tout vient de ces objets.
 */

export type Mode = "beginner" | "expert";
export type RoleId = "writer" | "prospector" | "researcher" | "analyst" | "qa" | "lead";

export type MissionStatus =
  | "LOCKED"
  | "AVAILABLE"
  | "ACTIVE"
  | "EVALUATING"
  | "COMPLETED"
  | "FAILED";
export type AttemptStatus = "AVAILABLE" | "ACTIVE" | "EVALUATING" | "COMPLETED" | "FAILED";
export type ActionStatus =
  | "PENDING"
  | "RESERVED"
  | "RUNNING"
  | "SUCCEEDED"
  | "PARTIAL"
  | "FAILED"
  | "AWAITING_CONFIRMATION";
/** EVALUATION_PENDING = échec technique récupérable (docs/DATA-MODEL.md). */
export type SubmissionStatus = "EVALUATING" | "EVALUATION_PENDING" | "EVALUATED";

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
  stage: number;
  rules_version: string;
}

export interface StageInfo {
  index: number;
  total: number;
  label: string;
}

export interface AgentView {
  role: RoleId;
  owned: boolean;
  price: number;
  /** Condition de déblocage, en texte (ex. « Réussir la commande M1 »). */
  unlock_condition: string;
  /** Débloqué = achetable. */
  unlocked: boolean;
  /** Rôle pédagogique en une phrase. */
  teaches: string;
}

export interface MissionView {
  id: string;
  title: string;
  status: MissionStatus;
  max_reward: number;
  unit_price: number;
  best_payment: number;
  /** Explication textuelle si la commande est indisponible. */
  unavailable_reason?: string;
  /** La mission de secours reste accessible sans argent. */
  is_rescue?: boolean;
}

export interface DiffLine {
  type: "same" | "add" | "remove";
  text: string;
}

export interface BriefVersion {
  version: number;
  text: string;
  /** Présent quand cette version remplace une précédente (événement, clarification). */
  diff?: DiffLine[];
  change_reason?: string;
}

export interface DocumentView {
  id: string;
  title: string;
  /** Date au format ISO (AAAA-MM-JJ). */
  date: string;
  content: string;
}

export interface CriterionView {
  id: string;
  label: string;
  description: string;
  weight: number;
  essential: boolean;
}

export interface ClarificationItem {
  id: string;
  question: string;
  answer: string;
}

export interface RoleQuota {
  role: RoleId;
  owned: boolean;
  used: number;
  limit: number;
  /** Coût maximal annoncé par le serveur pour le prochain envoi à ce rôle. */
  next_cost_max: number;
  /** Message gratuit exceptionnel restant (événement), le cas échéant. */
  free_credit?: number;
}

export interface SourceRef {
  document_id: string;
  title: string;
}

export interface MessageView {
  id: string;
  role: RoleId;
  author: "player" | "agent";
  text: string;
  status: "SENT" | "PENDING" | "FAILED";
  action_id?: string;
  sources?: SourceRef[];
  /** Faits connus vs propositions de l'agent, quand l'API les distingue. */
  known_facts?: string[];
  proposals?: string[];
}

export interface ArtifactVersionView {
  id: string;
  parent_id: string | null;
  author: "agent" | "player";
  role?: RoleId;
  content: string;
  sources: SourceRef[];
  created_at: string;
  number: number;
}

export interface EvaluatorCriterion {
  id: string;
  rating: number;
  evidence: string;
  comment: string;
}

/** Schéma « sortie du client évaluateur » de docs/CONTRACTS.md. */
export interface EvaluatorOutput {
  submission_id: string;
  rubric_version: string;
  out_of_scope: boolean;
  criteria: EvaluatorCriterion[];
  client_feedback: string;
  next_action: string;
}

export interface EvaluationView extends EvaluatorOutput {
  /** Score /100 calculé par le serveur. */
  score: number;
  passed: boolean;
  /** Score plafonné car un critère essentiel n'est pas rempli. */
  capped_by_essential: boolean;
  criteria_labels: Record<string, { label: string; essential: boolean }>;
  payment: {
    max_reward: number;
    target: number;
    already_acquired: number;
    credited: number;
    /** Récompense déjà attribuée pour cette livraison. */
    already_awarded: boolean;
  };
  spent: number;
  coach_note?: string;
}

export interface SubmissionView {
  id: string;
  status: SubmissionStatus;
  artifact_version_id: string;
  brief_version: number;
  evaluation?: EvaluationView;
}

export interface AttemptView {
  id: string;
  mission_id: string;
  mission_title: string;
  attempt_no: number;
  status: AttemptStatus;
  brief: BriefVersion;
  documents: DocumentView[];
  criteria: CriterionView[];
  max_reward: number;
  unit_price: number;
  spend_cap: number | null;
  clarifications: { used: number; max: number; items: ClarificationItem[] };
  roles: RoleQuota[];
  messages: MessageView[];
  artifacts: ArtifactVersionView[];
  submission: SubmissionView | null;
  hints_used: number;
  /** Date d'ouverture de la tentative (ISO), quand le serveur la donne. */
  created_at?: string;
}

export interface PlanStep {
  role: RoleId;
  task: string;
  source_ids?: string[];
  depends_on?: number;
}

/** Schéma « plan du chef d'équipe » de docs/CONTRACTS.md. */
export interface LeadPlan {
  steps: PlanStep[];
  summary: string;
}

export interface ActionView {
  id: string;
  type: "message" | "plan" | "delegation";
  attempt_id: string;
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
  /** Présent quand status = AWAITING_CONFIRMATION. */
  plan?: LeadPlan & { extra_cost_max: number; roles_cost_max: Partial<Record<RoleId, number>> };
}

export interface ObservedSkill {
  label: string;
  /** Action observée qui l'illustre. Jamais de compétence sans trace. */
  evidence: string;
}

export interface Bilan {
  campaign_finished: boolean;
  victory?: boolean;
  summary: string;
  observed: ObservedSkill[];
  results: { mission_id: string; title: string; best_score: number; best_payment: number }[];
}

export interface GameState {
  contract_version: string;
  session: SessionInfo | null;
  /** Fournisseur simulé : badge visible obligatoire. */
  simulated_provider: boolean;
  /** Accès démo protégé ouvert. */
  demo_enabled: boolean;
  balance: Balance;
  stage: StageInfo;
  next_action: string;
  /** Indices disponibles (absent = oui). Faux avec le serveur réel : la route n'existe pas dans le contrat. */
  hints_enabled?: boolean;
  /** Carnet de prompts disponible (absent = oui). Faux tant que `/api/notebook` répond 501. */
  notebook_enabled?: boolean;
  /** Événements de démo proposés (absent = les trois). Le serveur réel n'en accepte qu'une partie. */
  demo_events?: DemoEventId[];
  /** Limites exposées par le serveur quand il les expose (sinon valeurs d'affichage par défaut). */
  limits?: { prompt_max_chars?: number };
  agents: AgentView[];
  missions: MissionView[];
  attempt: AttemptView | null;
  actions_in_progress: ActionView[];
  bilan: Bilan;
}

export interface NotebookEntry {
  id: string;
  title: string;
  prompt: string;
  role: RoleId;
  mission_id: string;
  created_at: string;
}

export interface MutationResult {
  state: GameState;
  action?: ActionView;
}

export interface CreateSessionInput {
  company: string;
  mode: Mode;
}
export interface SendMessageInput {
  role: RoleId;
  text: string;
  document_ids: string[];
  /** Coût maximal affiché au joueur avant confirmation ; le serveur reste maître. */
  max_cost_confirmed: number;
}
export interface SaveArtifactInput {
  parent_id: string | null;
  content: string;
}
export interface SubmitInput {
  artifact_version_id: string;
  brief_version: number;
}
export interface NotebookInput {
  title: string;
  prompt: string;
  role: RoleId;
  mission_id: string;
}
export type DemoEventId = "target_change" | "preview_lead_plan" | "evaluation_outage";

export interface ApiClient {
  readonly mode: "mock" | "http";
  createSession(input: CreateSessionInput): Promise<MutationResult>;
  getState(): Promise<GameState | null>;
  startMission(missionId: string): Promise<MutationResult>;
  retryMission(missionId: string): Promise<MutationResult>;
  sendMessage(attemptId: string, input: SendMessageInput): Promise<MutationResult>;
  getAction(actionId: string): Promise<ActionView>;
  /** Toutes les tentatives (expéditions) d'une commande/planète, de la plus ancienne à la plus récente : historique de la planète. */
  getMissionAttempts(missionId: string): Promise<AttemptView[]>;
  confirmAction(actionId: string): Promise<MutationResult>;
  askClarification(attemptId: string, question: string): Promise<MutationResult>;
  saveArtifact(attemptId: string, input: SaveArtifactInput): Promise<MutationResult>;
  submit(attemptId: string, input: SubmitInput): Promise<MutationResult>;
  purchaseAgent(role: RoleId): Promise<MutationResult>;
  requestHint(attemptId: string, level: 1 | 2): Promise<{ text: string; state: GameState }>;
  listNotebook(): Promise<NotebookEntry[]>;
  saveNotebook(input: NotebookInput): Promise<NotebookEntry[]>;
  demoEvent(eventId: DemoEventId): Promise<MutationResult>;
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
