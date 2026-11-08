/**
 * Boutique et instances d'agents (ticket GR3-67, contrat docs/CONTRACTS-V2.md §2 et §8, ticket backend C2/GR3-54).
 * COUCHE D'ADAPTATION UNIQUE pour cette fonctionnalité : les composants ne connaissent que `ShopApi`, `ShopCatalog`,
 * `AgentInstance` et `ShopError`. Tout écart entre le contrat et l'API livrée se corrige ici, pas dans les composants.
 *
 * Formes du contrat consommées :
 *  - `GET /api/shop` → `ShopOut {items: [ShopItemOut…], owned_counts}`.
 *  - `POST /api/shop/purchase` corps `{item_id}` → 201 `AgentInstanceOut`.
 *  - `GET /api/agents/instances` → `{items: [AgentInstanceOut…]}`.
 *  - `PATCH /api/agents/instances/{id}` corps `{label}` → 200 `AgentInstanceOut`.
 *
 * Ce ticket n'implémente aucune route serveur : tant que C2 n'est pas fusionné dans `integration/v2`, ces routes
 * répondent 404 en mode http ; `createShopApiForMode` bascule alors automatiquement sur le mock typé.
 */
import type { RoleId } from "./types";

export type AgentInstanceStatus = "idle" | "busy" | "traveling" | "disabled";

export interface ShopEffects {
  durationMultiplier: number;
  qualityBonus: number;
}

export interface ShopItem {
  id: string;
  role: RoleId;
  tier: number;
  label: string;
  price: number;
  effects: ShopEffects;
  /** Nombre de clients obtenus requis ; null = seul le prix compte. */
  unlockClients: number | null;
  /** Condition de clients de CET article remplie (indépendant du verrouillage du rôle). */
  unlocked: boolean;
  /** Achetable maintenant (rôle débloqué, article débloqué, limite d'instances non atteinte). */
  buyable: boolean;
}

export interface ShopCatalog {
  items: ShopItem[];
  ownedCounts: Record<RoleId, number>;
}

export interface AgentConfig {
  version: number;
  instructions: string;
  contextNote: string | null;
  tools: string[];
  tierCap: number;
}

export interface AgentInstance {
  id: string;
  role: RoleId;
  tier: number;
  status: AgentInstanceStatus;
  label: string | null;
  config: AgentConfig;
  pricePaid: number;
  purchasedAt: string | null;
}

export type ShopErrorCode =
  | "ROLE_LOCKED"
  | "INSUFFICIENT_FUNDS"
  | "INSTANCE_LIMIT"
  | "NOT_FOUND"
  | "INVALID_REQUEST"
  | "RATE_LIMITED"
  | "SESSION_REQUIRED"
  | "NETWORK"
  | "UNKNOWN";

const KNOWN: readonly string[] = ["ROLE_LOCKED", "INSUFFICIENT_FUNDS", "INSTANCE_LIMIT", "NOT_FOUND", "INVALID_REQUEST", "RATE_LIMITED", "SESSION_REQUIRED"];

export class ShopError extends Error {
  constructor(
    readonly code: ShopErrorCode,
    message = "Une erreur est survenue.",
    readonly status = 0,
  ) {
    super(message);
    this.name = "ShopError";
  }
}

export function codeFrom(code: unknown, status: number): ShopErrorCode {
  if (typeof code === "string" && KNOWN.includes(code)) return code as ShopErrorCode;
  if (code === "VALIDATION") return "INVALID_REQUEST";
  if (status === 401) return "SESSION_REQUIRED";
  if (status === 404) return "NOT_FOUND";
  if (status === 409) return "INVALID_REQUEST";
  if (status === 422) return "INVALID_REQUEST";
  if (status === 429) return "RATE_LIMITED";
  return "UNKNOWN";
}

/** Messages français par défaut (le serveur peut en fournir un plus précis). */
export const SHOP_ERROR_MESSAGE: Record<ShopErrorCode, string> = {
  ROLE_LOCKED: "Ce métier n'est pas encore débloqué.",
  INSUFFICIENT_FUNDS: "Solde insuffisant pour cet achat. Rien n'a été débité.",
  INSTANCE_LIMIT: "Vous possédez déjà le nombre maximal d'exemplaires pour ce métier.",
  NOT_FOUND: "Cet article n'existe plus.",
  INVALID_REQUEST: "Cette demande n'est pas valide.",
  RATE_LIMITED: "Trop de demandes : patientez un instant.",
  SESSION_REQUIRED: "Aucune partie en cours.",
  NETWORK: "Connexion perdue : le serveur est injoignable.",
  UNKNOWN: "Une erreur inattendue est survenue.",
};
export function shopErrorMessage(e: unknown): string {
  if (e instanceof ShopError) return e.message || SHOP_ERROR_MESSAGE[e.code];
  return SHOP_ERROR_MESSAGE.UNKNOWN;
}

export interface ShopApi {
  getCatalog(): Promise<ShopCatalog>;
  listInstances(): Promise<AgentInstance[]>;
  purchase(itemId: string): Promise<AgentInstance>;
  rename(instanceId: string, label: string): Promise<AgentInstance>;
}

