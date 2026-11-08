import { mapErrorCode } from "./adapt";
import { ApiError, type ErrorCode } from "./types";

/** Compte connecté, tel que renvoyé par `/api/auth/*`. `hasGame` : une partie est rattachée au compte. */
export interface Account {
  userId: string;
  email: string;
  hasGame: boolean;
}

interface WireAccount {
  user_id: string;
  email: string;
  has_game: boolean;
}

const toAccount = (w: WireAccount): Account => ({ userId: w.user_id, email: w.email, hasGame: w.has_game });

function newKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function toError(res: Response): Promise<ApiError> {
  let code: ErrorCode = "UNKNOWN";
  let message = "Une erreur est survenue.";
  try {
    const raw = (await res.json()) as { error?: { code?: string; message?: string } };
    code = mapErrorCode(raw.error?.code) ?? code;
    if (typeof raw.error?.message === "string") message = raw.error.message;
  } catch {
    /* corps non JSON : message par défaut */
  }
  if (code === "UNKNOWN" && res.status === 422) code = "VALIDATION";
  return new ApiError(code, message, res.status);
}

/** Une clé d'idempotence par intention : rejouée tant que le serveur n'a pas répondu, renouvelée ensuite. */
let pendingKey: { sig: string; key: string } | null = null;

async function call(method: "GET" | "POST", path: string, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let sig = "";
  if (method === "POST") {
    sig = `${path} ${JSON.stringify(body ?? null)}`;
    if (pendingKey?.sig !== sig) pendingKey = { sig, key: newKey() };
    headers["Idempotency-Key"] = pendingKey.key;
  }
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { method, headers, credentials: "include", cache: "no-store", body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError("NETWORK", "Connexion perdue : le serveur est injoignable.");
  }
  if (method === "POST") pendingKey = null;
  if (!res.ok) throw await toError(res);
  return res;
}

export async function login(email: string, password: string): Promise<Account> {
  return toAccount((await (await call("POST", "/auth/login", { email, password })).json()) as WireAccount);
}

export async function signup(email: string, password: string): Promise<Account> {
  return toAccount((await (await call("POST", "/auth/signup", { email, password })).json()) as WireAccount);
}

export async function logout(): Promise<void> {
  await call("POST", "/auth/logout");
}

/** Compte courant, ou null si personne n'est connecté (401). */
export async function getAccount(): Promise<Account | null> {
  try {
    return toAccount((await (await call("GET", "/auth/me")).json()) as WireAccount);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return null;
    throw e;
  }
}
