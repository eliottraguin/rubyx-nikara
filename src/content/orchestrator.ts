/**
 * Textes de l'étage Orchestrateur (docs/PLAN-V2.md §3, docs/CONTRACTS-V2.md §1). Français courant, données statiques.
 * (Titres de tâches, bandeau, note et conseils de l'évaluateur viennent du serveur ; ceux d'ici ne servent que de repli.)
 */
import { FALLBACK, LINKS, PLAN_STATUS_LABELS, TASK_STATES, money, type PlanStatus, type TaskStatus } from "@/content/assistant";

export { FALLBACK, LINKS, PLAN_STATUS_LABELS, TASK_STATES, money };
export type { PlanStatus, TaskStatus };

export const MESSAGE_MAX = 500;
export const FEEDBACK_MAX = 500;

export const ROLE_LABELS: Record<string, string> = {
  scout: "Éclaireur",
  triage: "Trieur de boîte",
  replier: "Rédacteur",
  ads: "Directeur de campagne",
};

export const LABELS = {
  title: "L'Orchestrateur",
  intro: "Dites-lui ce que vous voulez faire. Il vous propose un plan : rien ne se lance sans votre accord.",
  fieldLabel: "Que voulez-vous faire ?",
  fieldHelp: "Une ou deux phrases suffisent.",
  examplesTitle: "Quelques idées (cliquez pour les reprendre) :",
  send: "Envoyer",
  sending: "Il réfléchit…",
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
  duration: "Durée estimée :",
  free0: "gratuit",
  total: "Total à dépenser",
  balanceNow: "Votre solde aujourd'hui",
  balanceAfter: "Votre solde après",
  simulated: "Démonstration : les résultats sont simulés.",
  evalTitle: "Votre note de prompt",
  evalScore: (n: number) => `${n}/100`,
  evalAdvice: "Conseils :",
  tabPlan: "Discuter et lancer",
  tabImprove: "Améliorer un agent",
} as const;

export const EXAMPLES: readonly string[] = [
  "Trouve-moi des clients en centre-ville",
  "Relance mon prospect Dupont",
  "Prépare le kit de ma prochaine campagne",
];

export const IMPROVE_LABELS = {
  title: "Améliorer un agent",
  intro: "Choisissez un exemplaire, dites en une phrase ce qui ne va pas : l'orchestrateur propose une nouvelle version.",
  pickInstance: "Quel exemplaire améliorer ?",
  noInstances: "Vous ne possédez encore aucun agent à améliorer.",
  feedbackLabel: "Ce qui ne va pas",
  feedbackHelp: "Une phrase suffit.",
  suggestionsTitle: "Quelques idées (cliquez pour les reprendre) :",
  propose: "Proposer une nouvelle version",
  proposing: "Il y réfléchit…",
  diffTitle: "Nouvelle version proposée",
  before: "Avant",
  after: "Après",
  cost: "Coût :",
  tierCap: (n: number) => `Plafond du palier : ${n}.`,
  confirm: "Confirmer et payer",
  confirming: "Mise à jour…",
  cancel: "Annuler",
  done: "Nouvelle version enregistrée.",
  historyTitle: "Historique des versions",
  current: "version active",
  rollback: "Revenir à cette version",
  rollingBack: "Retour en arrière…",
  rolledBack: "Retour à une version précédente effectué.",
  chars: (n: number) => `${n}/${FEEDBACK_MAX} caractères.`,
} as const;

export const SUGGESTIONS: readonly string[] = ["Trop générique", "Trop familier", "Trop long", "Ne reprend pas assez ma fiche entreprise", "Trop technique"];

export type ImproveErrorContext = "list" | "propose" | "confirm" | "rollback";

/** Code d'erreur -> phrase lisible (jamais le code ni le message du serveur). */
export function orchestratorErrorText(code: string, ctx: "propose" | "confirm" | "reject" | "load" | ImproveErrorContext): string {
  switch (code) {
    case "MESSAGE_LIMIT":
      return ctx === "propose" ? "Vous avez utilisé toutes vos demandes à l'orchestrateur pour cette partie." : "Cette tâche a déjà été demandée le nombre maximal de fois.";
    case "ROLE_LOCKED":
      return "Cet agent n'est pas encore disponible dans votre partie.";
    case "INVALID_OUTPUT":
      return ctx === "propose"
        ? "Je n'ai pas bien compris votre demande. Pouvez-vous la reformuler avec d'autres mots ? Rien n'a été dépensé."
        : "Cela n'a pas réussi cette fois. Rien n'a été dépensé : vous pouvez réessayer.";
    case "INVALID_STATE":
      return "Ce plan a déjà été lancé ou annulé : il n'est plus possible de le changer.";
    case "NOT_FOUND":
      return "Cet élément n'existe plus.";
    case "INVALID_REQUEST":
      return "Votre texte n'est pas valide : écrivez une ou deux phrases.";
    case "INSUFFICIENT_FUNDS":
      return "Vous n'avez pas assez d'argent pour cela.";
    case "LLM_UNAVAILABLE":
      return "L'orchestrateur est indisponible pour le moment. Rien n'a été dépensé : réessayez plus tard.";
    case "RATE_LIMITED":
      return "Trop de demandes en même temps. Rien n'a été dépensé : réessayez dans un instant.";
    case "SESSION_REQUIRED":
      return "Votre partie n'est plus ouverte : revenez à l'accueil pour la reprendre.";
    case "NETWORK":
    case "TIMEOUT":
      return "Connexion perdue. Rien n'est perdu : réessayez dans un instant.";
    default:
      return ctx === "load" || ctx === "list" ? "Vos informations n'ont pas pu être affichées pour le moment." : "Cela n'a pas pu se faire. Rien n'a été dépensé : vous pouvez réessayer.";
  }
}
