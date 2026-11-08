/**
 * Client de la messagerie (section Clients). Contrat : api/app/schemas/conversations.py.
 * Tous les textes reçus (messages, synthèses, brouillons) sont NON FIABLES : l'interface les rend en texte.
 * Client volontairement autonome (cookie de session, Idempotency-Key par intention, erreurs à codes stables).
 */

export type Bac = "a_traiter" | "en_attente" | "a_ne_plus_contacter" | "clos";
export type Intention = "interesse" | "question" | "objection" | "refus" | "desinscription" | "hors_sujet";
export type EtatConversation = "ouverte" | "close" | "desinscrit";
/** Statut de la négociation (docs/CONTRACTS-V2.md §10, ticket C8). */
export type NegotiationStatus = "ouverte" | "acceptee" | "refusee";

export interface Conversation {
  id: string;
  prospect_id: string;
  simule: boolean;
  statut_prospect: string | null;
  entreprise: string | null;
  etat: EtatConversation;
  bac: Bac;
  intention: Intention | null;
  dernier_message_le: string | null;
  tours_client: number;
  tours_client_max: number;
  created_at: string;
  /** Offre initiale du client simulé, en $ (message automatique à l'ouverture). */
  negotiation_offer_initial: number | null;
  negotiation_status: NegotiationStatus | null;
}
export interface ConvMessage {
  id: string;
  seq: number;
  sens: "envoye" | "recu";
  etat: "ENVOYE" | "NON_ENVOYE" | null;
  text: string;
  simule: boolean;
  draft_version_id: string | null;
  created_at: string;
}
export interface Controle {
  id: string;
  label: string;
  essentiel: boolean;
  reussi: boolean;
  detail: string | null;
}
export interface Synthese {
  id: string;
  intention: Intention;
  points: { texte: string; citation: string }[];
  urgence: "faible" | "normale" | "elevee";
  statut_suggere: string | null;
  desinscription_detectee_par_code: boolean;
  controles: Controle[];
  action_id: string | null;
  created_at: string;
}
export interface Brouillon {
  id: string;
  parent_id: string | null;
  auteur: "agent" | "joueur";
  objet: string | null;
  corps: string;
  a_verifier: string[];
  controles: Controle[];
  action_id: string | null;
  created_at: string;
}
export interface ConversationDetail extends Conversation {
  messages: ConvMessage[];
  synthese: Synthese | null;
  brouillons: Brouillon[];
  resultat: Record<string, unknown> | null;
  bandeau: string | null;
  quota_restant: Record<string, number>;
}
export interface ConversationList {
  items: Conversation[];
  next_cursor: string | null;
  counts: Partial<Record<Bac, number>>;
}
export interface SendResult {
  conversation_id: string;
  messages: ConvMessage[];
  statut_prospect: string | null;
  etat: EtatConversation;
  resultat: Record<string, unknown> | null;
  client_error: { code?: string; message?: string } | null;
  simule: boolean;
}
export interface ConvActionResult {
  id: string;
  status: string;
  conversation_id: string | null;
  synthese: Synthese | null;
  brouillon: Brouillon | null;
  messages_remaining: Record<string, number>;
}
/** Prospect minimal pour choisir une conversation à ouvrir. */
export interface ProspectChoice {
  id: string;
  entreprise: string;
  statut: string;
  simule: boolean;
}

/** Retour de l'évaluateur sur la négociation (docs/CONTRACTS-V2.md §10). Jamais bloquant, toujours affiché dans le fil. */
export interface NegotiationEvaluation {
  score: number;
  feedback: string;
  reward_kind: "argent";
  reward_amount: number;
}
export interface ConversationConcludeOut {
  conversation_id: string;
  negotiation_status: "acceptee" | "refusee";
  /** Nullable par prudence : le contrat ne précise pas ce champ pour le refus forcé (prospect désinscrit). */
  evaluation: NegotiationEvaluation | null;
  clients_obtained: number;
}

