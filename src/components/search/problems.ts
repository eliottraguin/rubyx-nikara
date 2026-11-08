import { CONTACT_PROBLEMS, type ProblemKind } from "@/content/recherche";
import { SearchError } from "@/lib/api/searches";

/** Code d'erreur -> problème affiché (français courant, sans code). Un seul endroit. */
export function problemKind(e: unknown): ProblemKind {
  if (!(e instanceof SearchError)) return "unknown";
  switch (e.code) {
    case "PLANET_LOCKED":
      return "locked";
    case "PROFILE_INCOMPLETE":
      return "profile";
    case "RATE_LIMITED":
      return "busy";
    case "LLM_UNAVAILABLE":
    case "TIMEOUT":
    case "NOT_IMPLEMENTED":
    case "NOT_FOUND":
      return "unavailable";
    case "NETWORK":
      return "network";
    case "INVALID_REQUEST":
      return "invalid";
    default:
      return "unknown";
  }
}

/** Contact : NOT_IMPLEMENTED et 404 (route absente ou prospect introuvable) donnent la même phrase claire. */
export function contactProblem(e: unknown): string {
  if (!(e instanceof SearchError)) return CONTACT_PROBLEMS.unknown;
  if (e.code === "NOT_IMPLEMENTED" || e.code === "NOT_FOUND") return CONTACT_PROBLEMS.unavailable;
  if (e.code === "INVALID_STATE") return CONTACT_PROBLEMS.ecarte;
  if (e.code === "NETWORK") return CONTACT_PROBLEMS.network;
  return CONTACT_PROBLEMS.unknown;
}
