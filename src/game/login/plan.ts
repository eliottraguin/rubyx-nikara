/**
 * Plan déterministe de la ville de fond de la page de connexion (données pures, sans Three.js).
 * Décoratif : aucune règle de jeu, aucun appel réseau. Même graine => même ville.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface BuildingPlan {
  x: number;
  z: number;
  width: number;
  depth: number;
  /** Hauteur de chaque étage empilé (de bas en haut). */
  floors: number[];
  roof: "cone" | "flat";
  /** Teinte de façade (0..FACADE_PALETTE.length-1). */
  palette: number;
  /** Répétition de la texture de façade. */
  repeat: { u: number; v: number };
}

export interface CloudPlan {
  x: number;
  y: number;
  z: number;
  width: number;
  depth: number;
  opacity: number;
  speed: number;
}

export interface CityPlan {
  buildings: BuildingPlan[];
  clouds: CloudPlan[];
}

export const FACADE_PALETTE = ["#c9b79c", "#9fb4c7", "#b98f8a", "#a8bf9f", "#d2c28a"] as const;
export const ROOF_PALETTE = ["#8a4b3c", "#5d6b7a", "#7a5a3c"] as const;

const GRID = 6;
const CELL = 4;

export function planCity(seed: number, buildingCount = 18, cloudCount = 7): CityPlan {
  const rand = mulberry32(seed);
  const cells: number[] = [];
  for (let i = 0; i < GRID * GRID; i++) cells.push(i);
  // Mélange de Fisher-Yates seedé : chaque immeuble occupe une cellule distincte (pas de chevauchement).
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [cells[i], cells[j]] = [cells[j]!, cells[i]!];
  }
  const count = Math.min(buildingCount, cells.length);
  const buildings: BuildingPlan[] = cells.slice(0, count).map((cell) => {
    const cx = (cell % GRID) - (GRID - 1) / 2;
    const cz = Math.floor(cell / GRID) - (GRID - 1) / 2;
    const width = 2 + rand() * 1.2;
    const depth = 2 + rand() * 1.2;
    const stacks = 1 + Math.floor(rand() * 3);
    const floors: number[] = [];
    for (let s = 0; s < stacks; s++) floors.push(1.5 + rand() * 2.5);
    return {
      x: cx * CELL,
      z: cz * CELL,
      width,
      depth,
      floors,
      roof: rand() < 0.5 ? "cone" : "flat",
      palette: Math.floor(rand() * FACADE_PALETTE.length),
      repeat: { u: Math.max(1, Math.round(width)), v: Math.max(1, Math.round(floors[0]! / 1.2)) },
    };
  });
  const clouds: CloudPlan[] = [];
  for (let i = 0; i < cloudCount; i++) {
    clouds.push({
      x: (rand() - 0.5) * GRID * CELL * 1.4,
      y: 14 + rand() * 4,
      z: (rand() - 0.5) * GRID * CELL * 1.4,
      width: 8 + rand() * 8,
      depth: 4 + rand() * 4,
      opacity: 0.35 + rand() * 0.3,
      speed: 0.15 + rand() * 0.25,
    });
  }
  return { buildings, clouds };
}
