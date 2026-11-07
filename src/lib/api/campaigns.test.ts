import { describe, expect, it, vi } from "vitest";
import { createCampaignsClient, exportUrl, fieldSpec, pubErrorMessage } from "./campaigns";
import { ApiError } from "./types";

const json = (status: number, body: unknown) => new Response(status === 204 ? null : JSON.stringify(body), { status });

describe("client campagnes", () => {
  it("envoie cookie, Idempotency-Key et corps JSON ; extrait la version créée", async () => {
    const f = vi.fn(async () => json(202, { steps: [{ artifact_version_id: "v1" }] }));
    const api = createCampaignsClient({ fetch: f as unknown as typeof fetch });
    expect(await api.generate("c1", "  court  ")).toEqual({ versionId: "v1" });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/campaigns/c1/generate");
    expect(init.credentials).toBe("include");
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBeTruthy();
    expect(JSON.parse(init.body as string)).toEqual({ consigne: "court" });
  });

  it("réutilise la clé après une panne réseau, en change après une réponse", async () => {
    const keys: string[] = [];
    let n = 0;
    const f = vi.fn(async (_u: string, init: RequestInit) => {
      keys.push((init.headers as Record<string, string>)["Idempotency-Key"]!);
      if (++n === 1) throw new TypeError("down");
      return json(202, { steps: [] });
    });
    const api = createCampaignsClient({ fetch: f as unknown as typeof fetch });
    await expect(api.generate("c1")).rejects.toMatchObject({ code: "NETWORK" });
    await api.generate("c1");
    await api.generate("c1");
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[1]);
  });

  it("mappe les codes d'erreur stables", async () => {
    const f = vi.fn(async () => json(409, { error: { code: "VERSION_CONFLICT", message: "x" } }));
    const api = createCampaignsClient({ fetch: f as unknown as typeof fetch });
    const err = await api.patch("c1", { version: 1, nom: "a" }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe("VERSION_CONFLICT");
    expect(pubErrorMessage(err)).toMatch(/rechargées/);
  });

  it("limites des formats lues dans data/ads et lien d'export serveur", () => {
    expect(fieldSpec("sponsored_content", "titre").max).toBe(70);
    expect(exportUrl("c 1", 2)).toBe("/api/campaigns/c%201/export.md?version=2");
  });
});
