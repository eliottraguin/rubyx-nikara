import { describe, expect, it, vi } from "vitest";
import { ConvError, createConversationsApi } from "./conversations";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("client de messagerie", () => {
  it("envoie cookie, Idempotency-Key et réutilise la clé au rejeu après coupure réseau", async () => {
    const f = vi.fn().mockRejectedValueOnce(new Error("net")).mockResolvedValueOnce(json({ id: "c" }, 201));
    const api = createConversationsApi({ fetch: f as unknown as typeof fetch });
    await expect(api.create("p1")).rejects.toMatchObject({ code: "NETWORK" });
    await api.create("p1");
    const k = (i: number) => (f.mock.calls[i]![1].headers as Record<string, string>)["Idempotency-Key"];
    expect(k(0)).toBeTruthy();
    expect(k(1)).toBe(k(0));
    expect(f.mock.calls[1]![1].credentials).toBe("include");
  });

  it("conserve les codes d'erreur stables, dont OPTED_OUT", async () => {
    const f = vi.fn().mockResolvedValue(json({ error: { code: "OPTED_OUT", message: "non" } }, 409));
    const api = createConversationsApi({ fetch: f as unknown as typeof fetch });
    const e = await api.send("c", "salut").catch((x) => x);
    expect(e).toBeInstanceOf(ConvError);
    expect(e.code).toBe("OPTED_OUT");
  });

  it("liste les prospects via /api/prospects?limit=100", async () => {
    const f = vi.fn().mockResolvedValue(json({ items: [{ id: "p", entreprise: "A", statut: "nouveau", simule: true, email: "x" }] }));
    const api = createConversationsApi({ fetch: f as unknown as typeof fetch });
    expect(await api.prospects()).toEqual([{ id: "p", entreprise: "A", statut: "nouveau", simule: true }]);
    expect(f.mock.calls[0]![0]).toBe("/api/prospects?limit=100");
  });
});
