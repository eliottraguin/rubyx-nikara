import Link from "next/link";
import { money } from "@/lib/format";
import type { MapViewModel, PlanetVM } from "@/game/map/viewmodel";
import { StatusIcon } from "./StatusIcon";

/** Fiche d'un lieu : tout en texte (l'état n'est jamais porté par la couleur seule). */
export function PlanetPanel({ planet, vm }: { planet: PlanetVM | null; vm: MapViewModel }) {
  if (!planet) {
    return (
      <section className="card planet-panel" aria-labelledby="panel-title">
        <h2 className="h3" id="panel-title">
          Choisissez un lieu
        </h2>
        <p className="muted">
          Cliquez un lieu sur la carte ou dans la liste pour voir sa fiche : ce qu&apos;on y apprend, la récompense,
          le coût par instruction et la condition de déblocage.
        </p>
      </section>
    );
  }
  const live = vm.source === "serveur";
  return (
    <section className="card planet-panel" aria-labelledby="panel-title" aria-live="off">
      <h2 className="h3" id="panel-title">
        {planet.title}
      </h2>
      <p className="muted">
        {planet.district} · trajet {planet.vehicleManner}
      </p>
      <p>
        <span className={`status-chip status-chip-${planet.status}`}>
          <StatusIcon status={planet.status} />
          {planet.statusLabel}
        </span>
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
      </dl>
      {planet.status === "locked" ? (
        <p className="note note-warn" role="note">
          <strong>Verrouillée.</strong> Condition de déblocage : {planet.unlockText}
        </p>
      ) : live && planet.missionId ? (
        <Link className="btn btn-primary" href="/bureau">
          Ouvrir la commande au bureau
        </Link>
      ) : (
        <p className="help">Aperçu : créez une partie pour lancer une expédition.</p>
      )}
      {!live ? <p className="help">Lieux en aperçu « maquette » : les états viendront du serveur.</p> : null}
    </section>
  );
}

export function AgentsSummary({ vm }: { vm: MapViewModel }) {
  return (
    <section className="card" aria-labelledby="hangar-title">
      <h2 className="h3" id="hangar-title">
        Garage
      </h2>
      <p>
        {vm.source === "serveur"
          ? `${vm.base.agentsOwned} bot${vm.base.agentsOwned > 1 ? "s" : ""} au garage sur ${vm.base.agentsTotal}.`
          : "Aucun bot : créez une partie pour recruter."}
      </p>
      <p className="help">Vos bots partent de votre immeuble et traversent la ville jusqu&apos;aux lieux.</p>
    </section>
  );
}