export class ConvError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 0,
  ) {
    super(message);
    this.name = "ConvError";
  }
}

export interface ConversationsApi {
  list(opts?: { bac?: Bac; limit?: number }): Promise<ConversationList>;
  create(prospectId: string): Promise<Conversation>;
  detail(id: string): Promise<ConversationDetail>;
  send(id: string, text: string, draftVersionId?: string | null): Promise<SendResult>;
  triage(id: string, instruction?: string): Promise<ConvActionResult>;
  reply(id: string, instruction?: string): Promise<ConvActionResult>;
  editDraft(id: string, draftId: string, text: string, objet?: string | null): Promise<Brouillon>;
  remove(id: string): Promise<void>;
  prospects(): Promise<ProspectChoice[]>;
  /** Conclure la négociation (accepter ou refuser l'offre) : déclenche l'évaluateur (docs/CONTRACTS-V2.md §10, ticket C8). */
  conclude(id: string, accepted: boolean): Promise<ConversationConcludeOut>;
}

const newKey = () => globalThis.crypto?.randomUUID?.() ?? `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const enc = encodeURIComponent;

async function toError(res: Response): Promise<ConvError> {
  let code = "UNKNOWN";
  let message = "Une erreur est survenue.";
  try {
    const raw = (await res.json()) as { error?: { code?: string; message?: string }; code?: string; message?: string };
    const b = raw.error ?? raw;
    if (typeof b.code === "string") code = b.code;
    if (typeof b.message === "string") message = b.message;
  } catch {
    /* corps non JSON */
  }
  if (code === "UNKNOWN") {
    if (res.status === 401) code = "SESSION_REQUIRED";
    else if (res.status === 422) code = "INVALID_REQUEST";
    else if (res.status === 429) code = "RATE_LIMITED";
    else if (res.status === 503) code = "LLM_UNAVAILABLE";
  }
  return new ConvError(code, message, res.status);
}

export function createConversationsApi(opts: { fetch?: typeof fetch } = {}): ConversationsApi {
  const doFetch: typeof fetch = opts.fetch ?? ((...a) => fetch(...a));
  // Une clé par intention : rejouée tant que le serveur n'a pas répondu (aucun double appel ni double débit).
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
      throw new ConvError("NETWORK", "Connexion perdue : le serveur est injoignable.");
    }
    if (!res.ok) {
      const err = await toError(res);
      if (mutation) intents.delete(sig);
      throw err;
    }
    if (mutation) intents.delete(sig);
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  const instr = (i?: string) => (i && i.trim() ? { instruction: i.trim() } : undefined);
  return {
    list: (o = {}) => send("GET", `/conversations?limit=${o.limit ?? 100}${o.bac ? `&bac=${enc(o.bac)}` : ""}`),
    create: (prospectId) => send("POST", "/conversations", { prospect_id: prospectId }, true),
    detail: (id) => send("GET", `/conversations/${enc(id)}`),
    send: (id, text, draft) => send("POST", `/conversations/${enc(id)}/messages`, { text, ...(draft ? { draft_version_id: draft } : {}) }, true),
    triage: (id, i) => send("POST", `/conversations/${enc(id)}/triage`, instr(i), true),
    reply: (id, i) => send("POST", `/conversations/${enc(id)}/reply`, instr(i), true),
    editDraft: (id, draftId, text, objet) => send("PATCH", `/conversations/${enc(id)}/drafts/${enc(draftId)}`, { text, ...(objet ? { objet } : {}) }, true),
    remove: (id) => send("DELETE", `/conversations/${enc(id)}`, undefined, true),
    conclude: (id, accepted) => send("POST", `/conversations/${enc(id)}/conclude`, { accepted }, true),
    async prospects() {
      const r = await send<{ items: { id: string; entreprise: string; statut: string; simule: boolean }[] }>("GET", "/prospects?limit=100");
      return r.items.map((p) => ({ id: p.id, entreprise: p.entreprise, statut: p.statut, simule: p.simule }));
    },
  };
}
