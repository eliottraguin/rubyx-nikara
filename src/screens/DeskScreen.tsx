"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ErrorNote, Pill, RequireSession, type Tone } from "@/components/ui";
import type { ApiError, GameState, MissionView } from "@/lib/api";
import { MISSION_STATUS_LABEL, ROLE_LABEL, money } from "@/lib/format";
import { useGame } from "@/lib/game-context";

const TONE: Record<MissionView["status"], Tone> = {
  LOCKED: "neutral",
  AVAILABLE: "info",
  ACTIVE: "warn",
  EVALUATING: "warn",
  COMPLETED: "ok",
  FAILED: "bad",
};

function Desk({ state }: { state: GameState }) {
  const router = useRouter();
  const { mutate, busy } = useGame();
  const [error, setError] = useState<ApiError | null>(null);
  const attempt = state.attempt;

  async function open(m: MissionView) {
    setError(null);
    const inProgress = attempt && attempt.mission_id === m.id && (attempt.status === "ACTIVE" || attempt.status === "EVALUATING");
    const replay = m.status === "COMPLETED" || (m.is_rescue && attempt?.mission_id === m.id && !inProgress && attempt?.submission);
    const r = await mutate((api) => (replay ? api.retryMission(m.id) : api.startMission(m.id)));
    if (!r.ok) return setError(r.error);
    const a = r.result.state.attempt;
    if (a) router.push(`/commande/${a.id}`);
  }

  function actionLabel(m: MissionView): string | null {
    const inProgress = attempt && attempt.mission_id === m.id && (attempt.status === "ACTIVE" || attempt.status === "EVALUATING");
    if (inProgress) return "Reprendre la commande";
    if (m.status === "COMPLETED") return "Rejouer pour améliorer le paiement";
    if (m.status === "AVAILABLE") return m.is_rescue ? "Lancer la mission de secours" : "Accepter la commande";
    return null;
  }

  return (
    <div className="page">
      <h1>Bureau de {state.session?.company}</h1>
      <p className="note note-info" role="note">
        Le jeu se joue <strong>sur la carte</strong> : envoyer un agent, consulter l&apos;historique, acheter un agent, voir le coffre. Le bureau est un écran secondaire.{" "}
        <Link className="btn btn-small btn-primary" href="/carte">
          Retour à la carte
        </Link>
      </p>

      <section className="card card-accent" aria-labelledby="next">
        <h2 id="next">Prochaine action</h2>
        <p className="big">{state.next_action}</p>
        <p className="muted">
          {state.stage.label} · Solde disponible {money(state.balance.available)}
        </p>
        {attempt && (attempt.status === "COMPLETED" || attempt.status === "FAILED" || attempt.status === "EVALUATING") && attempt.submission ? (
          <Link className="btn btn-primary" href={`/retour/${attempt.id}`}>
            Voir le retour du client
          </Link>
        ) : null}
      </section>

      <ErrorNote error={error} />

      <section aria-labelledby="orders">
        <h2 id="orders">Commandes</h2>
        <ul className="list">
          {state.missions.map((m) => {
            const label = actionLabel(m);
            return (
              <li key={m.id} className="card order">
                <div>
                  <h3>{m.title}</h3>
                  <p>
                    <Pill tone={TONE[m.status]}>{MISSION_STATUS_LABEL[m.status]}</Pill>{" "}
                    <span className="muted">
                      Récompense max {money(m.max_reward)} · {m.unit_price === 0 ? "appels gratuits" : `${money(m.unit_price)} par appel d'agent`}
                      {m.best_payment > 0 ? ` · meilleur paiement ${money(m.best_payment)}` : ""}
                    </span>
                  </p>
                  {m.status === "LOCKED" && m.unavailable_reason ? (
                    <p className="help">Indisponible : {m.unavailable_reason}</p>
                  ) : null}
                  {m.is_rescue ? <p className="help">Toujours accessible, même sans argent. Rejouable.</p> : null}
                </div>
                {label ? (
                  <button type="button" className="btn btn-primary" onClick={() => void open(m)} disabled={busy}>
                    {label}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="team">
        <h2 id="team">Vos agents</h2>
        <ul className="grid3 list">
          {state.agents.map((a) => (
            <li key={a.role} className="card">
              <h3>{ROLE_LABEL[a.role]}</h3>
              <p>
                {a.owned ? (
                  <Pill tone="ok">Possédé</Pill>
                ) : a.unlocked ? (
                  <Pill tone="info">Achetable · {money(a.price)}</Pill>
                ) : (
                  <Pill>Verrouillé</Pill>
                )}
              </p>
              {!a.owned && !a.unlocked ? <p className="help">{a.unlock_condition}</p> : null}
            </li>
          ))}
        </ul>
        <Link className="btn" href="/boutique">
          Ouvrir la boutique
        </Link>
      </section>
    </div>
  );
}

export function DeskScreen() {
  return <RequireSession>{(s) => <Desk state={s} />}</RequireSession>;
}
