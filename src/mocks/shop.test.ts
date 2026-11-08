import { beforeEach, describe, expect, it } from "vitest";
import { ShopError } from "@/lib/api/shop";
import { resetMockSearches } from "./searches";
import { createMockShopApi, resetMockShop } from "./shop";

beforeEach(() => {
  resetMockShop();
  resetMockSearches();
});

describe("createMockShopApi", () => {
  it("catalogue : scout dispo d'emblée, les autres métiers verrouillés sans clients", async () => {
    const api = createMockShopApi({ delayMs: 0 });
    const c = await api.getCatalog();
    const scout1 = c.items.find((i) => i.id === "scout_t1")!;
    const triage1 = c.items.find((i) => i.id === "triage_t1")!;
    expect(scout1.buyable).toBe(true);
    expect(triage1.unlocked).toBe(false);
    expect(triage1.buyable).toBe(false);
    expect(c.ownedCounts).toEqual({ scout: 0, triage: 0, replier: 0, ads: 0 });
  });

  it("achat : débite le solde simulé, crée une instance idle au bon palier", async () => {
    const api = createMockShopApi({ delayMs: 0 });
    const instance = await api.purchase("scout_t1");
    expect(instance).toMatchObject({ role: "scout", tier: 1, status: "idle", label: null, pricePaid: 40 });
    const list = await api.listInstances();
    expect(list).toHaveLength(1);
    const c = await api.getCatalog();
    expect(c.ownedCounts.scout).toBe(1);
  });

  it("achat : ROLE_LOCKED si le métier n'est pas débloqué", async () => {
    const api = createMockShopApi({ delayMs: 0 });
    await expect(api.purchase("triage_t1")).rejects.toMatchObject({ code: "ROLE_LOCKED" });
  });

  it("achat : NOT_FOUND pour un article inconnu", async () => {
    const api = createMockShopApi({ delayMs: 0 });
    const err: ShopError = await api.purchase("inconnu").catch((e) => e);
    expect(err).toBeInstanceOf(ShopError);
    expect(err.code).toBe("NOT_FOUND");
  });

  it("achat : INSTANCE_LIMIT au-delà de 3 exemplaires du même métier", async () => {
    const api = createMockShopApi({ delayMs: 0 });
    await api.purchase("scout_t1");
    await api.purchase("scout_t1");
    await api.purchase("scout_t1");
    await expect(api.purchase("scout_t1")).rejects.toMatchObject({ code: "INSTANCE_LIMIT" });
  });

  it("achat : INSUFFICIENT_FUNDS quand le prix dépasse le solde simulé", async () => {
    resetMockShop(10);
    const api = createMockShopApi({ delayMs: 0 });
    // scout_t1 coûte 40 $, solde simulé réduit à 10 $ pour ce test.
    await expect(api.purchase("scout_t1")).rejects.toMatchObject({ code: "INSUFFICIENT_FUNDS" });
  });

  it("renomme une instance, NOT_FOUND sinon", async () => {
    const api = createMockShopApi({ delayMs: 0 });
    const instance = await api.purchase("scout_t1");
    const renamed = await api.rename(instance.id, "  Éclaireur rapide  ");
    expect(renamed.label).toBe("Éclaireur rapide");
    await expect(api.rename("inconnu", "x")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
