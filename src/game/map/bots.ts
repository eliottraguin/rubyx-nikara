/**
 * Bots : états et équivalents texte (pur, sans Phaser ni React ; docs/VILLE-ET-BATIMENT.md §5 et §13).
 * Les phases visuelles d'un voyage rejouent les MÊMES états que la trace serveur (`departed`, `arrived`, `dialogue`,
 * `returned`, `failed` ; docs/CARTE-TECH.md) : même trace => même animation. Texte brut uniquement.
 */
import { ROLE_LABEL } from "@/lib/format";
import type { RoleId } from "@/lib/api/types";
import { legOf, tripFrame, type Trip, type TripPhase } from "./trips";
import { VEHICLE_MANNER, type VehicleId } from "./vehicles";

export type TraceEventType = "departed" | "arrived" | "dialogue" | "returned" | "failed";

/** État d'un bot (tableau de docs/VILLE-ET-BATIMENT.md §5). */
export type BotState = "garage" | "en_route" | "sur_place" | "retour" | "en_panne";

export const BOT_STATE_OF_PHASE: Record<TripPhase, BotState> = {
  outbound: "en_route",
  dialogue: "sur_place",
  return: "retour",
  home: "garage",
  failed: "en_panne",
};

/** Événements de trace atteints à l'instant `now` (dans l'ordre de la trace serveur). */
export function traceEventsAt(trip: Trip, now: number, reduced = false): TraceEventType[] {
  const phase = tripFrame(trip, now, reduced).phase;
  const ev: TraceEventType[] = ["departed"];
  if (phase === "outbound") return ev;
  // Une panne en route n'est jamais arrivée : la trace passe de `departed` à `failed`.
  if (phase === "failed") return trip.failedAt !== undefined && trip.failedAt < trip.startedAt + legOf(trip, reduced) ? [...ev, "failed"] : [...ev, "arrived", "dialogue", "failed"];
  ev.push("arrived", "dialogue");
  if (phase === "return" || phase === "home") ev.push("returned");
  return ev;
}

export interface BotLine {
  state: BotState;
  /** Phrase d'équivalent texte, ex. « Éclaireur : part à vélo vers Midtown ». */
  text: string;
}

/** Équivalent texte de l'état d'un bot (liste du mode liste, annonces aria-live). */
export function botLine(role: Trip["role"], phase: TripPhase | null, place: { name: string; vehicle: VehicleId } | null): BotLine {
  const who = ROLE_LABEL[role] ?? role;
  const where = place?.name ?? "un lieu";
  const state: BotState = phase ? BOT_STATE_OF_PHASE[phase] : "garage";
  switch (state) {
    case "en_route":
      return { state, text: `${who} : part ${VEHICLE_MANNER[place?.vehicle ?? "foot"]} vers ${where}` };
    case "sur_place":
      return { state, text: `${who} : discute avec ${where}` };
    case "retour":
      return { state, text: `${who} : de retour avec son dossier` };
    case "en_panne":
      return { state, text: `${who} : en panne, aucun débit` };
    default:
      return { state, text: `${who} : au garage` };
  }
}

export interface BotListItem {
  key: string;
  role: RoleId;
  state: BotState;
  text: string;
  /** Lieu visé (identifiant technique `planet`) ; null au garage. */
  placeId: string | null;
}

/**
 * Liste texte des bots (couche DOM accessible) : un bot par agent possédé, plus un par trajet en cours.
 * Un agent sans trajet est « au garage ». Équivalent exact de ce que la carte montre.
 */
export function botList(
  ownedRoles: readonly RoleId[],
  trips: readonly Trip[],
  places: readonly { id: string; name: string; vehicle: VehicleId }[],
  now: number,
  reduced = false,
): BotListItem[] {
  const placeOf = (id: string) => places.find((p) => p.id === id) ?? null;
  const items: BotListItem[] = [];
  const active = trips.filter((t) => tripFrame(t, now, reduced).phase !== "home");
  for (const role of ownedRoles) {
    const mine = active.filter((t) => t.role === role);
    if (mine.length === 0) {
      items.push({ key: `garage-${role}`, role, placeId: null, ...botLine(role, null, null) });
      continue;
    }
    for (const t of mine) {
      const phase = tripFrame(t, now, reduced).phase;
      items.push({ key: t.id, role, placeId: t.planetId, ...botLine(role, phase, placeOf(t.planetId)) });
    }
  }
  return items;
}
