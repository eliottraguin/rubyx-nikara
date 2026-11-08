/**
 * Textes des assistants personnels (docs/ASSISTANT.md §9) : libellés, exemples, états, messages d'erreur lisibles.
 * Données statiques, jamais produites par un modèle ; les composants n'en écrivent aucun en dur.
 * Français courant : pas de « agent », « quota », « token », « plan de délégation », « erreur serveur ».
 * (Les titres de tâches, le bandeau et le titre du plan viennent du serveur ; ceux d'ici ne servent que de repli.)
 */

/** Longueur maximale de la demande (contrat : POST /api/assistant/plans). Le serveur revérifie. */
export const MESSAGE_MAX = 500;

export type AssistantId = "assistant_prospection" | "assistant_clients" | "assistant_pub";

export interface AssistantCard {
  id: AssistantId;
  /** Nom court affiché sur la carte. */
  name: string;
  /** Ce que cet assistant sait faire, en une phrase. */
  about: string;
  examples: readonly string[];
}

export const ASSISTANTS: readonly AssistantCard[] = [
  {
    id: "assistant_prospection",
    name: "Prospection",
    about: "Il cherche de nouveaux clients et prépare vos fiches clients et vos premiers messages.",
    examples: ["Cherche de nouveaux clients à la Bibliothèque publique", "Prépare un premier message pour mes meilleurs prospects", "Prépare la fiche client de mon prospect le plus récent"],
  },
  {
    id: "assistant_clients",
    name: "Clients",
    about: "Il résume vos conversations avec les clients et prépare des brouillons de réponse.",
    examples: ["Résume mes conversations en cours", "Prépare une réponse à mon dernier client", "Propose un rendez-vous jeudi à mon client le plus pressé"],
  },
  {
    id: "assistant_pub",
    name: "Pub",
    about: "Il prépare vos contenus de publicité, que vous publiez vous-même.",
    examples: ["Prépare le kit de ma campagne de printemps", "Écris les textes de ma prochaine campagne", "Reprends ma campagne avec un ton plus chaleureux"],
  },
];

export const LABELS = {
  title: "Vos assistants",
  intro: "Dites en quelques mots ce que vous voulez faire : votre assistant vous propose une liste de tâches, et rien ne démarre sans votre accord.",
  askButton: (name: string) => `Demander à l'assistant ${name}`,
  askTitle: (name: string) => `Demander à l'assistant ${name}`,
  fieldLabel: "Que voulez-vous faire ?",
  fieldHelp: "Une ou deux phrases suffisent.",
  examplesTitle: "Quelques idées (cliquez pour les reprendre) :",
  send: "Envoyer ma demande",
  sending: "Je réfléchis…",
  free: "Proposer un plan est gratuit : vous ne payez que si vous lancez les tâches.",
  left: (n: number) => (n === 0 ? "Il ne vous reste aucune demande." : n === 1 ? "Il vous reste 1 demande." : `Il vous reste ${n} demandes.`),
  chars: (n: number) => `${n}/${MESSAGE_MAX} caractères.`,
  close: "Faire une autre demande",
  yes: "Oui, lancer",
  no: "Non, annuler",
  running: "Lancement en cours…",
  retry: "Réessayer les tâches qui n'ont pas pu se faire",
  retrying: "Nouvel essai en cours…",
  review: "Revoir",
  historyTitle: "Vos demandes récentes",
  historyEmpty: "Vous n'avez encore rien demandé.",
  who: "Qui s'en occupe :",
  youGet: "Ce que vous obtiendrez :",
  cost: "Coût :",
  free0: "gratuit",
  total: "Total à dépenser",
  balanceNow: "Votre solde aujourd'hui",
  balanceAfter: "Votre solde après",
  simulated: "Démonstration : les résultats sont simulés.",
} as const;

export const FALLBACK = {
  headline: "Voici ce que je propose de faire",
  banner: "Rien n'est envoyé ni publié sans vous. Vous recevez des brouillons à relire.",
} as const;

export const money = (n: number): string => `${n} $`;

export type PlanStatus = "PROPOSED" | "RUNNING" | "DONE" | "PARTIAL" | "REJECTED";
export type TaskStatus = "READY" | "BLOCKED" | "RUNNING" | "DONE" | "FAILED";

/** Titre de la zone du plan selon son état (celui du plan proposé vient du serveur). */
export const PLAN_TITLES: Record<Exclude<PlanStatus, "PROPOSED">, string> = {
  RUNNING: "C'est parti, je m'en occupe",
  DONE: "C'est terminé",
  PARTIAL: "C'est terminé, sauf une partie",
  REJECTED: "Ce plan a été annulé",
};

