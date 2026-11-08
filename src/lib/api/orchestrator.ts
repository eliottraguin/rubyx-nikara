/**
 * Orchestrateur et amélioration des agents (docs/CONTRACTS-V2.md §1, §2 — tickets C1/C3, PAS ENCORE FUSIONNÉS
 * dans `integration/v2` au moment de ce ticket) :
 * `POST /api/orchestrator/plans`, `GET /api/orchestrator/plans`, `GET /api/orchestrator/plans/{id}`,
 * `POST /api/orchestrator/plans/{id}/confirm`, `POST /api/orchestrator/plans/{id}/reject`,
 * `GET /api/agents/instances`, `POST /api/agents/instances/{id}/improve`, `POST /api/agents/instances/{id}/rollback`.
 *
 * COUCHE D'ADAPTATION UNIQUE : tout écart entre le contrat et l'API livrée se corrige ICI. Les composants ne connaissent
 * que `OrchestratorApi`, `OrchestratorPlan`, `AgentInstance` et `OrchestratorError`. Sorties du modèle (résumé, titres,
 * instructions) : NON FIABLES, rendues en texte seul.
 *
 * Écart signalé (routes non livrées) : `AgentImproveOut` (contrat §1) ne renvoie que `{instance_id, config_version,
 * price_paid, summary}`, pas le texte de la nouvelle configuration. Pour afficher un diff lisible, cette couche relit
 * l'instance (`GET /api/agents/instances`, qui expose `config.instructions`/`config.context_note` en clair, comme
 * `AgentInstanceOut` au §2) juste après l'amélioration, et compare au texte gardé avant l'appel. Diff calculé ici,
 * côté client, à partir de deux textes serveur : aucune donnée n'est inventée.
 */
import type { TaskStatus } from "@/content/assistant";

export type { TaskStatus };
export type PlanStatus = "PROPOSED" | "RUNNING" | "DONE" | "PARTIAL" | "REJECTED";
const PLAN_STATUSES: readonly PlanStatus[] = ["PROPOSED", "RUNNING", "DONE", "PARTIAL", "REJECTED"];
const TASK_STATUSES: readonly TaskStatus[] = ["READY", "BLOCKED", "RUNNING", "DONE", "FAILED"];
export type InstanceStatus = "idle" | "busy" | "traveling" | "disabled";
export type RoleId = "scout" | "triage" | "replier" | "ads";

export interface OrchestratorPlanStep {
  index: number;
  type: string;
  targetId: string;
  targetLabel: string;
  /** Exemplaire d'agent choisi par le serveur, jamais par le modèle. */
  instanceId: string | null;
  role: string;
  tier: number;
  durationEstimateS: number;
  title: string;
  who: string;
  youGet: string;
  instruction: string;
  cost: number;
  blockedReason: string | null;
  status: TaskStatus;
  actionId: string | null;
  resultText: string | null;
  tries: number;
}

export interface PromptEvaluation {
  score: number;
  feedback: string;
}

export interface OrchestratorPlan {
  id: string;
  headline: string;
  banner: string;
  summary: string;
  status: PlanStatus;
  steps: OrchestratorPlanStep[];
  totalCost: number;
  balance: number;
  balanceAfter: number;
  plansLeft: number;
  simule: boolean;
  createdAt: string;
  /** Note de prompt sur le message envoyé ; `null` si le message était vide (rien à noter). */
  evaluation: PromptEvaluation | null;
}

export interface PlanList {
  items: OrchestratorPlan[];
  plansLeft: number;
}

export interface AgentConfigView {
  version: number;
  instructions: string;
  contextNote: string | null;
  tierCap: number;
}

export interface AgentInstance {
  id: string;
  role: RoleId;
  tier: number;
  status: InstanceStatus;
  label: string | null;
  config: AgentConfigView;
  pricePaid: number;
  purchasedAt: string;
}

