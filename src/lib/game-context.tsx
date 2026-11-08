"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ApiError, isMockMode, loadApi, type ActionView, type ApiClient, type GameState, type MutationResult } from "./api";
import { getAccount, type Account } from "./api/auth";

const TERMINAL = ["SUCCEEDED", "PARTIAL", "FAILED"];

interface Ctx {
  api: ApiClient | null;
  /** undefined = chargement initial ; null = aucune partie ; sinon état serveur. */
  state: GameState | null | undefined;
  /** Compte connecté (`/api/auth/me`) : undefined = chargement initial, null = aucun compte. */
  account: Account | null | undefined;
  setAccount: (a: Account | null) => void;
  /**
   * Posée par la vue carte pendant son montage (dézoom `bus.farewell` avant déconnexion) ; `null` sur les autres
   * écrans ou sans scène 3D, pour une navigation immédiate.
   */
  farewellRef: { current: (() => Promise<void>) | null };
  /** Statut courant des actions longues (réponse de GET /api/actions/{id}). */
  live: Record<string, ActionView>;
  connectionLost: boolean;
  busy: boolean;
  refresh: () => Promise<GameState | null | undefined>;
  setState: (s: GameState | null) => void;
  /** Exécute une mutation, verrouille les doubles clics, et applique l'état renvoyé. */
  mutate: (fn: (api: ApiClient) => Promise<MutationResult>) => Promise<{ ok: true; result: MutationResult } | { ok: false; error: ApiError }>;
}

const GameContext = createContext<Ctx | null>(null);

export function useGame(): Ctx {
  const c = useContext(GameContext);
  if (!c) throw new Error("useGame hors GameProvider");
  return c;
}

function toApiError(e: unknown): ApiError {
  return e instanceof ApiError ? e : new ApiError("UNKNOWN", "Une erreur inattendue est survenue.");
}

export function GameProvider({ children }: { children: ReactNode }) {
  const [api, setApi] = useState<ApiClient | null>(null);
  const [state, setStateRaw] = useState<GameState | null | undefined>(undefined);
  // Mode simulé : les comptes ne sont pas branchés (LoginScreen) ; `account` reste `null`, jamais `undefined`.
  const [account, setAccount] = useState<Account | null | undefined>(() => (isMockMode() ? null : undefined));
  const farewellRef = useRef<(() => Promise<void>) | null>(null);
  const [live, setLive] = useState<Record<string, ActionView>>({});
  const [connectionLost, setConnectionLost] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  // Compte connecté (`/api/auth/me`), hors mode simulé. `getAccount` renvoie déjà `null` sur 401 (pas de compte) ;
  // une autre erreur (réseau, 500) laisse `account` à `undefined` plutôt que de la confondre avec « pas de compte » :
  // un compte réel pris pour anonyme déclencherait la suppression destructrice de la partie (« Quitter la partie »).
  useEffect(() => {
    if (isMockMode()) return;
    let cancelled = false;
    getAccount()
      .then((a) => {
        if (!cancelled) setAccount(a);
      })
      .catch(() => {
        /* erreur indéterminée : on ne bascule jamais en "pas de compte" par défaut */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!api) return undefined;
    try {
      const s = await api.getState();
      setStateRaw(s);
      setConnectionLost(false);
      return s;
    } catch (e) {
      if (toApiError(e).code === "NETWORK") setConnectionLost(true);
      return undefined;
    }
  }, [api]);

  // Chargement initial : l'état est toujours relu depuis l'API (rechargement de page, reprise).
  useEffect(() => {
    let cancelled = false;
    loadApi().then((a) => {
      if (!cancelled) setApi(a);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (!api) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronisation avec une source externe (API)
    void refresh();
  }, [api, refresh]);

  // Reconnexion automatique.
  useEffect(() => {
    if (!connectionLost) return;
    const t = setInterval(() => void refresh(), 5000);
    return () => clearInterval(t);
  }, [connectionLost, refresh]);

  // Interrogation des actions en cours.
  const runningIds = (state?.actions_in_progress ?? [])
    .filter((a) => !TERMINAL.includes(a.status))
    .map((a) => a.id);
  const runningKey = runningIds.join(",");
  useEffect(() => {
    if (!api || !runningKey) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const ids = runningKey ? runningKey.split(",") : [];
    const tick = async () => {
      let lost = false;
      try {
        if (ids.length) {
          const views = await Promise.all(ids.map((i) => api.getAction(i)));
          if (stop) return;
          setLive(Object.fromEntries(views.map((v) => [v.id, v])));
          if (views.some((v) => TERMINAL.includes(v.status))) await refresh();
        } else {
          await refresh();
        }
        if (!stop) setConnectionLost(false);
      } catch (e) {
        lost = toApiError(e).code === "NETWORK";
        if (!stop && lost) setConnectionLost(true);
      }
      if (!stop) timer = setTimeout(tick, lost ? 3000 : 900);
    };
    timer = setTimeout(tick, 500);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [api, runningKey, refresh]);

  const mutate: Ctx["mutate"] = useCallback(
    async (fn) => {
      if (!api) return { ok: false, error: new ApiError("UNKNOWN", "Interface en cours de chargement.") };
      if (busyRef.current) return { ok: false, error: new ApiError("INVALID_STATE", "Une action est déjà en cours d'envoi.") };
      busyRef.current = true;
      setBusy(true);
      try {
        const result = await fn(api);
        setStateRaw(result.state);
        setConnectionLost(false);
        return { ok: true, result };
      } catch (e) {
        const error = toApiError(e);
        if (error.code === "NETWORK") setConnectionLost(true);
        return { ok: false, error };
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [api],
  );

  const value = useMemo<Ctx>(
    () => ({ api, state, account, setAccount, farewellRef, live, connectionLost, busy, refresh, mutate, setState: setStateRaw }),
    [api, state, account, live, connectionLost, busy, refresh, mutate],
  );
  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}
