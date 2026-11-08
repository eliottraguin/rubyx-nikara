/**
 * Fiches d'exemple du mode Tutoriel (entreprises FICTIVES), recopiées de `data/profile/examples/`.
 * Elles ne servent qu'à pré-remplir le formulaire ; rien n'est enregistré avant le clic du joueur.
 */
import type { FicheValeurs } from "@/lib/api/profile";

export interface FicheExemple {
  id: string;
  valeurs: FicheValeurs;
}

export const FICHE_EXEMPLES: FicheExemple[] = [
  {
    id: "exemple_formation_vente",
    valeurs: {
        "entreprise_nom": "Cadence Formation (fictive)",
        "offre": "Cadence anime des ateliers de prospection téléphonique de deux jours pour les équipes commerciales de PME. Programme adaptable au secteur.",
        "besoin": "Les jeunes commerciaux n'osent pas appeler et obtiennent peu de rendez-vous.",
        "cible_secteurs": [
            "commerce_distribution",
            "conseil_services_entreprises"
        ],
        "cible_zone": [
            "Occitanie"
        ],
        "cible_taille": {
            "effectif_min": 20,
            "effectif_max": 300
        },
        "cible_fonctions": [
            "Directeur commercial",
            "Responsable des ventes"
        ],
        "exclusions": [
            "Cabinets de recrutement"
        ],
        "ton": "vouvoiement_chaleureux"
    },
  },
  {
    id: "exemple_logiciel_planning",
    valeurs: {
        "entreprise_nom": "Planéa Logiciels (fictive)",
        "offre": "Planéa propose un logiciel de planification de tournées pour les petites entreprises de transport. Mise en route en une semaine, sans engagement de durée.",
        "besoin": "Les dispatcheurs perdent des heures chaque semaine à replanifier les tournées à la main.",
        "cible_secteurs": [
            "transport_logistique"
        ],
        "cible_zone": [
            "Pays de la Loire",
            "Bretagne"
        ],
        "cible_taille": {
            "effectif_min": 10,
            "effectif_max": 200
        },
        "cible_fonctions": [
            "Directeur d'exploitation",
            "Responsable logistique"
        ],
        "exclusions": [
            "Entreprises de plus de 500 salariés",
            "Entreprises déjà clientes"
        ],
        "ton": "vouvoiement_formel"
    },
  },
  {
    id: "exemple_nettoyage_bureaux",
    valeurs: {
        "entreprise_nom": "Verdoyant Services (fictive)",
        "offre": "Verdoyant assure le nettoyage de bureaux avec des produits écolabellisés et des passages en soirée. Devis sous 48 heures.",
        "besoin": "Les entreprises veulent des locaux propres sans perturber leurs équipes ni utiliser de produits agressifs.",
        "cible_secteurs": [
            "immobilier",
            "conseil_services_entreprises",
            "logiciel_services_numeriques"
        ],
        "cible_zone": [
            "Lyon",
            "Grenoble"
        ],
        "cible_taille": {
            "effectif_min": 5,
            "effectif_max": 150
        },
        "cible_fonctions": [
            "Responsable des services généraux",
            "Office manager"
        ],
        "exclusions": [
            "Particuliers",
            "Chantiers de construction"
        ],
        "ton": "tutoiement"
    },
  },
];
