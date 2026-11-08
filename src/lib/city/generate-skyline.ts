/**
 * Génération procédurale, seedée et reproductible, des immeubles du décor
 * de la scène de connexion. Module pur (aucune dépendance Three.js, aucun
 * Math.random) : même seed + mêmes options => même résultat.
 */

export const DEFAULT_SKYLINE_SEED = 20260101;

export interface BuildingSpec {
  /** Centre de la base sur le plan XZ. */
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  /** Couleur de façade, 0xRRGGBB. */
  color: number;
}

export interface SkylineOptions {
  seed?: number;
  /** Nombre de colonnes / rangées de la grille de parcelles. */
  columns?: number;
  rows?: number;
  /** Pas de la grille (taille d'une parcelle). */
  cell?: number;
  /** Probabilité qu'une parcelle reste vide (parc, rue). */
  gapChance?: number;
}

/** PRNG mulberry32 : rapide, déterministe, suffisant pour du décor. */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FACADE_PALETTE = [0xb8c4d0, 0xa3b1c2, 0xc9c2b8, 0x9fb0a8, 0xd0c7d6, 0x8fa3b8];

export function parseSeed(raw: string | null | undefined): number {
  if (raw == null || raw.trim() === '') return DEFAULT_SKYLINE_SEED;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n >>> 0 : DEFAULT_SKYLINE_SEED;
}

export function generateSkyline(options: SkylineOptions = {}): BuildingSpec[] {
  const { seed = DEFAULT_SKYLINE_SEED, columns = 7, rows = 4, cell = 2.4, gapChance = 0.15 } = options;
  const rng = createRng(seed);
  const buildings: BuildingSpec[] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      // Toujours consommer le même nombre de tirages par parcelle pour que
      // changer gapChance ne décale pas le reste de la ville.
      const gap = rng();
      const w = 0.9 + rng() * 0.8;
      const d = 0.9 + rng() * 0.8;
      // Distribution biaisée : majorité d'immeubles bas, quelques tours.
      const h = 1.2 + Math.pow(rng(), 2.2) * 6;
      const jx = (rng() - 0.5) * 0.3;
      const jz = (rng() - 0.5) * 0.3;
      const color = FACADE_PALETTE[Math.floor(rng() * FACADE_PALETTE.length)] ?? 0xb8c4d0;
      if (gap < gapChance) continue;
      buildings.push({
        x: (c - (columns - 1) / 2) * cell + jx,
        z: -r * cell + jz,
        width: w,
        depth: d,
        height: h,
        color,
      });
    }
  }
  return buildings;
}
