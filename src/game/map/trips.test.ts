import { describe, expect, it } from "vitest";
import { TIMING, TIMING_REDUCED, isTripFinished, pruneTrips, syncTrips, tripFrame, type Trip } from "./trips";

const T0 = 1_000_000;
const trip = (over: Partial<Trip> = {}): Trip => ({ id: "t1", planetId: "annuaire", role: "writer", startedAt: T0, doneAt: null, ...over });

describe("phases d'un voyage (purement visuel)", () => {
  it("part de la base, vole, se pose, dialogue tant que le serveur n'a pas fini, puis revient", () => {
    const t = trip();
    expect(tripFrame(t, T0)).toMatchObject({ phase: "outbound", u: 0 });
    const mid = tripFrame(t, T0 + TIMING.outbound / 2);
    expect(mid.phase).toBe("outbound");
    expect(mid.u).toBeGreaterThan(0.3);
    expect(mid.u).toBeLessThan(0.7);
    expect(tripFrame(t, T0 + TIMING.outbound + 1)).toMatchObject({ phase: "dialogue", u: 1 });
    // Le serveur n'a pas répondu : on reste en dialogue, aussi longtemps que nécessaire.
    expect(tripFrame(t, T0 + 10 * 60_000).phase).toBe("dialogue");
  });

  it("une réponse instantanée laisse au moins le temps minimal de dialogue", () => {
    const t = trip({ doneAt: T0 });
    expect(tripFrame(t, T0 + TIMING.outbound + TIMING.dialogueMin - 1).phase).toBe("dialogue");
    expect(tripFrame(t, T0 + TIMING.outbound + TIMING.dialogueMin + 1).phase).toBe("return");
  });

  it("revient après la fin de l'action puis est rentré", () => {
    const done = T0 + TIMING.outbound + TIMING.dialogueMin + 5000;
    const t = trip({ doneAt: done });
    expect(tripFrame(t, done - 1).phase).toBe("dialogue");
    const back = tripFrame(t, done + TIMING.return / 2);
    expect(back.phase).toBe("return");
    expect(back.u).toBeLessThan(0.7);
    expect(tripFrame(t, done + TIMING.return + 1).phase).toBe("home");
    expect(isTripFinished(t, done + TIMING.return + 1)).toBe(true);
    expect(isTripFinished(t, done)).toBe(false);
  });

  it("animations réduites : pas de déplacement, uniquement dialogue puis rentré", () => {
    const t = trip({ doneAt: T0 });
    expect(tripFrame(t, T0, true).phase).toBe("dialogue");
    expect(tripFrame(t, T0, true).u).toBe(1);
    expect(tripFrame(t, T0 + TIMING_REDUCED.dialogueMin + 1, true).phase).toBe("home");
  });
});

describe("synchronisation avec les actions ouvertes du serveur", () => {
  const planetOf = (id: string) => (id === "att_1" ? "annuaire" : null);
  const open = [{ id: "act_1", attempt_id: "att_1", role: "writer" as const, status: "RUNNING" as const }];

  it("crée un voyage déjà sur place pour une action ouverte inconnue (rechargement de page)", () => {
    const out = syncTrips([], open, planetOf, T0);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ planetId: "annuaire", role: "writer", actionId: "act_1", doneAt: null });
    expect(tripFrame(out[0]!, T0).phase).toBe("dialogue");
  });

  it("ne duplique pas un voyage déjà lié à l'action", () => {
    const existing = [trip({ actionId: "act_1" })];
    expect(syncTrips(existing, open, planetOf, T0)).toBe(existing);
  });

  it("termine le voyage dont l'action n'est plus ouverte", () => {
    const out = syncTrips([trip({ actionId: "act_1" })], [], planetOf, T0 + 5);
    expect(out[0]!.doneAt).toBe(T0 + 5);
  });

  it("ignore une action sans planète connue et une action à confirmer", () => {
    expect(syncTrips([], [{ id: "x", attempt_id: "att_9", role: "writer", status: "RUNNING" }], planetOf, T0)).toEqual([]);
    expect(syncTrips([], [{ id: "y", attempt_id: "att_1", role: "lead", status: "AWAITING_CONFIRMATION" }], planetOf, T0)).toEqual([]);
  });

  it("n'attend pas l'action d'un voyage qui n'en a pas encore (envoi en cours)", () => {
    const pending = [trip()];
    expect(syncTrips(pending, [], planetOf, T0)).toBe(pending);
  });

  it("retire les voyages rentrés", () => {
    const old = trip({ doneAt: T0 });
    const fresh = trip({ id: "t2", startedAt: T0 + 100_000 });
    const out = pruneTrips([old, fresh], T0 + 100_000 + 10);
    expect(out.map((t) => t.id)).toEqual(["t2"]);
  });
});
