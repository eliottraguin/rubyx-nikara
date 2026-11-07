"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { BriefBlock, CriteriaList, DocumentList } from "@/components/OrderParts";
import { BackLink, ErrorNote, Notice, Pill, RequireSession } from "@/components/ui";
import type { ApiError, AttemptView, GameState } from "@/lib/api";
import { ATTEMPT_STATUS_LABEL, money } from "@/lib/format";
import { useGame } from "@/lib/game-context";

function Order({ state, attemptId }: { state: GameState; attemptId: string }) {
  const { mutate, busy } = useGame();
  const [q, setQ] = useState("");
  const [error, setError] = useState<ApiError | null>(null);
  const a: AttemptView | null = state.attempt && state.attempt.id === attemptId ? state.attempt : null;
  const beginner = state.session?.mode === "beginner";

  if (!a)
    return (
      <div className="card">
        <h1>Commande introuvable</h1>
        <p>Cette commande n&apos;existe pas dans votre partie en cours.</p>
        <Link className="btn btn-primary" href="/bureau">
          Retour au bureau
        </Link>
      </div>
    );

  const cl = a.clarifications;
  const left = cl.max - cl.used;

  async function ask(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const r = await mutate((api) => api.askClarification(attemptId, q.trim()));
    if (r.ok) setQ("");
    else setError(r.error);
  }

  return (
    <div className="page">
      <BackLink href="/bureau">Bureau</BackLink>
      <h1>{a.mission_title}</h1>
      <p>
        <Pill tone={a.status === "ACTIVE" ? "warn" : a.status === "COMPLETED" ? "ok" : "neutral"}>{ATTEMPT_STATUS_LABEL[a.status]}</Pill>{" "}
        <span className="muted">
          Tentative n° {a.attempt_no} · Récompense maximale {money(a.max_reward)} ·{" "}
          {a.unit_price === 0 ? "appels d'agent gratuits" : `${money(a.unit_price)} par appel d'agent (tarif figé)`}
        </span>
      </p>

      {beginner && a.status === "ACTIVE" && a.messages.length === 0 ? (
        <Notice tone="info" title="Étape 1 sur 4 : lisez le client.">
          Lisez le brief, les documents et les critères ci-dessous. Posez une question au client si une information manque.
          Quand vous êtes prêt, ouvrez l&apos;atelier.
        </Notice>
      ) : null}

      <div className="grid2">
        <section className="card" aria-labelledby="brief">
          <h2 id="brief">Le brief</h2>
          <BriefBlock brief={a.brief} />
        </section>
        <section className="card" aria-labelledby="crit">
          <h2 id="crit">Ce que le client vérifiera</h2>
          <CriteriaList criteria={a.criteria} />
        </section>
      </div>

      <section className="card" aria-labelledby="docs">
        <h2 id="docs">Documents datés</h2>
        <DocumentList documents={a.documents} />
      </section>

      <section className="card" aria-labelledby="clar">
        <h2 id="clar">Questions au client</h2>
        <p role="status">
          <strong>
            {cl.used}/{cl.max}
          </strong>{" "}
          questions posées. Elles sont gratuites et ne comptent pas dans les messages des agents. Le client répond
          uniquement à des questions factuelles.
        </p>
        {cl.items.length > 0 ? (
          <dl className="qa">
            {cl.items.map((c) => (
              <div key={c.id}>
                <dt>Vous : {c.question}</dt>
                <dd>Client : {c.answer}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {a.status !== "ACTIVE" ? (
          <p className="help">Commande non active : plus de question possible.</p>
        ) : left <= 0 ? (
          <p className="help">Plus de question disponible (limite de {cl.max} atteinte).</p>
        ) : (
          <form onSubmit={ask} className="field">
            <label htmlFor="q">Votre question (il en reste {left})</label>
            <input id="q" value={q} onChange={(e) => setQ(e.target.value)} maxLength={300} />
            <button type="submit" className="btn" disabled={busy || q.trim().length < 3}>
              Poser la question
            </button>
          </form>
        )}
        <ErrorNote error={error} />
      </section>

      <div className="row">
        {a.status === "ACTIVE" ? (
          <Link
            className="btn btn-primary"
            href={`/atelier/${a.id}`}
            onClick={() => {
              try {
                window.sessionStorage.setItem(`tuto-read-${a.id}`, "1");
              } catch {
                /* ignoré */
              }
            }}
          >
            {beginner ? "J'ai lu la commande : ouvrir l'atelier" : "Ouvrir l'atelier"}
          </Link>
        ) : a.submission ? (
          <Link className="btn btn-primary" href={`/retour/${a.id}`}>
            Voir le retour du client
          </Link>
        ) : null}
      </div>
    </div>
  );
}

export function OrderScreen({ attemptId }: { attemptId: string }) {
  return <RequireSession>{(s) => <Order state={s} attemptId={attemptId} />}</RequireSession>;
}
