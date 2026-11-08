/**
 * Choix du moteur de la vue immeuble (ADR 0003). Pur : testable sans navigateur.
 * La coupe Three.js est le moteur PAR DÉFAUT ; le DOM reste le repli permanent : sans WebGL, ou si la boucle reste
 * sous `FPS_MIN` images/s (`createFpsGuard`), la scène se retire et la liste des étages reste utilisable. On peut
 * forcer le DOM avec `NEXT_PUBLIC_BUILDING_ENGINE=dom`. Aucune règle de jeu ici.
 */
export type BuildingEngine = "dom" | "three";

export function buildingEngine(raw: string | undefined = process.env.NEXT_PUBLIC_BUILDING_ENGINE): BuildingEngine {
  return raw === "dom" ? "dom" : "three";
}
