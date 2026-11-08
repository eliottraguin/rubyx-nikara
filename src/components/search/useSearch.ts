"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createSearchesApiForMode, type SearchesApi, type SearchResult } from "@/lib/api/searches";
import { problemKind } from "./problems";
import type { ProblemKind } from "@/content/recherche";

export type RunState =
  | { status: "idle" }
  | { status: "running"; planetId: string }
  | { status: "done"; planetId: string; result: SearchResult }
  | { status: "error"; planetId: string; problem: ProblemKind };

export interface SearchController {
  api: SearchesApi;
  run: RunState;
  start: (planetId: string, precision: string) => Promise<void>;
  clear: () => void;
}

export interface SearchHooks {
  /** Injectable pour les tests. */
  api?: SearchesApi;
  /** Le serveur a accepté la recherche : le bot part (renvoie l'identifiant du voyage). */
  onStart?: (planetId: string) => string | undefined;
  /** La recherche est finie (réussie ou non) : le bot rentre ou tombe en panne. */
  onEnd?: (tripId: string | undefined, ok: boolean) => void;
  /** La recherche a réussi : relire l'état (déblocages). */
  onDone?: (result: SearchResult) => void;
}

/**
 * Une recherche à la fois. L'état vit dans l'écran qui l'appelle (pas dans le panneau) : fermer le panneau ne perd ni le
 * résultat ni le retour du bot. Aucune règle de jeu ici : le serveur décide de tout.
 */
export function useSearch(hooks: SearchHooks = {}): SearchController {
  const api = useMemo(() => hooks.api ?? createSearchesApiForMode(), [hooks.api]);
  const [run, setRun] = useState<RunState>({ status: "idle" });
  const busy = useRef(false);
  const h = useRef(hooks);
  useEffect(() => {
    h.current = hooks;
  });

  const start = useCallback(
    async (planetId: string, precision: string) => {
      if (busy.current) return;
      busy.current = true;
      setRun({ status: "running", planetId });
      let trip: string | undefined;
      let started = false;
      try {
        const result = await api.run(
          { planetId, precision },
          {
            onStarted: () => {
              started = true;
              trip = h.current.onStart?.(planetId);
            },
          },
        );
        h.current.onEnd?.(trip, true);
        setRun({ status: "done", planetId, result });
        h.current.onDone?.(result);
      } catch (e) {
        if (started) h.current.onEnd?.(trip, false);
        setRun({ status: "error", planetId, problem: problemKind(e) });
      } finally {
        busy.current = false;
      }
    },
    [api],
  );
  const clear = useCallback(() => setRun({ status: "idle" }), []);
  return { api, run, start, clear };
}
