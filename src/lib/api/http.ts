import { mapAction, mapErrorCode, mapState, type WireAction, type WireState } from "./adapt";
import { ApiError, type ActionView, type ApiClient, type ErrorCode, type GameState, type MutationResult, type RoleId } from "./types";

export interface HttpClientOptions {
  /** Injectable pour les tests. */
  fetch?: typeof fetch;
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;
}

const TERMINAL = ["SUCCEEDED", "PARTIAL", "FAILED"];

function newKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function toError(res: Response): Promise<ApiError> {
  let code: ErrorCode = "UNKNOWN";
  let message = "Une erreur est survenue.";
  try {
    // L'API répond { "error": { "code", "message" } } ; on tolère aussi l'ancien format à plat.
    const raw = (await res.json()) as { error?: { code?: string; message?: string }; code?: string; message?: string; detail?: unknown };
    const body = raw.error ?? raw;
    const mapped = mapErrorCode(body.code);
    if (mapped) code = mapped;
    if (typeof body.message === "string") message = body.message;
    else if (typeof raw.detail === "string") message = raw.detail;
  } catch {
    /* corps non JSON : message par défaut */
  }
  if (code === "UNKNOWN") {
    if (res.status === 422) code = "VALIDATION";
    else if (res.status === 429) code = "RATE_LIMITED";
    else if (res.status === 503) code = "LLM_UNAVAILABLE";
    else if (res.status === 401) code = "NO_SESSION";
  }
  return new ApiError(code, message, res.status);
}

const enc = encodeURIComponent;

export function createHttpClient(opts: HttpClientOptions = {}): ApiClient {
  const doFetch: typeof fetch = opts.fetch ?? ((...a) => fetch(...a));
  let storage: HttpClientOptions["storage"] = opts.storage;
  if (storage === undefined) {
    try {
      storage = globalThis.sessionStorage ?? null;
    } catch {
      storage = null;
    }
  }

  // --- Clés d'idempotence -------------------------------------------------------------------------------------------
  // Une clé par INTENTION : tant qu'une requête n'a reçu aucune réponse du serveur (réseau coupé, passerelle), son rejeu
  // réutilise la même clé et ne peut donc ni doubler l'appel ni le débit. Dès que le serveur a répondu (succès ou refus
  // métier, y compris LLM_UNAVAILABLE : « rien n'a été débité, réessayez »), l'intention est close : le clic suivant est
  // une nouvelle intention, donc une nouvelle clé.
  const intents = new Map<string, string>();

  async function send<T>(method: string, path: string, body?: unknown, o: { mutation?: boolean; headers?: Record<string, string> } = {}): Promise<T> {
    const headers: Record<string, string> = { Accept: "application/json", ...o.headers };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const sig = o.mutation ? `${method} ${path} ${JSON.stringify(body ?? null)}` : "";
    if (o.mutation) {
      let key = intents.get(sig);
      if (!key) {
        key = newKey();
        intents.set(sig, key);
      }
      headers["Idempotency-Key"] = key;
    }
    let res: Response;
    try {
      res = await doFetch(`/api${path}`, {
        method,
        headers,
        credentials: "include",
        cache: "no-store",
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      // Aucune réponse : l'intention reste ouverte (même clé au rejeu).
      throw new ApiError("NETWORK", "Connexion perdue : le serveur est injoignable.");
    }
    if (!res.ok) {
      const err = await toError(res);
      if (o.mutation && err.code !== "UNKNOWN") intents.delete(sig);
      throw err;
    }
    if (o.mutation) intents.delete(sig);
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }
  const get = <T>(path: string) => send<T>("GET", path);

  // --- Mémoire de session (sessionStorage, vidée à la création/suppression de partie) -------------------------------
  const readJson = <T>(k: string, d: T): T => {
    try {
      const v = storage?.getItem(k);
      return v ? (JSON.parse(v) as T) : d;
    } catch {
      return d;
    }
  };
  const writeJson = (k: string, v: unknown) => {
    try {
      storage?.setItem(k, JSON.stringify(v));
    } catch {
      /* ignoré */
    }
  };
  const OPEN = "rubix.open-actions";
  let openActions = new Set<string>(readJson<string[]>(OPEN, []));

  const saveOpen = () => writeJson(OPEN, [...openActions]);
  const forget = () => {
    openActions = new Set();
    try {
      storage?.removeItem(OPEN);
    } catch {
      /* ignoré */
    }
  };

  function remember(a: ActionView) {
    if (TERMINAL.includes(a.status)) openActions.delete(a.id);
    else openActions.add(a.id);
    saveOpen();
  }

  async function fetchAction(id: string): Promise<ActionView> {
    const view = mapAction(await get<WireAction>(`/actions/${enc(id)}`));
    remember(view);
    return view;
  }

  // --- Lecture de l'état --------------------------------------------------------------------------------------------
  async function readState(): Promise<GameState> {
    const w = await get<WireState>("/state");

    // Actions ouvertes : le serveur n'en liste pas encore (`active_actions` vide) ; on suit celles lancées depuis ce navigateur.
    const actions: ActionView[] = [];
    await Promise.all(
      [...openActions].map(async (id) => {
        try {
          const v = await fetchAction(id);
          if (!TERMINAL.includes(v.status)) actions.push(v);
        } catch (e) {
          if (e instanceof ApiError && e.status >= 400 && e.status < 500) {
            openActions.delete(id);
            saveOpen();
          }
        }
      }),
    );
    return mapState(w, { actions });
  }

  // --- Mutations ----------------------------------------------------------------------------------------------------
  /** L'API renvoie l'objet créé (partie, action, livraison…), pas un `MutationResult` : on relit l'état serveur après coup. */
  async function mutation(
    path: string,
    body?: unknown,
    o: { headers?: Record<string, string>; onResponse?: (res: unknown) => void } = {},
  ): Promise<{ res: unknown; result: MutationResult }> {
    const res = await send<unknown>("POST", path, body ?? {}, { mutation: true, headers: o.headers });
    o.onResponse?.(res);
    const id = typeof res === "object" && res !== null ? (res as { id?: unknown }).id : undefined;
    let action: ActionView | undefined;
    if (typeof id === "string" && id.startsWith("act_")) {
      action = mapAction(res as WireAction);
      remember(action);
    }
    const state = await readState();
    return { res, result: { state, ...(action ? { action } : {}) } };
  }
  const post = async (path: string, body?: unknown) => (await mutation(path, body)).result;

  return {
    mode: "http",
    // Le contrat nomme le champ `company_name` (docs/CONTRACTS.md) ; l'interface garde `company`.
    // Nouvelle partie : la mémoire locale (actions ouvertes) de l'ancienne est oubliée avant la relecture.
    async createSession({ company, ...rest }) {
      return (await mutation("/sessions", { company_name: company, ...rest }, { onResponse: forget })).result;
    },
    async getState() {
      try {
        return await readState();
      } catch (e) {
        if (e instanceof ApiError && (e.status === 401 || e.status === 404)) return null;
        throw e;
      }
    },
    getAction: fetchAction,
    purchaseAgent: (role: RoleId) => post("/agents/purchase", { role }),
    async deleteSession() {
      await send<void>("DELETE", "/session", undefined, { mutation: true });
      forget();
    },
  };
}
