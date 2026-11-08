/**
 * Textures de façade générées par le code (aucune image externe) : une tuile de 4 travées × 4 étages, avec des
 * fenêtres allumées tirées par la graine. Répétée par les UV de `boxParts`.
 */
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from "three";
import { mulberry32 } from "@/game/login/plan";
import { BAY, FLOOR, type Palette } from "./scale";

/** Une répétition de la tuile couvre 4 travées en largeur et 4 étages en hauteur. */
export const TILE_U = 4 * BAY;
export const TILE_V = 4 * FLOOR;

const shade = (hex: string, k: number): string => {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${c((n >> 16) & 255)},${c((n >> 8) & 255)},${c(n & 255)})`;
};

export function facadeTexture(p: Palette, seed: number): CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const S = 256;
  const cell = S / 4;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = S;
  const g = canvas.getContext("2d");
  if (!g) return null;
  const rng = mulberry32(seed);
  g.fillStyle = p.wall;
  g.fillRect(0, 0, S, S);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const x = c * cell;
      const y = r * cell;
      const lit = rng() < (p.kind === "curtain" ? 0.22 : 0.3);
      if (p.kind === "punched") {
        // bandeau d'étage + fenêtre à encadrement, linteau et appui
        g.fillStyle = shade(p.wall, 0.86);
        g.fillRect(x, y + cell - 7, cell, 7);
        g.fillStyle = shade(p.wall, 1.06);
        g.fillRect(x, y, cell, 3);
        const wx = x + 14;
        const wy = y + 12;
        const ww = cell - 28;
        const wh = cell - 30;
        g.fillStyle = shade(p.trim, 0.95);
        g.fillRect(wx - 3, wy - 3, ww + 6, wh + 9);
        const grad = g.createLinearGradient(wx, wy, wx + ww, wy + wh);
        grad.addColorStop(0, lit ? p.lit : p.glass);
        grad.addColorStop(1, lit ? shade(p.lit, 0.82) : shade(p.glass, 0.78));
        g.fillStyle = grad;
        g.fillRect(wx, wy, ww, wh);
        g.fillStyle = "rgba(255,255,255,0.18)";
        g.fillRect(wx, wy, ww, 6);
        g.fillStyle = shade(p.trim, 0.8);
        g.fillRect(wx + ww / 2 - 1, wy, 2, wh);
        g.fillRect(wx - 5, wy + wh + 2, ww + 10, 4);
      } else {
        // mur-rideau : allège pleine + vitrage continu, meneaux fins
        g.fillStyle = shade(p.wall, 0.78);
        g.fillRect(x, y + cell - 16, cell, 16);
        const grad = g.createLinearGradient(x, y, x + cell, y + cell);
        grad.addColorStop(0, lit ? p.lit : shade(p.glass, 1.25));
        grad.addColorStop(1, lit ? shade(p.lit, 0.8) : p.glass);
        g.fillStyle = grad;
        g.fillRect(x + 2, y + 3, cell - 4, cell - 21);
        g.fillStyle = "rgba(255,255,255,0.16)";
        g.beginPath();
        g.moveTo(x + 2, y + 3);
        g.lineTo(x + cell * 0.6, y + 3);
        g.lineTo(x + 2, y + cell * 0.55);
        g.fill();
        g.fillStyle = shade(p.trim, 0.7);
        g.fillRect(x, y, 2, cell);
        g.fillRect(x, y, cell, 2);
      }
    }
  }
  const t = new CanvasTexture(canvas);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
