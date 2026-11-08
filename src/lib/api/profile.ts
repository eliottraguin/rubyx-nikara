/**
 * Fiche entreprise et cible (UI-H1). Contrat : docs/CONTRACTS.md §1 — lecture par `GET /api/state` (`target_profile`),
 * enregistrement par `PUT /api/profile` (version suivante ; `expected_version` périmée => 409 `VERSION_CONFLICT`).
 *
 * COUCHE D'ADAPTATION UNIQUE : tout écart entre le contrat et l'API livrée se corrige ICI. Les composants ne connaissent
 * que `ProfileApi`, `Fiche`, `FicheValeurs` et `ProfileError`. Tout texte est NON FIABLE : à rendre en texte seul.
 */
import type { Ton } from "@/content/fiche";
import { TON_DEFAUT, TONS } from "@/content/fiche";

export interface FicheTaille {
  effectif_min: number;
  effectif_max: number;
}

/** Ce que le joueur écrit (corps du PUT, sans la version). */
export interface FicheValeurs {
  entreprise_nom: string;
  offre: string;
  besoin: string;
  cible_secteurs: string[];
  cible_zone: string[];
  cible_taille: FicheTaille | null;
  cible_fonctions: string[];
  exclusions: string[];
  ton: Ton;
}

/** Fiche lue sur le serveur. `complete` : offre, secteurs et zone renseignés (calculé par le serveur). */
export interface Fiche extends FicheValeurs {
  version: number;
  complete: boolean;
  modifieLe: string | null;
}

export type ProfileErrorCode = "VERSION_CONFLICT" | "INVALID_REQUEST" | "SESSION_REQUIRED" | "NOT_FOUND" | "NETWORK" | "UNKNOWN";

export class ProfileError extends Error {
  constructor(
    readonly code: ProfileErrorCode,
    message = "Une erreur est survenue.",
    readonly status = 0,
    /** Erreurs par champ (clé = nom du champ de la fiche), messages en français du serveur. */
    readonly fields: Record<string, string> = {},
  ) {
    super(message);
    this.name = "ProfileError";
  }
}

export interface ProfileApi {
  /** Lit la fiche courante. Rejette avec `ProfileError`. */
  get(): Promise<Fiche>;
  /** Enregistre la version suivante ; `expectedVersion` = version affichée. Rejette avec `ProfileError`. */
  save(values: FicheValeurs, expectedVersion: number): Promise<Fiche>;
}

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown): string => (typeof v === "string" ? v : "");
const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const int = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : null);

/** Fiche vide : valeurs de départ avant toute saisie. */
export const FICHE_VIDE: FicheValeurs = {
  entreprise_nom: "",
  offre: "",
  besoin: "",
  cible_secteurs: [],
  cible_zone: [],
  cible_taille: null,
  cible_fonctions: [],
  exclusions: [],
  ton: TON_DEFAUT,
};

/** `target_profile` (ou réponse du PUT) -> `Fiche`. Tolérant : champ absent = valeur vide ; ton inconnu = ton par défaut. */
export function adaptFiche(raw: unknown): Fiche {
  const w = isObj(raw) ? raw : {};
  const size = isObj(w.cible_taille) ? w.cible_taille : null;
  const lo = size ? int(size.effectif_min) : null;
  const hi = size ? int(size.effectif_max) : null;
  const ton = TONS.find((t) => t.id === w.ton)?.id ?? TON_DEFAUT;
  const secteurs = list(w.cible_secteurs);
  const zone = list(w.cible_zone);
  const offre = text(w.offre);
  return {
    version: int(w.profile_version) ?? int(w.version) ?? 1,
    entreprise_nom: text(w.entreprise_nom),
    offre,
    besoin: text(w.besoin),
    cible_secteurs: secteurs,
    cible_zone: zone,
    cible_taille: lo !== null && hi !== null ? { effectif_min: lo, effectif_max: hi } : null,
    cible_fonctions: list(w.cible_fonctions),
    exclusions: list(w.exclusions),
    ton,
    complete: typeof w.complete === "boolean" ? w.complete : Boolean(offre.trim() && secteurs.length && zone.length),
    modifieLe: typeof w.modifie_le === "string" ? w.modifie_le : null,
  };
}

