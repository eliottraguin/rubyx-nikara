"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BackLink, ErrorNote, Loading, Notice, RequireSession } from "@/components/ui";
import type { ApiError, GameState, NotebookEntry } from "@/lib/api";
import { ROLE_LABEL, money } from "@/lib/format";
import { useGame } from "@/lib/game-context";

function Notebook({ state }: { state: GameState }) {
  const router = useRouter();
  const { api, setState } = useGame();
  const [entries, setEntries] = useState<NotebookEntry[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const bilan = state.bilan;
  const attempt = state.attempt;

  useEffect(() => {
    if (!api) return;
    if (state.notebook_enabled === false) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- route serveur pas encore livrée : liste vide, explication affichée
      setEntries([]);
      return;
    }
    let cancelled = false;
    api
      .listNotebook()
      .then((e) => !cancelled && setEntries(e))
      .catch((e) => !cancelled && setError(e as ApiError));
    return () => {
      cancelled = true;
    };
  }, [api, state.notebook_enabled]);

  function reuse(e: NotebookEntry) {
    try {
      window.sessionStorage.setItem("reuse-prompt", e.prompt);
    } catch {
      /* ignoré */
    }
    router.push(attempt && attempt.status === "ACTIVE" ? `/atelier/${attempt.id}` : "/bureau");
  }

  async function reset() {
    if (!api) return;
    try {
      await api.deleteSession();
      setState(null);
      router.push("/");
    } catch (e) {
      setError(e as ApiError);
    }
  }

  return (
    <div className="page">
      <BackLink href="/bureau">Bureau</BackLink>
      <h1>Carnet et bilan</h1>
      <ErrorNote error={error} />

      <section className="card" aria-labelledby="nb">
        <h2 id="nb">Carnet de prompts</h2>
        <p className="help">
          Vos instructions sauvegardées. Adaptez-les au nouveau brief avant de les réutiliser : un envoi, même réutilisé,
          consomme un message.
        </p>
        {state.notebook_enabled === false ? (
          <Notice tone="info" title="Carnet bientôt disponible.">
            L&apos;enregistrement des instructions n&apos;est pas encore proposé par le serveur de jeu. Vos messages restent visibles dans l&apos;atelier.
          </Notice>
        ) : entries === null ? (
          <Loading />
        ) : entries.length === 0 ? (
          <p>Aucune instruction sauvegardée. Dans l&apos;atelier, utilisez « Enregistrer dans le carnet » sous un de vos messages.</p>
        ) : (
          <ul className="list">
            {entries.map((e) => (
              <li key={e.id} className="card">
                <h3 className="h4">
                  {e.title} <span className="muted">· {ROLE_LABEL[e.role]} · {e.mission_id.toUpperCase()}</span>
                </h3>
                <p className="pre">{e.prompt}</p>
                <button type="button" className="btn btn-small" onClick={() => reuse(e)}>
                  Préparer dans l&apos;atelier (à adapter)
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card" aria-labelledby="bilan">
        <h2 id="bilan">{bilan.campaign_finished ? "Bilan final" : "Bilan provisoire"}</h2>
        <p>{bilan.summary}</p>
        {bilan.campaign_finished && bilan.victory !== undefined ? (
          <p>
            <strong>{bilan.victory ? "Campagne réussie." : "Campagne terminée sans victoire."}</strong>
          </p>
        ) : null}
        <h3 className="h4">Compétences illustrées par vos actions</h3>
        {bilan.observed.length === 0 ? (
          <p className="muted">Aucune pour l&apos;instant.</p>
        ) : (
          <ul className="plain">
            {bilan.observed.map((s) => (
              <li key={s.label}>
                <strong>{s.label}</strong>
                <span className="help block">{s.evidence}</span>
              </li>
            ))}
          </ul>
        )}
        <h3 className="h4">Résultats</h3>
        {bilan.results.length === 0 ? (
          <p className="muted">Aucune commande terminée.</p>
        ) : (
          <ul className="plain">
            {bilan.results.map((r) => (
              <li key={r.mission_id}>
                {r.title} : meilleure note {r.best_score}/100, meilleur paiement {money(r.best_payment)}
              </li>
            ))}
          </ul>
        )}
        <p className="help">Le bilan ne décrit que ce qui a été observé ; il ne délivre ni diplôme ni niveau de maîtrise.</p>
      </section>

      <section className="card" aria-labelledby="new">
        <h2 id="new">Nouvelle partie</h2>
        {confirmReset ? (
          <Notice tone="warn" title="Supprimer votre partie ?">
            Votre entreprise, vos livrables et votre carnet seront supprimés définitivement.
            <div className="row">
              <button type="button" className="btn btn-primary" onClick={() => void reset()}>
                Oui, tout supprimer
              </button>
              <button type="button" className="btn" onClick={() => setConfirmReset(false)}>
                Annuler
              </button>
            </div>
          </Notice>
        ) : (
          <div className="row">
            <button type="button" className="btn" onClick={() => setConfirmReset(true)}>
              Supprimer cette partie et recommencer
            </button>
            <Link className="btn" href="/creer">
              Créer une autre entreprise
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}

export function NotebookScreen() {
  return <RequireSession>{(s) => <Notebook state={s} />}</RequireSession>;
}
