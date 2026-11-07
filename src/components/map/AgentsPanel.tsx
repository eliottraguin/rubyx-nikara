"use client";

import { useState } from "react";
import { ErrorNote, Notice, Pill } from "@/components/ui";
import { agentBlocker, buildAgentSlots, checkDispatch, expeditionStep, type AgentSlot } from "@/game/map/dispatch";
import { TRIP_PHASE_LABEL, type Trip } from "@/game/map/trips";
import type { PlanetVM } from "@/game/map/viewmodel";
import type { ApiError, AttemptView, GameState, RoleId } from "@/lib/api/types";
import { money } from "@/lib/format";
import { DEFAULT_PROMPT_MAX_CHARS } from "@/lib/send-rules";

interface Props {
  state: GameState;
  planet: PlanetVM;
  attempt: AttemptView | null;
  trips: Trip[];
  now: number;
  reduced: boolean;
  busy: boolean;
  /** Envoie l'agent (ouvre l'expédition si besoin) ; renvoie l'erreur serveur, ou null si l'envoi est parti. */
  onDispatch: (input: { role: RoleId; text: string; docIds: string[] }) => Promise<ApiError | null>;
  onBuy: (role: RoleId) => Promise<ApiError | null>;
  onOpenBase: () => void;
}

const costText = (n: number, free: boolean) => (free ? "gratuit (crédit exceptionnel)" : n === 0 ? "gratuit" : money(n));

/**
 * Panneau de droite d'une planète : agents déjà envoyés (état, instructions restantes, coût) et formulaire pour en
 * envoyer un autre. Prix, quotas et droits viennent du serveur ; les envois impossibles sont expliqués.
 */
