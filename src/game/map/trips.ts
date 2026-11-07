/**
 * Voyages visuels des agents (pur, sans Phaser ni React ; docs/CARTE-TECH.md « trace → animations »).
 *
 * Un voyage est PUREMENT VISUEL : il est déclenché par l'envoi d'une instruction et prolongé tant que le serveur
 * n'a pas terminé l'action ; il ne décide ni coût, ni quota, ni résultat. Le serveur reste maître de l'état.
 * Phases : départ de l'immeuble → trajet (à pied, vélo, skate ou hélicoptère, selon la donnée du lieu) → arrivée et
 * dialogue avec l'agent du lieu → retour → rentré ; ou panne (`failed`), sans aucun débit.
 * Ces phases rejouent les états de la trace serveur : departed, arrived, dialogue, returned, failed (voir bots.ts).
 */
import type { ActionView, RoleId } from "@/lib/api/types";

export interface Trip {
  id: string;
  /** Identifiant technique du lieu (ex-planète). */
  planetId: string;
  role: RoleId;
  startedAt: number;
  /** Instant où le serveur a terminé l'action (null = pas encore). */
  doneAt: number | null;
  actionId?: string;
  /** Durée cosmétique de chaque trajet (aller et retour, 2 à 4 s selon le véhicule du lieu) ; défaut : TIMING.outbound. */
  legMs?: number;
  /** Instant d'une panne (action échouée) : le bot s'arrête là, rien n'est débité. */
  failedAt?: number;
}

export type TripPhase = "outbound" | "dialogue" | "return" | "home" | "failed";

export interface TripTiming {
  outbound: number;
  /** Durée minimale du dialogue, même si le serveur répond instantanément (simulé). */
  dialogueMin: number;
  return: number;
}

export const TIMING: TripTiming = { outbound: 2600, dialogueMin: 2000, return: 2400 };
/** Durée pendant laquelle un bot en panne reste visible avant de disparaître. */
export const FAILED_HOLD = 8000;
/** Animations réduites : pas de déplacement, seulement un court temps de dialogue annoncé en texte. */
export const TIMING_REDUCED: TripTiming = { outbound: 0, dialogueMin: 1200, return: 0 };

export const timingFor = (reduced: boolean): TripTiming => (reduced ? TIMING_REDUCED : TIMING);

export interface TripFrame {
  phase: TripPhase;
  /** Avancement 0..1 dans la phase. */
  p: number;
  /** Avancement sur le trajet : 0 = immeuble, 1 = lieu. */
  u: number;
}

/** Durée d'un trajet (aller ou retour) : 0 en animations réduites (apparition à destination). */
export const legOf = (trip: Pick<Trip, "legMs">, reduced = false): number => (reduced ? TIMING_REDUCED.outbound : (trip.legMs ?? TIMING.outbound));

const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export function tripFrame(trip: Trip, now: number, reduced = false): TripFrame {
  const t = timingFor(reduced);
  const leg = legOf(trip, reduced);
  const outEnd = trip.startedAt + leg;
  // Panne : le bot s'arrête où il est (en route ou sur place), reste visible puis disparaît. Aucun retour.
  if (trip.failedAt !== undefined && now >= trip.failedAt) {
    if (now >= trip.failedAt + FAILED_HOLD) return { phase: "home", p: 1, u: 0 };
    const u = trip.failedAt >= outEnd || leg === 0 ? 1 : easeInOut(clamp01((trip.failedAt - trip.startedAt) / leg));
    return { phase: "failed", p: clamp01((now - trip.failedAt) / FAILED_HOLD), u };
  }
  const dialogueEnd = Math.max(outEnd + t.dialogueMin, trip.doneAt ?? Number.POSITIVE_INFINITY);
  const back = reduced ? TIMING_REDUCED.return : (trip.legMs ?? TIMING.return);
  const returnEnd = dialogueEnd + back;
  if (now < outEnd) {
    const p = leg === 0 ? 1 : clamp01((now - trip.startedAt) / leg);
    return { phase: "outbound", p, u: easeInOut(p) };
  }
  if (now < dialogueEnd) return { phase: "dialogue", p: clamp01((now - outEnd) / Math.max(1, t.dialogueMin)), u: 1 };
  if (now < returnEnd) {
    const p = back === 0 ? 1 : clamp01((now - dialogueEnd) / back);
    return { phase: "return", p, u: 1 - easeInOut(p) };
  }
  return { phase: "home", p: 1, u: 0 };
}

export const isTripFinished = (trip: Trip, now: number, reduced = false) => tripFrame(trip, now, reduced).phase === "home";

export const TRIP_PHASE_LABEL: Record<TripPhase, string> = {
  outbound: "En route vers le lieu",
  dialogue: "Sur place : dialogue avec l'agent du lieu",
  return: "Retour à l'immeuble",
  home: "Rentré au garage",
  failed: "En panne, aucun débit",
};

/** Libellé court (pastille). */
export const TRIP_PHASE_SHORT: Record<TripPhase, string> = {
  outbound: "En route",
  dialogue: "Sur place",
  return: "Retour",
  home: "Rentré",
  failed: "En panne",
};

const TERMINAL: ActionView["status"][] = ["SUCCEEDED", "PARTIAL", "FAILED"];
export const isTerminalAction = (a: Pick<ActionView, "status">) => TERMINAL.includes(a.status);

/**
 * Met à jour la liste de voyages d'après les actions ouvertes côté serveur :
 * - une action ouverte sans voyage (rechargement de page, autre onglet) en crée un, déjà sur place ;
 * - un voyage dont l'action n'est plus ouverte reçoit son instant de fin (début du retour).
 * `planetOfAttempt` associe une tentative à son lieu (via sa mission) ; `legMsOf` donne la durée cosmétique de trajet
 * du lieu (selon son véhicule).
 */
export function syncTrips(
  trips: readonly Trip[],
  openActions: readonly Pick<ActionView, "id" | "attempt_id" | "role" | "status">[],
  planetOfAttempt: (attemptId: string) => string | null,
  now: number,
  reduced = false,
  legMsOf?: (planetId: string) => number | undefined,
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
    const legMs = legMsOf?.(planetId);
    next.push({ id: `seed-${a.id}`, planetId, role: a.role, startedAt: now - legOf({ legMs }, reduced), doneAt: null, actionId: a.id, ...(legMs !== undefined ? { legMs } : {}) });
  }
  return changed ? next : (trips as Trip[]);
}

/** Retire les voyages terminés (rentrés). */
export function pruneTrips(trips: readonly Trip[], now: number, reduced = false): Trip[] {
  const kept = trips.filter((t) => !isTripFinished(t, now, reduced));
  return kept.length === trips.length ? (trips as Trip[]) : kept;
}

/** Marque le voyage en panne (action échouée côté serveur) : le bot s'arrête, rien n'est débité. */
export function failTrip(trips: readonly Trip[], tripId: string, now: number): Trip[] {
  return trips.map((t) => (t.id === tripId && t.failedAt === undefined ? { ...t, failedAt: now, doneAt: t.doneAt ?? now } : t));
}
