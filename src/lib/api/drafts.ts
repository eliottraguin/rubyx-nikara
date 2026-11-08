/**
 * Fiche client et premier message d'un prospect (rédacteur `replier`).
 * Contrat IMPLÉMENTÉ : docs/CONTRACTS.md §3 « Actions sur un prospect » et §11.
 *
 * COUCHE D'ADAPTATION UNIQUE : tout écart entre le contrat et l'API livrée se corrige ICI. Les composants ne connaissent
 * que `DraftsApi`, `DraftsState`, `DraftVersion` et `DraftsError`. Tout texte reçu est NON FIABLE : à rendre en texte seul.
 *
 * Formes réelles :
 *  - `GET /api/prospects/{id}/drafts` : `{fiches, messages, quota_restant: {prospect_profile, prospect_message}, couts: {…}}` ;
 *    chaque version : `{id, kind: "fiche"|"message", numero, parent_id, auteur, fiche?, message?, controles[], created_at}` ;
 *  - `POST /api/prospects/{id}/profile|message` (corps facultatif `{instruction}`) : 202 `ProspectActionOut` (`version`, `debited`,
 *    `messages_remaining`) ; l'action s'exécute dans la requête, il n'y a rien à suivre ; un échec est une erreur HTTP typée ;
 *  - `PATCH /api/prospects/{id}/drafts/{draft_id}` : 201 `ProspectDraftOut` (copie du joueur) ;
 *  - « Utiliser ce message » : `POST /api/prospects/{id}/contact` puis `POST /api/conversations/{id}/messages` `{text, draft_version_id}`.
 */

export type DraftKind = "profile" | "message";
export const DRAFT_KINDS: readonly DraftKind[] = ["profile", "message"];
export const QUOTA = 5;
const INSTRUCTION_MAX = 500;

export interface Check {
  id: string;
  label: string;
  essentiel: boolean;
  reussi: boolean;
  detail: string | null;
}

export interface DraftVersion {
  id: string;
  kind: DraftKind;
  /** Numéro de version, par prospect et par type. */
  numero: number;
  parentId: string | null;
  auteur: "agent" | "joueur";
  createdAt: string | null;
  checks: Check[];
  /** Fiche client. `pourquoi` n'est pas modifiable (raisons reliées à la fiche entreprise par le serveur). */
  resume: string;
  pourquoi: string[];
  accroches: string[];
  aVerifier: string[];
  /** Premier message. */
  objet: string | null;
  corps: string;
}

export interface DraftsState {
  /** Versions de la plus ancienne à la plus récente. */
  profile: DraftVersion[];
  message: DraftVersion[];
  /** Essais restants, lus du serveur (`quota_restant`). */
  remaining: Record<DraftKind, number>;
  /** Prix d'un essai réussi, lu du serveur (`couts`) ; null si le serveur ne l'a pas donné. */
  costs: Record<DraftKind, number | null>;
}

export interface DraftEdit {
  resume?: string;
  accroches?: string[];
  aVerifier?: string[];
  objet?: string | null;
  corps?: string;
}

export type DraftsErrorCode =
  | "ROLE_LOCKED" | "INSUFFICIENT_FUNDS" | "MESSAGE_LIMIT" | "INVALID_OUTPUT" | "LLM_UNAVAILABLE" | "VERSION_CONFLICT" | "OPTED_OUT"
  | "NOT_FOUND" | "NOT_IMPLEMENTED" | "INVALID_REQUEST" | "RATE_LIMITED" | "SESSION_REQUIRED" | "NETWORK" | "TIMEOUT" | "INVALID_STATE" | "UNKNOWN";

const KNOWN: readonly string[] = [
  "ROLE_LOCKED", "INSUFFICIENT_FUNDS", "MESSAGE_LIMIT", "INVALID_OUTPUT", "LLM_UNAVAILABLE", "VERSION_CONFLICT", "OPTED_OUT",
  "NOT_FOUND", "NOT_IMPLEMENTED", "INVALID_REQUEST", "RATE_LIMITED", "SESSION_REQUIRED", "INVALID_STATE",
];

