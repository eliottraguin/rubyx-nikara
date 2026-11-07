"use client";

import Link from "next/link";
import { forwardRef, useState } from "react";
import { ErrorNote, Pill } from "@/components/ui";
import { buildPlanetHistory, summarizeHistory, type HistoryEntry } from "@/game/map/history";
import type { PlanetVM } from "@/game/map/viewmodel";
import type { ApiError, AttemptView } from "@/lib/api/types";
import { ROLE_LABEL, money } from "@/lib/format";
import { SafeMarkdown } from "@/lib/markdown";
import { StatusIcon } from "./StatusIcon";

interface Props {
  planet: PlanetVM;
  /** Expéditions de la planète (la tentative courante déjà fusionnée). */
  attempts: AttemptView[];
  loading: boolean;
  loadError: string | null;
  onReload: () => void;
  /** Tentative active de la planète, pour la livraison depuis la carte. */
  active: AttemptView | null;
  busy: boolean;
  /** Livre une version du livrable ; renvoie l'erreur serveur ou null. */
  onDeliver: (attempt: AttemptView, versionId: string) => Promise<ApiError | null>;
}

const Heading = forwardRef<HTMLHeadingElement, { id: string; children: React.ReactNode }>(function Heading({ id, children }, ref) {
  return (
    <h2 className="h2" id={id} tabIndex={-1} ref={ref}>
      {children}
    </h2>
  );
});

/** Détail d'une planète : fiche, historique des expéditions, livraison du rapport. Tout en texte et rendu non fiable nettoyé. */
export const PlanetDetail = forwardRef<HTMLHeadingElement, Props>(function PlanetDetail({ planet, attempts, loading, loadError, onReload, active, busy, onDeliver }, headingRef) {
  const entries = buildPlanetHistory(attempts);
  const sum = summarizeHistory(entries);
  return (
    <div className="planet-detail">
      <section className="card" aria-labelledby="pd-title">
        <Heading id="pd-title" ref={headingRef}>
          {planet.name}
        </Heading>
        <p>
          <span className={`status-chip status-chip-${planet.status}`}>
            <StatusIcon status={planet.status} />
            {planet.statusLabel}
          </span>
          {planet.status === "visited" ? (
            <span className="planet-item-stars" aria-label={`${planet.stars} étoile${planet.stars > 1 ? "s" : ""} sur 3`}>
              {" "}
              {"★".repeat(planet.stars)}
              <span aria-hidden="true">{"☆".repeat(3 - planet.stars)}</span>
            </span>
          ) : null}
        </p>
        <p className="big-ish">{planet.tagline}</p>
        <p className="muted">{planet.blurb}</p>
        <dl className="facts">
          <div>
            <dt>Gain maximum</dt>
            <dd>{planet.maxReward !== null ? money(planet.maxReward) : "—"}</dd>
          </div>
          <div>
            <dt>Coût par instruction</dt>
            <dd>{planet.unitPrice === null ? "—" : planet.unitPrice === 0 ? "gratuit" : money(planet.unitPrice)}</dd>
          </div>
          <div>
            <dt>Meilleur paiement</dt>
            <dd>{planet.bestPayment > 0 ? money(planet.bestPayment) : "aucun"}</dd>
          </div>
          <div>
            <dt>Expéditions</dt>
            <dd>{sum.expeditions}</dd>
          </div>
          <div>
            <dt>Meilleur score</dt>
            <dd>{sum.bestScore === null ? "—" : `${sum.bestScore} / 100`}</dd>
          </div>
        </dl>
        {planet.status === "locked" ? (
          <p className="note note-warn" role="note">
            <strong>Verrouillée.</strong> Condition de déblocage : {planet.unlockText}
          </p>
        ) : null}
      </section>

      {active && active.status === "ACTIVE" ? <DeliverBox attempt={active} busy={busy} onDeliver={onDeliver} /> : null}

      <section className="card" aria-labelledby="hist-title" id="planet-history">
        <h2 className="h3" id="hist-title">
          Historique de {planet.name}
        </h2>
        {loadError ? (
          <p className="note note-bad" role="alert">
            Historique indisponible : {loadError}{" "}
            <button type="button" className="btn btn-small" onClick={onReload}>
              Réessayer
            </button>
          </p>
        ) : loading ? (
          <p className="muted" role="status">
            Chargement de l&apos;historique…
          </p>
        ) : entries.length === 0 ? (
          <p className="muted">Rien n&apos;a encore été fait sur cette planète. Envoyez un premier agent depuis le panneau de droite : chaque expédition apparaîtra ici avec vos instructions, les réponses et le résultat.</p>
        ) : (
          <>
            <p className="help">
              {sum.expeditions} expédition{sum.expeditions > 1 ? "s" : ""} · {sum.instructions} instruction{sum.instructions > 1 ? "s" : ""} envoyée{sum.instructions > 1 ? "s" : ""}
              {sum.totalPaid > 0 ? ` · ${money(sum.totalPaid)} crédités` : ""}
            </p>
            <ol className="history">
              {entries.map((e, i) => (
                <HistoryItem key={e.attemptId} entry={e} open={i === 0} />
              ))}
            </ol>
          </>
        )}
        {active ? (
          <p className="help secondary-links">
            Écrans détaillés (secondaires) : <Link href={`/atelier/${active.id}`}>atelier de l&apos;expédition</Link>
            {active.submission ? (
              <>
                {" "}
                · <Link href={`/retour/${active.id}`}>retour du client</Link>
              </>
            ) : null}
          </p>
        ) : null}
      </section>
    </div>
  );
});

