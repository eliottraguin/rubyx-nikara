/**
 * Logique pure de l'assistant pas à pas de la fiche entreprise (UI-H1) : saisie, validation, répartition par
 * étape et niveau de complétion local (indicatif ; `fiche.complete` du serveur reste la seule vérité d'usage).
 * Aucune dépendance React : testable directement, réutilisée par `FicheForm.tsx`.
 */
import { BORNES, CHAMPS, ERREURS, type EtapeId, SECTEURS, type Ton } from "@/content/fiche";
import type { FicheValeurs } from "@/lib/api/profile";

/** Valeurs en cours de saisie : les listes sont des textes (une ligne par élément), la taille deux champs texte. */
export interface Saisie {
  entreprise_nom: string;
  offre: string;
  besoin: string;
  secteurs: string[]; // identifiants cochés
  secteursAutres: string;
  zone: string;
  taille_min: string;
  taille_max: string;
  fonctions: string;
  exclusions: string;
  ton: Ton;
}

const SECTEUR_IDS = new Set(SECTEURS.map((s) => s.id));
const lines = (s: string) => s.split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);

export function toSaisie(v: FicheValeurs): Saisie {
  return {
    entreprise_nom: v.entreprise_nom,
    offre: v.offre,
    besoin: v.besoin,
    secteurs: v.cible_secteurs.filter((s) => SECTEUR_IDS.has(s)),
    secteursAutres: v.cible_secteurs.filter((s) => !SECTEUR_IDS.has(s)).join("\n"),
    zone: v.cible_zone.join("\n"),
    taille_min: v.cible_taille ? String(v.cible_taille.effectif_min) : "",
    taille_max: v.cible_taille ? String(v.cible_taille.effectif_max) : "",
    fonctions: v.cible_fonctions.join("\n"),
    exclusions: v.exclusions.join("\n"),
    ton: v.ton,
  };
}

export type Erreurs = Partial<Record<"entreprise_nom" | "offre" | "besoin" | "cible_secteurs" | "cible_zone" | "cible_taille" | "cible_fonctions" | "exclusions" | "ton", string>>;

/** Valide côté écran (le serveur revérifie). Renvoie les valeurs prêtes à envoyer, ou les erreurs par champ. */
export function validerSaisie(s: Saisie): { values: FicheValeurs; errors: Erreurs } {
  const errors: Erreurs = {};
  const nom = s.entreprise_nom.trim();
  const offre = s.offre.trim();
  const besoin = s.besoin.trim();
  if (nom.length > BORNES.nom) errors.entreprise_nom = ERREURS.tropLong(BORNES.nom);
  if (!offre) errors.offre = ERREURS.requis;
  else if (offre.length > BORNES.offre) errors.offre = ERREURS.tropLong(BORNES.offre);
  if (besoin.length > BORNES.besoin) errors.besoin = ERREURS.tropLong(BORNES.besoin);

  const listCheck = (items: string[], b: { max: number; item: number }, required: boolean): string | undefined => {
    if (!items.length) return required ? ERREURS.requis : undefined;
    if (items.length > b.max) return ERREURS.tropDElements(b.max);
    if (items.some((i) => i.length > b.item)) return ERREURS.elementLong(b.item);
    return undefined;
  };
  const secteurs = [...s.secteurs, ...lines(s.secteursAutres)];
  const zone = lines(s.zone);
  const fonctions = lines(s.fonctions);
  const exclusions = lines(s.exclusions);
  const e1 = listCheck(secteurs, BORNES.secteurs, true);
  if (e1) errors.cible_secteurs = e1;
  const e2 = listCheck(zone, BORNES.zone, true);
  if (e2) errors.cible_zone = e2;
  const e3 = listCheck(fonctions, BORNES.fonctions, false);
  if (e3) errors.cible_fonctions = e3;
  const e4 = listCheck(exclusions, BORNES.exclusions, false);
  if (e4) errors.exclusions = e4;

  let taille: FicheValeurs["cible_taille"] = null;
  const lo = s.taille_min.trim();
  const hi = s.taille_max.trim();
  if (lo || hi) {
    const a = /^\d+$/.test(lo) ? Number(lo) : NaN;
    const b = /^\d+$/.test(hi) ? Number(hi) : NaN;
    if (!lo || !hi) errors.cible_taille = ERREURS.tailleIncomplete;
    else if (![a, b].every((n) => n >= BORNES.taille.min && n <= BORNES.taille.max)) errors.cible_taille = ERREURS.taille(BORNES.taille.min, BORNES.taille.max);
    else if (a > b) errors.cible_taille = ERREURS.tailleOrdre;
    else taille = { effectif_min: a, effectif_max: b };
  }
  return {
    values: { entreprise_nom: nom, offre, besoin, cible_secteurs: secteurs, cible_zone: zone, cible_taille: taille, cible_fonctions: fonctions, exclusions, ton: s.ton },
    errors,
  };
}

