import type { GameState } from "@/lib/api/types";

/**
 * Salle du courrier (section Clients). À brancher : conversations par prospect, agents `triage` et `replier`
 * (docs/PRODUIT-CLIENTS-PUB.md). Pour l'instant : état vide honnête, aucune fausse donnée.
 */
export function CourrierPanel({ state }: { state: GameState }) {
  void state;
  return (
    <section className="card" aria-labelledby="courrier-title">
      <h2 className="h3" id="courrier-title">
        Salle du courrier
      </h2>
      <p className="note note-info" role="note">
        Rien n&apos;a été envoyé.
      </p>
      <p>
        <strong>Bientôt disponible.</strong> Cette salle accueillera une conversation par prospect de votre carnet. Le trieur de boîte résumera les messages reçus
        et le rédacteur de réponse proposera des brouillons que vous relirez.
      </p>
      <ul>
        <li>En mode Tutoriel, les clients sont simulés : envoyer ne fait rien sortir.</li>
        <li>En mode Réel, un email ne partira qu&apos;après votre confirmation explicite.</li>
        <li>Aucun agent ne peut envoyer de message de lui-même.</li>
      </ul>
      <p className="help">Aucune conversation pour le moment.</p>
    </section>
  );
}
