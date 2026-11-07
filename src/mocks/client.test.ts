import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockClient } from "./client";

describe("parcours M1 en mode mock", () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: false }));
  afterEach(() => vi.useRealTimers());

  it("création, message, version, livraison, paiement, achat, reprise", async () => {
    const api = createMockClient();
    const wait = async (ms: number) => {
      await vi.advanceTimersByTimeAsync(ms);
    };
    const p = api.createSession({ company: "Atelier Test", mode: "beginner" });
    await wait(200);
    expect((await p).state.balance.available).toBe(30);

    const r = api.startMission("m1");
    await wait(200);
    const attempt = (await r).state.attempt!;
    expect(attempt.roles.find((x) => x.role === "writer")?.used).toBe(0);

    const s = api.sendMessage(attempt.id, { role: "writer", text: "Écris une annonce", document_ids: [], max_cost_confirmed: 0 });
    await wait(200);
    const act = (await s).action!;
    expect(["RESERVED", "RUNNING"]).toContain(act.status);
    await wait(3000);
    let st = await (async () => {
      const g = api.getState();
      await wait(100);
      return (await g)!;
    })();
    expect(st.attempt!.artifacts).toHaveLength(1);
    expect(st.attempt!.roles.find((x) => x.role === "writer")?.used).toBe(1);

    // brief changé : livrer l'ancienne version du brief est refusé
    const ev = api.demoEvent("target_change");
    await wait(200);
    expect((await ev).state.attempt!.brief.version).toBe(2);
    const bad = api.submit(attempt.id, { artifact_version_id: st.attempt!.artifacts[0]!.id, brief_version: 1 });
    bad.catch(() => {});
    await wait(200);
    await expect(bad).rejects.toMatchObject({ code: "VERSION_CONFLICT" });

    const sub = api.submit(attempt.id, { artifact_version_id: st.attempt!.artifacts[0]!.id, brief_version: 2 });
    await wait(200);
    await sub;
    await wait(2500);
    const g2 = api.getState();
    await wait(100);
    st = (await g2)!;
    const ev1 = st.attempt!.submission!.evaluation!;
    expect(ev1.score).toBe(65);
    expect(ev1.payment.credited).toBe(13);
    expect(st.balance.available).toBe(43);
    expect(st.agents.find((a) => a.role === "prospector")?.unlocked).toBe(true);

    const buy = api.purchaseAgent("prospector");
    await wait(200);
    expect((await buy).state.balance.available).toBe(23);
    const again = api.purchaseAgent("lead");
    again.catch(() => {});
    await wait(200);
    await expect(again).rejects.toMatchObject({ code: "ROLE_LOCKED" });
  });
});
