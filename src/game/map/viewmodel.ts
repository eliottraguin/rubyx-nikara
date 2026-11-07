/**
 * GameState -> MapViewModel (fonction pure, sans Phaser ni React ; docs/CARTE-TECH.md).
 * La carte AFFICHE un état ; elle ne décide ni solde, ni prix, ni quota, ni score, ni déblocage.
 * Jusqu'au ticket API-A1 (planètes dans /state), l'état d'une planète est dérivé de la mission correspondante
 * (statut serveur) ; sans partie, un aperçu « maquette » figé est affiché et signalé comme tel.
 */
import type { GameState, MissionStatus, MissionView } from "@/lib/api/types";
import { LAYOUT, type MapLayout } from "./layout";
import type { Pt } from "./iso";
import { PLANETS, type PlanetDef, type PlanetId, type PlanetPalette } from "./planets";

export type PlanetStatus = "locked" | "available" | "in_progress" | "visited";

export const PLANET_STATUS_LABEL: Record<PlanetStatus, string> = {
  locked: "Verrouillée",
  available: "Disponible",
  in_progress: "Expédition en cours",
  visited: "Visitée",
};

export interface PlanetVM {
  id: PlanetId;
  name: string;
  tagline: string;
  blurb: string;
  status: PlanetStatus;
  /** Libellé texte de l'état (jamais la couleur seule). */
  statusLabel: string;
  /** 0 à 3 ; dérivé du meilleur paiement serveur (cosmétique). */
  stars: 0 | 1 | 2 | 3;
  maxReward: number | null;
  unitPrice: number | null;
  bestPayment: number;
  unlockText: string;
  missionId: string | null;
  /** Statut brut de la mission côté serveur (distingue « à retenter » et « visitée » d'une planète disponible). */
  missionStatus: MissionStatus | null;
  promptHint: string;
  examples: string[];
  palette: PlanetPalette;
  radius: number;
  ring: boolean;
  surface: PlanetDef["surface"];
  grid: Pt;
  world: Pt;
}

export interface MapViewModel {
  /** `serveur` : états lus dans /state ; `maquette` : aperçu figé, aucune partie. */
  source: "serveur" | "maquette";
  company: string | null;
  /** Solde disponible côté serveur, null en maquette. */
  treasury: number | null;
  simulated: boolean;
  base: { grid: Pt; size: number; agentsOwned: number; agentsTotal: number };
  planets: PlanetVM[];
  /** Rectangle monde englobant (marges comprises). */
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

export function planetStatusFromMission(status: MissionStatus): PlanetStatus {
  switch (status) {
    case "LOCKED":
      return "locked";
    case "AVAILABLE":
    case "FAILED": // non réussie : on peut la retenter
      return "available";
    case "ACTIVE":
    case "EVALUATING":
      return "in_progress";
    case "COMPLETED":
      return "visited";
  }
}

/** Étoiles d'affichage selon la part du gain maximal déjà payée (valeurs serveur). Visitée = au moins 1. */
export function starsFromPayment(best: number, max: number | null, visited: boolean): 0 | 1 | 2 | 3 {
  if (!visited && best <= 0) return 0;
  if (!max || max <= 0) return visited ? 1 : 0;
  const r = best / max;
  if (r >= 0.9) return 3;
  if (r >= 0.6) return 2;
  return 1;
}

function bounds(planets: { world: Pt; radius: number }[], base: { world: Pt; extent: number }) {
  const pad = 90;
  let minX = base.world.x - base.extent;
  let maxX = base.world.x + base.extent;
  let minY = base.world.y - base.extent;
  let maxY = base.world.y + base.extent;
  for (const p of planets) {
    minX = Math.min(minX, p.world.x - p.radius * 1.5);
    maxX = Math.max(maxX, p.world.x + p.radius * 1.5);
    minY = Math.min(minY, p.world.y - p.radius * 1.5);
    maxY = Math.max(maxY, p.world.y + p.radius * 2.1);
  }
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
}

function pickMission(missions: MissionView[], index: number): MissionView | null {
  const regular = missions.filter((m) => !m.is_rescue);
  return regular[index] ?? null;
}

export function buildMapViewModel(state: GameState | null | undefined, layout: MapLayout = LAYOUT): MapViewModel {
  const source: MapViewModel["source"] = state ? "serveur" : "maquette";
  const planets: PlanetVM[] = layout.planets.map((lp, i) => {
    const def = PLANETS.find((d) => d.id === lp.id)!;
    const mission = state ? pickMission(state.missions, i) : null;
    let status: PlanetStatus;
    if (mission) status = planetStatusFromMission(mission.status);
    else status = state ? "locked" : i === 0 ? "available" : "locked";
    const best = mission?.best_payment ?? 0;
    const max = mission?.max_reward ?? null;
    const label = mission?.status === "FAILED" ? "À retenter" : PLANET_STATUS_LABEL[status];
    return {
      id: def.id,
      name: def.name,
      tagline: def.tagline,
      blurb: def.blurb,
      status,
      statusLabel: label,
      stars: starsFromPayment(best, max, status === "visited"),
      maxReward: max,
      unitPrice: mission?.unit_price ?? null,
      bestPayment: best,
      unlockText: mission?.unavailable_reason?.trim() || def.unlockText,
      missionId: mission?.id ?? null,
      missionStatus: mission?.status ?? null,
      promptHint: def.promptHint,
      examples: def.examples,
      palette: def.palette,
      radius: def.radius,
      ring: def.ring,
      surface: def.surface,
      grid: lp.grid,
      world: lp.world,
    };
  });
  const baseWorld = { x: 0, y: 0 };
  const agents = state?.agents ?? [];
  return {
    source,
    company: state?.session?.company ?? null,
    treasury: state ? state.balance.available : null,
    simulated: state ? state.simulated_provider : true,
    base: {
      grid: layout.base.grid,
      size: layout.base.size,
      agentsOwned: agents.filter((a) => a.owned).length,
      agentsTotal: agents.length,
    },
    planets,
    bounds: bounds(planets, { world: baseWorld, extent: (layout.base.size * layout.tile.w) / 2 }),
  };
}
