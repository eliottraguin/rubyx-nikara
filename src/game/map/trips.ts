/**
 * Voyages visuels des agents (pur, sans Phaser ni React ; docs/CARTE-TECH.md « trace → animations »).
 *
 * Un voyage est PUREMENT VISUEL : il est déclenché par l'envoi d'une instruction et prolongé tant que le serveur
 * n'a pas terminé l'action ; il ne décide ni coût, ni quota, ni résultat. Le serveur reste maître de l'état.
 * Phases : départ de la base → vol → atterrissage et dialogue avec l'agent de la planète → retour → rentré.
 */
import type { ActionView, RoleId } from "@/lib/api/types";

export interface Trip {
  id: string;
  planetId: string;
  role: RoleId;
  startedAt: number;
  /** Instant où le serveur a terminé l'action (null = pas encore). */
  doneAt: number | null;
  actionId?: string;
}

export type TripPhase = "outbound" | "dialogue" | "return" | "home";

export interface TripTiming {
  outbound: number;
  /** Durée minimale du dialogue, même si le serveur répond instantanément (simulé). */
  dialogueMin: number;
  return: number;
}

export const TIMING: TripTiming = { outbound: 2600, dialogueMin: 2000, return: 2400 };
/** Animations réduites : pas de déplacement, seulement un court temps de dialogue annoncé en texte. */
export const TIMING_REDUCED: TripTiming = { outbound: 0, dialogueMin: 1200, return: 0 };

export const timingFor = (reduced: boolean): TripTiming => (reduced ? TIMING_REDUCED : TIMING);

export interface TripFrame {
  phase: TripPhase;
  /** Avancement 0..1 dans la phase. */
  p: number;
  /** Position sur la route : 0 = base, 1 = point d'atterrissage. */
  u: number;
}

const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export function tripFrame(trip: Trip, now: number, reduced = false): TripFrame {
  const t = timingFor(reduced);
  const outEnd = trip.startedAt + t.outbound;
  const dialogueEnd = Math.max(outEnd + t.dialogueMin, trip.doneAt ?? Number.POSITIVE_INFINITY);
  const returnEnd = dialogueEnd + t.return;
  if (now < outEnd) {
    const p = t.outbound === 0 ? 1 : clamp01((now - trip.startedAt) / t.outbound);
    return { phase: "outbound", p, u: easeInOut(p) };
  }
  if (now < dialogueEnd) return { phase: "dialogue", p: clamp01((now - outEnd) / Math.max(1, t.dialogueMin)), u: 1 };
  if (now < returnEnd) {
    const p = t.return === 0 ? 1 : clamp01((now - dialogueEnd) / t.return);
    return { phase: "return", p, u: 1 - easeInOut(p) };
  }
  return { phase: "home", p: 1, u: 0 };
}

export const isTripFinished = (trip: Trip, now: number, reduced = false) => tripFrame(trip, now, reduced).phase === "home";

export const TRIP_PHASE_LABEL: Record<TripPhase, string> = {
  outbound: "En route vers la planète",
  dialogue: "Sur place : dialogue avec l'agent de la planète",
  return: "Retour à la base",
  home: "Rentré à la base",
};

/** Libellé court (pastille). */
export const TRIP_PHASE_SHORT: Record<TripPhase, string> = {
  outbound: "En route",
  dialogue: "Sur place",
  return: "Retour",
  home: "Rentré",
};

const TERMINAL: ActionView["status"][] = ["SUCCEEDED", "PARTIAL", "FAILED"];
export const isTerminalAction = (a: Pick<ActionView, "status">) => TERMINAL.includes(a.status);

/**
 * Met à jour la liste de voyages d'après les actions ouvertes côté serveur :
 * - une action ouverte sans voyage (rechargement de page, autre onglet) en crée un, déjà sur place ;
 * - un voyage dont l'action n'est plus ouverte reçoit son instant de fin (début du retour).
 * `planetOfAttempt` associe une tentative à sa planète (via sa mission).
 */
export function syncTrips(
  trips: readonly Trip[],
  openActions: readonly Pick<ActionView, "id" | "attempt_id" | "role" | "status">[],
  planetOfAttempt: (attemptId: string) => string | null,
  now: number,
  reduced = false,
): Trip[] {
  const open = openActions.filter((a) => !isTerminalAction(a) && a.status !== "AWAITING_CONFIRMATION");
  const openIds = new Set(open.map((a) => a.id));
  const known = new Set(trips.map((t) => t.actionId).filter((x): x is string => !!x));
  let changed = false;
  const next = trips.map((t) => {
    if (t.actionId && t.doneAt === null && !openIds.has(t.actionId)) {
      changed = true;
      return { ...t, doneAt: now };
    }
    return t;
  });
  for (const a of open) {
    if (known.has(a.id)) continue;
    const planetId = planetOfAttempt(a.attempt_id);
    if (!planetId) continue;
    changed = true;
    // Déjà sur place : le départ est placé juste avant le début du dialogue.
    next.push({ id: `seed-${a.id}`, planetId, role: a.role, startedAt: now - timingFor(reduced).outbound, doneAt: null, actionId: a.id });
  }
  return changed ? next : (trips as Trip[]);
}

/** Retire les voyages terminés (rentrés). */
export function pruneTrips(trips: readonly Trip[], now: number, reduced = false): Trip[] {
  const kept = trips.filter((t) => !isTripFinished(t, now, reduced));
  return kept.length === trips.length ? (trips as Trip[]) : kept;
}
