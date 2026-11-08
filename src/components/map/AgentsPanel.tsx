"use client";

import { useState } from "react";
import { ErrorNote, Pill } from "@/components/ui";
import { agentBlocker, buildAgentSlots, type AgentSlot } from "@/game/map/dispatch";
import { TRIP_PHASE_LABEL, type Trip } from "@/game/map/trips";
import type { PlanetVM } from "@/game/map/viewmodel";
import type { ApiError, GameState, RoleId } from "@/lib/api/types";
import { money } from "@/lib/format";

interface Props {
  state: GameState;
  planet: PlanetVM;
  trips: Trip[];
  now: number;
  reduced: boolean;
  busy: boolean;
  onBuy: (role: RoleId) => Promise<ApiError | null>;
  onOpenBase: () => void;
}

/**
 * Panneau d'un lieu (en surimpression) : bots en route et achat des bots manquants. La recherche elle-même
 * (SearchLauncher) est affichée au-dessus. Prix et droits viennent du serveur.
 */
export function AgentsPanel({ state, planet, trips, now, reduced, busy, onBuy, onOpenBase }: Props) {
  const slots = buildAgentSlots({ state, planet, trips, now, reduced });
  const out = slots.filter((s) => s.phase);
  const others = slots.filter((s) => !s.owned);
  const [error, setError] = useState<ApiError | null>(null);
  const [buying, setBuying] = useState<RoleId | null>(null);

  async function buy(r: RoleId) {
    setError(null);
    const err = await onBuy(r);
    setBuying(null);
    if (err) setError(err);
  }

  return (
    <div className="agents-panel">
      <section aria-labelledby="ap-sent" className="ap-block">
        <h2 className="h3" id="ap-sent">
          Bots vers {planet.title}
        </h2>
        {out.length === 0 ? (
          <p className="muted">Aucun bot n&apos;est en route vers ce lieu.</p>
        ) : (
          <ul className="agent-list">
            {out.map((a) => (
              <li key={a.role} className={`agent-card agent-${a.phase ?? "back"}`}>
                <div className="agent-head">
                  <strong>{a.label}</strong>
                  <span className={`phase-chip phase-${a.phase ?? "home"}`}>
                    <span className="phase-dot" aria-hidden="true" />
                    {a.stateLabel}
                  </span>
                </div>
                {a.phase ? <p className="agent-phase">{TRIP_PHASE_LABEL[a.phase]}…</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="ap-new" className="ap-block">
        <h2 className="h3" id="ap-new">
          Autres bots
        </h2>
        {others.length === 0 ? <p className="muted">Tous vos bots sont au garage ou en route.</p> : null}
        {others.length > 0 ? (
          <ul className="role-list">
            {others.map((s: AgentSlot) => {
              const why = agentBlocker(s, state.balance.available);
              return (
                <li key={s.role} className="role-card role-off">
                  <div className="role-choice role-choice-off">
                    <span>
                      <strong>{s.label}</strong>
                      <span className="role-sub">{s.kind === "buyable" ? `À acheter : ${money(s.price)}` : `Verrouillé : ${s.unlockCondition}`}</span>
                    </span>
                    {buying === s.role ? (
                      <span className="role-confirm" role="group" aria-label={`Confirmer l'achat de ${s.label}`}>
                        <button type="button" className="btn btn-small btn-primary" onClick={() => void buy(s.role)} disabled={busy}>
                          Confirmer {money(s.price)}
                        </button>
                        <button type="button" className="btn btn-small" onClick={() => setBuying(null)}>
                          Annuler
                        </button>
                      </span>
                    ) : (
                      <button type="button" className="btn btn-small" onClick={() => setBuying(s.role)} disabled={!!why || busy} aria-describedby={why ? `why-${s.role}` : undefined}>
                        Acheter
                      </button>
                    )}
                    {why ? (
                      <span id={`why-${s.role}`} className="role-why">
                        {why}
                      </span>
                    ) : null}
                  </div>
                  <Pill tone="neutral">{s.stateLabel}</Pill>
                </li>
              );
            })}
          </ul>
        ) : null}
        <ErrorNote error={error} />
        <p className="help">
          Le garage et le coffre sont dans votre immeuble.{" "}
          <button type="button" className="linklike" onClick={onOpenBase}>
            Ouvrir l&apos;immeuble
          </button>
        </p>
      </section>
    </div>
  );
}
