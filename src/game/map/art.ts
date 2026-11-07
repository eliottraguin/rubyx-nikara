/**
 * Génération PROCÉDURALE des textures de la ville : PLACEHOLDERS (aucun fichier image : data/map/ASSETS.md).
 * Toute la scène ne référence que les CLÉS de `TEX` : pour passer aux vrais sprites « Les Sims en réaliste »
 * (ticket ART-Q1), il suffit de charger un atlas sous les mêmes clés (BootScene) et de supprimer l'appel à
 * `generateMapTextures`. Rien ici ne décide d'une règle : ce sont des dessins.
 */
import type Phaser from "phaser";
import { appearanceFor, PX_PER_FLOOR, type BuildingAppearance } from "./building";
import { gridToScreen } from "./iso";
import type { BlockStyle, MapLayout, PlaceLayout } from "./layout";
import type { PlanetId } from "./planets";
import type { VehicleId } from "./vehicles";

/** Échelle de rastérisation : les textures sont dessinées à ×S puis affichées à 1/S (netteté sur écrans denses). */
export const S = 2;
/** Les îlots de décor sont nombreux : rastérisés à ×1 (placeholders). */
export const BLOCK_S = 1;

export const TEX = {
  halo: "map-halo",
  shadow: "map-shadow",
  lock: "map-lock",
  pipOn: "map-pip-on",
  pipOff: "map-pip-off",
  rotor: "map-rotor",
  greeter: "map-greeter",
  folder: "map-folder",
  crane: "map-crane",
  ground: "map-ground",
  tree: (i: number) => `map-tree-${i}`,
  block: (style: BlockStyle, floors: number) => `map-block-${style}-${floors}`,
  place: (id: string) => `map-place-${id}`,
  placeLocked: (id: string) => `map-place-${id}-locked`,
  hq: (level: number) => `map-hq-${level}`,
  vehicle: (v: VehicleId) => `map-vehicle-${v}`,
} as const;

type Ctx = CanvasRenderingContext2D;
type Pt = { x: number; y: number };

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

