import type { GameState } from "@/lib/api/types";

/**
 * Studio pub (section Pub). À brancher : kits de campagne produits par l'agent `ads`
 * (docs/PRODUIT-CLIENTS-PUB.md). Pour l'instant : état vide honnête, aucune fausse donnée.
 */
export function PubPanel({ state }: { state: GameState }) {
  void state;
  return (
    <section className="card" aria-labelledby="pub-title">
      <h2 className="h3" id="pub-title">
        Studio pub
      </h2>
      <p className="note note-info" role="note">
        Rien n&apos;a été publié ni dépensé.
      </p>
      <p>
        <strong>Bientôt disponible.</strong> Le directeur de campagne préparera un kit : positionnement, accroches, textes aux limites de chaque format, brief
        visuel, plan et liste de contrôle. Vous copierez ou exporterez le contenu et vous le publierez vous-même.
      </p>
      <ul>
        <li>Seuls les faits de votre fiche entreprise seront utilisés : aucun chiffre ni promesse inventés.</li>
        <li>Le produit ne publie rien et ne dépense aucun budget publicitaire.</li>
      </ul>
      <p className="help">Aucune campagne pour le moment.</p>
    </section>
  );
}
