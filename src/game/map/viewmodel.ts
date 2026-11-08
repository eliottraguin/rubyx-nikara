/**
 * GameState -> MapViewModel (fonction pure, sans Phaser ni React ; docs/CARTE-TECH.md).
 * La carte AFFICHE un état ; elle ne décide ni solde, ni prix, ni quota, ni score, ni déblocage, ni niveau d'immeuble.
 * L'état d'un lieu (ex-planète, id technique `planet`) est lu dans `state.planets` (ouvert ou verrouillé, avec la raison :
 * décidé par le serveur, `GET /api/state`) ; sans partie, un aperçu « maquette » figé est affiché et signalé comme tel.
 */
import type { GameState, PlaceStateView } from "@/lib/api/types";
import { buildingVM, type BuildingVM } from "./building";
import { LAYOUT, type MapLayout } from "./layout";
import type { Pt } from "./iso";
import { PLANETS, type PlanetId, type PlanetPalette } from "./planets";
import { VEHICLE_LABEL, VEHICLE_MANNER, type VehicleId } from "./vehicles";

export type PlanetStatus = "locked" | "available" | "in_progress" | "visited";

export const PLANET_STATUS_LABEL: Record<PlanetStatus, string> = {
  locked: "Verrouillée",
  available: "Disponible",
  in_progress: "Recherche en cours",
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
  /** Phrase du serveur qui explique pourquoi le lieu est verrouillé (sinon le texte par défaut du lieu). */
  unlockText: string;
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

function placeOf(places: readonly PlaceStateView[], id: string): PlaceStateView | null {
  return places.find((p) => p.id === id) ?? null;
}

export function buildMapViewModel(state: GameState | null | undefined, layout: MapLayout = LAYOUT): MapViewModel {
  const source: MapViewModel["source"] = state ? "serveur" : "maquette";
  const planets: PlanetVM[] = layout.places.map((lp, i) => {
    const def = PLANETS.find((d) => d.id === lp.id)!;
    const place = state ? placeOf(state.planets, lp.id) : null;
    let status: PlanetStatus;
    if (place) status = place.status === "AVAILABLE" ? "available" : "locked";
    else status = state ? "locked" : i === 0 ? "available" : "locked";
    const label = PLANET_STATUS_LABEL[status];
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
      unlockText: place?.reason?.trim() || def.unlockText,
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

/** Libellé du mode (valeurs API `beginner` / `expert`). */
export function modeLabel(mode: string | null | undefined): string {
  return mode === "expert" ? "Réel" : mode === "beginner" ? "Tutoriel" : "Aperçu";
}
