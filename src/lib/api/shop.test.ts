import { describe, expect, it, vi } from "vitest";
import { ShopError, createShopApi } from "./shop";

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

const wireItem = (over: object = {}) => ({
  id: "scout_t2", role: "scout", tier: 2, label: "Éclaireur rapide", price: 90,
  effects: { duration_multiplier: 0.6, quality_bonus: 5 }, unlock_clients: 2, unlocked: true, buyable: true, ...over,
});
const wireInstance = (over: object = {}) => ({
  id: "agi_07", role: "replier", tier: 2, status: "idle", label: null, price_paid: 90, purchased_at: "2026-11-08T10:00:00Z",
  config: { version: 1, instructions: "Rédige des brouillons.", context_note: null, tools: [], tier_cap: 3 }, ...over,
});

describe("createShopApi", () => {
  it("getCatalog : adapte les articles et les compteurs possédés", async () => {
    const f = vi.fn(async () => json({ items: [wireItem()], owned_counts: { scout: 1, triage: 0, replier: 0, ads: 0 } }));
    const api = createShopApi({ fetch: f as unknown as typeof fetch });
    const c = await api.getCatalog();
    expect(c.items[0]).toMatchObject({ id: "scout_t2", role: "scout", tier: 2, price: 90, unlockClients: 2 });
    expect(c.items[0]!.effects).toEqual({ durationMultiplier: 0.6, qualityBonus: 5 });
    expect(c.ownedCounts).toEqual({ scout: 1, triage: 0, replier: 0, ads: 0 });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/shop");
    expect(init.credentials).toBe("include");
  });

  it("purchase : Idempotency-Key, corps {item_id}, instance adaptée", async () => {
    const f = vi.fn(async () => json(wireInstance(), 201));
    const api = createShopApi({ fetch: f as unknown as typeof fetch });
    const instance = await api.purchase("replier_t2");
    expect(instance).toMatchObject({ id: "agi_07", role: "replier", tier: 2, status: "idle", pricePaid: 90 });
    expect(instance.config).toMatchObject({ version: 1, tierCap: 3 });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/shop/purchase");
    expect(JSON.parse(init.body as string)).toEqual({ item_id: "replier_t2" });
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBeTruthy();
  });

  it("réutilise la clé après une panne réseau, en change après une réponse", async () => {
    const keys: string[] = [];
    let n = 0;
    const f = vi.fn(async (_u: string, init: RequestInit) => {
      keys.push((init.headers as Record<string, string>)["Idempotency-Key"]!);
      if (++n === 1) throw new TypeError("down");
      return json(wireInstance(), 201);
    });
    const api = createShopApi({ fetch: f as unknown as typeof fetch });
    await expect(api.purchase("replier_t2")).rejects.toMatchObject({ code: "NETWORK" });
    await api.purchase("replier_t2");
    await api.purchase("replier_t2");
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[1]);
  });

  it("mappe les codes d'erreur stables (INSTANCE_LIMIT, INSUFFICIENT_FUNDS, ROLE_LOCKED)", async () => {
    for (const code of ["INSTANCE_LIMIT", "INSUFFICIENT_FUNDS", "ROLE_LOCKED"]) {
      const f = vi.fn(async () => json({ error: { code, message: "x" } }, 409));
      const api = createShopApi({ fetch: f as unknown as typeof fetch });
      const err = await api.purchase("i1").catch((e) => e);
      expect(err).toBeInstanceOf(ShopError);
      expect(err.code).toBe(code);
    }
  });

  it("listInstances et rename", async () => {
    const f = vi.fn(async (url: string) =>
      url === "/api/agents/instances" ? json({ items: [wireInstance()] }) : json(wireInstance({ label: "Rapide" })),
    );
    const api = createShopApi({ fetch: f as unknown as typeof fetch });
    const list = await api.listInstances();
    expect(list).toHaveLength(1);
    const renamed = await api.rename("agi_07", "Rapide");
    expect(renamed.label).toBe("Rapide");
    const calls = f.mock.calls as unknown as [string, RequestInit][];
    const renameCall = calls.find(([u]) => u.includes("/agents/instances/"))!;
    expect(renameCall[0]).toBe("/api/agents/instances/agi_07");
    expect(renameCall[1].method).toBe("PATCH");
  });
});
