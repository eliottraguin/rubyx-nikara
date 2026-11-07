"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { BriefBlock, CriteriaList } from "@/components/OrderParts";
import { BackLink, ErrorNote, Notice, Pill, RequireSession } from "@/components/ui";
import type { ApiError, GameState } from "@/lib/api";
import { ROLE_LABEL } from "@/lib/format";
import { useGame } from "@/lib/game-context";
import { SafeMarkdown } from "@/lib/markdown";

function Delivery({ state, attemptId }: { state: GameState; attemptId: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const { mutate, busy } = useGame();
  const a = state.attempt && state.attempt.id === attemptId ? state.attempt : null;
  const [chosen, setChosen] = useState<string | null>(params.get("v"));
  const [error, setError] = useState<ApiError | null>(null);

  if (!a)
    return (
      <div className="card">
        <h1>Livraison introuvable</h1>
        <Link className="btn btn-primary" href="/bureau">
          Retour au bureau
        </Link>
      </div>
    );

  const latest = a.artifacts[a.artifacts.length - 1];
  const sel = a.artifacts.find((v) => v.id === chosen) ?? latest;
  const already = a.submission && a.status !== "ACTIVE";

  async function confirm() {
    if (!sel) return;
    setError(null);
    const r = await mutate((api) => api.submit(attemptId, { artifact_version_id: sel.id, brief_version: a!.brief.version }));
    if (r.ok) router.push(`/retour/${attemptId}`);
    else setError(r.error);
  }

  return (
    <div className="page narrow">
      <BackLink href={`/atelier/${attemptId}`}>Atelier</BackLink>
      <h1>Livrer au client</h1>
      {already ? (
        <Notice tone="info" title="Déjà livrée.">
          Cette commande a déjà été livrée : la version est figée. <Link href={`/retour/${attemptId}`}>Voir le retour du client</Link>
        </Notice>
      ) : null}
      {a.artifacts.length === 0 ? (
        <Notice tone="warn" title="Livraison impossible.">
          Aucun livrable n&apos;existe encore. <Link href={`/atelier/${attemptId}`}>Retour à l&apos;atelier</Link>
        </Notice>
      ) : (
        <>
          <fieldset className="versions">
            <legend>Choisissez la version à livrer</legend>
            {a.artifacts.map((v) => (
              <label key={v.id} className={`ver ${sel?.id === v.id ? "ver-on" : ""}`}>
                <input type="radio" name="v" checked={sel?.id === v.id} onChange={() => setChosen(v.id)} disabled={!!already} />
                <span>
                  Version {v.number} · {v.author === "agent" ? `texte généré (${v.role ? ROLE_LABEL[v.role] : "agent"})` : "modification manuelle (vous)"}
                </span>
              </label>
            ))}
          </fieldset>
          {sel ? (
            <section className="card" aria-label="Version sélectionnée">
              <p>
                <Pill tone={sel.author === "agent" ? "info" : "warn"}>{sel.author === "agent" ? "Texte généré" : "Modification manuelle"}</Pill>{" "}
                Version {sel.number}
              </p>
              <SafeMarkdown text={sel.content} />
            </section>
          ) : null}

          <section className="card" aria-labelledby="recap">
            <h2 id="recap">Brief applicable à cette livraison</h2>
            <BriefBlock brief={a.brief} />
            <h3 className="h4">Critères</h3>
            <CriteriaList criteria={a.criteria} />
          </section>

          <ErrorNote error={error} />
          {!already && sel ? (
            <div className="confirm" role="group" aria-label="Confirmer la livraison">
              <p>
                Vous allez livrer la <strong>version {sel.number}</strong> ({sel.author === "agent" ? "texte généré" : "modification manuelle"})
                pour le <strong>brief version {a.brief.version}</strong>. La livraison sera <strong>figée</strong> : vous ne pourrez plus la modifier.
              </p>
              <button type="button" className="btn btn-primary" onClick={() => void confirm()} disabled={busy}>
                {busy ? "Envoi…" : `Confirmer la livraison de la version ${sel.number}`}
              </button>{" "}
              <Link className="btn" href={`/atelier/${attemptId}`}>
                Annuler
              </Link>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

export function DeliveryScreen({ attemptId }: { attemptId: string }) {
  return <RequireSession>{(s) => <Delivery state={s} attemptId={attemptId} />}</RequireSession>;
}
