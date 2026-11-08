/**
 * Recherches du bot et contact (6e décision). Contrat : docs/CONTRACTS.md §11 (recherche IMPLÉMENTÉE, contact PROPOSÉ)
 * (`POST /api/searches`, `GET /api/searches/{id}`, `GET /api/searches`, `POST /api/prospects/{id}/contact`).
 *
 * COUCHE D'ADAPTATION UNIQUE : tout écart entre le contrat et l'API livrée se corrige ICI (formes de réponse, noms de
 * champs, codes d'erreur). Les composants ne connaissent que `SearchesApi`, `SearchResult` et `SearchError`.
 * Tout texte reçu (citations, noms) est NON FIABLE : à rendre en texte seul.
 */

export type Pertinence = "correspond" | "a_verifier" | "hors_cible";
export const PERTINENCES: readonly Pertinence[] = ["correspond", "a_verifier", "hors_cible"];

export interface SearchProspect {
  id: string;
  entreprise: string;
  fonction: string | null;
  source: string;
  sourceRef: string;
  pertinence: Pertinence;
  /** Citation de la source qui justifie l'étiquette (texte non fiable). */
  citation: string | null;
  aVerifier: string[];
  raisons: string[];
  simule: boolean;
}

export interface SearchResult {
  id: string | null;
  planetId: string;
  precision: string | null;
  added: SearchProspect[];
  alreadyPresent: number;
  rejected: number;
  horsCible: number;
}

export type SearchErrorCode =
  | "PLANET_LOCKED"
  | "PROFILE_INCOMPLETE"
  | "RATE_LIMITED"
  | "INVALID_REQUEST"
  | "LLM_UNAVAILABLE"
  | "NOT_IMPLEMENTED"
  | "NOT_FOUND"
  | "INVALID_STATE"
  | "SESSION_REQUIRED"
  | "NETWORK"
  | "TIMEOUT"
  | "UNKNOWN";

export class SearchError extends Error {
  constructor(
    readonly code: SearchErrorCode,
    message = "Une erreur est survenue.",
    readonly status = 0,
  ) {
    super(message);
    this.name = "SearchError";
  }
}

export interface RunInput {
  planetId: string;
  precision?: string;
}
export interface RunOptions {
  /** Appelé à l'envoi de la recherche (le bot part ; il revient quand le serveur répond). */
  onStarted?: () => void;
}
export interface ContactResult {
  conversationId: string;
}

export interface SearchesApi {
  /** Lance la recherche, attend sa fin et renvoie le résultat. Rejette avec `SearchError`. */
  run(input: RunInput, opts?: RunOptions): Promise<SearchResult>;
  /** Ouvre la conversation du prospect (idempotent). Rejette avec `SearchError`. */
  contact(prospectId: string): Promise<ContactResult>;
}

// --- Adaptation fil -> modèle d'affichage ---------------------------------------------------------------------------

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const count = (v: unknown): number => (Array.isArray(v) ? v.length : typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.trunc(v)) : 0);

/** Une valeur inconnue ou un ancien score numérique ne devient jamais « correspond » : repli prudent « à vérifier ». */
export function toPertinence(v: unknown): Pertinence {
  return typeof v === "string" && (PERTINENCES as readonly string[]).includes(v) ? (v as Pertinence) : "a_verifier";
}

/** Élément de `added[]` : `{prospect_id, entreprise, source_ref}` (+ `etiquette`, `citation` avec le tri de pertinence). */
export function adaptSearchProspect(raw: unknown, simule = false): SearchProspect | null {
  if (!isObj(raw)) return null;
  const id = str(raw.prospect_id) ?? str(raw.id);
  if (!id) return null;
  return {
    id,
    entreprise: str(raw.entreprise) ?? "Entreprise sans nom",
    fonction: str(raw.contact_fonction) ?? str(raw.fonction),
    source: str(raw.source) ?? "",
    sourceRef: str(raw.source_ref) ?? "",
    pertinence: toPertinence(raw.etiquette ?? raw.pertinence_etiquette ?? raw.pertinence),
    citation: str(raw.citation) ?? str(raw.pertinence_citation),
    aVerifier: strs(raw.pertinence_a_verifier),
    raisons: strs(raw.raisons_fit),
    simule: raw.simule === true || simule,
  };
}

/** Motifs d'écart (`discarded_items[].code`) regroupés pour l'affichage : doublons, hors cible, autres refus. */
const DUPLICATE_CODES = ["DUPLICATE"];
const OFF_TARGET_CODES = ["OUT_OF_ZONE", "OUT_OF_SECTOR", "OUT_OF_SIZE", "EXCLUDED"];

