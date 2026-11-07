/**
 * Disposition COSMÉTIQUE de la ville (data/map/city_v1.json, docs/VILLE-ET-BATIMENT.md §10), pure.
 * Positions et tracés ne décident d'aucune règle : états, prix, gains, déblocages et niveau viennent du serveur.
 */
import cityJson from "../../../data/map/city_v1.json";
import { gridToScreen, TILE_H, TILE_W, type Pt } from "./iso";
import { PLANETS, type PlanetId } from "./planets";
import { buildGraph, type StreetGraph } from "./streets";
import { vehicleOf, type VehicleId } from "./vehicles";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type BlockStyle = "brick" | "stone" | "glass" | "concrete";

export interface BlockLayout extends Rect {
  id: string;
  district: string;
  style: BlockStyle;
  floors: number;
}

export interface PlaceLayout {
  id: PlanetId;
  /** Nom affiché du lieu (« Bibliothèque publique »). */
  name: string;
  district: string;
  vehicle: VehicleId;
  grid: Pt;
  world: Pt;
  footprint: { w: number; h: number };
  floors: number;
  streetNode: string;
  helipad: { grid: Pt; world: Pt } | null;
}

export interface MapLayout {
  tile: { w: number; h: number };
  /** Rectangle monde englobant (pixels), marges comprises (hauteur des immeubles). */
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  /** Zone de grille de la ville (cases) et son rectangle monde exact (sol). */
  gridRect: Rect;
  ground: { minX: number; minY: number; maxX: number; maxY: number };
  land: Rect;
  rivers: Rect[];
  shores: Rect[];
  bridges: { id: string; from: Pt; to: Pt; width: number }[];
  park: Rect & { seed: number; trees: number; pond: { x: number; y: number; rx: number; ry: number } };
  districts: { id: string; name: string }[];
  streetWidth: number;
  streets: { nodes: { id: string; grid: Pt; world: Pt }[]; edges: [string, string][] };
  graph: StreetGraph;
  hq: { grid: Pt; world: Pt; footprint: { w: number; h: number }; doorNode: string; garageDoor: { grid: Pt; world: Pt } };
  heliport: { grid: Pt; world: Pt; onRoof: boolean };
  blocks: BlockLayout[];
  places: PlaceLayout[];
}

interface RawCity {
  version: number;
  tile: { w: number; h: number };
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  land: Rect;
  rivers: (Rect & { id: string })[];
  shores: (Rect & { id: string })[];
  bridges: { id: string; from: Pt; to: Pt; width: number }[];
  park: Rect & { id: string; name: string; seed: number; trees: number; pond: { x: number; y: number; rx: number; ry: number } };
  districts: { id: string; name: string }[];
  street_width: number;
  streets: { nodes: { id: string; x: number; y: number }[]; edges: [string, string][] };
  hq: { id: string; name: string; grid: Pt; footprint: { w: number; h: number }; door_node: string; garage_door: Pt };
  heliport: { grid: Pt; on_roof: boolean };
  blocks: (Rect & { id: string; district: string; style: string; floors: number })[];
  places: { id: string; name: string; district: string; vehicle: string; grid: Pt; footprint: { w: number; h: number }; floors: number; street_node: string; helipad?: Pt }[];
}

/** Marge au-dessus de la ville pour les grands immeubles (pixels monde). */
const TOP_MARGIN = 420;
const SIDE_MARGIN = 160;

/** Rectangle monde (pixels) qui contient la zone de grille donnée. */
export function gridBoundsToWorld(b: { minX: number; minY: number; maxX: number; maxY: number }, tile = { w: TILE_W, h: TILE_H }) {
  const corners = [
    gridToScreen({ x: b.minX, y: b.minY }, tile.w, tile.h),
    gridToScreen({ x: b.maxX, y: b.minY }, tile.w, tile.h),
    gridToScreen({ x: b.minX, y: b.maxY }, tile.w, tile.h),
    gridToScreen({ x: b.maxX, y: b.maxY }, tile.w, tile.h),
  ];
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

const BLOCK_STYLES: readonly string[] = ["brick", "stone", "glass", "concrete"];

/** Un identifiant de lieu inconnu du catalogue est ignoré ; un style inconnu devient « concrete ». */
export function buildLayout(raw: RawCity = cityJson as unknown as RawCity): MapLayout {
  const { w, h } = raw.tile;
  const toWorld = (g: Pt) => gridToScreen(g, w, h);
  const known = new Set<string>(PLANETS.map((p) => p.id));
  const nodes = raw.streets.nodes.map((n) => ({ id: n.id, grid: { x: n.x, y: n.y }, world: toWorld({ x: n.x, y: n.y }) }));
  const graph = buildGraph(nodes, raw.streets.edges);
  const wb = gridBoundsToWorld(raw.bounds, raw.tile);
  const places: PlaceLayout[] = raw.places
    .filter((p) => known.has(p.id))
    .map((p) => ({
      id: p.id as PlanetId,
      name: p.name,
      district: p.district,
      vehicle: vehicleOf(p.vehicle),
      grid: p.grid,
      world: toWorld(p.grid),
      footprint: p.footprint,
      floors: p.floors,
      streetNode: p.street_node,
      helipad: p.helipad ? { grid: { x: p.helipad.x, y: p.helipad.y }, world: toWorld({ x: p.helipad.x, y: p.helipad.y }) } : null,
    }));
  return {
    tile: raw.tile,
    bounds: { minX: wb.minX - SIDE_MARGIN, maxX: wb.maxX + SIDE_MARGIN, minY: wb.minY - TOP_MARGIN, maxY: wb.maxY + SIDE_MARGIN },
    gridRect: { x: raw.bounds.minX, y: raw.bounds.minY, w: raw.bounds.maxX - raw.bounds.minX, h: raw.bounds.maxY - raw.bounds.minY },
    ground: wb,
    land: raw.land,
    rivers: raw.rivers,
    shores: raw.shores,
    bridges: raw.bridges,
    park: raw.park,
    districts: raw.districts,
    streetWidth: raw.street_width,
    streets: { nodes, edges: raw.streets.edges },
    graph,
    hq: {
      grid: raw.hq.grid,
      world: toWorld(raw.hq.grid),
      footprint: raw.hq.footprint,
      doorNode: raw.hq.door_node,
      garageDoor: { grid: raw.hq.garage_door, world: toWorld(raw.hq.garage_door) },
    },
    heliport: { grid: raw.heliport.grid, world: toWorld(raw.heliport.grid), onRoof: raw.heliport.on_roof },
    blocks: raw.blocks.map((b) => ({ ...b, style: (BLOCK_STYLES.includes(b.style) ? b.style : "concrete") as BlockStyle })),
    places,
  };
}

export const LAYOUT: MapLayout = buildLayout();
