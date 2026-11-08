/**
 * Choix du moteur de la vue bureau (ADR 0003). Pur : testable sans navigateur.
 * Le DOM reste le moteur PAR DÉFAUT : le gate de l'ADR 0002 (>= 30 images/s, 20 montages/démontages sans fuite)
 * n'est PAS mesuré. Ne pas inverser ce défaut avant mesure. Aucune règle de jeu ici.
 */
export type BuildingEngine = "dom" | "three";

export function buildingEngine(raw: string | undefined = process.env.NEXT_PUBLIC_BUILDING_ENGINE): BuildingEngine {
  return raw === "three" ? "three" : "dom";
}
