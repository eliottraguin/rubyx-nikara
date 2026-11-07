"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { isTerminalAction, pruneTrips, syncTrips, type Trip } from "@/game/map/trips";
import type { MapViewModel } from "@/game/map/viewmodel";
import type { ActionView, ApiClient, AttemptView, GameState, RoleId } from "@/lib/api/types";

/** Horloge locale (un instantané qui avance tant que `active`) : sert aux libellés de phase des voyages. */
export function useNow(active: boolean, ms = 250): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const i = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(i);
  }, [active, ms]);
  return now;
}

export interface TripControls {
  trips: Trip[];
  now: number;
  /** Démarre un voyage visuel (l'agent quitte la base) ; renvoie son identifiant. */
  launch: (planetId: string, role: RoleId) => string;
  /** Lie le voyage à l'action serveur ; une action déjà terminée clôt le dialogue après son temps minimal. */
  bind: (tripId: string, action: ActionView | undefined) => void;
  /** Annule le voyage (envoi refusé : l'agent ne part pas). */
  drop: (tripId: string) => void;
}

/**
 * Voyages visuels des agents. Pilotés par les actions du serveur (`actions_in_progress`) : une action ouverte
 * prolonge le dialogue, sa fin déclenche le retour. Aucune règle de jeu ici.
 */
export function useTrips(state: GameState | null | undefined, vm: MapViewModel, reduced: boolean): TripControls {
  const [trips, setTrips] = useState<Trip[]>([]);
  const planetOfAttempt = useMemo(() => {
    const attempt = state?.attempt ?? null;
    const planetId = attempt ? vm.planets.find((p) => p.missionId === attempt.mission_id)?.id ?? null : null;
    return (attemptId: string) => (attempt && attempt.id === attemptId ? planetId : null);
  }, [state?.attempt, vm.planets]);
  const actions = state?.actions_in_progress;

  useEffect(() => {
    if (!actions) return;
    // Synchronisation avec une source externe (actions du serveur) : le voyage suit l'état serveur.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTrips((cur) => syncTrips(cur, actions, planetOfAttempt, Date.now(), reduced));
  }, [actions, planetOfAttempt, reduced]);

  const active = trips.length > 0;
  const now = useNow(active);
  useEffect(() => {
    if (!active) return;
    const i = setInterval(() => setTrips((cur) => pruneTrips(cur, Date.now(), reduced)), 500);
    return () => clearInterval(i);
  }, [active, reduced]);

  const launch = useCallback((planetId: string, role: RoleId) => {
    const id = `trip-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    setTrips((cur) => [...cur, { id, planetId, role, startedAt: Date.now(), doneAt: null }]);
    return id;
  }, []);
  const bind = useCallback((tripId: string, action: ActionView | undefined) => {
    setTrips((cur) =>
      cur.map((t) => {
        if (t.id !== tripId) return t;
        const finished = !action || isTerminalAction(action);
        return { ...t, actionId: action?.id ?? t.actionId, doneAt: finished ? Date.now() : t.doneAt };
      }),
    );
  }, []);
  const drop = useCallback((tripId: string) => setTrips((cur) => cur.filter((t) => t.id !== tripId)), []);
  return { trips, now, launch, bind, drop };
}

export interface PlanetAttemptsResult {
  attempts: AttemptView[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/** Tentatives (expéditions) de la mission d'une planète. Relues quand `signature` change (état serveur modifié). */
export function usePlanetAttempts(api: ApiClient | null, missionId: string | null, signature: string): PlanetAttemptsResult {
  const [data, setData] = useState<{ key: string; mission: string; attempts: AttemptView[]; error: string | null } | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const key = `${missionId}|${signature}|${reloadTick}`;
  useEffect(() => {
    if (!api || !missionId) return;
    let cancelled = false;
    api
      .getMissionAttempts(missionId)
      .then((attempts) => !cancelled && setData({ key, mission: missionId, attempts, error: null }))
      .catch((e: unknown) => !cancelled && setData({ key, mission: missionId, attempts: [], error: e instanceof Error ? e.message : "Historique indisponible." }));
    return () => {
      cancelled = true;
    };
  }, [api, missionId, key]);
  const reload = useCallback(() => setReloadTick((n) => n + 1), []);
  if (!api || !missionId) return { attempts: [], loading: false, error: null, reload };
  // Pendant un rechargement on garde les dernières données (pas de clignotement) ; `loading` seulement au premier chargement.
  const fresh = data && data.mission === missionId ? data : null;
  return { attempts: fresh?.attempts ?? [], loading: fresh === null, error: fresh && fresh.key === key ? fresh.error : null, reload };
}
