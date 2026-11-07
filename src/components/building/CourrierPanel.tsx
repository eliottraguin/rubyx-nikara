"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createConversationsApi, type Bac, type Conversation, type ConversationList, type ConversationsApi, type ProspectChoice } from "@/lib/api/conversations";
import type { GameState } from "@/lib/api/types";
import { ConversationView } from "./courrier/ConversationView";
import { describeProblem, type CourrierProblem } from "./courrier/errors";
import { Problem } from "./courrier/Problem";

const BACS: { id: Bac; label: string }[] = [
  { id: "a_traiter", label: "À traiter" },
  { id: "en_attente", label: "En attente" },
  { id: "a_ne_plus_contacter", label: "À ne plus contacter" },
  { id: "clos", label: "Clos" },
];

export interface CourrierPanelProps {
  state: GameState;
  /** Injectable pour les tests ; par défaut le client HTTP de la messagerie. */
  api?: ConversationsApi;
}

/**
 * Salle du courrier (section Clients) : une conversation par prospect du carnet, synthèse `triage`, brouillon `replier`.
 * Tutoriel : clients simulés, envoi simulé. Réel : aucun envoi (jalon O). Tout texte reçu ou généré est rendu en texte.
 */
export function CourrierPanel({ state, api: injected }: CourrierPanelProps) {
  const api = useMemo(() => injected ?? createConversationsApi(), [injected]);
  const tutoriel = state.session?.mode !== "expert";
  const [list, setList] = useState<ConversationList | null>(null);
  const [prospects, setProspects] = useState<ProspectChoice[]>([]);
  const [bac, setBac] = useState<Bac | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [pick, setPick] = useState("");
  const [problem, setProblem] = useState<CourrierProblem | null>(null);
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [l, p] = await Promise.all([api.list(), api.prospects().catch(() => [] as ProspectChoice[])]);
      setList(l);
      setProspects(p);
    } catch (e) {
      setProblem(describeProblem(e));
    }
  }, [api]);

  useEffect(() => {
    const t = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(t);
  }, [refresh]);

  const withConv = new Set((list?.items ?? []).map((c) => c.prospect_id));
  const available = prospects.filter((p) => !withConv.has(p.id));
  const shown: Conversation[] = (list?.items ?? []).filter((c) => !bac || c.bac === bac);

  async function open() {
    if (!pick || creating) return;
    setCreating(true);
    setProblem(null);
    try {
      const c = await api.create(pick);
      setPick("");
      setOpenId(c.id);
      await refresh();
    } catch (e) {
      setProblem(describeProblem(e));
    } finally {
      setCreating(false);
    }
  }

  if (openId) {
    return (
      <ConversationView
        key={openId}
        api={api}
        id={openId}
        tutoriel={tutoriel}
        onChanged={() => void refresh()}
        onDeleted={() => {
          setOpenId(null);
          void refresh();
        }}
        onClose={() => setOpenId(null)}
      />
    );
  }

  return (
    <section className="card" aria-labelledby="courrier-title">
      <h2 className="h3" id="courrier-title">
        Salle du courrier
      </h2>
      <p className="note note-info" role="note">
        {tutoriel ? "Clients simulés : rien n'est envoyé hors du jeu." : "Mode Réel : aucun envoi n'est encore possible, et aucun agent n'envoie de message."}
      </p>
      <Problem problem={problem} />

      <div role="group" aria-label="Tableau de bord">
        {BACS.map((b) => (
          <button key={b.id} type="button" className="btn btn-small" aria-pressed={bac === b.id} onClick={() => setBac(bac === b.id ? null : b.id)}>
            {b.label} : {list?.counts[b.id] ?? 0}
          </button>
        ))}
      </div>

      <h3 className="h4">Conversations</h3>
      {!list ? (
        problem ? null : <p className="help">Chargement…</p>
      ) : shown.length === 0 ? (
        <p className="help">{list.items.length === 0 ? "Aucune conversation pour le moment." : "Aucune conversation dans ce bac."}</p>
      ) : (
        <ul aria-label="Liste des conversations">
          {shown.map((c) => (
            <li key={c.id}>
              <button type="button" className="btn btn-small" onClick={() => setOpenId(c.id)}>
                {c.entreprise ?? "Prospect"}
              </button>{" "}
              <span className="help">
                {BACS.find((b) => b.id === c.bac)?.label}
                {c.etat === "desinscrit" ? " · désinscrit" : ""}
              </span>
            </li>
          ))}
        </ul>
      )}

      <h3 className="h4">Ouvrir une conversation</h3>
      {list && prospects.length === 0 ? (
        <p className="help">Votre carnet est vide : ajoutez des prospects depuis un rapport (Archives) pour discuter avec eux.</p>
      ) : available.length === 0 && list ? (
        <p className="help">Tous les prospects du carnet ont déjà une conversation.</p>
      ) : (
        <p>
          <label htmlFor="courrier-prospect">Prospect du carnet </label>
          <select id="courrier-prospect" value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">Choisir…</option>
            {available.map((p) => (
              <option key={p.id} value={p.id}>
                {p.entreprise}
              </option>
            ))}
          </select>{" "}
          <button type="button" className="btn btn-small btn-primary" disabled={!pick || creating} onClick={() => void open()}>
            Ouvrir
          </button>
        </p>
      )}
    </section>
  );
}
