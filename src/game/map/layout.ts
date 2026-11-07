import layoutJson from "../../../data/map/layout_v1.json";
import { gridToScreen, type Pt } from "./iso";
import { PLANETS, type PlanetId } from "./planets";

export interface MapLayout {
  tile: { w: number; h: number };
  base: { grid: Pt; size: number };
  planets: { id: PlanetId; grid: Pt; world: Pt }[];
}

interface RawLayout {
  version: number;
  tile: { w: number; h: number };
  base: { grid: Pt; size: number };
  planets: { id: string; grid: Pt }[];
}

/** Disposition cosmétique (data/map/layout_v1.json). Un identifiant inconnu du catalogue est ignoré. */
export function buildLayout(raw: RawLayout = layoutJson as RawLayout): MapLayout {
  const known = new Set<string>(PLANETS.map((p) => p.id));
  const planets = raw.planets
    .filter((p) => known.has(p.id))
    .map((p) => ({ id: p.id as PlanetId, grid: p.grid, world: gridToScreen(p.grid, raw.tile.w, raw.tile.h) }));
  return { tile: raw.tile, base: raw.base, planets };
}

export const LAYOUT: MapLayout = buildLayout();
