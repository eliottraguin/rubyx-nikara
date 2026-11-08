/**
 * Véhicules des bots (pur, sans Phaser ni React ; docs/VILLE-ET-BATIMENT.md §5, GR3-72).
 * Le véhicule vient soit de la DONNÉE du lieu (`vehicle` dans data/map/city_v1.json), soit du PALIER de
 * l'agent envoyé (`vehicleForAgent`, GR3-72) : purement visuel, le serveur ne le connaît pas, ne le choisit pas
 * et n'en dépend pas. Un même trajet garde le même véhicule à l'aller et au retour.
 */

export type VehicleId = "foot" | "bike" | "skate" | "car" | "drone" | "helicopter";

export const VEHICLE_IDS: readonly VehicleId[] = ["foot", "bike", "skate", "car", "drone", "helicopter"];

export const DEFAULT_VEHICLE: VehicleId = "foot";

export function isVehicleId(v: unknown): v is VehicleId {
  return typeof v === "string" && (VEHICLE_IDS as readonly string[]).includes(v);
}

/** Valeur de donnée inconnue ou absente : à pied (jamais d'erreur pour un détail cosmétique). */
export function vehicleOf(raw: unknown): VehicleId {
  return isVehicleId(raw) ? raw : DEFAULT_VEHICLE;
}

/** Mode de déplacement en texte (« part à vélo vers… »). */
export const VEHICLE_MANNER: Record<VehicleId, string> = {
  foot: "à pied",
  bike: "à vélo",
  skate: "en skate",
  car: "en voiture",
  drone: "en drone",
  helicopter: "en hélicoptère",
};

/** Nom du véhicule (liste, infobulle). */
export const VEHICLE_LABEL: Record<VehicleId, string> = {
  foot: "À pied",
  bike: "Vélo",
  skate: "Skate",
  car: "Voiture",
  drone: "Drone",
  helicopter: "Hélicoptère",
};

/** Vitesse cosmétique en pixels monde par seconde. */
export const VEHICLE_SPEED: Record<VehicleId, number> = { foot: 130, bike: 260, skate: 300, car: 320, drone: 420, helicopter: 380 };

/**
 * Palier cosmétique d'une instance d'agent (GR3-72) : 1 à pied, 2 en voiture, 3 en drone (survole les toits),
 * 4 reprend l'hélicoptère existant. Un palier au-delà de 4 reste à l'hélicoptère (dernier palier connu).
 * Ces paliers sont DISTINCTS du palier serveur (`AgentInstance.tier`, docs/CONTRACTS-V2.md §2) : simple mapping
 * d'affichage, jamais lu ni choisi par le serveur.
 */
export const TIER_VEHICLE: readonly VehicleId[] = ["foot", "car", "drone", "helicopter"];

/**
 * Véhicule d'un trajet : si l'agent a un palier connu (1+), il l'emporte sur le véhicule du lieu (plus seulement
 * le lieu qui décide, GR3-72). Sans palier (donnée serveur pas encore disponible, GR3-54), on retombe sur le
 * véhicule du lieu (comportement inchangé).
 */
export function vehicleForAgent(tier: number | null | undefined, placeVehicle: VehicleId): VehicleId {
  if (tier === null || tier === undefined || !Number.isFinite(tier) || tier < 1) return placeVehicle;
  const idx = Math.min(Math.floor(tier), TIER_VEHICLE.length) - 1;
  return TIER_VEHICLE[idx]!;
}

/** Un trajet dure de 2 à 4 s (réglable, docs/VILLE-ET-BATIMENT.md §5), quelle que soit la distance. */
export const LEG_MIN_MS = 2000;
export const LEG_MAX_MS = 4000;

/** Durée cosmétique d'un trajet (aller OU retour) selon le véhicule et la longueur du chemin en pixels. */
export function legDurationMs(vehicle: VehicleId, lengthPx: number): number {
  const raw = (Math.max(0, lengthPx) / VEHICLE_SPEED[vehicle]) * 1000;
  return Math.round(Math.min(LEG_MAX_MS, Math.max(LEG_MIN_MS, raw)));
}
