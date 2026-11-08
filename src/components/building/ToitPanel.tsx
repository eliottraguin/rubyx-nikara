import { buildMapViewModel } from "@/game/map/viewmodel";
import type { GameState } from "@/lib/api/types";

/** Toit : état de l'immeuble (niveau et clients obtenus, calculés par le serveur ; affichage seul). */
export function ToitPanel({ state }: { state: GameState }) {
  const b = buildMapViewModel(state).building;
  return (
    <section className="card" aria-labelledby="toit-title">
      <h2 className="h3" id="toit-title">
        Toit
      </h2>
      <p data-testid="toit-text">{b.text}</p>
      {b.source === "defaut" ? <p className="help">Niveau en attente du serveur : niveau 1 affiché.</p> : null}
      <p className="muted">{b.appearance}</p>
      <p className="help">Le niveau est purement visuel : il ne débloque aucun droit et ne change aucun prix.</p>
    </section>
  );
}
