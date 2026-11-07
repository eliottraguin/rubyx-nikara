import type { AttemptView, Balance, RoleId, RoleQuota } from "./api/types";
import { ROLE_LABEL, money } from "./format";

/**
 * Longueur maximale d'une instruction, pour l'AFFICHAGE seulement (le serveur reste maître : rules.limits.prompt_max_chars).
 * L'API ne l'expose pas encore dans /api/state : valeur de repli, remplacée par `state.limits.prompt_max_chars` dès qu'elle y est.
 */
export const DEFAULT_PROMPT_MAX_CHARS = 4000;

/**
 * Nombre d'instructions par agent et par expédition, pour l'AFFICHAGE avant l'ouverture d'une expédition (le serveur
 * l'annonce ensuite dans les quotas de la tentative : `RoleQuota.limit`, qui prime). Il décide seul des refus.
 */
export const DEFAULT_MESSAGE_LIMIT = 5;

export interface SendCheck {
  allowed: boolean;
  /** Cause affichée en texte quand l'envoi est bloqué. Jamais masquée. */
  reasons: string[];
}

/**
 * Prévérification d'affichage à partir des données renvoyées par l'API
 * (quota, coût maximal annoncé, solde disponible). Elle ne remplace pas le
 * contrôle serveur, qui reste seul maître : elle évite un envoi voué à l'échec
 * et EXPLIQUE pourquoi.
 */
export function checkSend(opts: {
  attempt: AttemptView;
  quota: RoleQuota | undefined;
  role: RoleId | null;
  balance: Balance;
  text: string;
  maxChars?: number;
}): SendCheck {
  const { attempt, quota, role, balance, text } = opts;
  const reasons: string[] = [];
  if (!role || !quota) {
    reasons.push("Choisissez d'abord un agent.");
    return { allowed: false, reasons };
  }
  if (attempt.status !== "ACTIVE") reasons.push("La commande n'est plus en cours : plus d'envoi possible.");
  if (!quota.owned) reasons.push(`Agent verrouillé : ${ROLE_LABEL[role]} n'est pas encore possédé. Voir la boutique.`);
  if (quota.used >= quota.limit)
    reasons.push(`Vous avez utilisé les ${quota.limit} messages de cet agent pour cette tentative. Vous pouvez encore modifier le livrable à la main et le livrer.`);
  const cost = quota.free_credit ? 0 : quota.next_cost_max;
  if (cost > balance.available)
    reasons.push(
      `Fonds insuffisants : coût maximal ${money(cost)}, solde disponible ${money(balance.available)}.`,
    );
  if (text.trim().length === 0) reasons.push("Écrivez une instruction pour l'agent.");
  if (opts.maxChars && text.length > opts.maxChars) reasons.push(`Instruction trop longue (${opts.maxChars} caractères maximum).`);
  return { allowed: reasons.length === 0, reasons };
}
