import { MESSAGES, PLACE_AT } from "@/content/recherche";
import type { PlanetVM } from "@/game/map/viewmodel";

/** Phrase simple d'un lieu verrouillé (« Il faut d'abord trouver 3 prospects pertinents à la Bibliothèque publique. »). */
export function lockedMessage(planets: readonly PlanetVM[], planetId: string): string {
  const i = planets.findIndex((p) => p.id === planetId);
  const prev = i > 0 ? planets[i - 1]! : null;
  return MESSAGES.verrouille(prev ? (PLACE_AT[prev.id] ?? `à ${prev.placeName}`) : null);
}
