import type {
  ActionStatus,
  AttemptStatus,
  ErrorCode,
  MissionStatus,
  RoleId,
  SubmissionStatus,
} from "./api/types";

/** Format monétaire unique : entiers de jeu. */
export function money(n: number): string {
  return `${n} $`;
}

export const ROLE_LABEL: Record<RoleId, string> = {
  writer: "Rédacteur",
  prospector: "Prospecteur",
  researcher: "Chargé de veille",
  analyst: "Analyste",
  qa: "Responsable qualité",
  lead: "Chef d'équipe",
};

export const MISSION_STATUS_LABEL: Record<MissionStatus, string> = {
  LOCKED: "Verrouillée",
  AVAILABLE: "Disponible",
  ACTIVE: "En cours",
  EVALUATING: "Évaluation en attente",
  COMPLETED: "Terminée",
  FAILED: "Non réussie",
};

export const ATTEMPT_STATUS_LABEL: Record<AttemptStatus, string> = {
  AVAILABLE: "Disponible",
  ACTIVE: "En cours",
  EVALUATING: "Évaluation en cours",
  COMPLETED: "Terminée",
  FAILED: "Non réussie",
};

export const ACTION_STATUS_LABEL: Record<ActionStatus, string> = {
  PENDING: "En file d'attente",
  RESERVED: "Coût réservé",
  RUNNING: "En cours",
  SUCCEEDED: "Terminée",
  PARTIAL: "Partielle",
  FAILED: "Échouée",
  AWAITING_CONFIRMATION: "À confirmer",
};

export const SUBMISSION_STATUS_LABEL: Record<SubmissionStatus, string> = {
  EVALUATING: "Évaluation en cours",
  EVALUATION_PENDING: "Évaluation en attente",
  EVALUATED: "Évaluée",
};

/** Messages par défaut (français) pour les codes stables, si l'API n'en fournit pas. */
export const ERROR_MESSAGE: Record<ErrorCode, string> = {
  INSUFFICIENT_FUNDS: "Fonds insuffisants : votre solde disponible ne couvre pas le coût maximal.",
  MESSAGE_LIMIT: "Vous avez utilisé tous les messages de cet agent pour cette tentative.",
  ROLE_LOCKED: "Cet agent n'est pas encore possédé ou débloqué.",
  INVALID_STATE: "Cette action n'est pas possible dans l'état actuel de la partie.",
  VERSION_CONFLICT: "Le brief ou la version a changé entre-temps. Relisez la commande puis réessayez.",
  INVALID_OUTPUT: "La réponse de l'agent était inutilisable. Rien n'a été débité : vous pouvez réessayer.",
  LLM_UNAVAILABLE: "Le service d'IA est indisponible. Rien n'a été débité : vous pouvez réessayer.",
  VALIDATION: "Les informations saisies ne sont pas valides.",
  RATE_LIMITED: "Le service est saturé. Patientez un instant puis réessayez.",
  NO_SESSION: "Aucune partie en cours.",
  NOT_FOUND: "Ressource introuvable dans votre partie.",
  NOT_IMPLEMENTED: "Cette fonction n'est pas encore disponible sur le serveur.",
  INTERNAL_ERROR: "Erreur interne du serveur. Réessayez dans un instant.",
  NETWORK: "Connexion perdue : le serveur est injoignable. Vos données sont conservées côté serveur.",
  UNKNOWN: "Une erreur inattendue est survenue.",
};

export const RECOVERABLE: ErrorCode[] = ["INVALID_OUTPUT", "LLM_UNAVAILABLE", "NETWORK", "RATE_LIMITED"];

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
}