export const LABEL_OF: Record<keyof Erreurs, string> = {
  entreprise_nom: CHAMPS.entreprise_nom.label,
  offre: CHAMPS.offre.label,
  besoin: CHAMPS.besoin.label,
  cible_secteurs: CHAMPS.cible_secteurs.label,
  cible_zone: CHAMPS.cible_zone.label,
  cible_taille: CHAMPS.cible_taille.label,
  cible_fonctions: CHAMPS.cible_fonctions.label,
  exclusions: CHAMPS.exclusions.label,
  ton: CHAMPS.ton.label,
};
export const ORDER = Object.keys(LABEL_OF) as (keyof Erreurs)[];
/** Identifiant (relatif) du premier contrôle de chaque champ, pour le lien du résumé d'erreurs. */
export const FOCUS_ID: Record<keyof Erreurs, string> = {
  entreprise_nom: "nom", offre: "offre", besoin: "besoin", cible_secteurs: "secteur-0", cible_zone: "zone", cible_taille: "taille-min", cible_fonctions: "fonctions", exclusions: "exclusions", ton: "ton-0",
};

/** Étape de l'assistant où vit chaque champ, pour afficher l'erreur pendant qu'on la commet et y renvoyer. */
export const ETAPE_DU_CHAMP: Record<keyof Erreurs, EtapeId> = {
  entreprise_nom: "qui",
  offre: "vente",
  besoin: "vente",
  cible_secteurs: "cible",
  cible_taille: "cible",
  cible_fonctions: "cible",
  exclusions: "cible",
  cible_zone: "zone",
  ton: "ton",
};

/** Ne garde, parmi `errors`, que les champs des étapes déjà visitées (on ne commente pas une étape pas encore vue). */
export function erreursVisibles(errors: Erreurs, etapesVisitees: ReadonlySet<EtapeId>): Erreurs {
  const out: Erreurs = {};
  for (const k of ORDER) if (errors[k] && etapesVisitees.has(ETAPE_DU_CHAMP[k])) out[k] = errors[k];
  return out;
}

/**
 * Niveau de complétion local (0 à 100, multiple de 5), indicatif pour le ressenti « jeu ».
 * Pondération : offre/secteurs/zone (obligatoires) comptent plus que le reste.
 */
export function niveauCompletion(s: Saisie): number {
  const nbSecteurs = s.secteurs.length + lines(s.secteursAutres).length;
  const poids: [boolean, number][] = [
    [s.entreprise_nom.trim().length > 0, 10],
    [s.offre.trim().length > 0, 25],
    [s.besoin.trim().length > 0, 10],
    [nbSecteurs > 0, 20],
    [lines(s.zone).length > 0, 20],
    [s.taille_min.trim().length > 0 && s.taille_max.trim().length > 0, 5],
    [lines(s.fonctions).length > 0, 10],
  ];
  const total = poids.reduce((acc, [ok, w]) => acc + (ok ? w : 0), 0);
  return Math.round(total / 5) * 5;
}
