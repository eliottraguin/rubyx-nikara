/**
 * Assistants personnels (docs/ASSISTANT.md, API livrée ASSIST-3 et ASSIST-4) :
 * `POST /api/assistant/plans`, `GET /api/assistant/plans`, `GET /api/assistant/plans/{id}`,
 * `POST /api/assistant/plans/{id}/confirm`, `POST /api/assistant/plans/{id}/reject`.
 *
 * COUCHE D'ADAPTATION UNIQUE : tout écart entre le contrat et l'API livrée se corrige ICI. Les composants ne connaissent
 * que `AssistantApi`, `Plan` et `AssistantError`. Le résumé, les libellés de cible et les instructions viennent du modèle
 * ou du carnet : NON FIABLES, à rendre en texte seul.
 */
import type { AssistantId, PlanStatus, TaskStatus } from "@/content/assistant";

export type { AssistantId, PlanStatus, TaskStatus };
export const ASSISTANT_IDS: readonly AssistantId[] = ["assistant_prospection", "assistant_clients", "assistant_pub"];
const PLAN_STATUSES: readonly PlanStatus[] = ["PROPOSED", "RUNNING", "DONE", "PARTIAL", "REJECTED"];
const TASK_STATUSES: readonly TaskStatus[] = ["READY", "BLOCKED", "RUNNING", "DONE", "FAILED"];

