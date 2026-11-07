"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loading, ErrorNote, Notice, Pill, RequireSession, type Tone } from "@/components/ui";
import type { ApiError, EvaluationView, GameState } from "@/lib/api";
import { SUBMISSION_STATUS_LABEL, money } from "@/lib/format";
import { useGame } from "@/lib/game-context";

function ratingText(r: number): { label: string; tone: Tone } {
  if (r >= 1) return { label: "Atteint", tone: "ok" };
  if (r > 0) return { label: "Partiellement atteint", tone: "warn" };
  return { label: "Non atteint", tone: "bad" };
}

function Result({ ev, state }: { ev: EvaluationView; state: GameState }) {
  const p = ev.payment;
  return (
    <>
      <section className="card card-accent" aria-labelledby="score">
        <h2 id="score">Note du client</h2>
        <p className="score">
          {ev.score}
          <span className="muted">/100</span>
        </p>
        <p>
          {ev.out_of_scope ? <Pill tone="bad">Hors sujet</Pill> : ev.passed ? <Pill tone="ok">Commande réussie</Pill> : <Pill tone="bad">Commande non réussie</Pill>}
        </p>
        {ev.capped_by_essential ? (
          <p className="help">La note est plafonnée parce qu&apos;un critère essentiel n&apos;est pas rempli.</p>
        ) : null}
        <p className="quote">« {ev.client_feedback} »</p>
      </section>

      <section className="card" aria-labelledby="crit">
        <h2 id="crit">Critères : réussites et écarts</h2>
        <ul className="plain">
          {ev.criteria.map((c) => {
            const meta = ev.criteria_labels[c.id];
            const t = ratingText(c.rating);
            return (
              <li key={c.id} className="crit">
                <p>
                  <strong>{meta?.label ?? c.id}</strong> <Pill tone={t.tone}>{t.label}</Pill>{" "}
                  {meta?.essential ? <Pill>Essentiel</Pill> : null}
                </p>
                <p>{c.comment}</p>
                {c.evidence ? <p className="help">Dans votre texte : « {c.evidence} »</p> : null}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card" aria-labelledby="pay">
        <h2 id="pay">Paiement et dépenses</h2>
        {p.already_awarded ? (
          <Notice tone="info" title="Récompense déjà attribuée.">
            Cette livraison a déjà été payée : aucun nouveau paiement n&apos;est ajouté.
          </Notice>
        ) : null}
        <dl className="kv">
          <div>
            <dt>Paiement crédité maintenant</dt>
            <dd>
              <strong>{money(p.credited)}</strong>
            </dd>
          </div>
          <div>
            <dt>Paiement cible pour cette note (max {money(p.max_reward)})</dt>
            <dd>{money(p.target)}</dd>
          </div>
          <div>
            <dt>Déjà acquis avant cette livraison</dt>
            <dd>{money(p.already_acquired)}</dd>
          </div>
          <div>
            <dt>Dépenses de la commande</dt>
            <dd>{money(ev.spent)}</dd>
          </div>
          <div>
            <dt>Solde disponible</dt>
            <dd>{money(state.balance.available)}</dd>
          </div>
        </dl>
      </section>

      <section className="card" aria-labelledby="next">
        <h2 id="next">Prochain objectif</h2>
        <p>{ev.next_action}</p>
        {ev.coach_note ? (
          <p className="note note-info">
            <strong>Conseil du coach : </strong>
            {ev.coach_note}
          </p>
        ) : null}
      </section>
    </>
  );
}

function Feedback({ state, attemptId }: { state: GameState; attemptId: string }) {
  const router = useRouter();
  const { mutate, busy } = useGame();
  const [error, setError] = useState<ApiError | null>(null);
  const a = state.attempt && state.attempt.id === attemptId ? state.attempt : null;
  const sub = a?.submission;

  if (!a || !sub)
    return (
      <div className="card">
        <h1>Aucune livraison</h1>
        <p>Cette commande n&apos;a pas encore été livrée.</p>
        <Link className="btn btn-primary" href={a ? `/atelier/${attemptId}` : "/bureau"}>
          Continuer
        </Link>
      </div>
    );

  async function retryEval() {
    setError(null);
    const r = await mutate((api) => api.submit(attemptId, { artifact_version_id: sub!.artifact_version_id, brief_version: sub!.brief_version }));
    if (!r.ok) setError(r.error);
  }
  async function replay() {
    setError(null);
    const r = await mutate((api) => api.retryMission(a!.mission_id));
    if (!r.ok) return setError(r.error);
    if (r.result.state.attempt) router.push(`/commande/${r.result.state.attempt.id}`);
  }

  const completed = a.status === "COMPLETED";
  return (
    <div className="page narrow">
      <h1>Retour du client</h1>
      <p>
        {a.mission_title} · <Pill tone={sub.status === "EVALUATED" ? "ok" : "warn"}>{SUBMISSION_STATUS_LABEL[sub.status]}</Pill>
        {completed ? <> <Pill tone="ok">Mission terminée</Pill></> : null}
      </p>

      {sub.status === "EVALUATING" ? (
        <>
          <Loading label="Le client lit votre livraison… (cette page se met à jour toute seule)" />
          <p className="help">Version livrée figée : version {a.artifacts.find((v) => v.id === sub.artifact_version_id)?.number ?? "?"}, brief v{sub.brief_version}.</p>
        </>
      ) : null}

      {sub.status === "EVALUATION_PENDING" ? (
        <Notice tone="warn" title="Évaluation en attente.">
          Un incident technique a empêché l&apos;évaluation. Votre livraison est conservée et aucune note n&apos;a été inventée.
          Vous pouvez relancer l&apos;évaluation.
          <div className="row">
            <button type="button" className="btn btn-primary" onClick={() => void retryEval()} disabled={busy}>
              Relancer l&apos;évaluation
            </button>
          </div>
        </Notice>
      ) : null}

      {sub.evaluation ? <Result ev={sub.evaluation} state={state} /> : null}
      <ErrorNote error={error} />

      <div className="row">
        <Link className="btn btn-primary" href="/bureau">
          Retour au bureau
        </Link>
        {sub.evaluation ? (
          <button type="button" className="btn" onClick={() => void replay()} disabled={busy}>
            {sub.evaluation.payment.target < sub.evaluation.payment.max_reward ? "Corriger et relivrer (nouvelle tentative)" : "Rejouer cette commande"}
          </button>
        ) : null}
        <Link className="btn" href="/boutique">
          Boutique
        </Link>
        <Link className="btn" href="/carnet">
          Carnet et bilan
        </Link>
      </div>
    </div>
  );
}

export function FeedbackScreen({ attemptId }: { attemptId: string }) {
  return <RequireSession>{(s) => <Feedback state={s} attemptId={attemptId} />}</RequireSession>;
}
