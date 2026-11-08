"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { FICHE_HREF, LABELS, MESSAGES, PRECISION_MAX, PROBLEMS } from "@/content/recherche";
import type { PlanetVM } from "@/game/map/viewmodel";
import { lockedMessage } from "./places";
import { SearchResultList } from "./SearchResultList";
import { TipBubble, TipsToggle } from "./TipBubble";
import type { SearchController } from "./useSearch";
import type { Tips } from "./useTips";

interface Props {
  planets: readonly PlanetVM[];
  controller: SearchController;
  tips: Tips;
  /** Panneau d'un lieu : le lieu est imposé. Sans lui (Accueil) : liste des lieux. */
  planetId?: string;
  /** Texte du bouton (défaut : « Chercher des clients ici »). */
  buttonLabel?: string;
  onOpenConversation: (conversationId: string) => void;
  onOpenCarnet?: () => void;
}

/** Recherche du bot : lieu, précision facultative, bouton, état (en route, revenu, rien, problème) et résultat. */
export function SearchLauncher({ planets, controller, tips, planetId, buttonLabel = LABELS.button, onOpenConversation, onOpenCarnet }: Props) {
  const uid = useId();
  const open = planets.filter((p) => p.status !== "locked");
  const [picked, setPicked] = useState<string>("");
  const [precision, setPrecision] = useState("");
  const chosenId = planetId ?? (picked || open[0]?.id || "");
  const planet = planets.find((p) => p.id === chosenId) ?? null;
  const locked = planet?.status === "locked";
  const { run } = controller;
  const here = run.status !== "idle" && run.planetId === chosenId ? run : null;
  const running = run.status === "running";
  const runningElsewhere = running && run.planetId !== chosenId;
  const resultRef = useRef<HTMLHeadingElement>(null);

  // Au retour du bot, le titre du résultat prend le focus : un lecteur d'écran l'annonce, le clavier arrive sur la liste.
  const doneKey = here?.status === "done" ? here.result : null;
  useEffect(() => {
    if (doneKey) resultRef.current?.focus({ preventScroll: true });
  }, [doneKey]);

  const lockText = locked && planet ? lockedMessage(planets, planet.id) : null;
  const canStart = !!planet && !locked && !running;
  const summary = here?.status === "done" ? (here.result.added.length > 0 ? MESSAGES.retour(here.result.added.length) : MESSAGES.vide) : "";

  const precisionId = `${uid}-precision`;
  const helpId = `${uid}-help`;
  const lockId = `${uid}-lock`;
  const placeId = `${uid}-place`;

  return (
    <div className="search-launcher">
      <h3 className="h4">{LABELS.title}</h3>
      {here?.status !== "done" ? <TipBubble id="cible" tips={tips} /> : null}

      {planetId ? null : open.length === 0 ? (
        <p className="help">{LABELS.noPlace}</p>
      ) : (
        <p>
          <label htmlFor={placeId}>{LABELS.placeLabel} </label>
          <select id={placeId} value={chosenId} onChange={(e) => setPicked(e.target.value)} disabled={running}>
            {planets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
                {p.status === "locked" ? " (pas encore ouvert)" : ""}
              </option>
            ))}
          </select>
        </p>
      )}

      {lockText ? (
        <p id={lockId} className="note note-warn" role="note">
          {lockText}
        </p>
      ) : null}

      <p>
        <label htmlFor={precisionId}>
          <strong>{LABELS.precisionLabel}</strong> <span className="muted">(facultatif)</span>
        </label>
        <textarea
          id={precisionId}
          className="search-precision"
          rows={2}
          maxLength={PRECISION_MAX}
          value={precision}
          onChange={(e) => setPrecision(e.target.value)}
          aria-describedby={helpId}
          disabled={running || locked}
        />
        <span id={helpId} className="help">
          {LABELS.precisionHelp} {precision.length}/{PRECISION_MAX} caractères.
        </span>
      </p>

      <p>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!canStart}
          aria-describedby={lockText ? lockId : undefined}
          onClick={() => planet && void controller.start(planet.id, precision)}
        >
          {here?.status === "running" ? LABELS.buttonRunning : buttonLabel}
        </button>{" "}
        <span className="help">{LABELS.free}</span>
      </p>
      {runningElsewhere ? <p className="help">{MESSAGES.autreEnCours}</p> : null}

      <div role="status" aria-live="polite" className="search-status">
        {here?.status === "running" ? <p className="search-running">{MESSAGES.enRoute}</p> : null}
      </div>

      {here?.status === "error" ? (
        <div className="note note-warn" role="alert">
          <strong>{PROBLEMS[here.problem].title}</strong> {here.problem === "locked" && planet ? lockedMessage(planets, planet.id) : PROBLEMS[here.problem].text}
          {here.problem === "profile" ? (
            <>
              {" "}
              {FICHE_HREF ? <Link href={FICHE_HREF}>{LABELS.fiche}</Link> : <span>({LABELS.fiche}.)</span>}
            </>
          ) : null}
        </div>
      ) : null}

      {here?.status === "done" ? (
        <section aria-labelledby={`${uid}-res`}>
          <h4 className="h4" id={`${uid}-res`} tabIndex={-1} ref={resultRef}>
            {summary}
          </h4>
          <SearchResultList result={here.result} api={controller.api} onOpenConversation={onOpenConversation} onOpenCarnet={onOpenCarnet}>
            <TipBubble id="resultat" tips={tips} />
            {!tips.visible("resultat") ? <TipBubble id="contacter" tips={tips} /> : null}
          </SearchResultList>
        </section>
      ) : null}
      <TipsToggle tips={tips} />
    </div>
  );
}