export interface PlanStep {
  index: number;
  type: string;
  targetId: string;
  targetLabel: string;
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

export interface Plan {
  id: string;
  assistant: string;
  assistantLabel: string;
  headline: string;
  banner: string;
  summary: string;
  status: PlanStatus;
  steps: PlanStep[];
  totalCost: number;
  balance: number;
  balanceAfter: number;
  plansLeft: number;
  simule: boolean;
  createdAt: string;
}

export interface PlanList {
  items: Plan[];
  plansLeft: number;
}

export type AssistantErrorCode =
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

export class AssistantError extends Error {
  constructor(
    readonly code: AssistantErrorCode,
    message = "Une erreur est survenue.",
    readonly status = 0,
  ) {
    super(message);
    this.name = "AssistantError";
  }
}

export interface ConfirmOptions {
  /** Appelé avec le plan relu pendant que la confirmation s'exécute (état de chaque tâche). */
  onProgress?: (plan: Plan) => void;
}

export interface AssistantApi {
  /** Demande un plan (gratuit, rien n'est lancé). Rejette avec `AssistantError`. */
  propose(assistant: AssistantId, message: string): Promise<Plan>;
  list(): Promise<PlanList>;
  get(id: string): Promise<Plan>;
  /** « Oui, lancer » : attend la fin et renvoie le plan final. Rejette avec `AssistantError`. */
  confirm(id: string, opts?: ConfirmOptions): Promise<Plan>;
  /** « Non, annuler » : aucun débit. */
  reject(id: string): Promise<Plan>;
}

// --- Adaptation fil -> modèle d'affichage ---------------------------------------------------------------------------

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const int = (v: unknown, d = 0): number => (typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : d);

export function adaptStep(raw: unknown, i: number): PlanStep {
  const w = isObj(raw) ? raw : {};
  const blockedReason = str(w.blocked_reason);
  const s = str(w.status);
  const status: TaskStatus = s && (TASK_STATUSES as readonly string[]).includes(s) ? (s as TaskStatus) : blockedReason ? "BLOCKED" : "READY";
  return {
    index: int(w.index, i),
    type: str(w.type) ?? "",
    targetId: str(w.target_id) ?? "",
    targetLabel: str(w.target_label) ?? "",
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

export function adaptPlan(raw: unknown): Plan {
  const w = isObj(raw) ? raw : {};
  const s = str(w.status);
  const balance = int(w.balance);
  return {
    id: str(w.id) ?? "",
    assistant: str(w.assistant) ?? "",
    assistantLabel: str(w.assistant_label) ?? "",
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
  };
}

const KNOWN: readonly AssistantErrorCode[] = [
  "MESSAGE_LIMIT", "ROLE_LOCKED", "INVALID_OUTPUT", "INVALID_STATE", "NOT_FOUND", "INVALID_REQUEST", "INSUFFICIENT_FUNDS", "LLM_UNAVAILABLE", "RATE_LIMITED", "SESSION_REQUIRED",
];

export function codeFrom(code: unknown, status: number): AssistantErrorCode {
  if (typeof code === "string" && (KNOWN as readonly string[]).includes(code)) return code as AssistantErrorCode;
  if (code === "VALIDATION") return "INVALID_REQUEST";
  if (status === 401) return "SESSION_REQUIRED";
  if (status === 404) return "NOT_FOUND";
  if (status === 422) return "INVALID_REQUEST";
  if (status === 429) return "RATE_LIMITED";
  if (status === 503) return "LLM_UNAVAILABLE";
  return "UNKNOWN";
}

async function toError(res: Response): Promise<AssistantError> {
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
  return new AssistantError(codeFrom(code, res.status), message, res.status);
}

const newKey = () => globalThis.crypto?.randomUUID?.() ?? `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const enc = encodeURIComponent;

export interface AssistantClientOptions {
  fetch?: typeof fetch;
  /** Délai entre deux lectures du plan pendant la confirmation (ms). */
  pollMs?: number;
}

export function createAssistantApi(opts: AssistantClientOptions = {}): AssistantApi {
  const doFetch: typeof fetch = opts.fetch ?? ((...a) => fetch(...a));
  const pollMs = opts.pollMs ?? 1000;
  // Une clé par intention : rejouée tant que le serveur n'a pas répondu (un renvoi après coupure ne relance rien),
  // renouvelée ensuite (une nouvelle confirmation retente les tâches en échec).
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
      throw new AssistantError("NETWORK", "Connexion perdue : le serveur est injoignable.");
    }
    if (mutation) intents.delete(sig);
    if (!res.ok) throw await toError(res);
    return (await res.json()) as T;
  }

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  return {
    async propose(assistant, message) {
      return adaptPlan(await send<Json>("POST", "/assistant/plans", { assistant, message: message.trim().slice(0, 500) }, true));
    },
    async list() {
      const w = await send<Json>("GET", "/assistant/plans");
      return { items: (Array.isArray(w.items) ? w.items : []).map(adaptPlan), plansLeft: Math.max(0, int(w.plans_left)) };
    },
    async get(id) {
      return adaptPlan(await send<Json>("GET", `/assistant/plans/${enc(id)}`));
    },
    async confirm(id, o = {}) {
      let done = false;
      const request = send<Json>("POST", `/assistant/plans/${enc(id)}/confirm`, {}, true).finally(() => {
        done = true;
      });
      request.catch(() => undefined); // l'erreur est rendue par l'`await` ci-dessous
      // Pendant que la confirmation s'exécute, on relit le plan pour montrer l'état de chaque tâche. Un échec de lecture est ignoré.
      const poll = async () => {
        while (!done) {
          await sleep(pollMs);
          if (done) return;
          try {
            const p = adaptPlan(await send<Json>("GET", `/assistant/plans/${enc(id)}`));
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
      return adaptPlan(await send<Json>("POST", `/assistant/plans/${enc(id)}/reject`, {}, true));
    },
  };
}

/** Point d'accès unique côté interface : mock explicite, chargé à la demande. */
export function createAssistantApiForMode(): AssistantApi {
  if (process.env.NEXT_PUBLIC_API_MODE !== "mock") return createAssistantApi();
  let mock: Promise<AssistantApi> | null = null;
  const load = () => (mock ??= import("@/mocks/assistant").then((m) => m.createMockAssistantApi()));
  return {
    propose: async (a, m) => (await load()).propose(a, m),
    list: async () => (await load()).list(),
    get: async (id) => (await load()).get(id),
    confirm: async (id, o) => (await load()).confirm(id, o),
    reject: async (id) => (await load()).reject(id),
  };
}
