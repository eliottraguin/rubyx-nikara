/**
 * Textes du parcours « Chercher des clients » (6e décision, docs/PARCOURS-BOT.md) : libellés, messages d'état,
 * bulles d'aide du mode Tutoriel. Données statiques, jamais produites par un modèle ; les composants n'en écrivent aucun en dur.
 * Français courant : pas de « agent », « quota », « token », « expédition ».
 */

/** Longueur maximale de la précision (contrat : POST /api/searches). Le serveur revérifie. */
export const PRECISION_MAX = 300;

/** Nombre de prospects à trouver au lieu précédent pour ouvrir le suivant. Affichage seul : le serveur décide du déblocage. */
export const UNLOCK_PROSPECTS = 3;

/** Page de la fiche entreprise et cible. Écran livré par UI-H1 ; `null` ferait retomber le message sans lien. */
export const FICHE_HREF: string | null = "/fiche";
export const CARNET_HREF = "/immeuble?etage=archives";
export const COURRIER_HREF = "/immeuble?etage=courrier";

export const LABELS = {
  title: "Chercher des clients",
  button: "Chercher des clients ici",
  buttonBuilding: "Lancer une recherche",
  buttonRunning: "Recherche en cours…",
  free: "La recherche est gratuite.",
  precisionLabel: "Une précision ?",
  precisionHelp: "Facultatif : une phrase pour orienter cette recherche, par exemple « plutôt des commerces du centre ».",
  placeLabel: "Lieu de la recherche",
  placePlaceholder: "Choisir un lieu…",
  noPlace: "Aucun lieu n'est ouvert pour le moment.",
  resultTitle: "Ce que le bot a trouvé",
  source: "Source",
  carnet: "Ouvrir mon carnet",
  contact: "Contacter",
  contacting: "Ouverture…",
  openCourrier: "Ouvrir la salle du courrier",
  fiche: "Compléter ma fiche entreprise et cible",
  retry: "Réessayer",
} as const;

export const PERTINENCE = {
  correspond: { label: "Correspond", hint: "Ce prospect colle à votre cible.", mark: "✓" },
  a_verifier: { label: "À vérifier", hint: "Il manque une information pour trancher : vérifiez avant de le contacter.", mark: "?" },
  hors_cible: { label: "Hors cible", hint: "Ce prospect ne correspond pas à votre cible.", mark: "✕" },
} as const;

export const MESSAGES = {
  enRoute: "Le bot est en route…",
  autreEnCours: "Une recherche est déjà en cours : attendez le retour du bot.",
  pasDeCitation: "Pas de citation de la source : vérifiez ce prospect avant de le contacter.",
  retour: (n: number) => (n === 1 ? "Le bot est revenu : 1 prospect ajouté à votre carnet." : `Le bot est revenu : ${n} prospects ajoutés à votre carnet.`),
  vide: "Rien ne correspond cette fois, essayez un autre lieu ou précisez votre cible.",
  dejaPresents: (n: number) => (n === 1 ? "1 prospect était déjà dans votre carnet." : `${n} prospects étaient déjà dans votre carnet.`),
  ecartes: (n: number) => (n === 1 ? "1 résultat a été écarté, car hors de votre cible." : `${n} résultats ont été écartés, car hors de votre cible.`),
  rejetes: (n: number) => (n === 1 ? "1 résultat n'a pas pu être vérifié et n'a pas été ajouté." : `${n} résultats n'ont pas pu être vérifiés et n'ont pas été ajoutés.`),
  /** `place` : lieu précédent, avec son article (« à la Bibliothèque publique »). */
  verrouille: (place: string | null) =>
    place ? `Il faut d'abord trouver ${UNLOCK_PROSPECTS} prospects pertinents ${place}.` : "Ce lieu n'est pas encore ouvert.",
} as const;

/** Lieu précédent avec article, par identifiant technique du lieu (noms de data/map/city_v1.json). */
export const PLACE_AT: Record<string, string> = {
  annuaire: "à la Bibliothèque publique",
  registre: "à l'Hôtel de ville",
  "carte-locale": "à SoHo",
  linkedin: "à Midtown",
  glassdoor: "à Wall Street",
  constellation: "à Times Square",
};

/** Problèmes affichés à la place du résultat (jamais de code technique à l'écran). */
export type ProblemKind = "locked" | "profile" | "busy" | "unavailable" | "network" | "invalid" | "unknown";
export const PROBLEMS: Record<ProblemKind, { title: string; text: string }> = {
  locked: { title: "Ce lieu n'est pas encore ouvert.", text: "Cherchez d'abord ailleurs." },
  profile: { title: "Votre fiche est incomplète.", text: "Le bot a besoin de savoir ce que vous vendez, où et à qui. Complétez votre fiche entreprise et cible, puis relancez la recherche." },
  busy: { title: "Trop de recherches pour le moment.", text: "Patientez un instant, puis réessayez." },
  unavailable: { title: "Le bot n'a pas pu partir.", text: "Rien n'a été utilisé ni ajouté à votre carnet. Vous pouvez réessayer." },
  network: { title: "Connexion perdue.", text: "Le serveur est injoignable. Vos données sont conservées : réessayez dans un instant." },
  invalid: { title: "Cette recherche n'est pas valide.", text: "Vérifiez le lieu choisi et la précision (300 caractères au plus), puis réessayez." },
  unknown: { title: "La recherche n'a pas abouti.", text: "Une erreur est survenue. Rien n'a été ajouté à votre carnet : vous pouvez réessayer." },
};

export const CONTACT_PROBLEMS = {
  unavailable: "La conversation n'est pas encore disponible pour ce prospect. Vous pourrez le contacter depuis la salle du courrier dès qu'elle sera ouverte.",
  ecarte: "Ce prospect est écarté de votre carnet : remettez-le en « Nouveau » pour le contacter.",
  network: "Connexion perdue : la conversation n'a pas pu s'ouvrir. Réessayez dans un instant.",
  unknown: "La conversation n'a pas pu s'ouvrir. Réessayez dans un instant.",
} as const;

/** Bulles d'aide du mode Tutoriel : une par étape, dans l'ordre du parcours. */
export interface Tip {
  id: "cible" | "resultat" | "contacter";
  title: string;
  text: string;
}
export const TIPS: Record<Tip["id"], Tip> = {
  cible: {
    id: "cible",
    title: "Voici votre cible",
    text: "Le bot cherche des clients qui ressemblent à votre fiche entreprise et cible. Choisissez un lieu, ajoutez une précision si vous voulez, puis lancez la recherche.",
  },
  resultat: {
    id: "resultat",
    title: "Voici ce que le bot a trouvé",
    text: "Chaque prospect est déjà dans votre carnet. L'étiquette vous aide à choisir : « Correspond », « À vérifier » ou « Hors cible », avec la phrase de la source qui l'explique.",
  },
  contacter: {
    id: "contacter",
    title: "Contactez-en un",
    text: "Cliquez sur « Contacter » pour ouvrir une conversation avec un prospect dans la salle du courrier. Rien n'est envoyé hors du jeu en mode Tutoriel.",
  },
};
export const TIP_LABELS = { dismiss: "Compris", disableAll: "Ne plus afficher les bulles d'aide", enableAll: "Réafficher les bulles d'aide", region: "Aide" } as const;