function HistoryItem({ entry: e, open }: { entry: HistoryEntry; open: boolean }) {
  return (
    <li className="hist-item">
      <details open={open}>
        <summary>
          <span className="hist-title">
            Expédition n°{e.attemptNo} <span className="muted">· {e.dateLabel}</span>
          </span>
          <span className="hist-chips">
            <Pill tone={e.status === "COMPLETED" ? "ok" : e.status === "FAILED" ? "bad" : "warn"}>{e.statusLabel}</Pill>
            {e.score !== null ? <Pill tone={e.passed ? "ok" : "warn"}>{e.score} / 100</Pill> : null}
            {e.payment !== null && e.payment > 0 ? <Pill tone="info">+{money(e.payment)}</Pill> : null}
          </span>
        </summary>
        <div className="hist-body">
          {e.agents.length > 0 ? (
            <p className="help">
              Agents : {e.agents.map((a) => `${a.label} (${a.used}/${a.limit})`).join(", ")}
            </p>
          ) : null}
          {e.instructions.length === 0 ? (
            <p className="muted">Aucune instruction envoyée.</p>
          ) : (
            <ul className="ins-list">
              {e.instructions.map((ins) => (
                <li key={ins.id} className="ins">
                  <p className="ins-head">
                    <Pill>{ROLE_LABEL[ins.role] ?? ins.roleLabel}</Pill> <span className="muted">votre instruction</span>
                  </p>
                  <p className="ins-text">{ins.text}</p>
                  {ins.reply ? (
                    <details className="ins-reply">
                      <summary>Réponse de l&apos;agent</summary>
                      <SafeMarkdown text={ins.reply} />
                    </details>
                  ) : ins.replyStatus === "FAILED" ? (
                    <p className="help">Pas de réponse exploitable : rien n&apos;a été débité.</p>
                  ) : (
                    <p className="help">Réponse en attente.</p>
                  )}
                </li>
              ))}
            </ul>
          )}
          {e.evaluating ? (
            <p className="note note-info" role="status">
              Le rapport est livré : évaluation en cours.
            </p>
          ) : e.score !== null ? (
            <div className="hist-result" role="group" aria-label={`Résultat de l'expédition ${e.attemptNo}`}>
              <h3 className="h4">Résultat</h3>
              <p>
                Score <strong>{e.score} / 100</strong> — {e.passed ? "réussie" : "à retravailler"}.{" "}
                {e.payment !== null ? (e.payment > 0 ? `Gain crédité : ${money(e.payment)}.` : "Aucun gain crédité.") : null}
              </p>
              {e.feedback ? <SafeMarkdown text={e.feedback} /> : null}
              {e.nextAction ? (
                <p className="help">
                  <strong>Prochain objectif :</strong> {e.nextAction}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </details>
    </li>
  );
}

/** Livraison du rapport depuis la carte : choix de la version, aperçu, confirmation qui montre ce qui est figé. */
function DeliverBox({ attempt, busy, onDeliver }: { attempt: AttemptView; busy: boolean; onDeliver: Props["onDeliver"] }) {
  const versions = attempt.artifacts;
  const [chosen, setChosen] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  if (versions.length === 0) return null;
  const sel = versions.find((v) => v.id === chosen) ?? versions[versions.length - 1]!;
  async function confirm() {
    setError(null);
    const err = await onDeliver(attempt, sel.id);
    setConfirming(false);
    if (err) setError(err);
  }
  return (
    <section className="card card-accent" aria-labelledby="deliver-title">
      <h2 className="h3" id="deliver-title">
        Rapport à livrer
      </h2>
      <p className="help">Les agents ont répondu. Choisissez la version à livrer : elle sera figée puis évaluée par le serveur.</p>
      <fieldset className="versions">
        <legend>Version à livrer</legend>
        {versions.map((v) => (
          <label key={v.id} className={`ver ${sel.id === v.id ? "ver-on" : ""}`}>
            <input type="radio" name="deliver-version" checked={sel.id === v.id} onChange={() => { setChosen(v.id); setConfirming(false); }} disabled={busy} />
            <span>
              Version {v.number} · {v.author === "agent" ? `texte généré (${v.role ? ROLE_LABEL[v.role] : "agent"})` : "modification manuelle (vous)"}
            </span>
          </label>
        ))}
      </fieldset>
      <div className="deliver-preview" aria-label={`Aperçu de la version ${sel.number}`}>
        <SafeMarkdown text={sel.content} />
      </div>
      <ErrorNote error={error} />
      {confirming ? (
        <div className="confirm" role="group" aria-label="Confirmer la livraison">
          <p>
            Vous allez livrer la <strong>version {sel.number}</strong> ({sel.author === "agent" ? "texte généré" : "modification manuelle"}) pour le <strong>brief version {attempt.brief.version}</strong>. La livraison sera <strong>figée</strong>.
          </p>
          <button type="button" className="btn btn-primary" onClick={() => void confirm()} disabled={busy}>
            {busy ? "Envoi…" : `Confirmer la livraison de la version ${sel.number}`}
          </button>{" "}
          <button type="button" className="btn" onClick={() => setConfirming(false)} disabled={busy}>
            Annuler
          </button>
        </div>
      ) : (
        <button type="button" className="btn btn-primary" onClick={() => setConfirming(true)} disabled={busy}>
          Livrer la version {sel.number}
        </button>
      )}
    </section>
  );
}