const FIELDS = ["entreprise_nom", "offre", "besoin", "cible_secteurs", "cible_zone", "cible_taille", "cible_fonctions", "exclusions", "ton"];

/** Détails d'une 422 : `[{loc: ["body", champ], message}]` -> `{champ: message}` (premier message par champ). */
export function fieldErrors(details: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!Array.isArray(details)) return out;
  for (const d of details) {
    if (!isObj(d) || !Array.isArray(d.loc)) continue;
    const name = d.loc.find((p): p is string => typeof p === "string" && FIELDS.includes(p));
    const msg = typeof d.message === "string" ? d.message : typeof d.msg === "string" ? d.msg : "";
    if (name && msg && !(name in out)) out[name] = msg;
  }
  return out;
}

function codeFrom(code: unknown, status: number): ProfileErrorCode {
  if (code === "VERSION_CONFLICT" || status === 409) return "VERSION_CONFLICT";
  if (code === "INVALID_REQUEST" || code === "VALIDATION" || status === 422) return "INVALID_REQUEST";
  if (status === 401) return "SESSION_REQUIRED";
  if (status === 404) return "NOT_FOUND";
  return "UNKNOWN";
}

async function toError(res: Response): Promise<ProfileError> {
  let code: unknown;
  let message: string | undefined;
  let details: unknown;
  try {
    const raw = (await res.json()) as { error?: Json } & Json;
    const b = isObj(raw.error) ? raw.error : raw;
    code = b.code;
    if (typeof b.message === "string") message = b.message;
    details = b.details;
  } catch {
    /* corps non JSON */
  }
  return new ProfileError(codeFrom(code, res.status), message, res.status, fieldErrors(details));
}

const newKey = () => globalThis.crypto?.randomUUID?.() ?? `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function createProfileApi(opts: { fetch?: typeof fetch } = {}): ProfileApi {
  const doFetch: typeof fetch = opts.fetch ?? ((...a) => fetch(...a));
  // Une clé par intention : rejouée tant que le serveur n'a pas répondu (réseau coupé), renouvelée ensuite.
  const intents = new Map<string, string>();

  async function send(method: string, path: string, body?: unknown, mutation = false): Promise<unknown> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const sig = `${method} ${path} ${JSON.stringify(body ?? null)}`;
    if (mutation) {
      let k = intents.get(sig);
      if (!k) intents.set(sig, (k = newKey()));
      headers["Idempotency-Key"] = k;
    }
    let res: Response;
    try {
      res = await doFetch(`/api${path}`, { method, headers, credentials: "include", cache: "no-store", body: body === undefined ? undefined : JSON.stringify(body) });
    } catch {
      throw new ProfileError("NETWORK", "Connexion perdue : le serveur est injoignable.");
    }
    if (mutation && (res.ok || res.status < 500)) intents.delete(sig);
    if (!res.ok) throw await toError(res);
    return res.json();
  }

  return {
    async get() {
      const state = await send("GET", "/state");
      return adaptFiche(isObj(state) ? state.target_profile : null);
    },
    async save(values, expectedVersion) {
      // Le corps ne contient que la fiche et la version attendue : jamais de prix, de solde ni de droit.
      return adaptFiche(await send("PUT", "/profile", { expected_version: expectedVersion, ...values }, true));
    },
  };
}

/** Point d'accès unique côté interface : mock hors `NEXT_PUBLIC_API_MODE=http`, chargé à la demande. */
export function createProfileApiForMode(): ProfileApi {
  if (process.env.NEXT_PUBLIC_API_MODE === "http") return createProfileApi();
  let mock: Promise<ProfileApi> | null = null;
  const load = () => (mock ??= import("@/mocks/profile").then((m) => m.createMockProfileApi()));
  return { get: async () => (await load()).get(), save: async (v, n) => (await load()).save(v, n) };
}