export interface AgentImproveResult {
  instanceId: string;
  configVersion: number;
  pricePaid: number;
  summary: string;
  /** Instance relue après l'amélioration (texte en clair pour le diff). */
  instance: AgentInstance;
}

export type OrchestratorErrorCode =
  | "MESSAGE_LIMIT"
  | "ROLE_LOCKED"
  | "INVALID_OUTPUT"
  | "INVALID_STATE"
  | "NOT_FOUND"
  | "INVALID_REQUEST"
  | "INSUFFICIENT_FUNDS"
  | "LLM_UNAVAILABLE"
  | "RATE_LIMITED"
  | "SESSION_REQUIRED"
  | "NETWORK"
  | "TIMEOUT"
  | "UNKNOWN";

export class OrchestratorError extends Error {
  constructor(
    readonly code: OrchestratorErrorCode,
    message = "Une erreur est survenue.",
    readonly status = 0,
  ) {
    super(message);
    this.name = "OrchestratorError";
  }
}

export interface ConfirmOptions {
  /** Appelé avec le plan relu pendant que la confirmation s'exécute (état de chaque tâche). */
  onProgress?: (plan: OrchestratorPlan) => void;
}

export interface OrchestratorApi {
  /** Demande un plan (gratuit, rien n'est lancé). Rejette avec `OrchestratorError`. */
  propose(message: string): Promise<OrchestratorPlan>;
  list(): Promise<PlanList>;
  get(id: string): Promise<OrchestratorPlan>;
  /** « Oui, lancer » : attend la fin et renvoie le plan final. Rejette avec `OrchestratorError`. */
  confirm(id: string, opts?: ConfirmOptions): Promise<OrchestratorPlan>;
  /** « Non, annuler » : aucun débit. */
  reject(id: string): Promise<OrchestratorPlan>;
  instances(): Promise<AgentInstance[]>;
  improve(instanceId: string, feedback: string): Promise<AgentImproveResult>;
  rollback(instanceId: string, configVersion: number): Promise<AgentInstance>;
}

// --- Adaptation fil -> modèle d'affichage ---------------------------------------------------------------------------

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const int = (v: unknown, d = 0): number => (typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : d);
const INSTANCE_STATUSES: readonly InstanceStatus[] = ["idle", "busy", "traveling", "disabled"];
const ROLES: readonly RoleId[] = ["scout", "triage", "replier", "ads"];

export function adaptStep(raw: unknown, i: number): OrchestratorPlanStep {
  const w = isObj(raw) ? raw : {};
  const blockedReason = str(w.blocked_reason);
  const s = str(w.status);
  const status: TaskStatus = s && (TASK_STATUSES as readonly string[]).includes(s) ? (s as TaskStatus) : blockedReason ? "BLOCKED" : "READY";
  return {
    index: int(w.index, i),
    type: str(w.type) ?? "",
    targetId: str(w.target_id) ?? "",
    targetLabel: str(w.target_label) ?? "",
    instanceId: str(w.instance_id),
    role: str(w.role) ?? "",
    tier: Math.max(1, int(w.tier, 1)),
    durationEstimateS: Math.max(0, int(w.duration_estimate_s)),
    title: str(w.title) ?? "Une tâche",
    who: str(w.who) ?? "",
    youGet: str(w.you_get) ?? "",
    instruction: str(w.instruction) ?? "",
    cost: Math.max(0, int(w.cost)),
    blockedReason,
    status,
    actionId: str(w.action_id),
    resultText: str(w.result_text),
    tries: Math.max(0, int(w.tries)),
  };
}

function adaptEvaluation(raw: unknown): PromptEvaluation | null {
  if (!isObj(raw)) return null;
  const feedback = str(raw.feedback);
  if (!feedback) return null;
  return { score: Math.max(0, Math.min(100, int(raw.score))), feedback };
}

