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
import { polylinePoint, polylineTangent } from "../streets";
import { tripFrame, type Trip, type TripPhase } from "../trips";
import { vehicleOf, type VehicleId } from "../vehicles";
import { FLOOR_H } from "./buildingPlan";

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
  const path = tripPath(layout, trip.planetId, hqRoofPx);
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
  return {
    x: g.x,
    y: alt + bounce(now, vehicle, moving && !flying, reduced) + (flying && !reduced ? Math.sin(now / 300) * 0.04 : 0),
    z: g.y,
    yaw,
    vehicle,
    phase: f.phase,
    airborne: flying,
  };
}

// --- Piétons : parcours du périmètre des blocs ------------------------------------------------------------------

export interface Walker {
  id: string;
  /** Boucle fermée (points de grille). */
  loop: Pt[];
  /** Tours par seconde. */
  speed: number;
  /** Décalage de départ 0..1. */
  offset: number;
}

const MARGIN = 0.9;
const WALK_UNITS_PER_S = 0.9;

/** Rectangle fermé (5 points) autour d'une emprise centrée en `c`. */
export function perimeterLoop(c: Pt, w: number, h: number, margin = MARGIN): Pt[] {
  const x0 = c.x - w / 2 - margin;
  const x1 = c.x + w / 2 + margin;
  const z0 = c.y - h / 2 - margin;
  const z1 = c.y + h / 2 + margin;
  return [{ x: x0, y: z0 }, { x: x1, y: z0 }, { x: x1, y: z1 }, { x: x0, y: z1 }, { x: x0, y: z0 }];
}

const loopLength = (pts: readonly Pt[]): number => {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
  return l;
};

/** Piétons déterministes : `perBlock` par bloc (immeuble du joueur + lieux), sens et phases répartis. */
export function planWalkers(layout: Pick<MapLayout, "hq" | "places">, perBlock = 2): Walker[] {
  const blocks = [
    { id: "hq", c: layout.hq.grid, w: layout.hq.footprint.w, h: layout.hq.footprint.h },
    ...layout.places.map((p) => ({ id: p.id, c: p.grid, w: p.footprint.w, h: p.footprint.h })),
  ];
  const out: Walker[] = [];
  for (const b of blocks) {
    const loop = perimeterLoop(b.c, b.w, b.h);
    const turns = WALK_UNITS_PER_S / Math.max(1e-6, loopLength(loop));
    for (let i = 0; i < perBlock; i++) {
      out.push({ id: `${b.id}#${i}`, loop, speed: (i % 2 === 0 ? 1 : -1) * turns, offset: i / perBlock });
    }
  }
  return out;
}

export interface WalkerPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

/** Pose d'un piéton à `timeMs` (ms) ; figé (sans rebond) en animations réduites. */
export function walkerPose(w: Walker, timeMs: number, reduced: boolean): WalkerPose {
  const raw = w.offset + (reduced ? 0 : (timeMs / 1000) * w.speed);
  const u = ((raw % 1) + 1) % 1;
  const p = polylinePoint(w.loop, u);
  const t = polylineTangent(w.loop, u);
  const dir = w.speed < 0 ? -1 : 1;
  return { x: p.x, y: bounce(timeMs + w.offset * 1000, "foot", true, reduced), z: p.y, yaw: yawOf(dir * t.x, dir * t.y) };
}
