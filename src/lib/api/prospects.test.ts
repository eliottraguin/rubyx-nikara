import { describe, expect, it, vi } from "vitest";
import { buildQuery, createProspectsClient, exportUrl } from "./prospects";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("client carnet de prospection", () => {
  it("construit la requête sans valeurs vides ; l'export retire curseur et limite", () => {
    expect(buildQuery({ tri: "entreprise", ordre: "asc", statut: "", q: "  ", cursor: "c", limit: 50 })).toBe("?tri=entreprise&ordre=asc&cursor=c&limit=50");
    expect(exportUrl({ tri: "pertinence", statut: "contacte", q: "bar & co", cursor: "c", limit: 5 })).toBe("/api/prospects/export.csv?tri=pertinence&statut=contacte&q=bar+%26+co");
    expect(buildQuery({})).toBe("");
  });

  it("filtre par étiquette dans la requête et l'export ; lecture tolérante de l'étiquette et de la citation", async () => {
    expect(buildQuery({ etiquette: "a_verifier" })).toBe("?etiquette=a_verifier");
    expect(exportUrl({ etiquette: "correspond", cursor: "c" })).toBe("/api/prospects/export.csv?etiquette=correspond");
    const raw = { id: "a", pertinence: 82 }; // ancien format : nombre, pas d'étiquette
    const fetch = vi.fn(async () => json({ items: [raw, { id: "b", pertinence_etiquette: "correspond", pertinence_citation: " « x » " }, { id: "c", pertinence_etiquette: "bizarre" }], next_cursor: null, counts: {}, total: 3 })) as unknown as typeof globalThis.fetch;
    const r = await createProspectsClient({ fetch }).list({ etiquette: "correspond" });
    expect(r.items.map((i) => i.pertinence_etiquette)).toEqual(["a_verifier", "correspond", "a_verifier"]);
    expect(r.items[0]!.pertinence_citation).toBeNull();
    expect(r.items[1]!.pertinence_citation).toBe(" « x » ");
  });

  it("PATCH : Idempotency-Key, cookie, version ; clé renouvelée après réponse", async () => {
    const f = vi.fn(async () => json({ id: "p1" }));
    const c = createProspectsClient({ fetch: f as unknown as typeof fetch });
    await c.patch("p1", { version: 2, statut: "contacte" });
    await c.patch("p1", { version: 2, statut: "contacte" });
    const calls = f.mock.calls as unknown as [string, RequestInit][];
    expect(calls[0]![0]).toBe("/api/prospects/p1");
    expect(calls[0]![1].credentials).toBe("include");
    const k1 = (calls[0]![1].headers as Record<string, string>)["Idempotency-Key"];
    expect(k1).toBeTruthy();
    expect((calls[1]![1].headers as Record<string, string>)["Idempotency-Key"]).not.toBe(k1);
  });

  it("réseau coupé : même clé au rejeu", async () => {
    const f = vi.fn().mockRejectedValueOnce(new TypeError("x")).mockResolvedValueOnce(new Response(null, { status: 204 }));
    const c = createProspectsClient({ fetch: f as unknown as typeof fetch });
    await expect(c.remove("p1")).rejects.toMatchObject({ code: "NETWORK" });
    await c.remove("p1");
    const keys = (f.mock.calls as unknown as [string, RequestInit][]).map((x) => (x[1].headers as Record<string, string>)["Idempotency-Key"]);
    expect(keys[0]).toBe(keys[1]);
  });

  it("erreurs à codes stables", async () => {
    const f = vi.fn(async () => json({ error: { code: "VERSION_CONFLICT", message: "Périmée." } }, 409));
    const c = createProspectsClient({ fetch: f as unknown as typeof fetch });
    await expect(c.patch("p1", { version: 1, notes: "a" })).rejects.toMatchObject({ code: "VERSION_CONFLICT", status: 409, message: "Périmée." });
  });
});
