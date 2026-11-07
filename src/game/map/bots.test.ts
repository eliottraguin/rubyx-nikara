import { describe, expect, it } from "vitest";
import { botLine, botList, traceEventsAt } from "./bots";
import { FAILED_HOLD, TIMING, failTrip, tripFrame, type Trip } from "./trips";

const T0 = 1_000_000;
const trip = (over: Partial<Trip> = {}): Trip => ({ id: "t1", planetId: "linkedin", role: "writer", startedAt: T0, doneAt: null, legMs: 2000, ...over });

describe("états de bot = états de la trace serveur", () => {
  it("departed -> arrived/dialogue -> returned, dans l'ordre", () => {
    const t = trip({ doneAt: T0 });
    expect(traceEventsAt(t, T0 + 500)).toEqual(["departed"]);
    expect(traceEventsAt(t, T0 + 2100)).toEqual(["departed", "arrived", "dialogue"]);
    const back = T0 + 2000 + TIMING.dialogueMin + 100;
    expect(traceEventsAt(t, back)).toEqual(["departed", "arrived", "dialogue", "returned"]);
  });

  it("même trace => même animation (rejouable, sans état caché)", () => {
    const t = trip({ doneAt: T0 + 6000 });
    for (const dt of [0, 800, 2500, 6100, 9000]) {
      expect(tripFrame(t, T0 + dt)).toEqual(tripFrame({ ...t }, T0 + dt));
      expect(traceEventsAt(t, T0 + dt)).toEqual(traceEventsAt({ ...t }, T0 + dt));
    }
  });

  it("failed : panne sans retour, puis disparition ; aucun « returned »", () => {
    const t = failTrip([trip()], "t1", T0 + 3000)[0]!;
    expect(tripFrame(t, T0 + 2999).phase).toBe("dialogue");
    expect(tripFrame(t, T0 + 3000).phase).toBe("failed");
    expect(traceEventsAt(t, T0 + 3500)).toEqual(["departed", "arrived", "dialogue", "failed"]);
    expect(tripFrame(t, T0 + 3000 + FAILED_HOLD + 1).phase).toBe("home");
  });

  it("une panne en route garde le bot là où il est, sans « arrived »", () => {
    const t = failTrip([trip()], "t1", T0 + 1000)[0]!;
    const f = tripFrame(t, T0 + 1200);
    expect(f.phase).toBe("failed");
    expect(f.u).toBeGreaterThan(0.1);
    expect(f.u).toBeLessThan(0.9);
    expect(traceEventsAt(t, T0 + 1200)).toEqual(["departed", "failed"]);
  });

  it("animations réduites : le bot apparaît à destination", () => {
    const t = trip({ doneAt: T0 });
    expect(tripFrame(t, T0, true)).toMatchObject({ phase: "dialogue", u: 1 });
    expect(traceEventsAt(t, T0, true)).toEqual(["departed", "arrived", "dialogue"]);
  });
});

describe("équivalent texte d'un bot", () => {
  const place = { name: "Midtown", vehicle: "bike" as const };
  it("suit le tableau de docs/VILLE-ET-BATIMENT.md §5", () => {
    expect(botLine("writer", null, place)).toEqual({ state: "garage", text: "Rédacteur : au garage" });
    expect(botLine("writer", "outbound", place)).toEqual({ state: "en_route", text: "Rédacteur : part à vélo vers Midtown" });
    expect(botLine("writer", "dialogue", place)).toEqual({ state: "sur_place", text: "Rédacteur : discute avec Midtown" });
    expect(botLine("writer", "return", place).state).toBe("retour");
    expect(botLine("writer", "failed", place)).toEqual({ state: "en_panne", text: "Rédacteur : en panne, aucun débit" });
  });

  it("le véhicule vient du lieu : à pied, en skate, en hélicoptère", () => {
    expect(botLine("writer", "outbound", { name: "A", vehicle: "foot" }).text).toContain("à pied");
    expect(botLine("writer", "outbound", { name: "A", vehicle: "skate" }).text).toContain("en skate");
    expect(botLine("writer", "outbound", { name: "A", vehicle: "helicopter" }).text).toContain("en hélicoptère");
  });
});

describe("liste texte des bots (couche DOM)", () => {
  const places = [{ id: "linkedin", name: "Midtown", vehicle: "bike" as const }];
  it("un agent sans trajet est au garage, un agent en route est annoncé avec son lieu et son véhicule", () => {
    const items = botList(["writer", "lead"], [trip()], places, T0 + 500);
    expect(items.map((i) => i.text)).toEqual(["Rédacteur : part à vélo vers Midtown", "Chef d'équipe : au garage"]);
    expect(items[0]).toMatchObject({ state: "en_route", placeId: "linkedin" });
    expect(items[1]).toMatchObject({ state: "garage", placeId: null });
  });

  it("un trajet terminé (rentré) remet le bot au garage", () => {
    const done = trip({ doneAt: T0 });
    const later = T0 + 2000 + TIMING.dialogueMin + 2000 + 10;
    expect(botList(["writer"], [done], places, later)[0]).toMatchObject({ state: "garage" });
  });

  it("une panne est annoncée sans débit", () => {
    const failed = failTrip([trip()], "t1", T0 + 100);
    expect(botList(["writer"], failed, places, T0 + 200)[0]!.text).toBe("Rédacteur : en panne, aucun débit");
  });
});