/** Texte d'état d'une tâche. « Prête » n'est montré qu'avant le lancement (rien), puis « en attente ». */
export const TASK_STATES: Record<TaskStatus, string> = {
  READY: "en attente",
  BLOCKED: "ne peut pas se faire",
  RUNNING: "en cours",
  DONE: "terminé",
  FAILED: "n'a pas pu se faire",
};

export const PLAN_STATUS_LABELS: Record<PlanStatus, string> = {
  PROPOSED: "à confirmer",
  RUNNING: "en cours",
  DONE: "terminé",
  PARTIAL: "terminé en partie",
  REJECTED: "annulé",
};

export const MESSAGES = {
  emptyPlan: "Je ne propose aucune tâche pour cette demande. Vous pouvez la reformuler.",
  nothingToRun: "Aucune tâche ne peut être lancée pour le moment.",
  notEnough: "Vous n'avez pas assez d'argent pour tout lancer.",
  progress: (done: number, total: number) => `${done} tâche${done > 1 ? "s" : ""} terminée${done > 1 ? "s" : ""} sur ${total}.`,
  allDone: "Toutes les tâches sont terminées.",
  partial: "Certaines tâches n'ont pas pu se faire. Rien n'est perdu : vous pouvez réessayer.",
  rejected: "Plan annulé. Rien n'a été dépensé.",
  loadFailed: "Vos demandes récentes n'ont pas pu être affichées pour le moment.",
} as const;

/** Où retrouver le résultat d'une tâche, selon son type. */
export const LINKS: Record<string, { href: string; label: string }> = {
  ad_campaign: { href: "/immeuble?etage=pub", label: "Ouvrir le Studio pub" },
  conversation_triage: { href: "/immeuble?etage=courrier", label: "Ouvrir la Salle du courrier" },
  conversation_reply: { href: "/immeuble?etage=courrier", label: "Ouvrir la Salle du courrier" },
  prospect_profile: { href: "/immeuble?etage=archives", label: "Ouvrir mon carnet" },
  prospect_message: { href: "/immeuble?etage=archives", label: "Ouvrir mon carnet" },
  scout_search: { href: "/immeuble?etage=archives", label: "Ouvrir mon carnet" },
};

export type ErrorContext = "propose" | "confirm" | "reject" | "load";

/** Code d'erreur -> phrase lisible (jamais le code ni le message du serveur). */
export function errorText(code: string, ctx: ErrorContext): string {
  switch (code) {
    case "MESSAGE_LIMIT":
      return ctx === "propose" ? "Vous avez utilisé toutes vos demandes à l'assistant pour cette partie." : "Cette tâche a déjà été demandée le nombre maximal de fois.";
    case "ROLE_LOCKED":
      return "Cet assistant n'est pas encore disponible dans votre partie.";
    case "INVALID_OUTPUT":
      return ctx === "propose"
        ? "Je n'ai pas bien compris votre demande. Pouvez-vous la reformuler avec d'autres mots ? Rien n'a été dépensé."
        : "Cela n'a pas réussi cette fois. Rien n'a été dépensé : vous pouvez réessayer.";
    case "INVALID_STATE":
      return "Ce plan a déjà été lancé ou annulé : il n'est plus possible de le changer.";
    case "NOT_FOUND":
      return "Ce plan n'existe plus.";
    case "INVALID_REQUEST":
      return `Votre demande n'est pas valide : écrivez une ou deux phrases (${MESSAGE_MAX} caractères au plus).`;
    case "INSUFFICIENT_FUNDS":
      return "Vous n'avez pas assez d'argent pour lancer ces tâches.";
    case "LLM_UNAVAILABLE":
      return "L'assistant est indisponible pour le moment. Rien n'a été dépensé : réessayez plus tard.";
    case "RATE_LIMITED":
      return "Trop de demandes en même temps. Rien n'a été dépensé : réessayez dans un instant.";
    case "SESSION_REQUIRED":
      return "Votre partie n'est plus ouverte : revenez à l'accueil pour la reprendre.";
    case "NETWORK":
    case "TIMEOUT":
      return "Connexion perdue. Rien n'est perdu : réessayez dans un instant.";
    default:
      return ctx === "load" ? MESSAGES.loadFailed : "Cela n'a pas pu se faire. Rien n'a été dépensé : vous pouvez réessayer.";
  }
}
