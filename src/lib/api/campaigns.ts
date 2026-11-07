/**
 * Client de la section Pub (`/api/campaigns`, docs/CONTRACTS.md §7). Types et appels propres à cette section : le client
 * partagé `http.ts` n'est pas modifié. Même convention : cookie de session, une `Idempotency-Key` par intention
 * (réutilisée tant que le serveur n'a pas répondu), erreurs à codes stables.
 * Aucune route de publication n'existe, ni ici ni côté serveur.
 */
import { mapErrorCode } from "./adapt";
import { ApiError, type ErrorCode } from "./types";
import formats from "../../../data/ads/formats.json";

// --- Types du contrat (api/app/schemas/ads.py) ---------------------------------------------------------------------

export interface Accroche {
  texte: string;
  fiche: string;
}
export interface TexteFormat {
  format: string;
  champs: Record<string, string[]>;
}
export interface BriefVisuel {
  sujet: string;
  style: string;
  texte_image: string;
  format_dimensions: string;
  prompt: string;
}
export interface PlanKit {
  calendrier: string[];
  repartition_budget: string[];
  indicateurs: string[];
}
export interface ChecklistItem {
  id: string;
  label: string;
  essential: boolean;
}
export interface AdKit {
  positionnement: string;
  audience_resume: string;
  accroches: Accroche[];
  textes: TexteFormat[];
  brief_visuel: BriefVisuel;
  plan: PlanKit;
  checklist: ChecklistItem[];
  a_verifier: string[];
}
export interface CheckResult extends ChecklistItem {
  passed: boolean;
  detail: string | null;
}
export interface CampaignVersion {
  id: string;
  numero: number;
  parent_id: string | null;
  auteur: "ads" | "joueur" | string;
  kit: AdKit;
  controles: CheckResult[];
  consigne: string | null;
  profile_version: number | null;
  simule: boolean;
  action_id: string | null;
  cree_le: string;
}
export interface Campaign {
  id: string;
  nom: string;
  objectif: string;
  plateforme: string;
  audience: string;
  budget_indicatif: string | null;
  consigne: string | null;
  version: number;
  versions: CampaignVersion[];
  generations_remaining: number;
  generation_cost: number;
  cree_le: string;
  modifie_le: string;
}
export interface CampaignSummary {
  id: string;
  nom: string;
  objectif: string;
  plateforme: string;
  version: number;
  versions_count: number;
  derniere_version: number | null;
  generations_remaining: number;
  modifie_le: string;
}
export interface CampaignList {
  items: CampaignSummary[];
  total: number;
  max: number;
  generation_cost: number;
}
export interface CampaignInput {
  nom: string;
  objectif: string;
  plateforme: string;
  audience?: string;
  budget_indicatif?: string;
  consigne?: string;
}
export type CampaignPatch = Partial<CampaignInput> & { version: number };
/** Kit renvoyé au serveur pour une copie éditée : la checklist ne porte que les identifiants. */
export type AdKitInput = Omit<AdKit, "checklist"> & { checklist: { id: string }[] };

export interface GenerateResult {
  /** Version de kit créée (`steps[0].artifact_version_id`). */
  versionId: string | null;
}

export interface CampaignsClient {
  list(): Promise<CampaignList>;
  get(id: string): Promise<Campaign>;
  create(input: CampaignInput): Promise<Campaign>;
  patch(id: string, patch: CampaignPatch): Promise<Campaign>;
  remove(id: string): Promise<void>;
  generate(id: string, consigne?: string): Promise<GenerateResult>;
  editVersion(id: string, versionId: string, version: number, kit: AdKitInput): Promise<CampaignVersion>;
}

// --- Données d'affichage (limites : data/ads/formats.json, source unique ; le serveur les contrôle) -----------------

export const OBJECTIFS: Record<string, string> = {
  notoriete: "Notoriété",
  leads: "Prospects (leads)",
  evenement: "Événement",
  offre: "Offre",
};

interface WireField {
  id: string;
  label: string;
  max_chars: number;
  required: boolean;
}
interface WireFormat {
  id: string;
  label: string;
  fields: WireField[];
}
interface WirePlatform {
  id: string;
  label: string;
  formats: WireFormat[];
}
const PLATFORMS = (formats as { plateformes: WirePlatform[] }).plateformes;

export const PLATEFORMES: { id: string; label: string }[] = PLATFORMS.map((p) => ({ id: p.id, label: p.label }));
export const platformLabel = (id: string): string => PLATFORMS.find((p) => p.id === id)?.label ?? id;
export const objectifLabel = (id: string): string => OBJECTIFS[id] ?? id;

/** Libellé et limite de caractères d'un champ de format (inconnus : id brut, pas de limite). */
export function fieldSpec(formatId: string, fieldId: string): { formatLabel: string; fieldLabel: string; max: number | null } {
  for (const p of PLATFORMS) {
    const f = p.formats.find((x) => x.id === formatId);
    if (!f) continue;
    const fld = f.fields.find((x) => x.id === fieldId);
    return { formatLabel: f.label, fieldLabel: fld?.label ?? fieldId, max: fld?.max_chars ?? null };
  }
  return { formatLabel: formatId, fieldLabel: fieldId, max: null };
}