export function AgentsPanel({ state, planet, attempt, trips, now, reduced, busy, onDispatch, onBuy, onOpenBase }: Props) {
  const slots = buildAgentSlots({ state, planet, attempt, trips, now, reduced });
  const sent = slots.filter((s) => s.kind === "sent");
  const [picked, setPicked] = useState<RoleId | null>(null);
  const [text, setText] = useState("");
  const [docIds, setDocIds] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [buying, setBuying] = useState<RoleId | null>(null);

  const firstOwned = slots.find((s) => s.owned)?.role ?? null;
  const role = picked ?? firstOwned;
  const slot = slots.find((s) => s.role === role) ?? null;
  const maxChars = state.limits?.prompt_max_chars ?? DEFAULT_PROMPT_MAX_CHARS;
  const check = checkDispatch({ planet, attempt, slot, balance: state.balance, text, maxChars, busyRole: !!slot?.phase });
  const step = expeditionStep(planet, attempt);
  const locked = planet.status === "locked";
  const remainingAfter = slot ? Math.max(0, slot.remaining - 1) : 0;
  const docs = attempt?.documents ?? [];

  async function confirm() {
    if (!slot || !check.allowed) return;
    setError(null);
    setNotice(null);
    const err = await onDispatch({ role: slot.role, text: text.trim(), docIds });
    setConfirming(false);
    if (err) setError(err);
    else {
      setNotice(`${slot.label} quitte la base pour ${planet.name}. Suivez son voyage sur la carte.`);
      setText("");
      setDocIds([]);
    }
  }

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
          Agents sur {planet.name}
        </h2>
        {sent.length === 0 ? (
          <p className="muted">Aucun agent n&apos;a encore été envoyé ici. Choisissez-en un ci-dessous et rédigez sa mission.</p>
        ) : (
          <ul className="agent-list">
            {sent.map((a) => (
              <li key={a.role} className={`agent-card agent-${a.phase ?? "back"}`}>
                <div className="agent-head">
                  <strong>{a.label}</strong>
                  <span className={`phase-chip phase-${a.phase ?? "home"}`}>
                    <span className="phase-dot" aria-hidden="true" />
                    {a.stateLabel}
                  </span>
                </div>
                <p className="agent-meta">
                  Instructions : <strong>{a.used}</strong> sur {a.limit} · il en reste <strong>{a.remaining}</strong>
                </p>
                <p className="agent-meta">Prochaine instruction : {costText(a.costMax, a.free)}</p>
                {a.phase ? <p className="agent-phase">{TRIP_PHASE_LABEL[a.phase]}…</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="ap-new" className="ap-block">
        <h2 className="h3" id="ap-new">
          Envoyer un agent
        </h2>
        {locked ? (
          <Notice tone="warn" title="Planète verrouillée.">
            {planet.unlockText}
          </Notice>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (check.allowed) setConfirming(true);
            }}
          >
            <fieldset className="role-picker">
              <legend>1. Choisissez l&apos;agent</legend>
              <ul className="role-list">
                {slots.map((s: AgentSlot) => {
                  const why = s.owned ? null : agentBlocker(s, state.balance.available);
                  return (
                    <li key={s.role} className={`role-card ${role === s.role ? "role-on" : ""} ${s.owned ? "" : "role-off"}`}>
                      {s.owned ? (
                        <label className="role-choice">
                          <input type="radio" name="role" value={s.role} checked={role === s.role} onChange={() => setPicked(s.role)} />
                          <span>
                            <strong>{s.label}</strong>
                            <span className="role-sub">
                              {s.used}/{s.limit} instructions · {costText(s.costMax, s.free)}
                            </span>
                          </span>
                          <Pill tone={s.phase ? "warn" : "ok"}>{s.stateLabel}</Pill>
                        </label>
                      ) : (
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
                      )}
                    </li>
                  );
                })}
              </ul>
            </fieldset>

            <div className="field">
              <label htmlFor="mission-text">2. Rédigez sa mission</label>
              <p className="help" id="mission-help">
                {planet.promptHint}
              </p>
              <textarea
                id="mission-text"
                rows={5}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setConfirming(false);
                }}
                aria-describedby="mission-help mission-count"
                aria-invalid={text.length > maxChars}
                placeholder="Ex. : Trouve 5 restaurants à Lyon avec leur site et leur téléphone."
                disabled={busy}
              />
              <p id="mission-count" className={`help count ${text.length > maxChars ? "count-bad" : ""}`}>
                {text.length} / {maxChars} caractères
              </p>
              <div className="examples" role="group" aria-label="Exemples de mission">
                <span className="help">Besoin d&apos;inspiration ?</span>
                {planet.examples.map((ex, i) => (
                  <button key={ex} type="button" className="btn btn-small" onClick={() => setText(ex)} disabled={busy}>
                    Exemple {i + 1}
                  </button>
                ))}
              </div>
            </div>

            {docs.length > 0 ? (
              <fieldset className="docs-pick">
                <legend>Pièces à transmettre (facultatif)</legend>
                {docs.map((d) => (
                  <label key={d.id} className="check">
                    <input type="checkbox" checked={docIds.includes(d.id)} onChange={(e) => setDocIds((cur) => (e.target.checked ? [...cur, d.id] : cur.filter((x) => x !== d.id)))} />
                    {d.title}
                  </label>
                ))}
              </fieldset>
            ) : null}

            <div className="cost-box" role="group" aria-label="Récapitulatif avant envoi">
              {slot ? (
                <dl className="kv">
                  <div>
                    <dt>Coût maximal de cette instruction</dt>
                    <dd>
                      <strong>{costText(slot.costMax, slot.free)}</strong>
                    </dd>
                  </div>
                  <div>
                    <dt>Solde disponible</dt>
                    <dd>{money(state.balance.available)}</dd>
                  </div>
                  <div>
                    <dt>Instructions de {slot.label}</dt>
                    <dd>
                      {slot.remaining} restante{slot.remaining > 1 ? "s" : ""} sur {slot.limit}
                      {slot.owned && slot.remaining > 0 ? ` (${remainingAfter} après cet envoi)` : ""}
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="help">Choisissez un agent pour voir le coût et les instructions restantes.</p>
              )}
              {step === "start" ? <p className="help">Une expédition sera ouverte sur cette planète à l&apos;envoi ; le serveur fige son tarif.</p> : null}
              {step === "retry" ? <p className="help">Cette planète a déjà été visitée : une nouvelle expédition sera ouverte ; seul l&apos;écart de gain est versé.</p> : null}
            </div>

            {check.reasons.length > 0 && (text.length > 0 || !slot?.owned || locked) ? (
              <ul className="why-list" aria-label="Pourquoi l'envoi est impossible">
                {check.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            ) : null}

            <ErrorNote error={error} />
            {notice ? (
              <p className="note note-ok" role="status">
                {notice}
              </p>
            ) : null}

            {confirming && slot ? (
              <div className="confirm" role="group" aria-label="Confirmer l'envoi">
                <p>
                  Envoyer <strong>{slot.label}</strong> sur <strong>{planet.name}</strong> ? Coût maximal : <strong>{costText(slot.costMax, slot.free)}</strong>. Il lui restera{" "}
                  <strong>{remainingAfter}</strong> instruction{remainingAfter > 1 ? "s" : ""}.
                </p>
                <button type="button" className="btn btn-primary" onClick={() => void confirm()} disabled={busy || !check.allowed}>
                  {busy ? "Envoi…" : "Confirmer l'envoi"}
                </button>{" "}
                <button type="button" className="btn" onClick={() => setConfirming(false)} disabled={busy}>
                  Modifier
                </button>
              </div>
            ) : (
              <button type="submit" className="btn btn-primary btn-wide" disabled={!check.allowed || busy}>
                Envoyer l&apos;agent
              </button>
            )}
          </form>
        )}
        <p className="help">
          Le hangar et le coffre sont sur la base.{" "}
          <button type="button" className="linklike" onClick={onOpenBase}>
            Ouvrir la base
          </button>
        </p>
      </section>
    </div>
  );
}
