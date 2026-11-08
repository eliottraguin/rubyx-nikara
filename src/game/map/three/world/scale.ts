/**
 * Échelle et palettes de la ville Three.js (pur : aucun import three). 1 unité = 1 case de la grille de
 * `data/map/city_v1.json` ; la ville est COSMÉTIQUE (aucune règle de jeu).
 */
import type { BlockStyle } from "../../layout";

/** Hauteur d'un étage (unités). Une personne mesure ~0,6, une voiture ~0,5 de haut. */
export const FLOOR = 0.85;
/** Largeur d'une travée de fenêtres (unités). */
export const BAY = 1;
/** Surface constructible d'un bloc 4×4 (marge de trottoir comprise). */
export const BUILDABLE = 3.1;
/** Hauteur du trottoir (bordure) au-dessus de la chaussée. */
export const CURB = 0.1;
/** Voie de circulation : décalage latéral du centre de la voiture par rapport à l'axe de la rue (largeur 2). */
export const LANE = 0.5;

/** Fond de scène : ciel chaud de diorama. */
export const SKY = "#eaf0e4";
export const SKY_TOP = "#bcdcef";
export const SKY_BOTTOM = "#f7f1dc";

export interface Palette {
  wall: string;
  glass: string;
  lit: string;
  roof: string;
  trim: string;
  /** `punched` : fenêtres percées dans un mur ; `curtain` : mur-rideau vitré. */
  kind: "punched" | "curtain";
}

const PUNCHED_LIT = "#ffe2a0";

/** Palettes par style de bloc (data) : variantes tirées par la graine. */
export const PALETTES: Record<BlockStyle, readonly Palette[]> = {
  brick: [
    { wall: "#c4714b", glass: "#2c3948", lit: PUNCHED_LIT, roof: "#6b4a3c", trim: "#ead9c0", kind: "punched" },
    { wall: "#b5614a", glass: "#2f3b4a", lit: PUNCHED_LIT, roof: "#5d4237", trim: "#f0e2cc", kind: "punched" },
    { wall: "#d08a5c", glass: "#35445a", lit: PUNCHED_LIT, roof: "#7a5640", trim: "#f3e8d2", kind: "punched" },
  ],
  stone: [
    { wall: "#e6d8b8", glass: "#44627e", lit: "#fff0c0", roof: "#b9aa88", trim: "#faf3df", kind: "punched" },
    { wall: "#d6cab0", glass: "#3f5a74", lit: "#fff0c0", roof: "#a89c80", trim: "#f6efdc", kind: "punched" },
    { wall: "#ece1c6", glass: "#4a6985", lit: "#fff0c0", roof: "#bfb090", trim: "#fffaf0", kind: "punched" },
    { wall: "#cfdbe6", glass: "#3d5870", lit: "#fff0c0", roof: "#9fb0c0", trim: "#f2f6fa", kind: "punched" },
    { wall: "#ecc9bd", glass: "#4a5a70", lit: "#fff0c0", roof: "#b88f84", trim: "#fbf0ea", kind: "punched" },
    { wall: "#d9e4c3", glass: "#40586a", lit: "#fff0c0", roof: "#a3b08a", trim: "#f6f9ee", kind: "punched" },
    { wall: "#f1d9a2", glass: "#4a5a70", lit: "#fff0c0", roof: "#c4a86a", trim: "#fff8e6", kind: "punched" },
  ],
  glass: [
    { wall: "#6aa7c9", glass: "#2c5878", lit: "#e0f4ff", roof: "#3f6f8f", trim: "#cfe8f4", kind: "curtain" },
    { wall: "#5a98c0", glass: "#264f70", lit: "#d7f0ff", roof: "#37627f", trim: "#cfe8f4", kind: "curtain" },
  ],
  concrete: [
    { wall: "#a6abb2", glass: "#35404d", lit: "#d7e6f4", roof: "#7c828a", trim: "#d9dce0", kind: "punched" },
    { wall: "#b8b4aa", glass: "#3a4552", lit: "#d7e6f4", roof: "#8a867c", trim: "#e2dfd6", kind: "punched" },
    { wall: "#979da6", glass: "#303a47", lit: "#d7e6f4", roof: "#70757d", trim: "#cfd3d8", kind: "punched" },
    { wall: "#8fa4b8", glass: "#2f3f52", lit: "#d7e6f4", roof: "#63788c", trim: "#d3dde8", kind: "punched" },
    { wall: "#b9a99a", glass: "#3a3f4a", lit: "#ffe2a0", roof: "#8a7a6c", trim: "#e8dfd6", kind: "punched" },
  ],
};

export const paletteKey = (p: Palette): string => `${p.kind}|${p.wall}|${p.glass}|${p.lit}`;

/** Couleur d'un état de lieu (anneau + épingle). Les teintes ne portent AUCUN sens seules : l'état est aussi en texte. */
export const STATUS_COLOR = {
  locked: "#8b8f98",
  available: "#f2b632",
  in_progress: "#3d9be9",
  visited: "#46b36b",
} as const;

/**
 * Angle par défaut de la caméra isométrique (radians, autour de Y). -90° place la caméra au sud-ouest : la ligne de
 * visée vers le siège (0, 0) ne croise que des lieux bas (hôtel de ville, SoHo), jamais les tours de Midtown ni de
 * Wall Street. Le joueur peut toujours faire tourner la vue.
 */
export const DEFAULT_YAW = -Math.PI / 2;
/** Direction (plan XZ) du siège vers la caméra par défaut. */
export const CAMERA_DIR = { x: -1, z: 1 } as const;

/** Zoom final de la transition ville -> immeuble : l'immeuble du joueur remplit l'écran. */
export const ENTER_ZOOM = 4.2;
