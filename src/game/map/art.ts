/**
 * Génération PROCÉDURALE des textures de la carte (aucun fichier image : data/map/ASSETS.md).
 * Toute la scène ne référence que les CLÉS de `TEX` : pour passer à des sprites, il suffit de charger un atlas
 * sous les mêmes clés (BootScene) et de supprimer l'appel à `generateMapTextures`.
 */
import type Phaser from "phaser";
import { TILE_H, TILE_W, type Pt } from "./iso";
import type { PlanetDef } from "./planets";

/** Échelle de rastérisation : les textures sont dessinées à ×S puis affichées à 1/S (netteté sur écrans denses). */
export const S = 2;

export const TEX = {
  base: "map-base",
  halo: "map-halo",
  shadow: "map-shadow",
  lock: "map-lock",
  pipOn: "map-pip-on",
  pipOff: "map-pip-off",
  ship: "map-ship",
  drone: "map-drone",
  star: (i: number) => `map-star-${i}`,
  nebula: (i: number) => `map-nebula-${i}`,
  planet: (id: string) => `map-planet-${id}`,
  planetLocked: (id: string) => `map-planet-${id}-locked`,
} as const;

type Ctx = CanvasRenderingContext2D;

function canvasTexture(scene: Phaser.Scene, key: string, w: number, h: number, draw: (ctx: Ctx) => void): void {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, Math.ceil(w), Math.ceil(h));
  if (!tex) return;
  draw(tex.getContext());
  tex.refresh();
}

/** Générateur pseudo-aléatoire déterministe (mulberry32) : même rendu à chaque chargement. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// ───────────────────────── Fond : étoiles, nébuleuses, halo, ombre ─────────────────────────

function makeBackdrop(scene: Phaser.Scene): void {
  const sizes = [6, 10, 16];
  sizes.forEach((px, i) => {
    canvasTexture(scene, TEX.star(i), px * S, px * S, (ctx) => {
      const r = (px * S) / 2;
      const g = ctx.createRadialGradient(r, r, 0, r, r, r);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(0.35, "rgba(214,232,255,0.65)");
      g.addColorStop(1, "rgba(214,232,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, px * S, px * S);
    });
  });
  const nebulas = ["#3b2a86", "#0f6b77", "#7a2a6a"];
  nebulas.forEach((c, i) => {
    const size = 520 * S;
    canvasTexture(scene, TEX.nebula(i), size, size, (ctx) => {
      const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      g.addColorStop(0, rgba(c, 0.5));
      g.addColorStop(0.5, rgba(c, 0.18));
      g.addColorStop(1, rgba(c, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
    });
  });
  canvasTexture(scene, TEX.halo, 256 * S, 256 * S, (ctx) => {
    const r = 128 * S;
    const g = ctx.createRadialGradient(r, r, r * 0.25, r, r, r);
    g.addColorStop(0, "rgba(255,255,255,0.9)");
    g.addColorStop(0.45, "rgba(255,255,255,0.28)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256 * S, 256 * S);
  });
  canvasTexture(scene, TEX.shadow, 200 * S, 80 * S, (ctx) => {
    const g = ctx.createRadialGradient(100 * S, 40 * S, 0, 100 * S, 40 * S, 100 * S);
    g.addColorStop(0, "rgba(0,0,0,0.55)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.save();
    ctx.scale(1, 0.4);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 200 * S, 200 * S);
    ctx.restore();
  });
}

// ───────────────────────── Icônes : cadenas, étoiles de score ─────────────────────────

function makeIcons(scene: Phaser.Scene): void {
  const px = 44;
  canvasTexture(scene, TEX.lock, px * S, px * S, (ctx) => {
    ctx.scale(S, S);
    ctx.fillStyle = "rgba(8,16,22,0.82)";
    ctx.beginPath();
    ctx.arc(px / 2, px / 2, px / 2 - 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.arc(px / 2, px / 2 - 3, 6.5, Math.PI, 0);
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.roundRect(px / 2 - 9, px / 2 - 3, 18, 14, 3);
    ctx.fill();
    ctx.fillStyle = "#14262d";
    ctx.beginPath();
    ctx.arc(px / 2, px / 2 + 4, 2.2, 0, Math.PI * 2);
    ctx.fill();
  });
  const star = (ctx: Ctx, cx: number, cy: number, r: number) => {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const rad = i % 2 === 0 ? r : r * 0.45;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const x = cx + Math.cos(a) * rad;
      const y = cy + Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  };
  const ps = 22;
  canvasTexture(scene, TEX.pipOn, ps * S, ps * S, (ctx) => {
    ctx.scale(S, S);
    star(ctx, ps / 2, ps / 2 + 1, ps / 2 - 2);
    ctx.fillStyle = "#ffd25a";
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = "#7a4a00";
    ctx.stroke();
  });
  canvasTexture(scene, TEX.pipOff, ps * S, ps * S, (ctx) => {
    ctx.scale(S, S);
    star(ctx, ps / 2, ps / 2 + 1, ps / 2 - 2);
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.stroke();
  });
}

// ───────────────────────── Planètes ─────────────────────────

/** Taille de la texture d'une planète (anneau compris), en pixels monde. */
export function planetTextureSize(radius: number): { w: number; h: number } {
  return { w: Math.ceil(radius * 4.2), h: Math.ceil(radius * 3.2) };
}

