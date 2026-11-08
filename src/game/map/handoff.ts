/**
 * Passage de relais entre deux écrans qui partagent la même ville (connexion -> carte, bureau -> carte) : l'écran
 * qui part dit où sa caméra s'est arrêtée, l'écran qui arrive démarre là puis s'éloigne. Purement visuel, en mémoire,
 * jamais persisté ; consommé une seule fois.
 */
export interface CameraHandoff {
  from: "login" | "building";
  /** Point visé (plan XZ) et zoom au moment du départ. */
  target: { x: number; z: number };
  zoom: number;
}

/** Un relais plus vieux que ça est oublié (le joueur a navigué ailleurs entre-temps). */
export const HANDOFF_MAX_AGE_MS = 15000;

let pending: (CameraHandoff & { at: number }) | null = null;

export function setHandoff(h: CameraHandoff | null, now = Date.now()): void {
  pending = h ? { ...h, at: now } : null;
}

export function takeHandoff(now = Date.now()): CameraHandoff | null {
  const h = pending;
  pending = null;
  if (!h || now - h.at > HANDOFF_MAX_AGE_MS) return null;
  return { from: h.from, target: h.target, zoom: h.zoom };
}
