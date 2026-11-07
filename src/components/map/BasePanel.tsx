"use client";

import { useState } from "react";
import { ErrorNote, Notice, Pill } from "@/components/ui";
import { agentBlocker } from "@/game/map/dispatch";
import type { ApiError, GameState, RoleId } from "@/lib/api/types";
import { ROLE_LABEL, money } from "@/lib/format";

/** Base : coffre (trésorerie) et hangar (agents, achat). Les prix, soldes et déblocages viennent du serveur. */
export function BasePanel({ state, busy, onBuy }: { state: GameState; busy: boolean; onBuy: (role: RoleId) => Promise<ApiError | null> }) {
  const [pending, setPending] = useState<RoleId | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [done, setDone] = useState<RoleId | null>(null);
  const b = state.balance;

  async function buy(role: RoleId) {
    setError(null);
    setDone(null);
    const err = await onBuy(role);
    setPending(null);
    if (err) setError(err);
    else setDone(role);
  }

  return (
    <div className="base-panel">
      <section className="card" aria-labelledby="coffre-title">
        <h2 className="h3" id="coffre-title">
          Coffre
        </h2>
        <dl className="kv">
          <div>
            <dt>Solde disponible</dt>
            <dd>
              <strong>{money(b.available)}</strong>
            </dd>
          </div>
          <div>
            <dt>Solde comptabilisé</dt>
            <dd>{money(b.booked)}</dd>
          </div>
          <div>
            <dt>Réservé (instructions en cours)</dt>
            <dd>{money(b.reserved)}</dd>
          </div>
        </dl>
        <p className="help">Le serveur calcule le solde : une instruction réserve son coût avant l&apos;appel et ne le débite que si la réponse est exploitable.</p>
      </section>

      <section className="card" aria-labelledby="hangar-title2">
        <h2 className="h3" id="hangar-title2">
          Hangar
        </h2>
        {done ? (
          <Notice tone="ok" title="Achat confirmé.">
            {ROLE_LABEL[done]} rejoint votre hangar.
          </Notice>
        ) : null}
        <ErrorNote error={error} />
        <ul className="agent-list">
          {state.agents.map((a) => {
            const why = agentBlocker({ owned: a.owned, unlocked: a.unlocked, unlockCondition: a.unlock_condition, price: a.price }, b.available);
            return (
              <li key={a.role} className="agent-card">
                <div className="agent-head">
                  <strong>{ROLE_LABEL[a.role]}</strong>
                  {a.owned ? <Pill tone="ok">Possédé</Pill> : a.unlocked ? <Pill tone="info">Débloqué</Pill> : <Pill>Verrouillé</Pill>}
                </div>
                <p className="agent-meta">{a.teaches}</p>
                <p className="agent-meta">
                  Prix : <strong>{a.price === 0 ? "gratuit" : money(a.price)}</strong> · Condition : {a.unlock_condition}
                </p>
                {a.owned ? null : pending === a.role ? (
                  <div className="confirm" role="group" aria-label={`Confirmer l'achat de ${ROLE_LABEL[a.role]}`}>
                    <p>
                      Acheter <strong>{ROLE_LABEL[a.role]}</strong> pour <strong>{money(a.price)}</strong> ?
                    </p>
                    <button type="button" className="btn btn-primary btn-small" onClick={() => void buy(a.role)} disabled={busy}>
                      Confirmer l&apos;achat
                    </button>{" "}
                    <button type="button" className="btn btn-small" onClick={() => setPending(null)}>
                      Annuler
                    </button>
                  </div>
                ) : (
                  <>
                    <button type="button" className="btn btn-small btn-primary" onClick={() => setPending(a.role)} disabled={!!why || busy} aria-describedby={why ? `bwhy-${a.role}` : undefined}>
                      Acheter
                    </button>
                    {why ? (
                      <p id={`bwhy-${a.role}`} className="help">
                        {why}
                      </p>
                    ) : null}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