export function adaptPlan(raw: unknown): OrchestratorPlan {
  const w = isObj(raw) ? raw : {};
  const s = str(w.status);
  const balance = int(w.balance);
  return {
    id: str(w.id) ?? "",
    headline: str(w.headline) ?? "",
    banner: str(w.banner) ?? "",
    summary: str(w.summary) ?? "",
    status: s && (PLAN_STATUSES as readonly string[]).includes(s) ? (s as PlanStatus) : "PROPOSED",
    steps: (Array.isArray(w.steps) ? w.steps : []).map(adaptStep),
    totalCost: Math.max(0, int(w.total_cost)),
    balance,
    balanceAfter: int(w.balance_after, balance),
    plansLeft: Math.max(0, int(w.plans_left)),
    simule: w.simule === true,
    createdAt: str(w.created_at) ?? "",
    evaluation: adaptEvaluation(w.evaluation),
  };
}

export function adaptInstance(raw: unknown): AgentInstance {
  const w = isObj(raw) ? raw : {};
  const role = str(w.role);
  const cfg = isObj(w.config) ? w.config : {};
  const status = str(w.status);
  return {
    id: str(w.id) ?? "",
    role: role && (ROLES as readonly string[]).includes(role) ? (role as RoleId) : "scout",
    tier: Math.max(1, int(w.tier, 1)),
    status: status && (INSTANCE_STATUSES as readonly string[]).includes(status) ? (status as InstanceStatus) : "idle",
    label: str(w.label),
    config: {
      version: Math.max(1, int(cfg.version, 1)),
      instructions: str(cfg.instructions) ?? "",
      contextNote: str(cfg.context_note),
      tierCap: Math.max(1, int(cfg.tier_cap, 1)),
    },
    pricePaid: Math.max(0, int(w.price_paid)),
    purchasedAt: str(w.purchased_at) ?? "",
  };
}

const KNOWN: readonly OrchestratorErrorCode[] = [
  "MESSAGE_LIMIT", "ROLE_LOCKED", "INVALID_OUTPUT", "INVALID_STATE", "NOT_FOUND", "INVALID_REQUEST", "INSUFFICIENT_FUNDS", "LLM_UNAVAILABLE", "RATE_LIMITED", "SESSION_REQUIRED",
];

export function codeFrom(code: unknown, status: number): OrchestratorErrorCode {
  if (typeof code === "string" && (KNOWN as readonly string[]).includes(code)) return code as OrchestratorErrorCode;
  if (code === "VALIDATION") return "INVALID_REQUEST";
  if (status === 401) return "SESSION_REQUIRED";
  if (status === 404) return "NOT_FOUND";
  if (status === 422) return "INVALID_REQUEST";
  if (status === 429) return "RATE_LIMITED";
  if (status === 503) return "LLM_UNAVAILABLE";
  return "UNKNOWN";
}

async function toError(res: Response): Promise<OrchestratorError> {
  let code: unknown;
  let message: string | undefined;
  try {
    const raw = (await res.json()) as { error?: { code?: string; message?: string }; code?: string; message?: string };
    const b = raw.error ?? raw;
    code = b.code;
    if (typeof b.message === "string") message = b.message;
  } catch {
    /* corps non JSON */
  }
  return new OrchestratorError(codeFrom(code, res.status), message, res.status);
}

