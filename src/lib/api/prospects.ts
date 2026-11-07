import { mapErrorCode } from "./adapt";
import { ApiError, type ErrorCode } from "./types";

/** Carnet de prospection (`/api/prospects`). Types alignés sur `api/app/schemas/prospects.py`. Tout texte est non fiable : à rendre en TEXTE. */

export type ProspectTri = "pertinence" | "date_ajout" | "entreprise" | "statut" | "fiabilite" | "source";
export type ProspectOrdre = "asc" | "desc";
export type Fiabilite = "verifie" | "partiel" | "simule";

export const STATUTS = ["nouveau", "contacte", "en_discussion", "gagne", "perdu", "ecarte"] as const;
const STATUT_LABEL: Record<string, string> = {
  nouveau: "Nouveau",
  contacte: "Contacté",
  en_discussion: "En discussion",
  gagne: "Gagné",
  perdu: "Perdu",
  ecarte: "Écarté",
};
const FIABILITE_LABEL: Record<string, string> = { verifie: "Vérifié", partiel: "Partiel", simule: "Simulé" };
export const statutLabel = (s: string) => STATUT_LABEL[s] ?? s;
export const fiabiliteLabel = (f: string) => FIABILITE_LABEL[f] ?? f;
export const DEFAULT_ORDER: Record<ProspectTri, ProspectOrdre> = { pertinence: "desc", date_ajout: "desc", entreprise: "asc", statut: "asc", fiabilite: "asc", source: "asc" };

export interface Prospect {
  id: string;
  entreprise: string;
  contact_nom?: string | null;
  contact_fonction?: string | null;
  canal?: { type: string; valeur: string } | null;
  source: string;
  source_ref: string;
  raisons_fit: string[];
  signal?: string | null;
  pertinence: number;
  fiabilite: Fiabilite;
  simule: boolean;
  statut: string;
  notes: string;
  collecte_le?: string | null;
  possible_doublon: boolean;
  cree_le: string;
  contacte_le?: string | null;
  version: number;
}
export interface ProspectDetail extends Prospect {
  historique_statut: { statut: string; le: string }[];
}
export interface ProspectList {
  items: Prospect[];
  next_cursor: string | null;
  counts: Record<string, number>;
  total: number;
}
export interface ProspectQuery {
  tri?: ProspectTri;
  ordre?: ProspectOrdre;
  statut?: string;
  q?: string;
  cursor?: string;
  limit?: number;
}

/** Chaîne de requête (valeurs vides omises). `forExport` retire curseur et limite : l'export est complet. */
export function buildQuery(p: ProspectQuery, forExport = false): string {
  const u = new URLSearchParams();
  if (p.tri) u.set("tri", p.tri);
  if (p.ordre) u.set("ordre", p.ordre);
  if (p.statut) u.set("statut", p.statut);
  const q = p.q?.trim();
  if (q) u.set("q", q.slice(0, 100));
  if (!forExport) {
    if (p.cursor) u.set("cursor", p.cursor);
    if (p.limit) u.set("limit", String(p.limit));
  }
  const s = u.toString();
  return s ? `?${s}` : "";
}

/** URL de la route serveur d'export : le téléchargement est une navigation, jamais un blob construit par le front. */
export const exportUrl = (p: ProspectQuery) => `/api/prospects/export.csv${buildQuery(p, true)}`;

async function toError(res: Response): Promise<ApiError> {
  let code: ErrorCode = "UNKNOWN";
  let message = "Une erreur est survenue.";
  try {
    const raw = (await res.json()) as { error?: { code?: string; message?: string }; code?: string; message?: string };
    const body = raw.error ?? raw;
    const mapped = mapErrorCode(body.code);
    if (mapped) code = mapped;
    if (typeof body.message === "string") message = body.message;
  } catch {
    /* corps non JSON */
  }
  if (code === "UNKNOWN") {
    if (res.status === 404) code = "NOT_FOUND";
    else if (res.status === 422) code = "VALIDATION";
    else if (res.status === 401) code = "NO_SESSION";
  }
  return new ApiError(code, message, res.status);
}

export interface ProspectsClient {
  list(p?: ProspectQuery): Promise<ProspectList>;
  get(id: string): Promise<ProspectDetail>;
  patch(id: string, body: { version: number; statut?: string; notes?: string }): Promise<ProspectDetail>;
  remove(id: string): Promise<void>;
  purge(): Promise<void>;
}

export function createProspectsClient(opts: { fetch?: typeof fetch } = {}): ProspectsClient {
  const doFetch: typeof fetch = opts.fetch ?? ((...a) => fetch(...a));
  // Une clé par intention : rejouée tant que le serveur n'a pas répondu (réseau coupé), renouvelée ensuite.
  const intents = new Map<string, string>();
  const newKey = () => globalThis.crypto?.randomUUID?.() ?? `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  async function send<T>(method: string, path: string, body?: unknown, mutation = false): Promise<T> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const sig = `${method} ${path} ${JSON.stringify(body ?? null)}`;
    if (mutation) {
      let key = intents.get(sig);
      if (!key) intents.set(sig, (key = newKey()));
      headers["Idempotency-Key"] = key;
    }
    let res: Response;
    try {
      res = await doFetch(`/api${path}`, { method, headers, credentials: "include", cache: "no-store", body: body === undefined ? undefined : JSON.stringify(body) });
    } catch {
      throw new ApiError("NETWORK", "Connexion perdue : le serveur est injoignable.");
    }
    if (mutation && (res.ok || res.status < 500)) intents.delete(sig);
    if (!res.ok) throw await toError(res);
    return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
  }

  return {
    list: (p = {}) => send<ProspectList>("GET", `/prospects${buildQuery(p)}`),
    get: (id) => send<ProspectDetail>("GET", `/prospects/${encodeURIComponent(id)}`),
    patch: (id, body) => send<ProspectDetail>("PATCH", `/prospects/${encodeURIComponent(id)}`, body, true),
    remove: (id) => send<void>("DELETE", `/prospects/${encodeURIComponent(id)}`, undefined, true),
    purge: () => send<void>("DELETE", "/prospects", undefined, true),
  };
}
