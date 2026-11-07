"use client";

import { useState } from "react";
import { ErrorNote, Notice, Pill } from "@/components/ui";
import { agentBlocker } from "@/game/map/dispatch";
import type { AgentSection, AgentView, ApiError, GameState, RoleId } from "@/lib/api/types";
import { ROLE_LABEL, money } from "@/lib/format";

export const SECTION_LABEL: Record<AgentSection, string> = { prospection: "Prospection", clients: "Clients", pub: "Pub" };
const SECTION_ORDER: AgentSection[] = ["prospection", "clients", "pub"];

/** État d'un agent du garage : possédé, à acheter, fonds insuffisants ou verrouillé (la raison est donnée par `agentBlocker`). */
function AgentStatus({ a, available }: { a: AgentView; available: number }) {
  if (a.owned) return <Pill tone="ok">Possédé</Pill>;
  if (!a.unlocked) return <Pill>Verrouillé</Pill>;
  if (a.price > available) return <Pill tone="warn">Fonds insuffisants</Pill>;
  return <Pill tone="info">À acheter</Pill>;
}

/** Votre immeuble : coffre (trésorerie) et garage (bots, achat). Les prix, soldes et déblocages viennent du serveur. */
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
          Garage
        </h2>
        {done ? (
          <Notice tone="ok" title="Achat confirmé.">
            {ROLE_LABEL[done]} rejoint votre garage.
          </Notice>
        ) : null}
        <ErrorNote error={error} />
        {SECTION_ORDER.map((sec) => {
          const group = state.agents.filter((a) => (a.section ?? "prospection") === sec);
          if (group.length === 0) return null;
          return (
            <div key={sec} role="group" aria-label={`Agents ${SECTION_LABEL[sec]}`}>
              <h3 className="h4">{SECTION_LABEL[sec]}</h3>
              <ul className="agent-list">
                {group.map((a) => {
                  const why = agentBlocker({ owned: a.owned, unlocked: a.unlocked, unlockCondition: a.unlock_condition, price: a.price }, b.available);
                  return (
                    <li key={a.role} className="agent-card">
                      <div className="agent-head">
                        <strong>{ROLE_LABEL[a.role]}</strong>
                        <AgentStatus a={a} available={b.available} />
                      </div>
                      <p className="agent-meta">{a.label && a.label !== ROLE_LABEL[a.role] ? a.label : a.teaches}</p>
                      <p className="agent-meta">
                        Prix : <strong>{a.price === 0 ? "gratuit" : money(a.price)}</strong>
                        {a.owned ? null : <> · Condition : {a.unlock_condition}</>}
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
            </div>
          );
        })}
      </section>
    </div>
  );
}
