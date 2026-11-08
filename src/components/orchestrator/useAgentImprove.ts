"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { orchestratorErrorText } from "@/content/orchestrator";
import { OrchestratorError, createOrchestratorApiForMode, type AgentConfigView, type AgentInstance, type OrchestratorApi } from "@/lib/api/orchestrator";

export type ImprovePhase = "idle" | "review" | "applying" | "rollingBack";

/**
 * Historique des versions vues dans cette partie de jeu (texte en clair, gardé côté client). Le contrat
 * (docs/CONTRACTS-V2.md §1, §2) n'offre aucune route de liste des versions d'une instance : c'est un écart
 * signalé dans la PR, à combler par une future route `GET /api/agents/instances/{id}/configs` si besoin.
 */
export interface ConfigHistoryEntry {
  version: number;
  instructions: string;
  contextNote: string | null;
}

export interface AgentImproveController {
  api: OrchestratorApi;
  instances: AgentInstance[];
  instancesProblem: string | null;
  selected: AgentInstance | null;
  select: (instanceId: string | null) => void;
  feedback: string;
  setFeedback: (v: string) => void;
  phase: ImprovePhase;
  problem: string | null;
  announce: string;
  /** Avant/après de la version active, à comparer dans le diff une fois la version appliquée. */
  before: AgentConfigView | null;
  /** Demande une confirmation avant d'envoyer (dépense réelle, serveur seul maître du prix). */
  review: () => void;
  cancelReview: () => void;
  confirm: () => Promise<void>;
  history: Record<string, ConfigHistoryEntry[]>;
  rollback: (instanceId: string, version: number) => Promise<void>;
  lastPrice: number | null;
  lastSummary: string | null;
}

const codeOf = (e: unknown): string => (e instanceof OrchestratorError ? e.code : "UNKNOWN");

export function useAgentImprove(hooks: { api?: OrchestratorApi; onSpent?: () => void } = {}): AgentImproveController {
  const api = useMemo(() => hooks.api ?? createOrchestratorApiForMode(), [hooks.api]);
  const [instances, setInstances] = useState<AgentInstance[]>([]);
  const [instancesProblem, setInstancesProblem] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [phase, setPhase] = useState<ImprovePhase>("idle");
  const [problem, setProblem] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  const [before, setBefore] = useState<AgentConfigView | null>(null);
  const [lastPrice, setLastPrice] = useState<number | null>(null);
  const [lastSummary, setLastSummary] = useState<string | null>(null);
  const [history, setHistory] = useState<Record<string, ConfigHistoryEntry[]>>({});
  const busy = useRef(false);
  const onSpent = useRef(hooks.onSpent);
  useEffect(() => {
    onSpent.current = hooks.onSpent;
  });

  const noteHistory = useCallback((inst: AgentInstance) => {
    setHistory((h) => {
      const entries = h[inst.id] ?? [];
      if (entries.some((e) => e.version === inst.config.version)) return h;
      return { ...h, [inst.id]: [...entries, { version: inst.config.version, instructions: inst.config.instructions, contextNote: inst.config.contextNote }] };
    });
  }, []);

  useEffect(() => {
    let alive = true;
    api
      .instances()
      .then((items) => {
        if (!alive) return;
        setInstances(items);
        items.forEach(noteHistory);
      })
      .catch((e) => {
        if (alive) setInstancesProblem(orchestratorErrorText(codeOf(e), "list"));
      });
    return () => {
      alive = false;
    };
  }, [api, noteHistory]);

  const selected = instances.find((i) => i.id === selectedId) ?? null;

  const select = useCallback((instanceId: string | null) => {
    setSelectedId(instanceId);
    setFeedback("");
    setPhase("idle");
    setProblem(null);
    setBefore(null);
  }, []);

  const review = useCallback(() => {
    if (!selected || !feedback.trim()) return;
    setPhase("review");
    setProblem(null);
  }, [selected, feedback]);

  const cancelReview = useCallback(() => {
    setPhase("idle");
  }, []);

  const confirm = useCallback(async () => {
    if (busy.current || !selected) return;
    busy.current = true;
    setPhase("applying");
    setProblem(null);
    setAnnounce("Mise à jour de l'agent…");
    const prevConfig = selected.config;
    try {
      const res = await api.improve(selected.id, feedback.trim());
      setBefore(prevConfig);
      setLastPrice(res.pricePaid);
      setLastSummary(res.summary);
      setAnnounce("Nouvelle version enregistrée.");
      noteHistory(res.instance);
      setInstances((cur) => cur.map((i) => (i.id === res.instance.id ? res.instance : i)));
      setFeedback("");
      onSpent.current?.();
    } catch (e) {
      const t = orchestratorErrorText(codeOf(e), "propose");
      setProblem(t);
      setAnnounce(t);
      setPhase("review");
      busy.current = false;
      return;
    }
    busy.current = false;
    setPhase("idle");
  }, [api, selected, feedback, noteHistory]);

  const rollback = useCallback(
    async (instanceId: string, version: number) => {
      if (busy.current) return;
      busy.current = true;
      setPhase("rollingBack");
      setProblem(null);
      setAnnounce("Retour en arrière…");
      try {
        const inst = await api.rollback(instanceId, version);
        noteHistory(inst);
        setInstances((cur) => cur.map((i) => (i.id === inst.id ? inst : i)));
        setAnnounce("Retour à une version précédente effectué.");
      } catch (e) {
        const t = orchestratorErrorText(codeOf(e), "rollback");
        setProblem(t);
        setAnnounce(t);
      } finally {
        busy.current = false;
        setPhase("idle");
      }
    },
    [api, noteHistory],
  );

  return { api, instances, instancesProblem, selected, select, feedback, setFeedback, phase, problem, announce, before, review, cancelReview, confirm, history, rollback, lastPrice, lastSummary };
}