// --- Adaptation (forme du serveur → modèle d'affichage) --------------------------------------------------------------

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const num = (v: unknown, d = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : d);
const ROLES: readonly RoleId[] = ["scout", "triage", "replier", "ads"];
const isRole = (v: unknown): v is RoleId => typeof v === "string" && (ROLES as readonly string[]).includes(v);
const isStatus = (v: unknown): v is AgentInstanceStatus => v === "idle" || v === "busy" || v === "traveling" || v === "disabled";

function adaptItem(raw: unknown): ShopItem | null {
  if (!isObj(raw)) return null;
  const id = str(raw.id);
  if (!id || !isRole(raw.role)) return null;
  const effects = isObj(raw.effects) ? raw.effects : {};
  return {
    id,
    role: raw.role,
    tier: num(raw.tier, 1),
    label: str(raw.label) ?? id,
    price: num(raw.price, 0),
    effects: { durationMultiplier: num(effects.duration_multiplier, 1), qualityBonus: num(effects.quality_bonus, 0) },
    unlockClients: typeof raw.unlock_clients === "number" ? raw.unlock_clients : null,
    unlocked: raw.unlocked === true,
    buyable: raw.buyable === true,
  };
}

function adaptCatalog(raw: unknown): ShopCatalog {
  const w = isObj(raw) ? raw : {};
  const items = (Array.isArray(w.items) ? w.items : []).map(adaptItem).filter((x): x is ShopItem => x !== null);
  const owned = isObj(w.owned_counts) ? w.owned_counts : {};
  const ownedCounts = Object.fromEntries(ROLES.map((r) => [r, num(owned[r], 0)])) as Record<RoleId, number>;
  return { items, ownedCounts };
}

function adaptInstance(raw: unknown): AgentInstance | null {
  if (!isObj(raw)) return null;
  const id = str(raw.id);
  if (!id || !isRole(raw.role)) return null;
  const c = isObj(raw.config) ? raw.config : {};
  return {
    id,
    role: raw.role,
    tier: num(raw.tier, 1),
    status: isStatus(raw.status) ? raw.status : "idle",
    label: str(raw.label),
    config: {
      version: num(c.version, 1),
      instructions: typeof c.instructions === "string" ? c.instructions : "",
      contextNote: str(c.context_note),
      tools: Array.isArray(c.tools) ? c.tools.filter((t): t is string => typeof t === "string") : [],
      tierCap: num(c.tier_cap, num(raw.tier, 1)),
    },
    pricePaid: num(raw.price_paid, 0),
    purchasedAt: str(raw.purchased_at),
  };
}

async function toError(res: Response): Promise<ShopError> {
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
  return new ShopError(codeFrom(code, res.status), message, res.status);
}

const newKey = () => globalThis.crypto?.randomUUID?.() ?? `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const enc = encodeURIComponent;

export interface ShopClientOptions {
  fetch?: typeof fetch;
}

export function createShopApi(opts: ShopClientOptions = {}): ShopApi {
  const doFetch: typeof fetch = opts.fetch ?? ((...a) => fetch(...a));
  // Une clé par intention : rejouée tant que le serveur n'a pas répondu (aucun second achat), renouvelée ensuite.
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
      // Réseau coupé : la clé est GARDÉE, un nouvel essai identique ne peut pas débiter deux fois.
      throw new ShopError("NETWORK", "Connexion perdue : le serveur est injoignable.");
    }
    if (mutation) intents.delete(sig);
    if (!res.ok) throw await toError(res);
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  return {
    getCatalog: async () => adaptCatalog(await send<unknown>("GET", "/shop")),
    async listInstances() {
      const out = await send<Json>("GET", "/agents/instances");
      return (Array.isArray(out.items) ? out.items : []).map(adaptInstance).filter((x): x is AgentInstance => x !== null);
    },
    async purchase(itemId) {
      const out = await send<unknown>("POST", "/shop/purchase", { item_id: itemId }, true);
      const instance = adaptInstance(out);
      if (!instance) throw new ShopError("UNKNOWN");
      return instance;
    },
    async rename(instanceId, label) {
      const out = await send<unknown>("PATCH", `/agents/instances/${enc(instanceId)}`, { label }, true);
      const instance = adaptInstance(out);
      if (!instance) throw new ShopError("UNKNOWN");
      return instance;
    },
  };
}

/** Point d'accès unique côté interface : mock explicite, chargé à la demande. */
export function createShopApiForMode(): ShopApi {
  if (process.env.NEXT_PUBLIC_API_MODE !== "mock") return createShopApi();
  let mock: Promise<ShopApi> | null = null;
  const m = () => (mock ??= import("@/mocks/shop").then((x) => x.createMockShopApi()));
  return {
    getCatalog: async () => (await m()).getCatalog(),
    listInstances: async () => (await m()).listInstances(),
    purchase: async (id) => (await m()).purchase(id),
    rename: async (id, label) => (await m()).rename(id, label),
  };
}
