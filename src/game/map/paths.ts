/**
 * Trajets des bots dans la ville (pur, sans Phaser ; docs/VILLE-ET-BATIMENT.md §5, GR3-72).
 * - À pied, à vélo, en skate, en voiture : plus court chemin dans le graphe de rues (`streets`), du seuil du garage
 *   au lieu (la voiture suit les mêmes voies, comme docs/VILLE-ET-BATIMENT.md le prévoit pour un deux-roues).
 * - En hélicoptère : décollage de l'héliport (toit de l'immeuble), courbe aérienne basse, atterrissage sur
 *   l'hélipad du lieu ; l'ombre suit le point au sol.
 * - En drone : décollage du garage (comme les autres), montée rapide à une altitude de croisière AU-DESSUS du toit
 *   le plus haut des deux extrémités (survole les toits), descente rapide à l'arrivée.
 * Le véhicule vient de la donnée du lieu OU du palier de l'agent (`vehicleForAgent`, GR3-72), jamais du serveur.
 * Même lieu + même palier => même trajet (déterministe).
 */
import type { Pt } from "./iso";
import type { MapLayout, PlaceLayout } from "./layout";
import { PX_PER_FLOOR } from "./building";
import { polylineLength, polylinePoint, polylineTangent, shortestPath } from "./streets";
import { legDurationMs, vehicleForAgent, type VehicleId } from "./vehicles";

export interface GroundPath {
  kind: "ground";
  vehicle: VehicleId;
  /** Points monde, du seuil du garage au lieu. */
  points: Pt[];
  length: number;
}

export interface AirPath {
  kind: "air";
  vehicle: "helicopter" | "drone";
  from: Pt;
  to: Pt;
  /** Altitude (px) au départ et à l'arrivée. */
  startAlt: number;
  endAlt: number;
  /** Hauteur ajoutée au-dessus de la ligne droite : au point culminant de la courbe (hélicoptère) ou sur tout le
   * plateau de croisière (drone). */
  arc: number;
  length: number;
  /** `arc` : courbe basse (hélicoptère). `plateau` : monte vite, croise AU-DESSUS des toits, redescend vite (drone). */
  profile: "arc" | "plateau";
}

export type TripPath = GroundPath | AirPath;

export const AIR_ARC = 150;
/** Marge (px) au-dessus du toit le plus haut des deux extrémités, pour que le drone survole bien les toits. */
export const DRONE_ROOF_MARGIN = 60;

/** Hauteur du toit d'un lieu en pixels monde. */
export const placeRoofPx = (p: PlaceLayout): number => p.floors * PX_PER_FLOOR;

/**
 * Chemin d'un bot de l'immeuble au lieu. `hqRoofPx` : hauteur du toit de l'immeuble au niveau courant (départ de
 * l'hélicoptère). `tier` : palier cosmétique de l'agent envoyé (GR3-72) ; prioritaire sur le véhicule du lieu
 * quand connu (`vehicleForAgent`). Un lieu sans hélipad prend son centre ; un lieu injoignable par les rues est
 * relié en ligne droite.
 */
export function tripPath(layout: MapLayout, placeId: string, hqRoofPx = 3 * PX_PER_FLOOR, tier?: number | null): TripPath | null {
  const place = layout.places.find((p) => p.id === placeId);
  if (!place) return null;
  const vehicle = vehicleForAgent(tier, place.vehicle);
  if (vehicle === "helicopter") {
    const to = place.helipad?.world ?? place.world;
    const from = layout.heliport.world;
    const startAlt = layout.heliport.onRoof ? hqRoofPx : 0;
    const endAlt = placeRoofPx(place);
    const ground = Math.hypot(to.x - from.x, to.y - from.y);
    return { kind: "air", vehicle: "helicopter", from, to, startAlt, endAlt, arc: AIR_ARC, length: ground + AIR_ARC, profile: "arc" };
  }
  if (vehicle === "drone") {
    const to = place.helipad?.world ?? place.world;
    const from = layout.hq.garageDoor.world;
    const startAlt = 0;
    const endAlt = placeRoofPx(place);
    const cruise = Math.max(startAlt, endAlt, hqRoofPx) + DRONE_ROOF_MARGIN;
    const ground = Math.hypot(to.x - from.x, to.y - from.y);
    return { kind: "air", vehicle: "drone", from, to, startAlt, endAlt, arc: cruise - Math.max(startAlt, endAlt), length: ground + (cruise - Math.max(startAlt, endAlt)), profile: "plateau" };
  }
  const ids = streetNodesFor(layout, place);
  const points: Pt[] = [layout.hq.garageDoor.world];
  if (ids) for (const id of ids) points.push(layout.graph.nodes.get(id)!.world);
  else points.push(layout.graph.nodes.get(place.streetNode)?.world ?? place.world);
  return { kind: "ground", vehicle, points, length: polylineLength(points) };
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

/**
 * Altitude (px) à l'instant `t` (0..1) d'un trajet aérien. `arc` : courbe basse hélicoptère (sinusoïde entre
 * `startAlt` et `endAlt`) ; `plateau` : montée sur [0, .2], croisière CONSTANTE au-dessus des toits sur [.2, .8],
 * descente sur [.8, 1] (le drone survole les toits sur l'essentiel du trajet, pas seulement au point culminant).
 */
function airAltitude(path: AirPath, t: number): number {
  if (path.profile === "arc") return lerp(path.startAlt, path.endAlt, t) + Math.sin(Math.PI * t) * path.arc;
  const cruise = Math.max(path.startAlt, path.endAlt) + path.arc;
  if (t <= 0.2) return lerp(path.startAlt, cruise, t / 0.2);
  if (t >= 0.8) return lerp(cruise, path.endAlt, (t - 0.8) / 0.2);
  return cruise;
}

/** Pose d'un bot à la fraction `u` (0 = immeuble, 1 = lieu) du chemin. */
export function pathPose(path: TripPath, u: number): PathPose {
  const t = clamp01(u);
  if (path.kind === "ground") {
    const p = polylinePoint(path.points, t);
    return { pos: p, ground: p, altitude: 0, heading: polylineTangent(path.points, t) };
  }
  const ground = { x: lerp(path.from.x, path.to.x, t), y: lerp(path.from.y, path.to.y, t) };
  const altitude = airAltitude(path, t);
  const dx = path.to.x - path.from.x;
  const dy = path.to.y - path.from.y;
  const n = Math.hypot(dx, dy) || 1;
  return { pos: { x: ground.x, y: ground.y - altitude }, ground, altitude, heading: { x: dx / n, y: dy / n } };
}

/** Durée cosmétique d'un trajet (2 à 4 s) pour un lieu ; undefined si le lieu est inconnu. */
export function legMsForPlace(layout: MapLayout, placeId: string, hqRoofPx?: number, tier?: number | null): number | undefined {
  const path = tripPath(layout, placeId, hqRoofPx, tier);
  return path ? legDurationMs(path.vehicle, path.length) : undefined;
}
