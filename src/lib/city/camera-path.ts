/**
 * Trajectoire de la caméra de la scène de connexion : vue très haute (ville +
 * nuages) -> vue centrée sur un quartier. Module pur (sans Three.js) pour rester testable.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface CameraPose {
  position: Vec3;
  target: Vec3;
}

/** Vue d'ensemble, de haut, sur la ville et les nuages. */
export const FAR_POSE: CameraPose = {
  position: { x: 0, y: 26, z: 14 },
  target: { x: 0, y: -2, z: -3.6 },
};

/** Vue de quartier : immeubles et rues au premier plan. */
export const NEIGHBORHOOD_POSE: CameraPose = {
  position: { x: 1.2, y: 2.2, z: 3.2 },
  target: { x: 0, y: 0.8, z: -2.4 },
};

export const ZOOM_DURATION_MS = 2200;

export function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** Ease in-out cubique : démarrage et arrivée doux. */
export function easeInOutCubic(t: number): number {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

function lerpVec(a: Vec3, b: Vec3, t: number): Vec3 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
}

/** Pose interpolée pour une progression linéaire `progress` dans [0, 1]. */
export function poseAt(progress: number, from: CameraPose = FAR_POSE, to: CameraPose = NEIGHBORHOOD_POSE): CameraPose {
  const t = easeInOutCubic(progress);
  return { position: lerpVec(from.position, to.position, t), target: lerpVec(from.target, to.target, t) };
}
