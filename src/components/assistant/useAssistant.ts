"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { errorText } from "@/content/assistant";
import { AssistantError, createAssistantApiForMode, type AssistantApi, type AssistantId, type Plan } from "@/lib/api/assistant";

export type Phase = "idle" | "asking" | "running";

export interface AssistantController {
  api: AssistantApi;
  /** Plan affiché (proposé, en cours ou terminé). */
  plan: Plan | null;
  phase: Phase;
  /** Phrase lisible du dernier problème (jamais un code). */
  problem: string | null;
  /** Demandes restantes (null tant que inconnu). */
  plansLeft: number | null;
  history: Plan[];
  historyProblem: string | null;
  /** Annonce pour le lecteur d'écran. */
  announce: string;
  ask: (assistant: AssistantId, message: string) => Promise<void>;
  confirm: () => Promise<void>;
  reject: () => Promise<void>;
  open: (plan: Plan) => void;
  clear: () => void;
}

const codeOf = (e: unknown): string => (e instanceof AssistantError ? e.code : "UNKNOWN");

/** Une demande à la fois. Aucune règle de jeu ici : prix, limites et droits viennent du serveur. */
export function useAssistant(hooks: { api?: AssistantApi; onSpent?: () => void } = {}): AssistantController {
  const api = useMemo(() => hooks.api ?? createAssistantApiForMode(), [hooks.api]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [problem, setProblem] = useState<string | null>(null);
  const [plansLeft, setPlansLeft] = useState<number | null>(null);
  const [history, setHistory] = useState<Plan[]>([]);
  const [historyProblem, setHistoryProblem] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  const busy = useRef(false);
  const onSpent = useRef(hooks.onSpent);
  useEffect(() => {
    onSpent.current = hooks.onSpent;
  });

  const reload = useCallback(async () => {
    try {
      const l = await api.list();
      setHistory(l.items);
      setPlansLeft(l.plansLeft);
      setHistoryProblem(null);
    } catch (e) {
      setHistoryProblem(errorText(codeOf(e), "load"));
    }
  }, [api]);
  useEffect(() => {
    let alive = true;
    api
      .list()
      .then((l) => {
        if (!alive) return;
        setHistory(l.items);
        setPlansLeft(l.plansLeft);
      })
      .catch((e) => {
        if (alive) setHistoryProblem(errorText(codeOf(e), "load"));
      });
    return () => {
      alive = false;
    };
  }, [api]);

  const ask = useCallback(
    async (assistant: AssistantId, message: string) => {
      if (busy.current) return;
      busy.current = true;
      setPhase("asking");
      setProblem(null);
      setAnnounce("Je réfléchis à votre demande…");
      try {
        const p = await api.propose(assistant, message);
        setPlan(p);
        setPlansLeft(p.plansLeft);
        setAnnounce(p.steps.length === 0 ? "Je n'ai aucune tâche à proposer." : `Voici ma proposition : ${p.steps.length} tâche${p.steps.length > 1 ? "s" : ""}.`);
        void reload();
      } catch (e) {
        const t = errorText(codeOf(e), "propose");
        setProblem(t);
        setAnnounce(t);
        if (codeOf(e) === "MESSAGE_LIMIT") setPlansLeft(0);
      } finally {
        busy.current = false;
        setPhase("idle");
      }
    },
    [api, reload],
  );

  const confirm = useCallback(async () => {
    if (busy.current || !plan) return;
    busy.current = true;
    const id = plan.id;
    setPhase("running");
    setProblem(null);
    setAnnounce("C'est parti, je m'en occupe.");
    try {
      const final = await api.confirm(id, { onProgress: (p) => setPlan((cur) => (cur && cur.id === id ? p : cur)) });
      setPlan(final);
      setPlansLeft(final.plansLeft);
      setAnnounce(final.status === "DONE" ? "Toutes les tâches sont terminées." : final.status === "PARTIAL" ? "Certaines tâches n'ont pas pu se faire." : "Terminé.");
      onSpent.current?.();
      void reload();
    } catch (e) {
      const t = errorText(codeOf(e), "confirm");
      setProblem(t);
      setAnnounce(t);
      // Le plan a peut-être avancé malgré l'erreur : on relit son état réel.
      try {
        setPlan(await api.get(id));
      } catch {
        /* on garde l'affichage actuel */
      }
    } finally {
      busy.current = false;
      setPhase("idle");
    }
  }, [api, plan, reload]);

  const reject = useCallback(async () => {
    if (busy.current || !plan) return;
    busy.current = true;
    try {
      const p = await api.reject(plan.id);
      setPlan(p);
      setPlansLeft(p.plansLeft);
      setProblem(null);
      setAnnounce("Plan annulé. Rien n'a été dépensé.");
      void reload();
    } catch (e) {
      const t = errorText(codeOf(e), "reject");
      setProblem(t);
      setAnnounce(t);
    } finally {
      busy.current = false;
    }
  }, [api, plan, reload]);

  const open = useCallback((p: Plan) => {
    setPlan(p);
    setProblem(null);
  }, []);
  const clear = useCallback(() => {
    setPlan(null);
    setProblem(null);
  }, []);

  return { api, plan, phase, problem, plansLeft, history, historyProblem, announce, ask, confirm, reject, open, clear };
}