export class DraftsError extends Error {
  constructor(
    readonly code: DraftsErrorCode,
    message = "Une erreur est survenue.",
    readonly status = 0,
  ) {
    super(message);
    this.name = "DraftsError";
  }
}

export interface GenerateResult {
  state: DraftsState;
  /** Version créée par cet essai (`version` de la réponse). */
  createdId: string | null;
  /** Montant débité pour cet essai (`debited`). */
  debited: number | null;
}
export interface EditResult {
  state: DraftsState;
  createdId: string | null;
}

export interface DraftsApi {
  load(prospectId: string): Promise<DraftsState>;
  generate(prospectId: string, kind: DraftKind, instruction?: string): Promise<GenerateResult>;
  /** Nouvelle version écrite par le joueur (gratuit, les versions existantes ne changent pas). */
  edit(prospectId: string, kind: DraftKind, versionId: string, changes: DraftEdit): Promise<EditResult>;
  /** Ouvre la conversation du prospect et y met ce message (`text` relu par le joueur, version de référence `versionId`). */
  useAsFirstMessage(prospectId: string, versionId: string, text: string): Promise<{ conversationId: string }>;
}

// --- Adaptation ------------------------------------------------------------------------------------------------------

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "") : []);

export function adaptCheck(raw: unknown): Check | null {
  if (!isObj(raw)) return null;
  const label = str(raw.label) ?? str(raw.id);
  if (!label) return null;
  return { id: str(raw.id) ?? label, label, essentiel: raw.essentiel === true, reussi: raw.reussi === true, detail: str(raw.detail) };
}

export function adaptVersion(raw: unknown): DraftVersion | null {
  if (!isObj(raw)) return null;
  const id = str(raw.id);
  if (!id) return null;
  const kind: DraftKind = raw.kind === "message" ? "message" : "profile";
  const fiche = isObj(raw.fiche) ? raw.fiche : {};
  const msg = isObj(raw.message) ? raw.message : {};
  const raisons = (Array.isArray(fiche.pourquoi_ce_prospect) ? fiche.pourquoi_ce_prospect : [])
    .map((r) => (isObj(r) ? str(r.texte) : str(r)))
    .filter((x): x is string => x !== null);
  return {
    id,
    kind,
    numero: typeof raw.numero === "number" ? raw.numero : 0,
    parentId: str(raw.parent_id),
    auteur: raw.auteur === "joueur" ? "joueur" : "agent",
    createdAt: str(raw.created_at),
    checks: (Array.isArray(raw.controles) ? raw.controles : []).map(adaptCheck).filter((c): c is Check => c !== null),
    resume: str(fiche.resume) ?? "",
    pourquoi: raisons,
    accroches: strs(fiche.points_d_accroche),
    aVerifier: strs(fiche.a_verifier),
    objet: str(msg.objet),
    corps: typeof msg.corps === "string" ? msg.corps : "",
  };
}

function versions(raw: unknown): DraftVersion[] {
  const list = Array.isArray(raw) ? raw : [];
  const out = list.map(adaptVersion).filter((v): v is DraftVersion => v !== null);
  // Par numéro croissant ; à numéro égal, l'ordre du serveur.
  return out.map((v, i) => ({ v, i })).sort((a, b) => a.v.numero - b.v.numero || a.i - b.i).map((x) => x.v);
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.trunc(v)) : null);

export function adaptState(raw: unknown): DraftsState {
  const w = isObj(raw) ? raw : {};
  const q = isObj(w.quota_restant) ? w.quota_restant : {};
  const c = isObj(w.couts) ? w.couts : {};
  const profile = versions(w.fiches);
  const message = versions(w.messages);
  // Sans valeur du serveur : 5 moins les versions écrites par le rédacteur (jamais plus que le quota).
  const left = (k: DraftKind, list: DraftVersion[]) => Math.min(QUOTA, num(q[k === "profile" ? "prospect_profile" : "prospect_message"]) ?? Math.max(0, QUOTA - list.filter((x) => x.auteur === "agent").length));
  return {
    profile,
    message,
    remaining: { profile: left("profile", profile), message: left("message", message) },
    costs: { profile: num(c.prospect_profile), message: num(c.prospect_message) },
  };
}