function drawSurface(ctx: Ctx, def: PlanetDef, cx: number, cy: number, R: number, locked: boolean): void {
  const rand = rng(hashSeed(def.id));
  const dark = locked ? "rgba(10,18,24,0.35)" : rgba(def.palette.dark, 0.5);
  const light = locked ? "rgba(220,232,238,0.16)" : rgba(def.palette.light, 0.4);
  switch (def.surface) {
    case "bands":
      for (let i = 0; i < 9; i++) {
        const y = cy - R + (i / 9) * 2 * R + rand() * R * 0.12;
        ctx.fillStyle = i % 2 ? dark : light;
        ctx.beginPath();
        ctx.moveTo(cx - R, y);
        for (let x = -R; x <= R; x += R / 6) ctx.lineTo(cx + x, y + Math.sin(x / 14 + i) * R * 0.04);
        ctx.lineTo(cx + R, y + R * 0.13);
        ctx.lineTo(cx - R, y + R * 0.13);
        ctx.closePath();
        ctx.fill();
      }
      break;
    case "craters":
      for (let i = 0; i < 14; i++) {
        const a = rand() * Math.PI * 2;
        const d = Math.sqrt(rand()) * R * 0.85;
        const x = cx + Math.cos(a) * d;
        const y = cy + Math.sin(a) * d;
        const r = R * (0.06 + rand() * 0.14);
        ctx.fillStyle = dark;
        ctx.beginPath();
        ctx.ellipse(x, y, r, r * 0.75, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = light;
        ctx.lineWidth = 1.5 * S;
        ctx.beginPath();
        ctx.ellipse(x - r * 0.12, y - r * 0.14, r, r * 0.75, 0, Math.PI * 0.9, Math.PI * 1.9);
        ctx.stroke();
      }
      break;
    case "clouds":
      ctx.fillStyle = locked ? "rgba(235,242,246,0.14)" : "rgba(255,255,255,0.28)";
      for (let i = 0; i < 16; i++) {
        const x = cx + (rand() - 0.5) * 2 * R;
        const y = cy + (rand() - 0.5) * 2 * R;
        ctx.beginPath();
        ctx.ellipse(x, y, R * (0.18 + rand() * 0.3), R * (0.05 + rand() * 0.08), rand() * 0.6 - 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case "city":
      ctx.fillStyle = dark;
      ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R);
      for (let i = 0; i < 70; i++) {
        const x = cx + (rand() - 0.5) * 2 * R;
        const y = cy + (rand() - 0.5) * 2 * R;
        ctx.fillStyle = locked ? "rgba(255,255,255,0.35)" : rand() > 0.5 ? "#ffe9a8" : "#ffb86b";
        ctx.fillRect(x, y, 2 * S, 2 * S);
      }
      break;
    case "grid":
      ctx.strokeStyle = light;
      ctx.lineWidth = 1.4 * S;
      for (let i = -3; i <= 3; i++) {
        ctx.beginPath();
        ctx.ellipse(cx, cy, R * Math.abs(Math.cos((i * Math.PI) / 7)), R, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(cx, cy + (i * R) / 3.4, R * 0.98, R * 0.16, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    case "swirl":
      ctx.lineWidth = R * 0.1;
      for (let k = 0; k < 4; k++) {
        ctx.strokeStyle = k % 2 ? dark : light;
        ctx.beginPath();
        for (let t = 0; t < 7; t += 0.15) {
          const r = (t / 7) * R * 1.1 + k * R * 0.03;
          const a = t * 1.3 + k * 1.57;
          const x = cx + Math.cos(a) * r;
          const y = cy + Math.sin(a) * r * 0.9;
          if (t === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      break;
  }
}

function drawRing(ctx: Ctx, def: PlanetDef, cx: number, cy: number, R: number, front: boolean, locked: boolean): void {
  const rx = R * 1.8;
  const ry = R * 0.52;
  const rot = -0.28;
  const [from, to] = front ? [0, Math.PI] : [Math.PI, Math.PI * 2];
  const col = locked ? "#9aa7ae" : def.palette.light;
  ctx.lineCap = "butt";
  ctx.strokeStyle = rgba(col, locked ? 0.45 : 0.55);
  ctx.lineWidth = R * 0.26;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, rot, from, to);
  ctx.stroke();
  ctx.strokeStyle = rgba(locked ? "#d7e0e5" : "#ffffff", 0.5);
  ctx.lineWidth = R * 0.05;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx * 1.02, ry * 1.02, rot, from, to);
  ctx.stroke();
}

function makePlanet(scene: Phaser.Scene, def: PlanetDef, locked: boolean): void {
  const { w, h } = planetTextureSize(def.radius);
  const key = locked ? TEX.planetLocked(def.id) : TEX.planet(def.id);
  canvasTexture(scene, key, w * S, h * S, (ctx) => {
    const R = def.radius * S;
    const cx = (w * S) / 2;
    const cy = (h * S) / 2;
    if (def.ring) drawRing(ctx, def, cx, cy, R, false, locked);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();
    const lx = cx - R * 0.38;
    const ly = cy - R * 0.42;
    const body = ctx.createRadialGradient(lx, ly, R * 0.05, cx, cy, R * 1.05);
    if (locked) {
      body.addColorStop(0, "#9fadb4");
      body.addColorStop(0.55, "#56666e");
      body.addColorStop(1, "#1b272d");
    } else {
      body.addColorStop(0, def.palette.light);
      body.addColorStop(0.5, def.palette.mid);
      body.addColorStop(1, def.palette.dark);
    }
    ctx.fillStyle = body;
    ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R);
    drawSurface(ctx, def, cx, cy, R, locked);
    const night = ctx.createRadialGradient(lx, ly, R * 0.35, lx, ly, R * 1.75);
    night.addColorStop(0, "rgba(4,10,20,0)");
    night.addColorStop(0.6, "rgba(4,10,20,0.15)");
    night.addColorStop(1, "rgba(4,10,20,0.78)");
    ctx.fillStyle = night;
    ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R);
    if (locked) {
      // Voile : brume qui masque la planète tant qu'elle n'est pas débloquée.
      const rand = rng(hashSeed(def.id + "veil"));
      for (let i = 0; i < 9; i++) {
        ctx.fillStyle = `rgba(214,226,232,${0.1 + rand() * 0.1})`;
        ctx.beginPath();
        ctx.ellipse(cx + (rand() - 0.5) * R * 1.6, cy + (rand() - 0.5) * R * 1.6, R * (0.4 + rand() * 0.5), R * (0.1 + rand() * 0.12), rand() - 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "rgba(10,18,24,0.3)";
      ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R);
    }
    ctx.restore();
    // Liseré d'atmosphère.
    ctx.strokeStyle = locked ? "rgba(190,205,212,0.5)" : rgba(def.palette.glow, 0.75);
    ctx.lineWidth = 2.2 * S;
    ctx.beginPath();
    ctx.arc(cx, cy, R - S, 0, Math.PI * 2);
    ctx.stroke();
    if (def.ring) drawRing(ctx, def, cx, cy, R, true, locked);
  });
}

// ───────────────────────── Base (plateforme isométrique + bâtiments) ─────────────────────────

const BASE_N = 7;
const PLATFORM_DEPTH = 18;
const MAX_BUILDING_H = 150;

/** Dimensions logiques de la texture de base et point d'ancrage (centre du dessus de la plateforme). */
export const BASE_ART = {
  w: BASE_N * TILE_W + 16,
  h: (BASE_N * TILE_H) / 2 + (BASE_N * TILE_H) / 2 + PLATFORM_DEPTH + MAX_BUILDING_H + 12,
  get originX() {
    return this.w / 2;
  },
  get originY() {
    return MAX_BUILDING_H + (BASE_N * TILE_H) / 2;
  },
};

type FaceColors = { top: string; left: string; right: string };

function makeBase(scene: Phaser.Scene): void {
  canvasTexture(scene, TEX.base, BASE_ART.w * S, BASE_ART.h * S, (ctx) => {
    ctx.scale(S, S);
    const ox = BASE_ART.originX;
    const oy = BASE_ART.originY;
    /** Case de grille centrée (0,0 = centre de la plateforme) -> pixel texture. */
    const P = (gx: number, gy: number, z = 0): Pt => ({ x: ox + (gx - gy) * (TILE_W / 2), y: oy + (gx + gy) * (TILE_H / 2) - z });
    const poly = (pts: Pt[], fill: string, stroke?: string) => {
      ctx.beginPath();
      pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    };
    const half = BASE_N / 2;

    // Ombre portée sous la plateforme.
    const sh = ctx.createRadialGradient(ox, oy + 40, 10, ox, oy + 40, 260);
    sh.addColorStop(0, "rgba(0,0,0,0.45)");
    sh.addColorStop(1, "rgba(0,0,0,0)");
    ctx.save();
    ctx.translate(0, 0);
    ctx.fillStyle = sh;
    ctx.beginPath();
    ctx.ellipse(ox, oy + PLATFORM_DEPTH + 30, 260, 96, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Tranches de la plateforme (faces avant gauche et droite).
    const l = P(-half, half);
    const b = P(half, half);
    const r = P(half, -half);
    const D = PLATFORM_DEPTH;
    poly([l, b, { x: b.x, y: b.y + D }, { x: l.x, y: l.y + D }], "#16423f");
    poly([b, r, { x: r.x, y: r.y + D }, { x: b.x, y: b.y + D }], "#0f302e");
    // Sous-structure : réacteurs lumineux.
    for (let i = 1; i < BASE_N; i += 2) {
      const a = P(-half + i, half);
      ctx.fillStyle = "rgba(122,240,192,0.55)";
      ctx.beginPath();
      ctx.ellipse(a.x - 4, a.y + D - 4, 9, 3.2, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Tuiles (de l'arrière vers l'avant).
    for (let s = 0; s < 2 * BASE_N - 1; s++) {
      for (let i = 0; i < BASE_N; i++) {
        const j = s - i;
        if (j < 0 || j >= BASE_N) continue;
        const gx = i - half + 0.5;
        const gy = j - half + 0.5;
        const plaza = i >= 2 && i <= 4 && j >= 2 && j <= 4;
        const path = i === 3 || j === 3;
        const fill = plaza ? ((i + j) % 2 ? "#a7bcc2" : "#b6c9ce") : path ? "#7fa6a2" : (i + j) % 2 ? "#2c8c82" : "#34a094";
        poly([P(gx - 0.5, gy - 0.5), P(gx + 0.5, gy - 0.5), P(gx + 0.5, gy + 0.5), P(gx - 0.5, gy + 0.5)], fill, "rgba(255,255,255,0.10)");
      }
    }
    // Liseré lumineux du bord.
    ctx.strokeStyle = "rgba(122,240,192,0.8)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    [P(-half, -half), P(half, -half), P(half, half), P(-half, half)].forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
    ctx.stroke();

    const box = (gx: number, gy: number, w: number, d: number, h: number, c: FaceColors, z0 = 0) => {
      const t = [P(gx, gy, z0 + h), P(gx + w, gy, z0 + h), P(gx + w, gy + d, z0 + h), P(gx, gy + d, z0 + h)];
      poly([P(gx, gy + d, z0), P(gx + w, gy + d, z0), P(gx + w, gy + d, z0 + h), P(gx, gy + d, z0 + h)], c.left, "rgba(0,0,0,0.25)");
      poly([P(gx + w, gy + d, z0), P(gx + w, gy, z0), P(gx + w, gy, z0 + h), P(gx + w, gy + d, z0 + h)], c.right, "rgba(0,0,0,0.25)");
      poly(t, c.top, "rgba(0,0,0,0.2)");
    };
    /** Fenêtres sur la face « avant gauche » (y = gy + d) d'un bloc. */
    const windowsLeft = (gx: number, gy: number, w: number, d: number, h: number, cols: number, rows: number) => {
      for (let c = 0; c < cols; c++)
        for (let rr = 0; rr < rows; rr++) {
          const u0 = gx + ((c + 0.25) / cols) * w;
          const u1 = gx + ((c + 0.75) / cols) * w;
          const z0 = ((rr + 0.3) / rows) * h;
          const z1 = ((rr + 0.7) / rows) * h;
          poly([P(u0, gy + d, z0), P(u1, gy + d, z0), P(u1, gy + d, z1), P(u0, gy + d, z1)], (c + rr) % 3 === 0 ? "#ffe9a8" : "#7fd0ff");
        }
    };
    const windowsRight = (gx: number, gy: number, w: number, d: number, h: number, cols: number, rows: number) => {
      for (let c = 0; c < cols; c++)
        for (let rr = 0; rr < rows; rr++) {
          const v0 = gy + ((c + 0.25) / cols) * d;
          const v1 = gy + ((c + 0.75) / cols) * d;
          const z0 = ((rr + 0.3) / rows) * h;
          const z1 = ((rr + 0.7) / rows) * h;
          poly([P(gx + w, v0, z0), P(gx + w, v1, z0), P(gx + w, v1, z1), P(gx + w, v0, z1)], (c + rr) % 2 === 0 ? "#6bb6e0" : "#ffe9a8");
        }
    };

    // Aires d'atterrissage (devant la base, côté hangar).
    const pads: [number, number][] = [
      [1.5, 1.7],
      [-0.4, 2.1],
      [2.4, -0.2],
    ];
    for (const [px, py] of pads) {
      const c = P(px, py);
      ctx.fillStyle = "#26373d";
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, 27, 13.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#ffd25a";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#ffd25a";
      ctx.fillRect(c.x - 7, c.y - 2, 14, 1.6);
      ctx.fillRect(c.x - 0.8, c.y - 6, 1.6, 8);
    }

    // Coffre-fort (trésorerie).
    box(-3.1, 0.6, 1.5, 1.5, 34, { top: "#e4cc7a", left: "#b99a3c", right: "#8f7425" });
    const coin = P(-2.35, 1.35, 34);
    ctx.fillStyle = "#ffd25a";
    ctx.strokeStyle = "#7a4a00";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(coin.x, coin.y - 4, 12, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#7a4a00";
    ctx.font = "bold 9px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("$", coin.x, coin.y - 1);

    // Hangar : bloc bas avec porte voûtée côté avant.
    box(0.7, -3.1, 2.4, 2.1, 46, { top: "#f0c777", left: "#d99a3f", right: "#a9702a" });
    // Porte sur la face droite du hangar (x = gx + w = 3.1).
    poly([P(3.1, -2.6, 0), P(3.1, -1.6, 0), P(3.1, -1.6, 26), P(3.1, -2.6, 26)], "#2b1d10");
    poly([P(3.1, -2.45, 0), P(3.1, -1.75, 0), P(3.1, -1.75, 22), P(3.1, -2.45, 22)], "#ffd25a");

    // Siège (HQ) : deux étages, fenêtres, enseigne.
    box(-2.6, -2.7, 3, 3, 86, { top: "#d7e2e5", left: "#e9f0f2", right: "#b9c9ce" });
    windowsLeft(-2.6, -2.7, 3, 3, 86, 4, 4);
    windowsRight(-2.6, -2.7, 3, 3, 86, 4, 4);
    box(-1.9, -2.0, 1.6, 1.6, 40, { top: "#0b5c63", left: "#0f7a83", right: "#08474d" }, 86);
    // Antenne + balise.
    const a0 = P(-1.1, -1.2, 126);
    ctx.strokeStyle = "#475a62";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(a0.x, a0.y);
    ctx.lineTo(a0.x, a0.y - 22);
    ctx.stroke();
    ctx.fillStyle = "#ff5a5f";
    ctx.beginPath();
    ctx.arc(a0.x, a0.y - 24, 3.4, 0, Math.PI * 2);
    ctx.fill();

    // Végétation : quelques buissons sur le bord avant.
    const rand = rng(7);
    for (let i = 0; i < 9; i++) {
      const gx = (rand() - 0.5) * (BASE_N - 0.8);
      const gy = half - 0.5 + rand() * 0.2;
      const c = P(gx, gy);
      ctx.fillStyle = i % 2 ? "#1f6f5c" : "#2a8a6e";
      ctx.beginPath();
      ctx.ellipse(c.x, c.y - 4, 8, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

// ───────────────────────── Navette d'agent et sentinelle de planète ─────────────────────────

/** Taille de la navette en pixels monde (affichée à cette taille ; rastérisée à ×S). */
export const SHIP_SIZE = { w: 64, h: 36 };

function makeShip(scene: Phaser.Scene): void {
  const { w, h } = SHIP_SIZE;
  canvasTexture(scene, TEX.ship, w * S, h * S, (ctx) => {
    ctx.scale(S, S);
    // Sillage moteur (à gauche : la navette regarde vers +x).
    const glow = ctx.createRadialGradient(8, h / 2, 0, 8, h / 2, 14);
    glow.addColorStop(0, "rgba(255,226,140,0.95)");
    glow.addColorStop(0.5, "rgba(255,150,60,0.45)");
    glow.addColorStop(1, "rgba(255,120,40,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 24, h);
    // Aile arrière (ombrée) puis avant.
    ctx.fillStyle = "#0b4a50";
    ctx.beginPath();
    ctx.moveTo(18, h / 2);
    ctx.lineTo(34, 3);
    ctx.lineTo(40, 6);
    ctx.lineTo(30, h / 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#0f7a83";
    ctx.beginPath();
    ctx.moveTo(18, h / 2);
    ctx.lineTo(34, h - 3);
    ctx.lineTo(40, h - 6);
    ctx.lineTo(30, h / 2);
    ctx.closePath();
    ctx.fill();
    // Fuselage.
    const body = ctx.createLinearGradient(0, 8, 0, h - 8);
    body.addColorStop(0, "#ffffff");
    body.addColorStop(0.55, "#d9e6ea");
    body.addColorStop(1, "#8fa6ae");
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(14, h / 2);
    ctx.quadraticCurveTo(22, 7, 44, 10);
    ctx.quadraticCurveTo(w - 2, h / 2, 44, h - 10);
    ctx.quadraticCurveTo(22, h - 7, 14, h / 2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#2c4650";
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // Bande colorée + cockpit.
    ctx.fillStyle = "#ffd25a";
    ctx.fillRect(24, h / 2 - 1.5, 14, 3);
    const glass = ctx.createLinearGradient(0, 10, 0, 20);
    glass.addColorStop(0, "#bff0ff");
    glass.addColorStop(1, "#3a9ec6");
    ctx.fillStyle = glass;
    ctx.beginPath();
    ctx.ellipse(46, h / 2 - 1, 7, 4.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#1c4b5c";
    ctx.stroke();
  });
  // Sentinelle de la planète : petite sphère ambrée avec anneau (l'« agent de la planète » pendant le dialogue).
  const d = 34;
  canvasTexture(scene, TEX.drone, d * S, d * S, (ctx) => {
    ctx.scale(S, S);
    const g = ctx.createRadialGradient(15, 13, 1, 17, 17, 14);
    g.addColorStop(0, "#fff4c9");
    g.addColorStop(0.5, "#ffc43d");
    g.addColorStop(1, "#b86a00");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(17, 17, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(17, 17, 15, 5, -0.25, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#2a1600";
    ctx.beginPath();
    ctx.arc(13.5, 15.5, 1.6, 0, Math.PI * 2);
    ctx.arc(20.5, 15.5, 1.6, 0, Math.PI * 2);
    ctx.fill();
  });
}

/** Génère toutes les textures de la carte (idempotent : une clé existante est remplacée). */
export function generateMapTextures(scene: Phaser.Scene, planets: readonly PlanetDef[]): void {
  makeBackdrop(scene);
  makeIcons(scene);
  makeBase(scene);
  makeShip(scene);
  for (const p of planets) {
    makePlanet(scene, p, false);
    makePlanet(scene, p, true);
  }
}
