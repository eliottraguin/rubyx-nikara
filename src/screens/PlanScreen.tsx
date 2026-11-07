"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BackLink, ErrorNote, Loading, Notice, RequireSession } from "@/components/ui";
import type { ActionView, ApiError } from "@/lib/api";
import { ACTION_STATUS_LABEL, ROLE_LABEL, money } from "@/lib/format";
import { useGame } from "@/lib/game-context";

function Plan({ actionId }: { actionId: string }) {
  const router = useRouter();
  const { api, mutate, busy, live } = useGame();
  const [action, setAction] = useState<ActionView | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    if (!api) return;
    let cancelled = false;
    api
      .getAction(actionId)
      .then((a) => !cancelled && setAction(a))
      .catch((e) => !cancelled && setError(e as ApiError));
    return () => {
      cancelled = true;
    };
  }, [api, actionId]);

  const current = live[actionId] ?? action;
  const plan = current?.plan ?? action?.plan;
  const attemptId = current?.attempt_id;

  async function confirm() {
    setError(null);
    const r = await mutate((a) => a.confirmAction(actionId));
    if (r.ok && r.result.action) setAction(r.result.action);
    else if (!r.ok) setError(r.error);
  }

  if (!current) return error ? <ErrorNote error={error} /> : <Loading />;

  return (
    <div className="page narrow">
      <BackLink href={attemptId ? `/atelier/${attemptId}` : "/bureau"}>Atelier</BackLink>
      <h1>Plan du chef d&apos;équipe</h1>
      <p>
        Statut : <strong>{ACTION_STATUS_LABEL[current.status]}</strong>
      </p>
      {plan ? (
        <>
          <section className="card" aria-labelledby="sum">
            <h2 id="sum">Résumé</h2>
            <p>{plan.summary}</p>
            <ol className="steps">
              {plan.steps.map((s, i) => (
                <li key={i}>
                  <strong>{ROLE_LABEL[s.role]}</strong> : {s.task}
                  {s.source_ids && s.source_ids.length > 0 ? <span className="help block">Pièces : {s.source_ids.join(", ")}</span> : null}
                  {s.depends_on !== undefined ? <span className="help block">Après l&apos;étape {s.depends_on + 1}</span> : null}
                </li>
              ))}
            </ol>
          </section>
          <section className="card" aria-labelledby="cost">
            <h2 id="cost">Surcoût</h2>
            <p>
              Montant maximal à réserver : <strong>{money(plan.extra_cost_max)}</strong>
            </p>
            <ul className="plain">
              {Object.entries(plan.roles_cost_max).map(([r, c]) => (
                <li key={r}>
                  {ROLE_LABEL[r as keyof typeof ROLE_LABEL]} : jusqu&apos;à {money(c)} et 1 message
                </li>
              ))}
            </ul>
            <p className="help">Le plan est contrôlé par le serveur (2 étapes maximum, agents possédés). Confirmer ne relance pas de nouvelle planification.</p>
          </section>
        </>
      ) : null}

      {current.status === "AWAITING_CONFIRMATION" ? (
        <div className="confirm" role="group" aria-label="Confirmation du plan">
          <p>Confirmez-vous ce plan et son surcoût maximal de {plan ? money(plan.extra_cost_max) : "–"} ?</p>
          <button type="button" className="btn btn-primary" onClick={() => void confirm()} disabled={busy}>
            Confirmer le plan et le surcoût
          </button>{" "}
          <Link className="btn" href={attemptId ? `/atelier/${attemptId}` : "/bureau"}>
            Refuser et revenir
          </Link>
        </div>
      ) : (
        <Notice tone="info" title="Plan confirmé.">
          {current.progress_label ?? "Les délégations sont en cours ou terminées."}{" "}
          <button type="button" className="btn btn-small" onClick={() => router.push(attemptId ? `/atelier/${attemptId}` : "/bureau")}>
            Retour à l&apos;atelier
          </button>
        </Notice>
      )}
      <ErrorNote error={error} />
    </div>
  );
}

export function PlanScreen({ actionId }: { actionId: string }) {
  return <RequireSession>{() => <Plan actionId={actionId} />}</RequireSession>;
}