/** Éclaircit (k > 1) ou assombrit (k < 1) une couleur `#rrggbb` ou `rgb(r,g,b)` (une couleur déjà nuancée reste nuançable). */
export function shade(color: string, k: number): string {
  let r: number;
  let g: number;
  let b: number;
  const m = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.exec(color);
  if (m) {
    r = Number(m[1]);
    g = Number(m[2]);
    b = Number(m[3]);
  } else {
    const n = parseInt(color.slice(1), 16);
    r = (n >> 16) & 255;
    g = (n >> 8) & 255;
    b = n & 255;
  }
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${c(r)},${c(g)},${c(b)})`;
}

// ───────────────────────── Halo, ombre ─────────────────────────

function makeBackdrop(scene: Phaser.Scene): void {
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

// ───────────────────────── Boîtes isométriques (briques de base des bâtiments) ─────────────────────────

/** Contexte de dessin isométrique : (gx, gy, z) en cases/pixels -> pixel de la texture, origine = centre au sol. */
interface Iso {
  ctx: Ctx;
  ox: number;
  oy: number;
  gp: (gx: number, gy: number, z?: number) => Pt;
}

function makeIso(ctx: Ctx, ox: number, oy: number): Iso {
  return { ctx, ox, oy, gp: (gx, gy, z = 0) => ({ x: (gx - gy) * 32 + ox, y: (gx + gy) * 16 - z + oy }) };
}

function poly(ctx: Ctx, pts: Pt[], fill?: string, stroke?: string, lw = 1): void {
  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.lineWidth = lw;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

const lerpPt = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

interface BoxSpec {
  cx: number;
  cy: number;
  w: number;
  d: number;
  z0: number;
  h: number;
  wall: string;
  glass: string;
  /** Rendu des fenêtres : briques/pierre (petites fenêtres), verre (bandes continues). */
  look: "windows" | "glass" | "none";
  floors: number;
  seed: number;
  lit?: number;
  roof?: string;
}

/** Quadrilatère d'une façade : arête A->B au sol (z0), hauteur h ; (u, v) en 0..1. */
function facePoint(a: Pt, b: Pt, z0: number, h: number, u: number, v: number): Pt {
  const p = lerpPt(a, b, u);
  return { x: p.x, y: p.y - z0 - h * v };
}

function windows(iso: Iso, a: Pt, b: Pt, spec: BoxSpec, tileLen: number, rand: () => number): void {
  const { ctx } = iso;
  if (spec.look === "none") return;
  const cols = Math.max(2, Math.round(tileLen * (spec.look === "glass" ? 1.6 : 1.5)));
  for (let f = 0; f < spec.floors; f++) {
    for (let c = 0; c < cols; c++) {
      const glass = spec.look === "glass";
      const u0 = glass ? (c + 0.06) / cols : (c + 0.2) / cols;
      const u1 = glass ? (c + 0.94) / cols : (c + 0.8) / cols;
      const v0 = (f + (glass ? 0.14 : 0.25)) / spec.floors;
      const v1 = (f + (glass ? 0.86 : 0.78)) / spec.floors;
      const lit = rand() < (spec.lit ?? 0.25);
      ctx.globalAlpha = lit ? 0.95 : 0.55 + rand() * 0.35;
      poly(ctx, [facePoint(a, b, spec.z0, spec.h, u0, v0), facePoint(a, b, spec.z0, spec.h, u1, v0), facePoint(a, b, spec.z0, spec.h, u1, v1), facePoint(a, b, spec.z0, spec.h, u0, v1)], lit ? "#ffe9a8" : spec.glass);
    }
  }
  ctx.globalAlpha = 1;
}

/** Dessine une boîte isométrique (deux façades, un toit). Retourne les coins utiles pour les décors. */
function drawBox(iso: Iso, spec: BoxSpec) {
  const { ctx, gp } = iso;
  const { cx, cy, w, d, z0, h } = spec;
  const hw = w / 2;
  const hd = d / 2;
  const Lg = gp(cx - hw, cy + hd, z0);
  const Bg = gp(cx + hw, cy + hd, z0);
  const Rg = gp(cx + hw, cy - hd, z0);
  const Tg = gp(cx - hw, cy - hd, z0);
  const up = (p: Pt): Pt => ({ x: p.x, y: p.y - h });
  const rand = rng(spec.seed);
  poly(ctx, [Lg, Bg, up(Bg), up(Lg)], shade(spec.wall, 0.86), "rgba(0,0,0,0.18)", 1);
  poly(ctx, [Bg, Rg, up(Rg), up(Bg)], shade(spec.wall, 0.66), "rgba(0,0,0,0.18)", 1);
  windows(iso, Lg, Bg, spec, w, rand);
  windows(iso, Bg, Rg, spec, d, rand);
  poly(ctx, [up(Tg), up(Rg), up(Bg), up(Lg)], spec.roof ?? shade(spec.wall, 1.12), "rgba(0,0,0,0.22)", 1);
  return { L: Lg, B: Bg, R: Rg, T: Tg, topL: up(Lg), topB: up(Bg), topR: up(Rg), topT: up(Tg), spec };
}

/** Petit bloc technique ou réservoir sur un toit. */
function roofProps(iso: Iso, cx: number, cy: number, z: number, wall: string, seed: number): void {
  const r = rng(seed);
  drawBox(iso, { cx: cx + (r() - 0.5) * 0.8, cy: cy + (r() - 0.5) * 0.8, w: 0.7, d: 0.7, z0: z, h: 7, wall: shade(wall, 0.9), glass: "#444", look: "none", floors: 1, seed });
}

function helipad(iso: Iso, cx: number, cy: number, z: number): void {
  const { ctx } = iso;
  const c = iso.gp(cx, cy, z);
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.scale(1, 0.5);
  ctx.beginPath();
  ctx.arc(0, 0, 24, 0, Math.PI * 2);
  ctx.fillStyle = "#4a5560";
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 30px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("H", 0, 1);
  ctx.restore();
}

function columns(iso: Iso, a: Pt, b: Pt, z0: number, h: number, n: number, color: string): void {
  const { ctx } = iso;
  ctx.strokeStyle = color;
  ctx.lineWidth = 3.2;
  ctx.lineCap = "round";
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const p = lerpPt(a, b, t);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - z0);
    ctx.lineTo(p.x, p.y - z0 - h);
    ctx.stroke();
  }
  ctx.lineCap = "butt";
}

// ───────────────────────── Îlots de décor ─────────────────────────

const BLOCK_PALETTE: Record<BlockStyle, { wall: string; glass: string; look: BoxSpec["look"] }> = {
  brick: { wall: "#a8644c", glass: "#7ea3b5", look: "windows" },
  stone: { wall: "#c4bcab", glass: "#6f8798", look: "windows" },
  glass: { wall: "#7da4bf", glass: "#4f86ad", look: "glass" },
  concrete: { wall: "#b3b6ba", glass: "#6a8296", look: "windows" },
};

function blockSize(floors: number) {
  const h = floors * PX_PER_FLOOR;
  const w = 8 * 32 + 16;
  const top = h + 40;
  return { w, h: top + 8 * 16 + 8, ox: w / 2, oy: top + 4 * 16 };
}

function makeBlock(scene: Phaser.Scene, style: BlockStyle, floors: number): void {
  const sz = blockSize(floors);
  const pal = BLOCK_PALETTE[style];
  canvasTexture(scene, TEX.block(style, floors), sz.w * BLOCK_S, sz.h * BLOCK_S, (ctx) => {
    ctx.scale(BLOCK_S, BLOCK_S);
    const iso = makeIso(ctx, sz.ox, sz.oy);
    // Trottoir de l'îlot.
    poly(ctx, [iso.gp(-2, -2), iso.gp(2, -2), iso.gp(2, 2), iso.gp(-2, 2)], "#c9cdcf");
    const seed = hashSeed(`${style}-${floors}`);
    const h = floors * PX_PER_FLOOR;
    if (floors >= 14) {
      // Tour à gradins.
      const base = Math.round(floors * 0.4) * PX_PER_FLOOR;
      drawBox(iso, { cx: 0, cy: 0, w: 3.6, d: 3.6, z0: 0, h: base, wall: pal.wall, glass: pal.glass, look: pal.look, floors: Math.round(floors * 0.4), seed });
      drawBox(iso, { cx: 0, cy: 0, w: 2.6, d: 2.6, z0: base, h: h - base, wall: shade(pal.wall, 1.05), glass: pal.glass, look: pal.look, floors: floors - Math.round(floors * 0.4), seed: seed + 1 });
    } else {
      drawBox(iso, { cx: 0, cy: 0, w: 3.4, d: 3.4, z0: 0, h, wall: pal.wall, glass: pal.glass, look: pal.look, floors, seed });
      if (style !== "glass") roofProps(iso, 0, 0, h, pal.wall, seed + 2);
    }
  });
}

// ───────────────────────── Les six lieux ─────────────────────────

function placeSize(floors: number) {
  const h = floors * PX_PER_FLOOR;
  const w = 8 * 32 + 16;
  const top = h + 90;
  return { w, h: top + 8 * 16 + 8, ox: w / 2, oy: top + 4 * 16 };
}

/** Silhouettes génériques évocatrices (aucun logo, aucune marque). */
function drawPlace(iso: Iso, id: PlanetId, floors: number): void {
  const { ctx } = iso;
  const H = floors * PX_PER_FLOOR;
  poly(ctx, [iso.gp(-2, -2), iso.gp(2, -2), iso.gp(2, 2), iso.gp(-2, 2)], "#c9cdcf");
  switch (id) {
    case "annuaire": {
      // Bibliothèque : corps de pierre, escalier, colonnes, fronton.
      const b = drawBox(iso, { cx: 0, cy: -0.2, w: 3.4, d: 2.6, z0: 0, h: H, wall: "#d8d0bd", glass: "#7d96a6", look: "windows", floors: 3, seed: 1 });
      drawBox(iso, { cx: 0, cy: 1.45, w: 3.0, d: 0.9, z0: 0, h: 6, wall: "#e4dccb", glass: "#444", look: "none", floors: 1, seed: 2 });
      columns(iso, b.L, b.B, 6, H - 10, 6, "#f3ecda");
      poly(ctx, [{ x: b.topL.x, y: b.topL.y }, { x: b.topB.x, y: b.topB.y }, { x: (b.topL.x + b.topB.x) / 2, y: b.topL.y - 6 + ((b.topB.y - b.topL.y) / 2) - 14 }], "#efe7d4", "rgba(0,0,0,0.2)");
      break;
    }
    case "registre": {
      // Hôtel de ville : corps, tour centrale, dôme.
      drawBox(iso, { cx: 0, cy: 0, w: 3.6, d: 3.0, z0: 0, h: H, wall: "#cdb892", glass: "#6f879a", look: "windows", floors: 6, seed: 3 });
      const t = drawBox(iso, { cx: 0, cy: 0, w: 1.7, d: 1.7, z0: H, h: 30, wall: "#d8c7a4", glass: "#6f879a", look: "windows", floors: 2, seed: 4 });
      const c = { x: (t.topL.x + t.topR.x) / 2, y: (t.topT.y + t.topB.y) / 2 };
      const g = ctx.createLinearGradient(c.x - 26, 0, c.x + 26, 0);
      g.addColorStop(0, "#8cc3ae");
      g.addColorStop(1, "#4f8a77");
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, 26, 13, 0, Math.PI, 0);
      ctx.ellipse(c.x, c.y, 26, 13, 0, 0, Math.PI, true);
      ctx.closePath();
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(c.x - 26, c.y);
      ctx.bezierCurveTo(c.x - 26, c.y - 44, c.x + 26, c.y - 44, c.x + 26, c.y);
      ctx.ellipse(c.x, c.y, 26, 12, 0, 0, Math.PI);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#2c5a4b";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(c.x, c.y - 33);
      ctx.lineTo(c.x, c.y - 52);
      ctx.stroke();
      poly(ctx, [{ x: c.x, y: c.y - 52 }, { x: c.x + 14, y: c.y - 48 }, { x: c.x, y: c.y - 44 }], "#d94f4f");
      break;
    }
    case "carte-locale": {
      // SoHo : trois immeubles étroits de fonte, escaliers de secours.
      const cols = ["#a85a44", "#c8a06a", "#7f9a8a"];
      [-1.3, 0, 1.3].forEach((cx, i) => {
        const b = drawBox(iso, { cx, cy: 0, w: 1.2, d: 3.4, z0: 0, h: H + (i === 1 ? 12 : 0), wall: cols[i]!, glass: "#6b8497", look: "windows", floors: 5, seed: 10 + i });
        ctx.strokeStyle = "rgba(30,30,30,0.7)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let f = 0; f < 4; f++) {
          const p = lerpPt(b.B, b.R, 0.2);
          ctx.moveTo(p.x, p.y - 8 - f * PX_PER_FLOOR);
          ctx.lineTo(lerpPt(b.B, b.R, 0.8).x, lerpPt(b.B, b.R, 0.8).y - 8 - (f + 1) * PX_PER_FLOOR + 4);
        }
        ctx.stroke();
      });
      roofProps(iso, 0, 0, H + 12, "#c8a06a", 15);
      break;
    }
    case "linkedin": {
      // Midtown : trois tours de bureaux en verre.
      const towers = [
        { cx: -1, cy: -1, w: 1.6, d: 1.6, k: 1, c: "#6b97b8" },
        { cx: 1, cy: -0.6, w: 1.4, d: 1.4, k: 0.72, c: "#7fa9c4" },
        { cx: 0, cy: 1.1, w: 1.9, d: 1.6, k: 0.5, c: "#5f88a8" },
      ];
      towers.forEach((t, i) => drawBox(iso, { cx: t.cx, cy: t.cy, w: t.w, d: t.d, z0: 0, h: H * t.k, wall: t.c, glass: "#3f6f95", look: "glass", floors: Math.round(floors * t.k), seed: 20 + i, lit: 0.18 }));
      break;
    }
    case "glassdoor": {
      // Wall Street : socle à colonnes, tour de pierre à toit pyramidal.
      const base = 5 * PX_PER_FLOOR;
      const b = drawBox(iso, { cx: 0, cy: 0, w: 3.6, d: 3.6, z0: 0, h: base, wall: "#cdc7b8", glass: "#6f8798", look: "windows", floors: 4, seed: 30 });
      columns(iso, b.L, b.B, 4, base - 8, 7, "#efe9da");
      const t = drawBox(iso, { cx: 0, cy: 0, w: 2.2, d: 2.2, z0: base, h: H - base, wall: "#bdb7a8", glass: "#62798a", look: "windows", floors: floors - 5, seed: 31 });
      const apex = { x: (t.topL.x + t.topR.x) / 2, y: (t.topT.y + t.topB.y) / 2 - 36 };
      poly(ctx, [t.topL, t.topB, apex], "#8f6f5a", "rgba(0,0,0,0.25)");
      poly(ctx, [t.topB, t.topR, apex], "#6f5444", "rgba(0,0,0,0.25)");
      break;
    }
    case "constellation": {
      // Times Square : podium lumineux, tour sombre, panneaux publicitaires génériques (sans texte ni logo).
      const pod = drawBox(iso, { cx: 0, cy: 0, w: 3.8, d: 3.8, z0: 0, h: 3 * PX_PER_FLOOR, wall: "#59606b", glass: "#9ad0ff", look: "windows", floors: 3, seed: 40, lit: 0.6 });
      const t = drawBox(iso, { cx: 0, cy: 0, w: 2.2, d: 2.2, z0: 3 * PX_PER_FLOOR, h: H - 3 * PX_PER_FLOOR, wall: "#44566a", glass: "#7fb0d6", look: "glass", floors: floors - 3, seed: 41, lit: 0.3 });
      const colors = ["#ff4f9a", "#ffb02e", "#37d6e0", "#9bf04a", "#a77bff"];
      for (let i = 0; i < 5; i++) {
        const z = 3 * PX_PER_FLOOR + 14 + i * 34;
        const face = i % 2 === 0 ? [t.L, t.B] : [t.B, t.R];
        const a = lerpPt(face[0]!, face[1]!, 0.12);
        const b = lerpPt(face[0]!, face[1]!, 0.88);
        poly(ctx, [{ x: a.x, y: a.y - z }, { x: b.x, y: b.y - z }, { x: b.x, y: b.y - z - 24 }, { x: a.x, y: a.y - z - 24 }], colors[i]!, "rgba(255,255,255,0.7)", 1.5);
      }
      poly(ctx, [pod.topL, pod.topB, { x: pod.topB.x, y: pod.topB.y - 6 }, { x: pod.topL.x, y: pod.topL.y - 6 }], "#ff4f9a");
      helipad(iso, 0, 0, H);
      break;
    }
  }
}

function makePlace(scene: Phaser.Scene, p: PlaceLayout, locked: boolean): void {
  const sz = placeSize(p.floors);
  canvasTexture(scene, locked ? TEX.placeLocked(p.id) : TEX.place(p.id), sz.w * S, sz.h * S, (ctx) => {
    ctx.scale(S, S);
    drawPlace(makeIso(ctx, sz.ox, sz.oy), p.id, p.floors);
    if (locked) {
      // Voile : immeubles grisés (l'état est aussi écrit en texte : jamais la couleur seule).
      ctx.globalCompositeOperation = "source-atop";
      ctx.fillStyle = "rgba(116,132,148,0.66)";
      ctx.fillRect(0, 0, sz.w, sz.h);
      ctx.globalCompositeOperation = "source-over";
    }
  });
}

/** Géométrie d'affichage d'un lieu : origine (pixels de la texture, avant ×S) et dimensions. */
export function placeArt(floors: number) {
  return placeSize(floors);
}
export function blockArt(floors: number) {
  return blockSize(floors);
}

// ───────────────────────── L'immeuble du joueur (10 niveaux) ─────────────────────────

const HQ_TOP_PAD = 90;

export function hqSize(level: number) {
  const a = appearanceFor(level);
  const h = a.floors * PX_PER_FLOOR;
  const w = 8 * 32 + 16;
  const top = h + HQ_TOP_PAD;
  return { w, h: top + 8 * 16 + 8, ox: w / 2, oy: top + 4 * 16, bodyH: h };
}

/** Hauteur du corps, largeur de l'étage supérieur (fanion) et hauteur du premier niveau (enseigne). */
export function hqRoof(level: number) {
  const a = appearanceFor(level);
  const t = tiersFor(a);
  return { h: a.floors * PX_PER_FLOOR, topW: t[t.length - 1]!.w, baseW: t[0]!.w, podium: t[0]!.z0 + t[0]!.h };
}

interface Tier {
  w: number;
  z0: number;
  h: number;
  floors: number;
}

function tiersFor(a: BuildingAppearance): Tier[] {
  const H = a.floors * PX_PER_FLOOR;
  const f = a.floors;
  const mk = (w: number, fromF: number, toF: number): Tier => ({ w, z0: fromF * PX_PER_FLOOR, h: (toF - fromF) * PX_PER_FLOOR, floors: toF - fromF });
  if (f <= 6) return [mk(a.width, 0, f)];
  if (f <= 14) return [mk(a.width + 0.5, 0, 4), mk(a.width, 4, f)];
  if (f <= 20) {
    const mid = Math.round(f * 0.62);
    return [mk(a.width + 0.6, 0, 4), mk(a.width, 4, mid), mk(a.width - 0.8, mid, f)];
  }
  void H;
  return [mk(a.width + 0.8, 0, 4), mk(a.width + 0.1, 4, Math.round(f * 0.5)), mk(a.width - 0.5, Math.round(f * 0.5), Math.round(f * 0.8)), mk(a.width - 1.2, Math.round(f * 0.8), f)];
}

function drawHq(iso: Iso, a: BuildingAppearance): void {
  const { ctx } = iso;
  const has = (f: string) => a.features.includes(f);
  poly(ctx, [iso.gp(-2, -2), iso.gp(2, -2), iso.gp(2, 2), iso.gp(-2, 2)], "#c9cdcf");
  const glassFull = has("glass_full");
  const tiers = tiersFor(a);
  let last: ReturnType<typeof drawBox> | null = null;
  tiers.forEach((t, i) => {
    const look: BoxSpec["look"] = glassFull ? "glass" : has("glass_partial") && i === 0 ? "glass" : "windows";
    last = drawBox(iso, {
      cx: 0,
      cy: 0,
      w: t.w,
      d: t.w,
      z0: t.z0,
      h: t.h,
      wall: i === 0 || !glassFull ? a.wall : shade(a.wall, 1.05),
      glass: has("new_windows") || glassFull ? a.glass : shade(a.glass, 0.9),
      look,
      floors: t.floors,
      seed: 100 + a.level * 7 + i,
      lit: has("facade_lights") ? 0.85 : 0.2,
    });
  });
  const base = tiers[0]!;
  const bw = base.w;
  const Bg = iso.gp(bw / 2, bw / 2, 0);
  const Lg = iso.gp(-bw / 2, bw / 2, 0);
  const Rg = iso.gp(bw / 2, -bw / 2, 0);
  // Socle (plinthe) et porte de garage sur la façade gauche, entrée sur la façade droite, près du coin avant.
  poly(ctx, [Lg, Bg, { x: Bg.x, y: Bg.y - 5 }, { x: Lg.x, y: Lg.y - 5 }], a.trim);
  const g0 = lerpPt(Lg, Bg, 0.58);
  const g1 = lerpPt(Lg, Bg, 0.92);
  poly(ctx, [{ x: g0.x, y: g0.y }, { x: g1.x, y: g1.y }, { x: g1.x, y: g1.y - 20 }, { x: g0.x, y: g0.y - 20 }], "#2a323a", a.trim, 1.5);
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 1;
  for (let k = 1; k < 4; k++) {
    ctx.beginPath();
    ctx.moveTo(g0.x, g0.y - k * 5);
    ctx.lineTo(g1.x, g1.y - k * 5);
    ctx.stroke();
  }
  const d0 = lerpPt(Bg, Rg, 0.1);
  const d1 = lerpPt(Bg, Rg, 0.42);
  const lobbyH = has("big_lobby") ? 34 : 22;
  poly(ctx, [d0, d1, { x: d1.x, y: d1.y - lobbyH }, { x: d0.x, y: d0.y - lobbyH }], has("big_lobby") ? "#9ed3ee" : "#3b4651", a.trim, 1.5);
  if (has("grand_hall")) {
    columns(iso, lerpPt(Bg, Rg, 0.45), lerpPt(Bg, Rg, 0.95), 0, 38, 4, "#f2f5f7");
    columns(iso, Lg, lerpPt(Lg, Bg, 0.5), 0, 38, 4, "#f2f5f7");
  }
  if (has("awning")) {
    const t0 = { x: d0.x - 3, y: d0.y - lobbyH - 2 };
    const t1 = { x: d1.x + 3, y: d1.y - lobbyH - 2 };
    poly(ctx, [t0, t1, { x: t1.x + 7, y: t1.y + 11 }, { x: t0.x + 7, y: t0.y + 11 }], "#c0392b", "#fff", 1);
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.lineWidth = 2;
    for (let k = 1; k < 5; k++) {
      const p = lerpPt(t0, t1, k / 5);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + 7, p.y + 11);
      ctx.stroke();
    }
  }
  if (has("plants")) {
    ctx.fillStyle = "#3f8f4e";
    for (const [dx, r] of [[-5, 6], [4, 7], [d1.x - Bg.x + 14, 6]] as const) {
      ctx.beginPath();
      ctx.arc(Bg.x + dx, Bg.y - 4, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#2b6b38";
    ctx.beginPath();
    ctx.arc(Bg.x - 2, Bg.y - 7, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  if (has("panoramic_elevator")) {
    const e0 = lerpPt(Bg, Rg, 0.5);
    const e1 = lerpPt(Bg, Rg, 0.64);
    const top = tiers[tiers.length - 1]!.z0 + 8;
    poly(ctx, [{ x: e0.x, y: e0.y - lobbyH }, { x: e1.x, y: e1.y - lobbyH }, { x: e1.x, y: e1.y - top }, { x: e0.x, y: e0.y - top }], "rgba(190,230,250,0.85)", "#e8f6ff", 2);
  }
  if (has("hanging_garden")) {
    const t = tiers[Math.min(1, tiers.length - 1)]!;
    const z = t.z0 + t.h * 0.55;
    const gl = iso.gp(-t.w / 2, t.w / 2, 0);
    const gb = iso.gp(t.w / 2, t.w / 2, 0);
    const gr = iso.gp(t.w / 2, -t.w / 2, 0);
    ctx.fillStyle = "#4aa35a";
    for (const [p0, p1] of [[gl, gb], [gb, gr]] as const) {
      for (let k = 0; k < 9; k++) {
        const p = lerpPt(p0, p1, (k + 0.5) / 9);
        ctx.beginPath();
        ctx.arc(p.x, p.y - z, 4.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  if (last) {
    const l = last as ReturnType<typeof drawBox>;
    const cx = (l.topL.x + l.topR.x) / 2;
    const cy = (l.topT.y + l.topB.y) / 2;
    if (has("heliport")) {
      const topZ = tiers[tiers.length - 1]!.z0 + tiers[tiers.length - 1]!.h;
      if (!has("crown")) helipad(iso, 0, 0, topZ + 0.5);
    }
    if (has("rooftop_terrace") && !has("heliport")) {
      ctx.strokeStyle = "#e9eef0";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(l.topL.x, l.topL.y);
      ctx.lineTo(l.topB.x, l.topB.y);
      ctx.lineTo(l.topR.x, l.topR.y);
      ctx.stroke();
      ctx.fillStyle = "#e8743b";
      ctx.beginPath();
      ctx.ellipse(cx - 6, cy - 6, 9, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#3f8f4e";
      ctx.beginPath();
      ctx.arc(cx + 14, cy + 2, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    if (has("crown")) {
      // Couronne éclairée : anneau lumineux et antenne.
      const g = ctx.createRadialGradient(cx, cy - 6, 2, cx, cy - 6, 36);
      g.addColorStop(0, "rgba(255,240,170,0.95)");
      g.addColorStop(1, "rgba(255,240,170,0)");
      ctx.fillStyle = g;
      ctx.fillRect(cx - 40, cy - 46, 80, 80);
      ctx.strokeStyle = "#fff3b0";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 22, 11, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = "#dfe7ee";
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(cx, cy - 2);
      ctx.lineTo(cx, cy - 42);
      ctx.stroke();
    }
  }
}

/** Génère la texture de l'immeuble pour un niveau (1 à 10), paresseusement : seul le niveau courant est rastérisé. */
export function ensureHqTexture(scene: Phaser.Scene, level: number): string {
  const a = appearanceFor(level);
  const key = TEX.hq(a.level);
  if (scene.textures.exists(key)) return key;
  const sz = hqSize(a.level);
  canvasTexture(scene, key, sz.w * S, sz.h * S, (ctx) => {
    ctx.scale(S, S);
    drawHq(makeIso(ctx, sz.ox, sz.oy), a);
  });
  return key;
}

// ───────────────────────── Bots, véhicules, personnages ─────────────────────────

/** Taille des sprites de véhicule (pixels monde) ; origine = pieds / sol, au centre bas. */
export const VEHICLE_SIZE = { w: 64, h: 60, ox: 32, oy: 52 };

const TEAL = "#0b5c63";

function person(ctx: Ctx, x: number, y: number, o: { body?: string; head?: string; scale?: number; lean?: number; helmet?: string; crouch?: number } = {}): void {
  const s = o.scale ?? 1;
  const crouch = o.crouch ?? 0;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.rotate(o.lean ?? 0);
  // jambes
  ctx.strokeStyle = "#26323a";
  ctx.lineWidth = 3.4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-2, -10 + crouch);
  ctx.lineTo(-4, 0);
  ctx.moveTo(2, -10 + crouch);
  ctx.lineTo(4, 0);
  ctx.stroke();
  // buste
  ctx.fillStyle = o.body ?? TEAL;
  ctx.beginPath();
  ctx.roundRect(-6, -26 + crouch, 12, 17, 4);
  ctx.fill();
  // tête
  ctx.fillStyle = o.head ?? "#f0c8a0";
  ctx.beginPath();
  ctx.arc(0, -32 + crouch, 5.6, 0, Math.PI * 2);
  ctx.fill();
  if (o.helmet) {
    ctx.fillStyle = o.helmet;
    ctx.beginPath();
    ctx.arc(0, -33 + crouch, 5.8, Math.PI, 0);
    ctx.fill();
  }
  ctx.restore();
}

function wheel(ctx: Ctx, x: number, y: number, r: number): void {
  ctx.strokeStyle = "#1c2226";
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#8b979d";
  ctx.beginPath();
  ctx.moveTo(x - r, y);
  ctx.lineTo(x + r, y);
  ctx.moveTo(x, y - r);
  ctx.lineTo(x, y + r);
  ctx.stroke();
}

function makeVehicles(scene: Phaser.Scene): void {
  const { w, h, ox, oy } = VEHICLE_SIZE;
  const draw = (v: VehicleId, fn: (ctx: Ctx) => void) =>
    canvasTexture(scene, TEX.vehicle(v), w * S, h * S, (ctx) => {
      ctx.scale(S, S);
      fn(ctx);
    });
  draw("foot", (ctx) => {
    person(ctx, ox, oy, { scale: 1.15 });
    // mallette
    ctx.fillStyle = "#6b4a2b";
    ctx.beginPath();
    ctx.roundRect(ox + 6, oy - 14, 9, 7, 1.5);
    ctx.fill();
  });
  draw("bike", (ctx) => {
    wheel(ctx, ox - 15, oy - 8, 8.5);
    wheel(ctx, ox + 15, oy - 8, 8.5);
    ctx.strokeStyle = "#c0392b";
    ctx.lineWidth = 2.8;
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(ox - 15, oy - 8);
    ctx.lineTo(ox - 3, oy - 20);
    ctx.lineTo(ox + 11, oy - 20);
    ctx.lineTo(ox + 15, oy - 8);
    ctx.moveTo(ox - 3, oy - 20);
    ctx.lineTo(ox + 2, oy - 8);
    ctx.lineTo(ox - 15, oy - 8);
    ctx.moveTo(ox + 11, oy - 20);
    ctx.lineTo(ox + 9, oy - 26);
    ctx.stroke();
    person(ctx, ox - 2, oy - 10, { scale: 0.95, lean: 0.25, helmet: "#f2c230" });
  });
  draw("skate", (ctx) => {
    ctx.fillStyle = "#e8743b";
    ctx.beginPath();
    ctx.roundRect(ox - 17, oy - 6, 34, 4.5, 2.2);
    ctx.fill();
    ctx.fillStyle = "#1c2226";
    for (const dx of [-11, 11]) {
      ctx.beginPath();
      ctx.arc(ox + dx, oy - 1, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
    person(ctx, ox, oy - 6, { scale: 1.05, crouch: 4, lean: 0.12, helmet: "#2f80d1" });
  });
  draw("helicopter", (ctx) => {
    // fuselage, queue, cabine vitrée, patins ; le rotor est un sprite à part (animé).
    ctx.fillStyle = "#d94f4f";
    ctx.beginPath();
    ctx.ellipse(ox - 3, oy - 22, 19, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#c13e3e";
    ctx.beginPath();
    ctx.moveTo(ox + 12, oy - 26);
    ctx.lineTo(ox + 30, oy - 30);
    ctx.lineTo(ox + 30, oy - 25);
    ctx.lineTo(ox + 12, oy - 18);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#bfe6f7";
    ctx.beginPath();
    ctx.ellipse(ox - 10, oy - 25, 8.5, 7, -0.2, Math.PI, Math.PI * 2.2);
    ctx.fill();
    ctx.strokeStyle = "#2a323a";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(ox - 16, oy - 6);
    ctx.lineTo(ox + 10, oy - 6);
    ctx.moveTo(ox - 8, oy - 12);
    ctx.lineTo(ox - 10, oy - 6);
    ctx.moveTo(ox + 4, oy - 12);
    ctx.lineTo(ox + 4, oy - 6);
    ctx.stroke();
    ctx.strokeStyle = "#2a323a";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(ox + 30, oy - 38);
    ctx.lineTo(ox + 30, oy - 20);
    ctx.stroke();
  });
  canvasTexture(scene, TEX.rotor, 76 * S, 14 * S, (ctx) => {
    ctx.scale(S, S);
    ctx.fillStyle = "rgba(40,48,56,0.55)";
    ctx.beginPath();
    ctx.ellipse(38, 7, 36, 3.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#2a323a";
    ctx.fillRect(35, 4, 6, 8);
  });
  canvasTexture(scene, TEX.greeter, 36 * S, 56 * S, (ctx) => {
    ctx.scale(S, S);
    person(ctx, 18, 52, { body: "#c9741a", scale: 1.2 });
    ctx.fillStyle = "#2a323a";
    ctx.beginPath();
    ctx.roundRect(11, 10, 14, 4, 2);
    ctx.fill();
  });
  canvasTexture(scene, TEX.folder, 20 * S, 16 * S, (ctx) => {
    ctx.scale(S, S);
    ctx.fillStyle = "#e0b84a";
    ctx.beginPath();
    ctx.roundRect(1, 3, 18, 12, 2);
    ctx.fill();
    ctx.fillStyle = "#f4d77a";
    ctx.beginPath();
    ctx.roundRect(1, 1, 8, 4, 1.5);
    ctx.fill();
  });
}

// ───────────────────────── Parc, chantier ─────────────────────────

export const TREE_SIZE = { w: 44, h: 60, ox: 22, oy: 54 };

function makeTrees(scene: Phaser.Scene): void {
  const greens = ["#3f8f4e", "#4aa35a", "#2f7a41"];
  greens.forEach((g, i) => {
    canvasTexture(scene, TEX.tree(i), TREE_SIZE.w * S, TREE_SIZE.h * S, (ctx) => {
      ctx.scale(S, S);
      ctx.fillStyle = "#6b4a2b";
      ctx.fillRect(TREE_SIZE.ox - 2.5, TREE_SIZE.oy - 18, 5, 18);
      for (const [dx, dy, r, k] of [[-8, -26, 12, 0.85], [8, -28, 12, 0.95], [0, -38, 14, 1.1], [0, -24, 13, 1]] as const) {
        ctx.fillStyle = shade(g, k);
        ctx.beginPath();
        ctx.arc(TREE_SIZE.ox + dx, TREE_SIZE.oy + dy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  });
}

export const CRANE_SIZE = { w: 150, h: 230, ox: 30, oy: 224 };

function makeCrane(scene: Phaser.Scene): void {
  canvasTexture(scene, TEX.crane, CRANE_SIZE.w * S, CRANE_SIZE.h * S, (ctx) => {
    ctx.scale(S, S);
    const { ox, oy } = CRANE_SIZE;
    ctx.strokeStyle = "#e8a317";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(ox - 5, oy);
    ctx.lineTo(ox - 5, oy - 190);
    ctx.moveTo(ox + 5, oy);
    ctx.lineTo(ox + 5, oy - 190);
    ctx.stroke();
    ctx.lineWidth = 1.6;
    for (let y = oy; y > oy - 190; y -= 14) {
      ctx.beginPath();
      ctx.moveTo(ox - 5, y);
      ctx.lineTo(ox + 5, y - 14);
      ctx.moveTo(ox + 5, y);
      ctx.lineTo(ox - 5, y - 14);
      ctx.stroke();
    }
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(ox - 20, oy - 192);
    ctx.lineTo(ox + 112, oy - 192);
    ctx.stroke();
    ctx.fillStyle = "#e8a317";
    ctx.fillRect(ox - 24, oy - 198, 14, 10);
    ctx.fillStyle = "#555";
    ctx.fillRect(ox - 22, oy - 190, 10, 10);
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(ox + 90, oy - 192);
    ctx.lineTo(ox + 90, oy - 140);
    ctx.stroke();
    ctx.fillStyle = "#333";
    ctx.fillRect(ox + 86, oy - 140, 8, 8);
  });
}

// ───────────────────────── Sol de la ville (cuit une fois) ─────────────────────────

/** Le sol (eau, rives, rues, parc, ponts) est cuit dans UNE texture à ×0,6 : aucun coût de tracé par image. */
export const GROUND_S = 0.6;

const GC = { water: "#8dbbd6", waterLine: "#a9cfe3", shore: "#bccb9f", land: "#c9cdcf", quay: "#8a949b", street: "#5b6670", edge: "#4a545d", dash: "#f1e7a6", zebra: "#eceff1", park: "#8fc57b", parkDark: "#6fa65f", pond: "#7fb6d8", path: "#d9cfa8", bridge: "#8c9298" };

function makeGround(scene: Phaser.Scene, L: MapLayout): void {
  const g = L.ground;
  const w = Math.ceil((g.maxX - g.minX) * GROUND_S);
  const h = Math.ceil((g.maxY - g.minY) * GROUND_S);
  canvasTexture(scene, TEX.ground, w, h, (ctx) => {
    ctx.scale(GROUND_S, GROUND_S);
    ctx.translate(-g.minX, -g.minY);
    const P = (x: number, y: number): Pt => gridToScreen({ x, y }, L.tile.w, L.tile.h);
    const rect = (r: { x: number; y: number; w: number; h: number }, fill: string, stroke?: string, lw = 2) =>
      poly(ctx, [P(r.x, r.y), P(r.x + r.w, r.y), P(r.x + r.w, r.y + r.h), P(r.x, r.y + r.h)], fill, stroke, lw);
    const r = rng(5);
    rect(L.gridRect, GC.water);
    // Rives et fleuves : reflets en traits clairs.
    for (const s of L.shores) rect(s, GC.shore);
    for (const rv of L.rivers) {
      rect(rv, GC.water);
      ctx.strokeStyle = GC.waterLine;
      ctx.lineWidth = 2;
      for (let i = 0; i < 70; i++) {
        const a = P(rv.x + r() * rv.w, rv.y + r() * rv.h);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(a.x + 18 + r() * 24, a.y + 1);
        ctx.stroke();
      }
    }
    rect(L.land, GC.land, GC.quay, 4);
    // Rues : chaussée, bords, ligne centrale, passages piétons aux carrefours.
    const half = L.streetWidth / 2;
    const gridOf = (id: string) => L.streets.nodes.find((n) => n.id === id)!.grid;
    for (const [a, b] of L.streets.edges) {
      const ga = gridOf(a);
      const gb = gridOf(b);
      const dx = Math.sign(gb.x - ga.x);
      const dy = Math.sign(gb.y - ga.y);
      const nx = -dy;
      const ny = dx;
      const q = (t: number, side: number) => P(ga.x + (gb.x - ga.x) * t + nx * half * side + dx * half * (t === 0 ? -1 : t === 1 ? 1 : 0), ga.y + (gb.y - ga.y) * t + ny * half * side + dy * half * (t === 0 ? -1 : t === 1 ? 1 : 0));
      poly(ctx, [q(0, -1), q(1, -1), q(1, 1), q(0, 1)], GC.street);
    }
    for (const [a, b] of L.streets.edges) {
      const ga = gridOf(a);
      const gb = gridOf(b);
      const len = Math.hypot(gb.x - ga.x, gb.y - ga.y);
      const dx = (gb.x - ga.x) / len;
      const dy = (gb.y - ga.y) / len;
      ctx.strokeStyle = GC.dash;
      ctx.lineWidth = 2.4;
      for (let t = half + 0.6; t < len - half - 0.6; t += 1.6) {
        const p0 = P(ga.x + dx * t, ga.y + dy * t);
        const p1 = P(ga.x + dx * (t + 0.8), ga.y + dy * (t + 0.8));
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
      }
      // Passage piétons à chaque extrémité (bandes en travers de la rue).
      ctx.strokeStyle = GC.zebra;
      ctx.lineWidth = 3;
      for (const [x0, y0, sgn] of [[ga.x, ga.y, 1], [gb.x, gb.y, -1]] as const) {
        for (let k = -0.7; k <= 0.71; k += 0.35) {
          const cx = x0 + dx * (half + 0.25) * sgn;
          const cy = y0 + dy * (half + 0.25) * sgn;
          const p0 = P(cx - dy * k - dx * 0.0, cy + dx * k - dy * 0.0);
          const p1 = P(cx - dy * k + dx * 0.5 * sgn, cy + dx * k + dy * 0.5 * sgn);
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(p1.x, p1.y);
          ctx.stroke();
        }
      }
    }
    // Parc (décor) : pelouse, allées, étang.
    const pk = L.park;
    rect(pk, GC.park, GC.parkDark, 3);
    poly(ctx, [P(pk.x + 1, pk.y + pk.h / 2 - 0.5), P(pk.x + pk.w - 1, pk.y + pk.h / 2 - 0.5), P(pk.x + pk.w - 1, pk.y + pk.h / 2 + 0.5), P(pk.x + 1, pk.y + pk.h / 2 + 0.5)], GC.path);
    poly(ctx, [P(pk.x + pk.w / 2 - 0.5, pk.y + 1), P(pk.x + pk.w / 2 + 0.5, pk.y + 1), P(pk.x + pk.w / 2 + 0.5, pk.y + pk.h - 1), P(pk.x + pk.w / 2 - 0.5, pk.y + pk.h - 1)], GC.path);
    const pond = pk.pond;
    ctx.beginPath();
    for (let i = 0; i <= 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      const p = P(pond.x + Math.cos(a) * pond.rx, pond.y + Math.sin(a) * pond.ry);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.fillStyle = GC.pond;
    ctx.fill();
    ctx.strokeStyle = GC.parkDark;
    ctx.lineWidth = 3;
    ctx.stroke();
    // Ponts : tablier et garde-corps.
    for (const b of L.bridges) {
      const hw = b.width / 2;
      const horizontal = Math.abs(b.to.x - b.from.x) > Math.abs(b.to.y - b.from.y);
      const q = horizontal
        ? [P(b.from.x, b.from.y - hw), P(b.to.x, b.to.y - hw), P(b.to.x, b.to.y + hw), P(b.from.x, b.from.y + hw)]
        : [P(b.from.x - hw, b.from.y), P(b.to.x - hw, b.to.y), P(b.to.x + hw, b.to.y), P(b.from.x + hw, b.from.y)];
      poly(ctx, q, GC.bridge, "#6d7378", 2);
    }
  });
}

/** Génère les textures permanentes (décor, véhicules, icônes). L'immeuble se génère à la demande (`ensureHqTexture`). */
export function generateMapTextures(scene: Phaser.Scene, layout: MapLayout): void {
  const { places, blocks } = layout;
  makeGround(scene, layout);
  makeBackdrop(scene);
  makeIcons(scene);
  makeVehicles(scene);
  makeTrees(scene);
  makeCrane(scene);
  const seen = new Set<string>();
  for (const b of blocks) {
    const k = `${b.style}-${b.floors}`;
    if (seen.has(k)) continue;
    seen.add(k);
    makeBlock(scene, b.style, b.floors);
  }
  for (const p of places) {
    makePlace(scene, p, false);
    makePlace(scene, p, true);
  }
}
