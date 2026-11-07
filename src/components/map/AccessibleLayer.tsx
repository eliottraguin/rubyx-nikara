import { botList } from "@/game/map/bots";
import type { Trip } from "@/game/map/trips";
import type { MapViewModel } from "@/game/map/viewmodel";
import type { RoleId } from "@/lib/api/types";
import { StatusIcon } from "./StatusIcon";

/**
 * Couche DOM parallèle à la ville (docs/UX.md « Accessibilité », docs/VILLE-ET-BATIMENT.md §13) : mêmes lieux, mêmes
 * bots, même immeuble, mêmes actions, au clavier et au lecteur d'écran. Elle lit le MÊME MapViewModel que la scène
 * (une seule source de vérité). Tout est du texte brut.
 */
export function PlanetList({
  vm,
  selectedId,
  onSelect,
}: {
  vm: MapViewModel;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <nav aria-label="Lieux">
      <h2 className="h3" id="planet-list-title">
        Lieux
      </h2>
      <ul className="planet-list" aria-labelledby="planet-list-title">
        {vm.places.map((p, i) => {
          const selected = selectedId === p.id;
          return (
            <li key={p.id}>
              <button type="button" className={`planet-item planet-item-${p.status}`} aria-pressed={selected} onClick={() => onSelect(p.id)}>
                <span className="planet-item-rank" aria-hidden="true">
                  {i + 1}
                </span>
                <span className="planet-item-main">
                  <strong>{p.title}</strong>
                  <span className="planet-item-sub">
                    {p.district} · trajet {p.vehicleManner}
                  </span>
                  <span className={`status-chip status-chip-${p.status}`}>
                    <StatusIcon status={p.status} />
                    {p.statusLabel}
                  </span>
                </span>
                {p.status === "visited" ? (
                  <span className="planet-item-stars" aria-label={`${p.stars} étoile${p.stars > 1 ? "s" : ""} sur 3`}>
                    {"★".repeat(p.stars)}
                    <span aria-hidden="true">{"☆".repeat(3 - p.stars)}</span>
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Immeuble du joueur : équivalent texte PERMANENT du niveau et bouton « Entrer » (clavier). */
export function BuildingStatus({ vm, onEnter, constructing, onSkip }: { vm: MapViewModel; onEnter: () => void; constructing?: boolean; onSkip?: () => void }) {
  const b = vm.building;
  return (
    <section className="building-status" aria-labelledby="building-title">
      <h2 className="h4" id="building-title">
        Votre immeuble{vm.company ? ` : ${vm.company}` : ""}
      </h2>
      <p className="building-text" data-testid="building-text">
        {b.text}
      </p>
      {b.source === "defaut" ? <p className="help">Niveau en attente du serveur : niveau 1 affiché.</p> : null}
      <p className="muted building-look">{b.appearance}</p>
      {constructing ? (
        <p role="status">
          Chantier en cours : votre immeuble passe de niveau.{" "}
          <button type="button" className="linklike" onClick={onSkip}>
            Passer
          </button>
        </p>
      ) : null}
      <button type="button" className="btn btn-small btn-primary" onClick={onEnter}>
        Entrer dans votre immeuble
      </button>
    </section>
  );
}

/** Bots : un par agent possédé (au garage) et un par trajet en cours, avec l'état en toutes lettres. */
export function BotList({ vm, ownedRoles, trips, now, reduced }: { vm: MapViewModel; ownedRoles: readonly RoleId[]; trips: readonly Trip[]; now: number; reduced: boolean }) {
  const items = botList(ownedRoles, trips, vm.places.map((p) => ({ id: p.id, name: p.placeName, vehicle: p.vehicle })), now, reduced);
  return (
    <section aria-labelledby="bot-list-title">
      <h2 className="h3" id="bot-list-title">
        Bots
      </h2>
      {items.length === 0 ? (
        <p className="muted">Aucun bot au garage : recrutez-en depuis votre immeuble.</p>
      ) : (
        <ul className="bot-list">
          {items.map((it) => (
            <li key={it.key} className={`bot-item bot-${it.state}`}>
              {it.text}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
