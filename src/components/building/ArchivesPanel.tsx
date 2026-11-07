import type { GameState } from "@/lib/api/types";

/**
 * Archives (section Prospection : carnet de prospection). À brancher : `/api/prospects` (liste, tri, « contacté »,
 * suppression, export CSV). Pour l'instant : état vide honnête, aucune fausse donnée.
 */
export function ArchivesPanel({ state }: { state: GameState }) {
  void state;
  return (
    <section className="card" aria-labelledby="archives-title">
      <h2 className="h3" id="archives-title">
        Archives
      </h2>
      <p className="note note-info" role="note">
        Rien n&apos;a été envoyé.
      </p>
      <p>
        <strong>Bientôt disponible.</strong> Les Archives rassembleront votre carnet de prospection : les prospects retrouvés par vos expéditions, avec leur
        source, leur date de collecte et leur fiabilité. Vous pourrez les consulter, les trier, les marquer « contactés », les supprimer et les exporter en CSV.
      </p>
      <p className="help">Aucun prospect dans le carnet pour le moment.</p>
    </section>
  );
}
