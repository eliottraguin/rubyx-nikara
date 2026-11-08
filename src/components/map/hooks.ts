"use client";

import { useCallback, useEffect, useState } from "react";
import { buildingHeightPx } from "@/game/map/building";
import { LAYOUT } from "@/game/map/layout";
import { legMsForPlace } from "@/game/map/paths";
import { isTerminalAction, pruneTrips, syncTrips, type Trip } from "@/game/map/trips";
import type { MapViewModel } from "@/game/map/viewmodel";
import type { ActionView, GameState, RoleId } from "@/lib/api/types";

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
  /** Démarre un voyage visuel (le bot quitte l'immeuble, véhicule du lieu) ; renvoie son identifiant. */
  launch: (planetId: string, role: RoleId) => string;
  /** Lie le voyage à l'action serveur ; une action déjà terminée clôt le dialogue après son temps minimal ; un échec = panne. */
  bind: (tripId: string, action: ActionView | undefined) => void;
  /** Annule le voyage (envoi refusé : le bot ne part pas). */
  drop: (tripId: string) => void;
}

/**
 * Voyages visuels des agents. Pilotés par les actions du serveur (`actions_in_progress`) : une action ouverte
 * prolonge le dialogue, sa fin déclenche le retour. Aucune règle de jeu ici.
 */
export function useTrips(state: GameState | null | undefined, vm: MapViewModel, reduced: boolean): TripControls {
  const [trips, setTrips] = useState<Trip[]>([]);
  const actions = state?.actions_in_progress;
  // Durée cosmétique des trajets : selon le véhicule du LIEU (donnée), jamais le serveur.
  const level = vm.building.level;
  const legMsOf = useCallback((planetId: string) => legMsForPlace(LAYOUT, planetId, buildingHeightPx(level)), [level]);

  useEffect(() => {
    if (!actions) return;
    // Synchronisation avec une source externe (actions du serveur) : le voyage suit l'état serveur.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTrips((cur) => syncTrips(cur, actions, Date.now(), reduced, legMsOf));
  }, [actions, reduced, legMsOf]);

  const active = trips.length > 0;
  const now = useNow(active);
  useEffect(() => {
    if (!active) return;
    const i = setInterval(() => setTrips((cur) => pruneTrips(cur, Date.now(), reduced)), 500);
    return () => clearInterval(i);
  }, [active, reduced]);

  const launch = useCallback(
    (planetId: string, role: RoleId) => {
      const id = `trip-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const legMs = legMsOf(planetId);
      setTrips((cur) => [...cur, { id, planetId, role, startedAt: Date.now(), doneAt: null, ...(legMs !== undefined ? { legMs } : {}) }]);
      return id;
    },
    [legMsOf],
  );
  const bind = useCallback((tripId: string, action: ActionView | undefined) => {
    setTrips((cur) =>
      cur.map((t) => {
        if (t.id !== tripId) return t;
        const finished = !action || isTerminalAction(action);
        const now = Date.now();
        // Échec technique : le bot tombe en panne, rien n'est débité (le serveur le garantit).
        return { ...t, actionId: action?.id ?? t.actionId, doneAt: finished ? now : t.doneAt, ...(action?.status === "FAILED" ? { failedAt: now } : {}) };
      }),
    );
  }, []);
  const drop = useCallback((tripId: string) => setTrips((cur) => cur.filter((t) => t.id !== tripId)), []);
  return { trips, now, launch, bind, drop };
}
