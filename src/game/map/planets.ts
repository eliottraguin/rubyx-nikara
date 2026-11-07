/**
 * Catalogue COSMÉTIQUE des plateformes (id technique `planet`, affichées comme des LIEUX de la ville : noms, textes,
 * couleur d'accent) — « maquette » : docs/PRODUIT-PROSPECTION.md §4 et docs/VILLE-ET-BATIMENT.md §3.
 * Le nom du lieu, son quartier et son véhicule vivent dans data/map/city_v1.json.
 * Le serveur reste maître des états, prix, gains et déblocages (CLAUDE.md règle 1) : rien ici ne les décide.
 * Tant que `GET /api/state` n'expose pas de lieux (ticket API-A1), la correspondance se fait avec les
 * missions existantes (mission -> lieu, PRODUIT-PROSPECTION §10).
 */

export type PlanetId = "annuaire" | "registre" | "carte-locale" | "linkedin" | "glassdoor" | "constellation";

export interface PlanetPalette {
  light: string;
  mid: string;
  dark: string;
  glow: string;
}

export interface PlanetDef {
  id: PlanetId;
  name: string;
  /** Une phrase : ce que le joueur y apprend. */
  tagline: string;
  /** Nature des données (texte d'affichage). */
  blurb: string;
  /** Condition de déblocage, en texte (maquette ; le texte serveur l'emporte s'il existe). */
  unlockText: string;
  /** Couleur d'accent du lieu (halo, pastille). */
  palette: PlanetPalette;
  /** Aide à la rédaction de la mission de l'agent (texte d'affichage, « maquette »). */
  promptHint: string;
  /** Exemples de missions à insérer (texte d'affichage, « maquette » ; le joueur les adapte). */
  examples: string[];
}

export const PLANETS: readonly PlanetDef[] = [
  {
    id: "annuaire",
    name: "Annuaire",
    tagline: "Écrire un prompt clair : qui cherche-t-on, où, combien ?",
    blurb: "Fiches d'entreprises avec coordonnées : le lieu de départ.",
    unlockText: "Disponible dès le départ.",
    palette: { light: "#9be7c4", mid: "#2fa57e", dark: "#14523f", glow: "#7af0c0" },
    promptHint: "Dites qui vous cherchez (secteur), où (ville ou département), combien de fiches, et ce que vous voulez voir pour chacune (nom, site, téléphone).",
    examples: ["Trouve 5 restaurants indépendants à Lyon avec leur nom, leur adresse et leur numéro de téléphone.", "Liste 8 agences immobilières de Nantes. Pour chacune : nom, site web, contact. Ignore les grandes enseignes nationales."],
  },
  {
    id: "registre",
    name: "Registre",
    tagline: "Filtrer avec précision et exclure ce qui ne convient pas.",
    blurb: "Données structurées : secteur, taille, zone, ancienneté.",
    unlockText: "Réussir le lieu Annuaire (score d'au moins 60).",
    palette: { light: "#a9c8ff", mid: "#4a78d6", dark: "#1b3678", glow: "#8db4ff" },
    promptHint: "Précisez les filtres : secteur, taille, zone, ancienneté, et ce qu'il faut exclure.",
    examples: ["Cherche des entreprises de plomberie de 3 à 10 salariés en Gironde, créées depuis plus de 5 ans. Exclus les franchises.", "Trouve 6 PME du bâtiment en Bretagne, hors auto-entrepreneurs, avec leur date de création et leur effectif."],
  },
  {
    id: "carte-locale",
    name: "Carte locale",
    tagline: "Prospecter à proximité et choisir le bon canal de contact.",
    blurb: "Établissements, avis, horaires et contacts.",
    unlockText: "Réussir le lieu Registre (score d'au moins 60).",
    palette: { light: "#ffd9a0", mid: "#e0883b", dark: "#7a3a14", glow: "#ffbd6e" },
    promptHint: "Indiquez la zone, le type d'établissement et le canal de contact à privilégier (téléphone, e-mail, passage).",
    examples: ["Trouve 6 salons de coiffure à moins de 5 km du centre de Toulouse, avec leurs horaires et le meilleur moyen de les contacter.", "Repère 5 garages bien notés à Lille et indique pour chacun s'il vaut mieux appeler ou passer."],
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    tagline: "Viser un décideur, pas seulement une entreprise.",
    blurb: "Entreprises et décideurs : poste, ancienneté, réseau.",
    unlockText: "Réussir le lieu Carte locale (score d'au moins 60).",
    palette: { light: "#a6dcff", mid: "#2d8fd9", dark: "#0f3f73", glow: "#6cc4ff" },
    promptHint: "Visez une personne : poste exact, secteur, taille d'entreprise, et ce qui justifie de la contacter.",
    examples: ["Trouve 5 directeurs commerciaux de PME du logiciel en Île-de-France, avec leur poste et pourquoi ils seraient intéressés.", "Cherche des responsables achats dans l'agroalimentaire (50 à 250 salariés) en Occitanie."],
  },
  {
    id: "glassdoor",
    name: "Glassdoor",
    tagline: "Repérer le bon moment pour approcher une entreprise.",
    blurb: "Signaux : recrutement, croissance, climat interne.",
    unlockText: "Réussir le lieu LinkedIn (score d'au moins 60).",
    palette: { light: "#c8f0a8", mid: "#6bb83a", dark: "#2d5e14", glow: "#a4f06c" },
    promptHint: "Cherchez des signaux de timing : recrutements, croissance, changements. Dites ce qui rend le moment opportun.",
    examples: ["Repère 5 entreprises de services du numérique qui recrutent des commerciaux en ce moment et explique pourquoi le moment est bon.", "Trouve des entreprises en forte croissance dans le conseil, avec les signaux qui le montrent."],
  },
  {
    id: "constellation",
    name: "Constellation",
    tagline: "Combiner plusieurs sources et plusieurs agents, sous budget.",
    blurb: "La finale : un nouveau commanditaire, plusieurs lieux.",
    unlockText: "Réussir le lieu Glassdoor (score d'au moins 70).",
    palette: { light: "#e6c4ff", mid: "#a35ae0", dark: "#4a1b7a", glow: "#d09cff" },
    promptHint: "Combinez plusieurs sources et plusieurs agents : dites qui fait quoi et gardez un œil sur le budget.",
    examples: ["Croise l'annuaire et le registre pour trouver 5 entreprises de transport en Auvergne-Rhône-Alpes, puis qualifie le décideur de chacune.", "Trouve 6 prospects de la restauration à Bordeaux : un agent cherche, un autre vérifie le contact, sans dépasser le budget."],
  },
];

export function planetDef(id: string): PlanetDef | undefined {
  return PLANETS.find((p) => p.id === id);
}
