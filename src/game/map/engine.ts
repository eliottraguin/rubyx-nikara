/**
 * Choix du moteur de la carte et garde de performance (ADR 0002, statut `draft`). Pur : testable sans navigateur.
 * Three.js est le moteur par défaut ; Phaser reste livré comme repli tant que l'ADR n'est pas validée
 * (`NEXT_PUBLIC_MAP_ENGINE=phaser`). Aucune règle de jeu ici.
 */
export type MapEngine = "three" | "phaser";

export function mapEngine(raw: string | undefined = process.env.NEXT_PUBLIC_MAP_ENGINE): MapEngine {
  return raw === "phaser" ? "phaser" : "three";
}

/** Fenêtre de mesure (s) et seuil (images/s) sous lequel la ville est jugée trop lente : bascule en mode liste. */
export const FPS_WINDOW_S = 3;
export const FPS_MIN = 12;
export const FPS_WARMUP_S = 2;
export const FPS_BAD_WINDOWS = 2;

/**
 * Alimenté avec le delta (s) de chaque image. Renvoie `true` une fois `FPS_BAD_WINDOWS` fenêtres consécutives
 * sous `FPS_MIN` (après un échauffement). Un delta > 1 s (onglet masqué, veille) est ignoré, pas compté comme lent.
 */
export function createFpsGuard() {
  let warm = 0;
  let time = 0;
  let frames = 0;
  let bad = 0;
  return {
    push(dt: number): boolean {
      if (dt <= 0 || dt > 1) return false;
      if (warm < FPS_WARMUP_S) {
        warm += dt;
        return false;
      }
      time += dt;
      frames++;
      if (time < FPS_WINDOW_S) return false;
      bad = frames / time < FPS_MIN ? bad + 1 : 0;
      time = 0;
      frames = 0;
      return bad >= FPS_BAD_WINDOWS;
    },
  };
}
