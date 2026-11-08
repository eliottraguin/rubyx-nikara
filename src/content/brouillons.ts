/** Textes de la fiche client et du premier message (français courant, sans jargon). */
export const QUOTA_ESSAIS = 5;
export const INSTRUCTION_MAX = 500;

export const BANDEAU = "Rien n'est envoyé : vous relisez et vous envoyez vous-même.";

export const KIND = {
  profile: {
    titre: "Fiche client",
    bouton: "Préparer la fiche client",
    enCours: "Le rédacteur prépare la fiche client…",
    vide: "Aucune fiche client pour l'instant.",
    prete: "La fiche client est prête.",
    coller: "Résumé, raisons de cibler ce prospect et points à vérifier, à partir de ce que le carnet sait déjà.",
  },
  message: {
    titre: "Premier message",
    bouton: "Écrire un premier message",
    enCours: "Le rédacteur écrit le premier message…",
    vide: "Aucun premier message pour l'instant.",
    prete: "Le premier message est prêt.",
    coller: "Un objet et un texte à relire, à modifier puis à copier : rien n'est envoyé.",
  },
} as const;

export const T = {
  precision: "Précision pour le rédacteur (facultatif)",
  precisionAide: (n: number) => `${n} caractères au plus. Exemple : « mettre en avant le gain de temps ».`,
  essais: (n: number) => (n <= 0 ? "Plus d'essai pour ce prospect." : n === 1 ? "Il vous reste 1 essai." : `Il vous reste ${n} essais.`),
  cout: (n: number | null) => (n === null ? "Coût indiqué par le serveur" : `Coût : ${n} $ par essai réussi`),
  coutAide: "Rien n'est débité si le rédacteur n'a pas réussi.",
  resume: "Résumé",
  pourquoi: "Pourquoi ce prospect",
  accroches: "Points d'accroche",
  aVerifier: "À vérifier avant de vous en servir",
  objet: "Objet",
  corps: "Message",
  sansObjet: "(sans objet)",
  versions: "Versions",
  versionsAide: "Une version ne change jamais : modifier en crée une nouvelle.",
  version: (i: number, total: number) => `Version ${i} sur ${total}`,
  auteur: { agent: "écrite par le rédacteur", joueur: "modifiée par vous" },
  controles: "Contrôles automatiques",
  reussi: "Réussi",
  aCorriger: "À corriger",
  modifier: "Modifier (nouvelle version)",
  enregistrer: "Enregistrer comme nouvelle version",
  annuler: "Annuler",
  copier: "Copier",
  copierQuoi: { profile: "la fiche client", message: "le message" },
  utiliser: "Utiliser ce message comme premier message",
  utiliserAide: "Ouvre la conversation avec ce prospect, dans la Salle du courrier, et y met ce texte comme premier message. Rien ne part sans votre confirmation.",
  pourquoiFixe: "Ces raisons viennent de votre fiche entreprise : elles ne se modifient pas.",
  ouvrirConversation: "Ouvrir la conversation",
  contacter: "Contacter ce prospect",
  chargement: "Chargement des fiches et messages…",
  lignes: "Une ligne par élément.",
  lienAccueil: "Aller à l'Accueil et garage",
  champs: { resume: "Résumé", pourquoi: "Pourquoi ce prospect", accroches: "Points d'accroche", aVerifier: "À vérifier", objet: "Objet", corps: "Message" },
  sauvee: "Nouvelle version enregistrée.",
} as const;

export const UNLOCK_PHRASE = "Obtenez 2 clients pour débloquer ce rédacteur.";

export type ProblemCode =
  | "ROLE_LOCKED"
  | "INSUFFICIENT_FUNDS"
  | "MESSAGE_LIMIT"
  | "INVALID_OUTPUT"
  | "LLM_UNAVAILABLE"
  | "VERSION_CONFLICT"
  | "OPTED_OUT"
  | "NOT_FOUND"
  | "NOT_IMPLEMENTED"
  | "INVALID_REQUEST"
  | "RATE_LIMITED"
  | "SESSION_REQUIRED"
  | "NETWORK"
  | "TIMEOUT"
  | "INVALID_STATE"
  | "UNKNOWN";

/** Phrase lisible pour un code d'erreur (jamais le code ni le message brut du serveur). */
export function problemText(code: string): string {
  switch (code) {
    case "ROLE_LOCKED":
      return `Le rédacteur n'est pas encore à vous. ${UNLOCK_PHRASE} Achetez-le ensuite à l'Accueil et garage.`;
    case "INSUFFICIENT_FUNDS":
      return "Votre solde est insuffisant pour cet essai. Rien n'a été débité.";
    case "MESSAGE_LIMIT":
      return "Vous avez utilisé vos 5 essais pour ce prospect. Vous pouvez toujours lire, modifier et copier les versions existantes. Rien n'a été débité.";
    case "INVALID_OUTPUT":
      return "Le rédacteur n'a pas réussi cette fois, rien n'a été dépensé. Vous pouvez réessayer.";
    case "LLM_UNAVAILABLE":
      return "Le rédacteur est momentanément indisponible. Rien n'a été débité, réessayez dans un instant.";
    case "VERSION_CONFLICT":
      return "Votre fiche entreprise a changé entre-temps. Rechargez la page puis réessayez. Rien n'a été débité.";
    case "OPTED_OUT":
      return "Ce prospect a demandé à ne plus être contacté : aucun message ne peut lui être préparé.";
    case "NOT_FOUND":
      return "Ce prospect n'existe plus dans votre carnet.";
    case "NOT_IMPLEMENTED":
      return "Cette fonction n'est pas encore disponible.";
    case "INVALID_REQUEST":
      return `Votre demande n'est pas valide : la précision fait ${INSTRUCTION_MAX} caractères au plus et les textes ne doivent pas être vides.`;
    case "RATE_LIMITED":
      return "Trop de demandes d'affilée : patientez un instant. Rien n'a été débité.";
    case "SESSION_REQUIRED":
      return "Votre partie n'est plus ouverte : revenez à l'accueil du jeu.";
    case "NETWORK":
      return "Connexion perdue : le serveur est injoignable. Vérifiez que rien n'a changé avant de réessayer.";
    case "TIMEOUT":
      return "Le rédacteur met trop de temps à répondre. Rien n'a été débité tant qu'il n'a pas réussi.";
    default:
      return "Une erreur est survenue. Rien n'a été débité.";
  }
}