// --- Erreurs -------------------------------------------------------------------------------------------------------

const MESSAGES: Partial<Record<ErrorCode, string>> = {
  ROLE_LOCKED: "Le directeur de campagne n'est pas encore à votre service : engagez-le à l'étage « Accueil et garage ».",
  INSUFFICIENT_FUNDS: "Solde insuffisant pour cette génération. Rien n'a été débité.",
  MESSAGE_LIMIT: "Les 5 générations de cette campagne sont utilisées. Modifiez le kit vous-même (copie éditée) ou créez une autre campagne.",
  INVALID_OUTPUT: "Le kit produit ne respecte pas les contrôles essentiels. Rien n'a été débité : vous pouvez réessayer.",
  VERSION_CONFLICT: "La campagne a changé depuis votre dernière lecture. Les données ont été rechargées : reprenez votre modification.",
  LLM_UNAVAILABLE: "Le service de génération est indisponible. Rien n'a été débité : réessayez dans un instant.",
  NETWORK: "Connexion perdue : le serveur est injoignable.",
  NO_SESSION: "Aucune partie en cours : créez une partie pour utiliser le studio pub.",
  NOT_FOUND: "Cette campagne n'existe plus.",
  VALIDATION: "Certains champs ne sont pas valides. Vérifiez le formulaire.",
  INVALID_STATE: "Action impossible dans l'état actuel (par exemple, nombre maximal de campagnes atteint).",
  RATE_LIMITED: "Trop de demandes : patientez un instant.",
};

/** Message français affichable pour toute erreur (jamais de détail technique). */
export function pubErrorMessage(e: unknown): string {
  if (e instanceof ApiError) return MESSAGES[e.code] ?? e.message ?? "Une erreur est survenue.";
  return "Une erreur est survenue.";
}
export const errorCode = (e: unknown): ErrorCode | null => (e instanceof ApiError ? e.code : null);

// --- Client HTTP ---------------------------------------------------------------------------------------------------

const enc = encodeURIComponent;
const newKey = () => globalThis.crypto?.randomUUID?.() ?? `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;

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
    if (res.status === 422) code = "VALIDATION";
    else if (res.status === 429) code = "RATE_LIMITED";
    else if (res.status === 503) code = "LLM_UNAVAILABLE";
    else if (res.status === 401) code = "NO_SESSION";
    else if (res.status === 404) code = "NOT_FOUND";
  }
  return new ApiError(code, message, res.status);
}

export interface CampaignsClientOptions {
  fetch?: typeof fetch;
}

export function createCampaignsClient(opts: CampaignsClientOptions = {}): CampaignsClient {
  const doFetch: typeof fetch = opts.fetch ?? ((...a) => fetch(...a));
  // Une clé par intention : rejouée tant qu'aucune réponse du serveur n'est arrivée (aucun double appel ni débit).
  const intents = new Map<string, string>();

  async function send<T>(method: string, path: string, body?: unknown, mutation = false): Promise<T> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const sig = mutation ? `${method} ${path} ${JSON.stringify(body ?? null)}` : "";
    if (mutation) {
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
      throw new ApiError("NETWORK", "Connexion perdue : le serveur est injoignable.");
    }
    if (!res.ok) {
      const err = await toError(res);
      if (mutation && err.code !== "NETWORK") intents.delete(sig);
      throw err;
    }
    if (mutation) intents.delete(sig);
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  return {
    list: () => send<CampaignList>("GET", "/campaigns"),
    get: (id) => send<Campaign>("GET", `/campaigns/${enc(id)}`),
    create: (input) => send<Campaign>("POST", "/campaigns", input, true),
    patch: (id, patch) => send<Campaign>("PATCH", `/campaigns/${enc(id)}`, patch, true),
    remove: (id) => send<void>("DELETE", `/campaigns/${enc(id)}`, undefined, true),
    async generate(id, consigne) {
      const body = consigne?.trim() ? { consigne: consigne.trim() } : {};
      const action = await send<{ steps?: { artifact_version_id?: string | null }[] }>("POST", `/campaigns/${enc(id)}/generate`, body, true);
      return { versionId: action.steps?.[0]?.artifact_version_id ?? null };
    },
    editVersion: (id, versionId, version, kit) =>
      send<CampaignVersion>("PATCH", `/campaigns/${enc(id)}/versions/${enc(versionId)}`, { version, kit }, true),
  };
}

/** Lien de l'export Markdown produit par le serveur (aucun blob côté navigateur). */
export const exportUrl = (id: string, versionNumero?: number): string =>
  `/api/campaigns/${enc(id)}/export.md${versionNumero ? `?version=${versionNumero}` : ""}`;