const newKey = () => globalThis.crypto?.randomUUID?.() ?? `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const enc = encodeURIComponent;

export interface OrchestratorClientOptions {
  fetch?: typeof fetch;
  /** Délai entre deux lectures du plan pendant la confirmation (ms). */
  pollMs?: number;
}

export function createOrchestratorApi(opts: OrchestratorClientOptions = {}): OrchestratorApi {
  const doFetch: typeof fetch = opts.fetch ?? ((...a) => fetch(...a));
  const pollMs = opts.pollMs ?? 1000;
  // Une clé par intention : rejouée tant que le serveur n'a pas répondu, renouvelée ensuite.
  const intents = new Map<string, string>();

  async function send<T>(method: string, path: string, body?: unknown, mutation = false): Promise<T> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const sig = mutation ? `${method} ${path} ${JSON.stringify(body ?? null)}` : "";
    if (mutation) {
      let k = intents.get(sig);
      if (!k) intents.set(sig, (k = newKey()));
      headers["Idempotency-Key"] = k;
    }
    let res: Response;
    try {
      res = await doFetch(`/api${path}`, { method, headers, credentials: "include", cache: "no-store", body: body === undefined ? undefined : JSON.stringify(body) });
    } catch {
      throw new OrchestratorError("NETWORK", "Connexion perdue : le serveur est injoignable.");
    }
    if (mutation) intents.delete(sig);
    if (!res.ok) throw await toError(res);
    return (await res.json()) as T;
  }

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  async function listInstances(): Promise<AgentInstance[]> {
    const w = await send<Json>("GET", "/agents/instances");
    return (Array.isArray(w.items) ? w.items : []).map(adaptInstance);
  }

  return {
    async propose(message) {
      return adaptPlan(await send<Json>("POST", "/orchestrator/plans", { message: message.trim().slice(0, 500) }, true));
    },
    async list() {
      const w = await send<Json>("GET", "/orchestrator/plans");
      return { items: (Array.isArray(w.items) ? w.items : []).map(adaptPlan), plansLeft: Math.max(0, int(w.plans_left)) };
    },
    async get(id) {
      return adaptPlan(await send<Json>("GET", `/orchestrator/plans/${enc(id)}`));
    },
    async confirm(id, o = {}) {
      let done = false;
      const request = send<Json>("POST", `/orchestrator/plans/${enc(id)}/confirm`, {}, true).finally(() => {
        done = true;
      });
      request.catch(() => undefined); // l'erreur est rendue par l'`await` ci-dessous
      const poll = async () => {
        while (!done) {
          await sleep(pollMs);
          if (done) return;
          try {
            const p = adaptPlan(await send<Json>("GET", `/orchestrator/plans/${enc(id)}`));
            if (!done) o.onProgress?.(p);
          } catch {
            /* ignoré : la réponse de la confirmation fait foi */
          }
        }
      };
      void poll();
      return adaptPlan(await request);
    },
    async reject(id) {
      return adaptPlan(await send<Json>("POST", `/orchestrator/plans/${enc(id)}/reject`, {}, true));
    },
    instances: listInstances,
    async improve(instanceId, feedback) {
      const out = await send<Json>("POST", `/agents/instances/${enc(instanceId)}/improve`, { feedback: feedback.trim().slice(0, 500) }, true);
      const instances = await listInstances();
      const instance = instances.find((i) => i.id === instanceId);
      if (!instance) throw new OrchestratorError("NOT_FOUND", undefined, 404);
      return { instanceId: str(out.instance_id) ?? instanceId, configVersion: int(out.config_version, instance.config.version), pricePaid: Math.max(0, int(out.price_paid)), summary: str(out.summary) ?? "Nouvelle version enregistrée.", instance };
    },
    async rollback(instanceId, configVersion) {
      return adaptInstance(await send<Json>("POST", `/agents/instances/${enc(instanceId)}/rollback`, { config_version: configVersion }, true));
    },
  };
}

/** Point d'accès unique côté interface : mock explicite, chargé à la demande. */
export function createOrchestratorApiForMode(): OrchestratorApi {
  if (process.env.NEXT_PUBLIC_API_MODE !== "mock") return createOrchestratorApi();
  let mock: Promise<OrchestratorApi> | null = null;
  const load = () => (mock ??= import("@/mocks/orchestrator").then((m) => m.createMockOrchestratorApi()));
  return {
    propose: async (m) => (await load()).propose(m),
    list: async () => (await load()).list(),
    get: async (id) => (await load()).get(id),
    confirm: async (id, o) => (await load()).confirm(id, o),
    reject: async (id) => (await load()).reject(id),
    instances: async () => (await load()).instances(),
    improve: async (id, f) => (await load()).improve(id, f),
    rollback: async (id, v) => (await load()).rollback(id, v),
  };
}
