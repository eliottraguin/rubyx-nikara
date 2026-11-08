"use client";

import { SECTION_LABEL } from "@/components/map/BasePanel";
import { useState } from "react";
import { BackLink, ErrorNote, Notice, Pill, RequireSession } from "@/components/ui";
import type { AgentView, ApiError, GameState, RoleId } from "@/lib/api";
import { ROLE_LABEL, money } from "@/lib/format";
import { clientsProgressText } from "@/lib/api/adapt";
import { useGame } from "@/lib/game-context";

function Shop({ state }: { state: GameState }) {
  const { mutate, busy } = useGame();
  const [pending, setPending] = useState<RoleId | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [done, setDone] = useState<RoleId | null>(null);

  async function buy(role: RoleId) {
    setError(null);
    const r = await mutate((api) => api.purchaseAgent(role));
    setPending(null);
    if (r.ok) setDone(role);
    else setError(r.error);
  }

  function blocker(a: AgentView): string | null {
    if (a.owned) return "Déjà possédé.";
    if (!a.unlocked) return `Verrouillé : ${a.unlock_condition}.`;
    if (a.price > state.balance.available)
      return `Fonds insuffisants : prix ${money(a.price)}, solde disponible ${money(state.balance.available)}.`;
    return null;
  }

  return (
    <div className="page">
      <BackLink href="/carte">Carte</BackLink>
      <h1>Boutique</h1>
      <p>
        Solde disponible : <strong>{money(state.balance.available)}</strong>. Chaque agent s&apos;achète une seule fois ; le
        serveur vérifie votre solde.
      </p>
      {done ? (
        <Notice tone="ok" title="Achat confirmé.">
          {ROLE_LABEL[done]} fait maintenant partie de votre équipe.
        </Notice>
      ) : null}
      <ErrorNote error={error} />
      <ul className="grid3 list">
        {state.agents.map((a) => {
          const why = blocker(a);
          return (
            <li key={a.role} className="card">
              <h2 className="h3">{ROLE_LABEL[a.role]}</h2>
              {a.section ? <p className="help">Section {SECTION_LABEL[a.section]}</p> : null}
              <p>
                <strong>{a.price === 0 ? "Gratuit" : money(a.price)}</strong>{" "}
                {a.owned ? <Pill tone="ok">Possédé</Pill> : !a.unlocked ? <Pill>Verrouillé</Pill> : a.price > state.balance.available ? <Pill tone="warn">Fonds insuffisants</Pill> : <Pill tone="info">À acheter</Pill>}
              </p>
              <p>{a.teaches}</p>
              <p className="help">Condition : {a.unlock_condition}</p>
              {!a.owned && !a.unlocked && typeof a.unlock_clients === "number" ? (
                <p className="help" data-testid={`progress-${a.role}`}>
                  Progression : {clientsProgressText(state.building?.clients_obtained ?? 0, a.unlock_clients)}
                </p>
              ) : null}
              {pending === a.role ? (
                <div className="confirm" role="group" aria-label={`Confirmer l'achat de ${ROLE_LABEL[a.role]}`}>
                  <p>
                    Acheter <strong>{ROLE_LABEL[a.role]}</strong> pour <strong>{money(a.price)}</strong> ?
                  </p>
                  <button type="button" className="btn btn-primary" onClick={() => void buy(a.role)} disabled={busy}>
                    Confirmer l&apos;achat
                  </button>{" "}
                  <button type="button" className="btn" onClick={() => setPending(null)}>
                    Annuler
                  </button>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setPending(a.role)}
                    disabled={!!why || busy}
                    aria-describedby={why ? `why-${a.role}` : undefined}
                  >
                    Acheter
                  </button>
                  {why ? (
                    <p id={`why-${a.role}`} className="help">
                      {why}
                    </p>
                  ) : null}
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function ShopScreen() {
  return <RequireSession>{(s) => <Shop state={s} />}</RequireSession>;
}
