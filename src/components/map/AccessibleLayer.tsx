import { StatusIcon } from "./StatusIcon";
import type { MapViewModel } from "@/game/map/viewmodel";

/**
 * Couche DOM parallèle à la carte (docs/UX.md « Accessibilité ») : mêmes planètes, mêmes actions, au clavier et au
 * lecteur d'écran. Elle lit le MÊME MapViewModel que la scène (une seule source de vérité).
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
    <nav aria-label="Planètes">
      <h2 className="h3" id="planet-list-title">
        Planètes
      </h2>
      <ul className="planet-list" aria-labelledby="planet-list-title">
        {vm.planets.map((p, i) => {
          const selected = selectedId === p.id;
          return (
            <li key={p.id}>
              <button
                type="button"
                className={`planet-item planet-item-${p.status}`}
                aria-pressed={selected}
                onClick={() => onSelect(p.id)}
              >
                <span className="planet-item-rank" aria-hidden="true">
                  {i + 1}
                </span>
                <span className="planet-item-main">
                  <strong>{p.name}</strong>
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
