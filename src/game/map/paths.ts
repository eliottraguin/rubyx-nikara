/**
 * Trajets des bots dans la ville (pur, sans Phaser ; docs/VILLE-ET-BATIMENT.md §5).
 * - À pied, à vélo, en skate : plus court chemin dans le graphe de rues (`streets`), du seuil du garage au lieu.
 * - En hélicoptère : décollage de l'héliport (toit de l'immeuble), courbe aérienne, atterrissage sur l'hélipad du lieu ;
 *   l'ombre suit le point au sol.
 * Le véhicule vient de la donnée du lieu, jamais du serveur. Même lieu => même trajet (déterministe).
 */
import type { Pt } from "./iso";
import type { MapLayout, PlaceLayout } from "./layout";
import { PX_PER_FLOOR } from "./building";
import { polylineLength, polylinePoint, polylineTangent, shortestPath } from "./streets";
import { legDurationMs, type VehicleId } from "./vehicles";

export interface GroundPath {
  kind: "ground";
  vehicle: VehicleId;
  /** Points monde, du seuil du garage au lieu. */
  points: Pt[];
  length: number;
}

export interface AirPath {
  kind: "air";
  vehicle: "helicopter";
  from: Pt;
  to: Pt;
  /** Altitude (px) au départ (toit de l'immeuble) et à l'arrivée (hélipad). */
  startAlt: number;
  endAlt: number;
  /** Hauteur de croisière ajoutée au milieu du trajet (la courbe). */
  arc: number;
  length: number;
}

export type TripPath = GroundPath | AirPath;

export const AIR_ARC = 150;

/** Hauteur du toit d'un lieu en pixels monde. */
export const placeRoofPx = (p: PlaceLayout): number => p.floors * PX_PER_FLOOR;

/**
 * Chemin d'un bot de l'immeuble au lieu. `hqRoofPx` : hauteur du toit de l'immeuble au niveau courant (départ de
 * l'hélicoptère). Un lieu sans hélipad prend son centre ; un lieu injoignable par les rues est relié en ligne droite.
 */
export function tripPath(layout: MapLayout, placeId: string, hqRoofPx = 3 * PX_PER_FLOOR): TripPath | null {
  const place = layout.places.find((p) => p.id === placeId);
  if (!place) return null;
  if (place.vehicle === "helicopter") {
    const to = place.helipad?.world ?? place.world;
    const from = layout.heliport.world;
    const startAlt = layout.heliport.onRoof ? hqRoofPx : 0;
    const endAlt = placeRoofPx(place);
    const ground = Math.hypot(to.x - from.x, to.y - from.y);
    return { kind: "air", vehicle: "helicopter", from, to, startAlt, endAlt, arc: AIR_ARC, length: ground + AIR_ARC };
  }
  const ids = streetNodesFor(layout, place);
  const points: Pt[] = [layout.hq.garageDoor.world];
  if (ids) for (const id of ids) points.push(layout.graph.nodes.get(id)!.world);
  else points.push(layout.graph.nodes.get(place.streetNode)?.world ?? place.world);
  return { kind: "ground", vehicle: place.vehicle, points, length: polylineLength(points) };
}

function streetNodesFor(layout: MapLayout, place: PlaceLayout): string[] | null {
  return shortestPath(layout.graph, layout.hq.doorNode, place.streetNode);
}

export interface PathPose {
  /** Position de dessin (pixels monde). */
  pos: Pt;
  /** Point au sol (l'ombre) : égal à `pos` pour un trajet terrestre. */
  ground: Pt;
  /** Altitude en pixels (0 au sol). */
  altitude: number;
  /** Direction unitaire à l'écran (au sol). */
  heading: Pt;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Pose d'un bot à la fraction `u` (0 = immeuble, 1 = lieu) du chemin. */
export function pathPose(path: TripPath, u: number): PathPose {
  const t = clamp01(u);
  if (path.kind === "ground") {
    const p = polylinePoint(path.points, t);
    return { pos: p, ground: p, altitude: 0, heading: polylineTangent(path.points, t) };
  }
  const ground = { x: lerp(path.from.x, path.to.x, t), y: lerp(path.from.y, path.to.y, t) };
  const altitude = lerp(path.startAlt, path.endAlt, t) + Math.sin(Math.PI * t) * path.arc;
  const dx = path.to.x - path.from.x;
  const dy = path.to.y - path.from.y;
  const n = Math.hypot(dx, dy) || 1;
  return { pos: { x: ground.x, y: ground.y - altitude }, ground, altitude, heading: { x: dx / n, y: dy / n } };
}

/** Durée cosmétique d'un trajet (2 à 4 s) pour un lieu ; undefined si le lieu est inconnu. */
export function legMsForPlace(layout: MapLayout, placeId: string, hqRoofPx?: number): number | undefined {
  const path = tripPath(layout, placeId, hqRoofPx);
  return path ? legDurationMs(path.vehicle, path.length) : undefined;
}
