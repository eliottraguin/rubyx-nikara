/** Projection isométrique 2:1 (pur, sans Phaser). Tuile 64x32 px. */

export const TILE_W = 64;
export const TILE_H = 32;

export interface Pt {
  x: number;
  y: number;
}

/** Case de la grille -> pixel monde. */
export function gridToScreen(g: Pt, tileW = TILE_W, tileH = TILE_H): Pt {
  return { x: (g.x - g.y) * (tileW / 2), y: (g.x + g.y) * (tileH / 2) };
}

/** Pixel monde -> case de la grille (inverse exact de `gridToScreen`). */
export function screenToGrid(p: Pt, tileW = TILE_W, tileH = TILE_H): Pt {
  const a = p.x / (tileW / 2);
  const b = p.y / (tileH / 2);
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

/** Ordre de dessin (peintre) : plus grand = plus proche de la caméra. */
export function isoDepth(g: Pt): number {
  return g.x + g.y;
}

/** Sommets (haut, droite, bas, gauche) du losange d'une tuile centrée en (cx, cy). */
export function diamond(cx: number, cy: number, w = TILE_W, h = TILE_H): [Pt, Pt, Pt, Pt] {
  return [
    { x: cx, y: cy - h / 2 },
    { x: cx + w / 2, y: cy },
    { x: cx, y: cy + h / 2 },
    { x: cx - w / 2, y: cy },
  ];
}
