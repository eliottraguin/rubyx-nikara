import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockClient } from "./client";
import { createMockSearchesApi } from "./searches";

describe("client simulé", () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: false }));
  afterEach(() => vi.useRealTimers());

  it("création, ouverture d'un lieu par les recherches, achat d'un rôle verrouillé puis débloqué", async () => {
    const api = createMockClient();
    const wait = (ms: number) => vi.advanceTimersByTimeAsync(ms);
    const p = api.createSession({ company: "Atelier Test", mode: "beginner" });
    await wait(200);
    expect((await p).state.balance.available).toBe(30);

    const locked = api.purchaseAgent("triage");
    locked.catch(() => {});
    await wait(200);
    await expect(locked).rejects.toMatchObject({ code: "ROLE_LOCKED" });

    // Le lieu suivant s'ouvre quand le précédent a rapporté 3 prospects retenus (recherches simulées).
    expect((await Promise.all([api.getState(), wait(100)]))[0]!.planets[1]!.status).toBe("LOCKED");
    const search = createMockSearchesApi({ delayMs: 0 });
    const s1 = search.run({ planetId: "annuaire" });
    await wait(10);
    await s1;
    expect((await Promise.all([api.getState(), wait(100)]))[0]!.planets[1]!.status).toBe("AVAILABLE");
    const s2 = search.run({ planetId: "registre" });
    await wait(10);
    await s2;

    const buy = api.purchaseAgent("triage");
    buy.catch(() => {});
    await wait(200);
    await expect(buy).rejects.toMatchObject({ code: "INSUFFICIENT_FUNDS" });
  });
});
