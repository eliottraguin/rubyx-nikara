/**
 * Véhicules des bots (pur, sans Phaser ni React ; docs/VILLE-ET-BATIMENT.md §5).
 * Le véhicule vient de la DONNÉE du lieu (`vehicle` dans data/map/city_v1.json) : il est purement visuel, le serveur
 * ne le connaît pas, ne le choisit pas et n'en dépend pas. Un même trajet garde le même véhicule à l'aller et au retour.
 */

export type VehicleId = "foot" | "bike" | "skate" | "helicopter";

export const VEHICLE_IDS: readonly VehicleId[] = ["foot", "bike", "skate", "helicopter"];

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
  helicopter: "en hélicoptère",
};

/** Nom du véhicule (liste, infobulle). */
export const VEHICLE_LABEL: Record<VehicleId, string> = {
  foot: "À pied",
  bike: "Vélo",
  skate: "Skate",
  helicopter: "Hélicoptère",
};

/** Vitesse cosmétique en pixels monde par seconde. */
export const VEHICLE_SPEED: Record<VehicleId, number> = { foot: 130, bike: 260, skate: 300, helicopter: 380 };

/** Un trajet dure de 2 à 4 s (réglable, docs/VILLE-ET-BATIMENT.md §5), quelle que soit la distance. */
export const LEG_MIN_MS = 2000;
export const LEG_MAX_MS = 4000;

/** Durée cosmétique d'un trajet (aller OU retour) selon le véhicule et la longueur du chemin en pixels. */
export function legDurationMs(vehicle: VehicleId, lengthPx: number): number {
  const raw = (Math.max(0, lengthPx) / VEHICLE_SPEED[vehicle]) * 1000;
  return Math.round(Math.min(LEG_MAX_MS, Math.max(LEG_MIN_MS, raw)));
}
