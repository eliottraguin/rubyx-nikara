import {
  mapAction,
  mapAttempt,
  mapErrorCode,
  mapState,
  currentAttempt,
  type WireAction,
  type WireAttemptSummary,
  type WireDetail,
  type WireState,
} from "./adapt";
import {
  ApiError,
  type ActionView,
  type ApiClient,
  type ClarificationItem,
  type DemoEventId,
  type ErrorCode,
  type GameState,
  type MutationResult,
  type NotebookEntry,
  type RoleId,
} from "./types";

export interface HttpClientOptions {
  /** Injectable pour les tests. */
  fetch?: typeof fetch;
  /** Secret de l'accès démo (en-tête X-Demo-Secret). Sans secret, l'accès démo est masqué. */
  demoSecret?: string;
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;
}

/**
 * Événements de démo que le serveur réel sait appliquer. Leur id dépend de la mission (`ev_<mission>_<type>`, voir
 * data/missions/*) et le serveur ne liste pas les événements admissibles : on ne propose que ceux de la mission courante.
 */
const DEMO_TYPES: Partial<Record<DemoEventId, { type: string; mission: string }>> = { target_change: { type: "target_change", mission: "m5" } };
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
  const demoSecret = opts.demoSecret ?? process.env.NEXT_PUBLIC_DEMO_SECRET ?? "";
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
  const CLAR = "rubix.clarifications";
  let openActions = new Set<string>(readJson<string[]>(OPEN, []));
  let clarifications = readJson<Record<string, ClarificationItem[]>>(CLAR, {});
  const payCache = new Map<string, number>();
  // Détails des tentatives terminées (immuables) : l'historique d'une planète ne les relit pas à chaque ouverture.
  const detailCache = new Map<string, WireDetail>();
  let currentAttemptId: string | null = null;
  let currentMissionId: string | null = null;

  const saveOpen = () => writeJson(OPEN, [...openActions]);
  const forget = () => {
    openActions = new Set();
    clarifications = {};
    payCache.clear();
    detailCache.clear();
    currentAttemptId = null;
    try {
      storage?.removeItem(OPEN);
      storage?.removeItem(CLAR);
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
  function paymentOf(d: WireDetail): number {
    return d.evaluations.reduce((n, e) => {
      const p = e.report?.payment;
      return p ? Math.max(n, p.already_acquired + p.credited) : n;
    }, 0);
  }

  async function readState(): Promise<GameState> {
    const w = await get<WireState>("/state");
    const cur = currentAttempt(w);
    currentAttemptId = cur?.id ?? null;
    currentMissionId = cur?.mission_id ?? null;
    const demoEvents = (Object.keys(DEMO_TYPES) as DemoEventId[]).filter(
      (e) => cur?.status === "ACTIVE" && cur.mission_id === DEMO_TYPES[e]?.mission && cur.brief_version === 1,
    );
    const detail = cur ? await get<WireDetail>(`/attempts/${enc(cur.id)}`) : null;
    if (cur && detail && (cur.status === "COMPLETED" || cur.status === "FAILED")) payCache.set(cur.id, paymentOf(detail));
    // Paiement acquis par mission : lu dans les évaluations des tentatives terminées (immuables, mises en cache).
    const finished = w.attempts.filter((a: WireAttemptSummary) => (a.status === "COMPLETED" || a.status === "FAILED") && !payCache.has(a.id));
    await Promise.all(finished.map(async (a) => payCache.set(a.id, paymentOf(await get<WireDetail>(`/attempts/${enc(a.id)}`)))));
    const payments: Record<string, number> = {};
    for (const a of w.attempts) payments[a.mission_id] = Math.max(payments[a.mission_id] ?? 0, payCache.get(a.id) ?? 0);

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

    // Réponses de clarification encore en attente.
    const items = cur ? (clarifications[cur.id] ?? []) : [];
    for (const it of items) {
      if (it.answer) continue;
      try {
        const raw = await get<WireAction>(`/actions/${enc(it.id)}`);
        if (raw.answer) it.answer = raw.answer;
      } catch {
        /* réessayé au prochain relevé */
      }
    }
    if (cur) {
      clarifications[cur.id] = items;
      writeJson(CLAR, clarifications);
    }

    return mapState(w, {
      detail,
      clarifications: items,
      payments,
      actions,
      demo: { enabled: demoSecret.length > 0 && demoEvents.length > 0, events: demoEvents },
    });
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
    // Nouvelle partie : la mémoire locale (actions ouvertes, clarifications) de l'ancienne est oubliée avant la relecture.
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
    startMission: (id) => post(`/missions/${enc(id)}/start`),
    retryMission: (id) => post(`/missions/${enc(id)}/retry`),
    async sendMessage(id, input) {
      // Les pièces cochées se partagent d'abord avec le rôle (`POST /shares`), puis le message les référence.
      const linked: string[] = [];
      for (const document_id of input.document_ids) {
        const share = (await send<{ artifact_version_id: string }>("POST", `/attempts/${enc(id)}/shares`, { role: input.role, document_id }, { mutation: true }));
        linked.push(share.artifact_version_id);
      }
      return post(`/attempts/${enc(id)}/messages`, { role: input.role, text: input.text, linked_artifact_ids: linked });
    },
    getAction: fetchAction,
    async getMissionAttempts(missionId) {
      const w = await get<WireState>("/state");
      const list = w.attempts.filter((a) => a.mission_id === missionId).sort((x, y) => x.attempt_no - y.attempt_no);
      const details = await Promise.all(
        list.map(async (a) => {
          const cached = detailCache.get(a.id);
          if (cached) return cached;
          const d = await get<WireDetail>(`/attempts/${enc(a.id)}`);
          if (a.status === "COMPLETED" || a.status === "FAILED") detailCache.set(a.id, d);
          return d;
        }),
      );
      return details.map((d) => mapAttempt(d, w, clarifications[d.attempt.id] ?? []));
    },
    confirmAction: (id) => post(`/actions/${enc(id)}/confirm`),
    async askClarification(id, question) {
      return (
        await mutation(`/attempts/${enc(id)}/clarifications`, { question }, {
          onResponse: (res) => {
            const w = res as WireAction;
            clarifications[id] = [...(clarifications[id] ?? []), { id: w.id, question, answer: w.answer ?? "" }];
            writeJson(CLAR, clarifications);
          },
        })
      ).result;
    },
    saveArtifact: (id, input) => post(`/attempts/${enc(id)}/artifacts`, { kind: "manual", content: input.content, ...(input.parent_id ? { parent_id: input.parent_id } : {}) }),
    submit: (id, input) => post(`/attempts/${enc(id)}/submit`, input),
    purchaseAgent: (role: RoleId) => post("/agents/purchase", { role }),
    // Le contrat v0.3 n'a pas de route d'indices : l'interface les masque (`hints_enabled: false`).
    async requestHint() {
      throw new ApiError("NOT_IMPLEMENTED", "Les indices ne sont pas encore disponibles avec ce serveur.", 501);
    },
    // `/notebook` répond 501 (stub) : l'interface affiche l'erreur stable en français.
    listNotebook: () => get<NotebookEntry[]>("/notebook"),
    async saveNotebook(input) {
      await post("/notebook", input);
      return get<NotebookEntry[]>("/notebook");
    },
    async demoEvent(eventId) {
      const spec = DEMO_TYPES[eventId];
      if (!spec) throw new ApiError("INVALID_STATE", "Cet événement de démonstration n'est pas disponible sur le serveur réel.", 0);
      if (!demoSecret) throw new ApiError("INVALID_STATE", "L'accès démo n'est pas activé.", 0);
      if (!currentAttemptId) await readState();
      if (!currentAttemptId || !currentMissionId) throw new ApiError("INVALID_STATE", "Aucune commande en cours pour cet événement.", 0);
      const event_id = `ev_${currentMissionId}_${spec.type}`;
      return (await mutation("/demo/events", { attempt_id: currentAttemptId, event_id }, { headers: { "X-Demo-Secret": demoSecret } })).result;
    },
    async deleteSession() {
      await send<void>("DELETE", "/session", undefined, { mutation: true });
      forget();
    },
  };
}
