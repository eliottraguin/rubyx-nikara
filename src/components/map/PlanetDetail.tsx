"use client";

import { forwardRef } from "react";
import type { PlanetVM } from "@/game/map/viewmodel";
import { StatusIcon } from "./StatusIcon";

interface Props {
  planet: PlanetVM;
  /** Phrase simple du déblocage (lieu verrouillé). */
  lockedText?: string;
}

/** Fiche d'un lieu : texte seul. La recherche du bot est dans le panneau voisin (SearchLauncher). */
export const PlanetDetail = forwardRef<HTMLHeadingElement, Props>(function PlanetDetail({ planet, lockedText }, headingRef) {
  return (
    <div className="planet-detail">
      <section className="card" aria-labelledby="pd-title">
        <h2 className="h2" id="pd-title" tabIndex={-1} ref={headingRef}>
          {planet.title}
        </h2>
        <p>
          <span className={`status-chip status-chip-${planet.status}`}>
            <StatusIcon status={planet.status} />
            {planet.statusLabel}
          </span>
        </p>
        <p className="muted">
          {planet.district} · trajet {planet.vehicleManner} · Plateforme : {planet.name}. Lieu illustré de façon générique, non affilié.
        </p>
        <p className="big-ish">{planet.tagline}</p>
        <p className="muted">{planet.blurb}</p>
        {planet.status === "locked" ? (
          <p className="note note-warn" role="note">
            <strong>Pas encore ouvert.</strong> {lockedText ?? "Ce lieu s'ouvre plus tard."}
          </p>
        ) : null}
      </section>
    </div>
  );
});