export function codeFrom(code: unknown, status: number): DraftsErrorCode {
  if (typeof code === "string" && KNOWN.includes(code)) return code as DraftsErrorCode;
  if (code === "VALIDATION") return "INVALID_REQUEST";
  if (status === 401) return "SESSION_REQUIRED";
  if (status === 404) return "NOT_FOUND";
  if (status === 405 || status === 501) return "NOT_IMPLEMENTED";
  if (status === 422) return "INVALID_REQUEST";
  if (status === 429) return "RATE_LIMITED";
  if (status === 503) return "LLM_UNAVAILABLE";
  return "UNKNOWN";
}

async function toError(res: Response): Promise<DraftsError> {
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
  return new DraftsError(codeFrom(code, res.status), message, res.status);
}

const newKey = () => globalThis.crypto?.randomUUID?.() ?? `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const enc = encodeURIComponent;
const PATH: Record<DraftKind, string> = { profile: "profile", message: "message" };

export interface DraftsClientOptions {
  fetch?: typeof fetch;
}

export function createDraftsApi(opts: DraftsClientOptions = {}): DraftsApi {
  const doFetch: typeof fetch = opts.fetch ?? ((...a) => fetch(...a));
  // Une clé par intention : rejouée tant que le serveur n'a pas répondu (aucun second appel, aucun second débit), renouvelée ensuite.
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
      throw new DraftsError("NETWORK", "Connexion perdue : le serveur est injoignable.");
    }
    if (mutation) intents.delete(sig);
    if (!res.ok) throw await toError(res);
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  const load = async (prospectId: string) => adaptState(await send<unknown>("GET", `/prospects/${enc(prospectId)}/drafts`));

  return {
    load,
    async generate(prospectId, kind, instruction) {
      const i = instruction?.trim();
      const body = i ? { instruction: i.slice(0, INSTRUCTION_MAX) } : {};
      // L'action s'exécute dans la requête : la réponse EST le résultat (aucun suivi à faire).
      const out = await send<Json>("POST", `/prospects/${enc(prospectId)}/${PATH[kind]}`, body, true);
      if (str(out.status) === "FAILED") {
        const e = isObj(out.error) ? out.error : {};
        throw new DraftsError(codeFrom(e.code, 0), str(e.message) ?? undefined);
      }
      const created = adaptVersion(out.version);
      return { state: await load(prospectId), createdId: created?.id ?? null, debited: num(out.debited) };
    },
    async edit(prospectId, kind, versionId, c) {
      const body =
        kind === "message"
          ? { ...(c.objet ? { objet: c.objet } : {}), corps: c.corps ?? "" }
          : { resume: c.resume ?? "", points_d_accroche: c.accroches ?? [], a_verifier: c.aVerifier ?? [] };
      const out = await send<Json>("PATCH", `/prospects/${enc(prospectId)}/drafts/${enc(versionId)}`, body, true);
      return { state: await load(prospectId), createdId: adaptVersion(out)?.id ?? null };
    },
    async useAsFirstMessage(prospectId, versionId, text) {
      const conv = await send<Json>("POST", `/prospects/${enc(prospectId)}/contact`, {}, true);
      const id = str(conv.id) ?? str(conv.conversation_id);
      if (!id) throw new DraftsError("UNKNOWN");
      await send<Json>("POST", `/conversations/${enc(id)}/messages`, { text, draft_version_id: versionId }, true);
      return { conversationId: id };
    },
  };
}

/** Point d'accès unique côté interface : mock hors `NEXT_PUBLIC_API_MODE=http`, chargé à la demande. */
export function createDraftsApiForMode(): DraftsApi {
  if (process.env.NEXT_PUBLIC_API_MODE === "http") return createDraftsApi();
  let mock: Promise<DraftsApi> | null = null;
  const m = () => (mock ??= import("@/mocks/drafts").then((x) => x.createMockDraftsApi()));
  return {
    load: async (id) => (await m()).load(id),
    generate: async (id, k, i) => (await m()).generate(id, k, i),
    edit: async (id, k, v, c) => (await m()).edit(id, k, v, c),
    useAsFirstMessage: async (id, v, t) => (await m()).useAsFirstMessage(id, v, t),
  };
}
