import { ConvError } from "@/lib/api/conversations";

export interface CourrierProblem {
  text: string;
  /** Vrai quand l'agent est à acheter : l'interface propose le lien vers l'étage Accueil. */
  buyAgent?: boolean;
}

/** Messages en français pour les codes stables de la messagerie. Aucune donnée du serveur autre que son message d'erreur. */
export function describeProblem(e: unknown): CourrierProblem {
  if (!(e instanceof ConvError)) return { text: "Une erreur est survenue. Rien n'a été débité." };
  switch (e.code) {
    case "OPTED_OUT":
      return { text: "Ce prospect a demandé à ne plus être contacté : aucun message ne peut lui être envoyé." };
    case "INSUFFICIENT_FUNDS":
      return { text: "Solde disponible insuffisant pour cette action. Rien n'a été débité." };
    case "ROLE_LOCKED":
      return { text: "Cet agent n'est pas encore à vous : achetez-le à l'Accueil et garage.", buyAgent: true };
    case "MESSAGE_LIMIT":
      return { text: "Les 5 générations de cet agent sont utilisées pour cette conversation. Rien n'a été débité." };
    case "INVALID_OUTPUT":
      return { text: "La réponse de l'agent n'était pas exploitable. Rien n'a été débité, vous pouvez réessayer." };
    case "LLM_UNAVAILABLE":
      return { text: "L'agent est momentanément indisponible. Rien n'a été débité, réessayez." };
    case "NETWORK":
      return { text: "Connexion perdue : le serveur est injoignable." };
    case "SESSION_REQUIRED":
      return { text: "Votre partie n'est plus ouverte : revenez à l'accueil du jeu." };
    case "NOT_IMPLEMENTED":
      return { text: "Cette fonction n'est pas encore disponible." };
    case "NOT_FOUND":
      return { text: "Cette conversation n'existe plus." };
    default:
      return { text: e.message || "Une erreur est survenue." };
  }
}
