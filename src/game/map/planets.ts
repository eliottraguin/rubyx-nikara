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
  /** Exemples de missions à insérer (texte d'affichage, « maquette » ; le joueur les adapte). */
}

export const PLANETS: readonly PlanetDef[] = [
  {
    id: "annuaire",
    name: "Annuaire",
    tagline: "Le lieu de départ : des entreprises de quartier, simples à repérer.",
    blurb: "Fiches d'entreprises avec coordonnées : le lieu de départ.",
    unlockText: "Disponible dès le départ.",
    palette: { light: "#9be7c4", mid: "#2fa57e", dark: "#14523f", glow: "#7af0c0" },
  },
  {
    id: "registre",
    name: "Registre",
    tagline: "Des entreprises triées par secteur, taille et zone.",
    blurb: "Données structurées : secteur, taille, zone, ancienneté.",
    unlockText: "Trouver des prospects pertinents à Annuaire.",
    palette: { light: "#a9c8ff", mid: "#4a78d6", dark: "#1b3678", glow: "#8db4ff" },
  },
  {
    id: "carte-locale",
    name: "Carte locale",
    tagline: "Des commerces proches de vous, avec leurs avis et horaires.",
    blurb: "Établissements, avis, horaires et contacts.",
    unlockText: "Trouver des prospects pertinents à Registre.",
    palette: { light: "#ffd9a0", mid: "#e0883b", dark: "#7a3a14", glow: "#ffbd6e" },
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    tagline: "Des entreprises et leurs décideurs.",
    blurb: "Entreprises et décideurs : poste, ancienneté, réseau.",
    unlockText: "Trouver des prospects pertinents à Carte locale.",
    palette: { light: "#a6dcff", mid: "#2d8fd9", dark: "#0f3f73", glow: "#6cc4ff" },
  },
  {
    id: "glassdoor",
    name: "Glassdoor",
    tagline: "Des entreprises qui recrutent ou qui grandissent.",
    blurb: "Signaux : recrutement, croissance, climat interne.",
    unlockText: "Trouver des prospects pertinents à LinkedIn.",
    palette: { light: "#c8f0a8", mid: "#6bb83a", dark: "#2d5e14", glow: "#a4f06c" },
  },
  {
    id: "constellation",
    name: "Constellation",
    tagline: "Un lieu qui regroupe plusieurs sources.",
    blurb: "Plusieurs sources réunies en un seul lieu.",
    unlockText: "Trouver des prospects pertinents à Glassdoor.",
    palette: { light: "#e6c4ff", mid: "#a35ae0", dark: "#4a1b7a", glow: "#d09cff" },
  },
];

export function planetDef(id: string): PlanetDef | undefined {
  return PLANETS.find((p) => p.id === id);
}
