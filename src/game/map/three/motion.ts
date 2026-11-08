/**
 * Mouvement des bots, véhicules et piétons pour la vue Three.js (pur : aucun import three, aucun état de jeu).
 * Réutilise tel quel `trips.ts` (phase / avancement dans le temps), `paths.ts` (chemin) et `vehicles.ts` (véhicule).
 * Les coordonnées monde Phaser (px iso) sont reconverties en grille (1 case = 1 unité Three, grille (x, y) -> (x, z)).
 * Purement visuel : le serveur ne connaît ni le véhicule, ni la pose, ni les piétons.
 */
import { screenToGrid, type Pt } from "../iso";
import { PX_PER_FLOOR } from "../building";
import type { MapLayout } from "../layout";
import { pathPose, tripPath } from "../paths";
import { tripFrame, type Trip, type TripPhase } from "../trips";
import { vehicleOf, type VehicleId } from "../vehicles";
import { FLOOR as FLOOR_H } from "./world/scale";

/** Décalage latéral (unités) : plusieurs agents sur le même trajet au même instant ne se chevauchent pas. */
export const LANE_SPREAD = 0.7;

/**
 * Décalage déterministe (unités, centré sur 0) tiré de l'identifiant du voyage : même voyage => même décalage
 * (rejouable), deux voyages différents => décalages différents avec une bonne probabilité.
 */
export function laneOffset(tripId: string): number {
  let h = 2166136261;
  for (let i = 0; i < tripId.length; i++) {
    h ^= tripId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const u = ((h >>> 0) % 1000) / 1000;
  return (u - 0.5) * LANE_SPREAD;
}

/** Plafond du pas de temps (s) : un onglet en arrière-plan ne fait pas « sauter » les bots. */
export const MAX_DT = 0.1;
export const clampDt = (dt: number): number => (Number.isFinite(dt) ? Math.min(MAX_DT, Math.max(0, dt)) : 0);

export interface BotPose {
  x: number;
  y: number;
  z: number;
  /** Rotation autour de Y (rad), alignée sur la direction de marche (axe local +X). */
  yaw: number;
  vehicle: VehicleId;
  phase: TripPhase;
  /** Rebond vertical déjà inclus dans y. */
  airborne: boolean;
  /** Ce que l'agent rapporte (`trip.resultCount`, GR3-72) : à la couche d'affichage de choisir quand le montrer. */
  cargo: number | null;
}

const toGrid = (p: Pt): Pt => screenToGrid(p);
const yawOf = (dx: number, dz: number): number => -Math.atan2(dz, dx);
/** Altitude px -> unités Three ; atténuée (0,4) pour que la courbe de l'hélicoptère reste dans le cadre. */
const pxToUnits = (px: number): number => (px / PX_PER_FLOOR) * FLOOR_H * 0.4;

/** Rebond d'un piéton / d'un bot à pied (unités Three), 0 en animations réduites. */
export function bounce(timeMs: number, vehicle: VehicleId, moving: boolean, reduced: boolean): number {
  if (reduced || !moving) return 0;
  if (vehicle === "foot") return Math.abs(Math.sin(timeMs / 110)) * 0.09;
  if (vehicle === "bike") return Math.abs(Math.sin(timeMs / 90)) * 0.03;
  return 0;
}

/** Pose 3D d'un voyage à l'instant `now` ; null si le lieu est inconnu ou le voyage terminé. */
export function botPose(layout: MapLayout, trip: Trip, now: number, reduced: boolean, hqRoofPx?: number): BotPose | null {
  const path = tripPath(layout, trip.planetId, hqRoofPx, trip.tier);
  if (!path) return null;
  const f = tripFrame(trip, now, reduced);
  if (f.phase === "home") return null;
  const pose = pathPose(path, f.u);
  const g = toGrid(pose.ground);
  const h = toGrid(pose.heading);
  // le cap est un vecteur (écran) converti en direction de grille ; un trajet de retour va à rebours.
  const sign = f.phase === "return" ? -1 : 1;
  const yaw = yawOf(sign * h.x, sign * h.y);
  const moving = f.phase === "outbound" || f.phase === "return";
  const vehicle = vehicleOf(path.vehicle);
  const flying = path.kind === "air";
  const alt = pxToUnits(pose.altitude);
  // Plusieurs agents sur le même trajet au même instant ne se chevauchent pas (décalage latéral déterministe).
  const hLen = Math.hypot(h.x, h.y) || 1;
  const offset = laneOffset(trip.id);
  const px = g.x + (-h.y / hLen) * offset;
  const pz = g.y + (h.x / hLen) * offset;
  return {
    x: px,
    y: alt + bounce(now, vehicle, moving && !flying, reduced) + (flying && !reduced ? Math.sin(now / 300) * 0.04 : 0),
    z: pz,
    yaw,
    vehicle,
    phase: f.phase,
    airborne: flying,
    cargo: trip.resultCount ?? null,
  };
}
