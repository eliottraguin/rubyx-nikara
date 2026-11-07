/**
 * GameState -> MapViewModel (fonction pure, sans Phaser ni React ; docs/CARTE-TECH.md).
 * La carte AFFICHE un état ; elle ne décide ni solde, ni prix, ni quota, ni score, ni déblocage, ni niveau d'immeuble.
 * Jusqu'au ticket API-A1 (lieux dans /state), l'état d'un lieu (ex-planète, id technique `planet`) est dérivé de la
 * mission correspondante (statut serveur) ; sans partie, un aperçu « maquette » figé est affiché et signalé comme tel.
 */
import type { GameState, MissionStatus, MissionView } from "@/lib/api/types";
import { buildingVM, type BuildingVM } from "./building";
import { LAYOUT, type MapLayout } from "./layout";
import type { Pt } from "./iso";
import { PLANETS, type PlanetId, type PlanetPalette } from "./planets";
import { VEHICLE_LABEL, VEHICLE_MANNER, type VehicleId } from "./vehicles";

export type PlanetStatus = "locked" | "available" | "in_progress" | "visited";

export const PLANET_STATUS_LABEL: Record<PlanetStatus, string> = {
  locked: "Verrouillée",
  available: "Disponible",
  in_progress: "Expédition en cours",
  visited: "Visitée",
};

export interface PlanetVM {
  id: PlanetId;
  /** Nom de la plateforme (Annuaire, LinkedIn…) : toujours affiché avec le lieu. */
  name: string;
  /** Nom du lieu dans la ville (« Bibliothèque publique »), donnée cosmétique. */
  placeName: string;
  /** Quartier du lieu. */
  district: string;
  /** Véhicule des bots vers ce lieu : donnée du lieu, purement visuelle. */
  vehicle: VehicleId;
  /** « Vélo », « Skate »… (texte). */
  vehicleLabel: string;
  /** Mode de déplacement en texte (« à vélo »). */
  vehicleManner: string;
  /** « Midtown : LinkedIn » : lieu et plateforme ensemble (le joueur doit savoir quelle source il interroge). */
  title: string;
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
  grid: Pt;
  world: Pt;
  /** Hauteur du bâtiment du lieu en étages (art). */
  floors: number;
}

export interface MapViewModel {
  /** `serveur` : états lus dans /state ; `maquette` : aperçu figé, aucune partie. */
  source: "serveur" | "maquette";
  company: string | null;
  /** Solde disponible côté serveur, null en maquette. */
  treasury: number | null;
  simulated: boolean;
  /** Immeuble du joueur (id technique `base`) : position, agents au garage. */
  base: { grid: Pt; size: number; agentsOwned: number; agentsTotal: number };
  /** Niveau et texte d'équivalent de l'immeuble, lus UNIQUEMENT dans l'état serveur. */
  building: BuildingVM;
  planets: PlanetVM[];
  /** Les lieux de la ville : même tableau que `planets` (identifiant technique conservé). */
  places: PlanetVM[];
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

function pickMission(missions: MissionView[], index: number): MissionView | null {
  const regular = missions.filter((m) => !m.is_rescue);
  return regular[index] ?? null;
}

export function buildMapViewModel(state: GameState | null | undefined, layout: MapLayout = LAYOUT): MapViewModel {
  const source: MapViewModel["source"] = state ? "serveur" : "maquette";
  const planets: PlanetVM[] = layout.places.map((lp, i) => {
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
      placeName: lp.name,
      district: lp.district,
      vehicle: lp.vehicle,
      vehicleLabel: VEHICLE_LABEL[lp.vehicle],
      vehicleManner: VEHICLE_MANNER[lp.vehicle],
      title: `${lp.name} : ${def.name}`,
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
      grid: lp.grid,
      world: lp.world,
      floors: lp.floors,
    };
  });
  const agents = state?.agents ?? [];
  return {
    source,
    company: state?.session?.company ?? null,
    treasury: state ? state.balance.available : null,
    simulated: state ? state.simulated_provider : true,
    base: {
      grid: layout.hq.grid,
      size: layout.hq.footprint.w,
      agentsOwned: agents.filter((a) => a.owned).length,
      agentsTotal: agents.length,
    },
    building: buildingVM(state?.building),
    planets,
    places: planets,
    bounds: layout.bounds,
  };
}

/** Instructions (messages) restantes sur l'expédition en cours, tous bots possédés confondus ; null sans expédition. */
export function instructionsRemaining(state: GameState | null | undefined): number | null {
  const attempt = state?.attempt;
  if (!attempt || attempt.status !== "ACTIVE") return null;
  const owned = new Set((state?.agents ?? []).filter((a) => a.owned).map((a) => a.role));
  return attempt.roles.filter((r) => owned.has(r.role)).reduce((n, r) => n + Math.max(0, r.limit - r.used), 0);
}

/** Libellé du mode (valeurs API `beginner` / `expert`). */
export function modeLabel(mode: string | null | undefined): string {
  return mode === "expert" ? "Réel" : mode === "beginner" ? "Tutoriel" : "Aperçu";
}