export function adaptSearch(raw: unknown, fallbackPlanet = ""): SearchResult {
  const w = isObj(raw) ? raw : {};
  const simule = w.simule === true;
  const added = (Array.isArray(w.added) ? w.added : []).map((x) => adaptSearchProspect(x, simule)).filter((p): p is SearchProspect => p !== null);
  const dropped = (Array.isArray(w.discarded_items) ? w.discarded_items : []).filter(isObj);
  const inGroup = (codes: string[]) => dropped.filter((d) => typeof d.code === "string" && codes.includes(d.code)).length;
  const duplicates = inGroup(DUPLICATE_CODES);
  const offTarget = inGroup(OFF_TARGET_CODES);
  return {
    id: str(w.id),
    planetId: str(w.planet_id) ?? fallbackPlanet,
    precision: str(w.precision),
    added,
    alreadyPresent: duplicates,
    rejected: Math.max(0, count(w.discarded) - duplicates - offTarget),
    horsCible: offTarget,
  };
}

const KNOWN: readonly SearchErrorCode[] = [
  "PLANET_LOCKED", "PROFILE_INCOMPLETE", "RATE_LIMITED", "INVALID_REQUEST", "LLM_UNAVAILABLE", "NOT_IMPLEMENTED", "NOT_FOUND", "INVALID_STATE", "SESSION_REQUIRED",
];

export function codeFrom(code: unknown, status: number): SearchErrorCode {
  if (typeof code === "string" && (KNOWN as readonly string[]).includes(code)) return code as SearchErrorCode;
  if (typeof code === "string" && code === "VALIDATION") return "INVALID_REQUEST";
  if (status === 401) return "SESSION_REQUIRED";
  if (status === 404) return "NOT_FOUND";
  if (status === 405 || status === 501) return "NOT_IMPLEMENTED";
  if (status === 422) return "INVALID_REQUEST";
  if (status === 429) return "RATE_LIMITED";
  if (status === 503) return "LLM_UNAVAILABLE";
  return "UNKNOWN";
}

async function toError(res: Response): Promise<SearchError> {
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
  return new SearchError(codeFrom(code, res.status), message, res.status);
}

const RUNNING = ["PENDING", "RUNNING"];
const newKey = () => globalThis.crypto?.randomUUID?.() ?? `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const enc = encodeURIComponent;

export interface SearchesClientOptions {
  fetch?: typeof fetch;
  /** Délai entre deux lectures de l'action (ms). */
  pollMs?: number;
  /** Durée maximale d'attente (ms). */
  timeoutMs?: number;
}

export function createSearchesApi(opts: SearchesClientOptions = {}): SearchesApi {
  const doFetch: typeof fetch = opts.fetch ?? ((...a) => fetch(...a));
  const pollMs = opts.pollMs ?? 900;
  const timeoutMs = opts.timeoutMs ?? 120_000;
  // Une clé par intention : rejouée tant que le serveur n'a pas répondu (aucun second appel), renouvelée ensuite.
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
      throw new SearchError("NETWORK", "Connexion perdue : le serveur est injoignable.");
    }
    if (mutation) intents.delete(sig);
    if (!res.ok) throw await toError(res);
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  /** `POST /api/searches` renvoie la recherche terminée ; si le serveur la rend encore en cours, on relit `GET /searches/{id}`. */
  async function settle(first: Json): Promise<Json> {
    let cur = first;
    const t0 = Date.now();
    for (;;) {
      const status = str(cur.status) ?? "";
      if (status === "FAILED") {
        const e = isObj(cur.error) ? cur.error : {};
        throw new SearchError(codeFrom(e.code, 0), str(e.message) ?? undefined);
      }
      if (!RUNNING.includes(status)) return cur;
      if (Date.now() - t0 > timeoutMs) throw new SearchError("TIMEOUT", "Le bot met trop de temps à revenir.");
      const id = str(cur.id);
      if (!id) throw new SearchError("UNKNOWN", "Le résultat de la recherche est introuvable.");
      await sleep(pollMs);
      cur = await send<Json>("GET", `/searches/${enc(id)}`);
    }
  }

  return {
    async run({ planetId, precision }, o = {}) {
      const p = precision?.trim();
      const body = { planet_id: planetId, ...(p ? { precision: p.slice(0, 300) } : {}) };
      o.onStarted?.(); // le bot part dès l'envoi ; le serveur répond quand il est revenu
      const done = await settle(await send<Json>("POST", "/searches", body, true));
      return adaptSearch(done, planetId);
    },
    async contact(prospectId) {
      const c = await send<Json>("POST", `/prospects/${enc(prospectId)}/contact`, {}, true);
      const id = str(c.id) ?? str(c.conversation_id);
      if (!id) throw new SearchError("UNKNOWN");
      return { conversationId: id };
    },
  };
}

/** Point d'accès unique côté interface : mock explicite, chargé à la demande. */
export function createSearchesApiForMode(): SearchesApi {
  if (process.env.NEXT_PUBLIC_API_MODE !== "mock") return createSearchesApi();
  let mock: Promise<SearchesApi> | null = null;
  const load = () => (mock ??= import("@/mocks/searches").then((m) => m.createMockSearchesApi()));
  return { run: async (i, o) => (await load()).run(i, o), contact: async (id) => (await load()).contact(id) };
}
