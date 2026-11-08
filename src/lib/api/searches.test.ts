import { describe, expect, it } from "vitest";
import { adaptSearch, codeFrom, createSearchesApi, SearchError, toPertinence } from "./searches";

interface Call { method: string; url: string; headers: Record<string, string>; body: unknown }
function harness(handler: (c: Call) => Response) {
  const calls: Call[] = [];
  const fetch = (async (url: string, init?: RequestInit) => {
    const c: Call = { method: init?.method ?? "GET", url, headers: (init?.headers ?? {}) as Record<string, string>, body: init?.body ? JSON.parse(init.body as string) : undefined };
    calls.push(c);
    return handler(c);
  }) as unknown as typeof globalThis.fetch;
  return { api: createSearchesApi({ fetch, pollMs: 1 }), calls };
}
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

// Forme réelle de `SearchOut` (docs/CONTRACTS.md §11) : la recherche rendue par POST est déjà terminée.
const SEARCH = {
  id: "src_1", planet_id: "annuaire", planet_label: "Bibliothèque publique", precision: null, status: "DONE", found: 6, kept: 2, discarded: 4, simule: true,
  added: [
    { prospect_id: "pro_1", entreprise: "Boulangerie X", source_ref: "ann_1", etiquette: "correspond", citation: "« 6 salariés »" },
    { prospect_id: "pro_2", entreprise: "Y", source_ref: "ann_2" },
  ],
  discarded_items: [
    { source_ref: "ann_3", entreprise: "Z", code: "DUPLICATE", raison: "déjà au carnet" },
    { source_ref: "ann_4", entreprise: "W", code: "OUT_OF_ZONE", raison: "hors zone" },
    { source_ref: "ann_5", entreprise: "V", code: "OUT_OF_SIZE", raison: "taille" },
    { source_ref: "ann_6", entreprise: "U", code: "CLOSED", raison: "fermée" },
  ],
  error: null,
};

describe("adaptation des recherches", () => {
  it("pertinence inconnue ou ancien score numérique : repli « à vérifier », jamais « correspond »", () => {
    expect(toPertinence("correspond")).toBe("correspond");
    expect(toPertinence(82)).toBe("a_verifier");
    expect(toPertinence("n'importe quoi")).toBe("a_verifier");
  });
  it("bilan : prospects ajoutés (étiquette par défaut « à vérifier »), écarts regroupés par motif", () => {
    const r = adaptSearch({ ...SEARCH, added: [...SEARCH.added, { entreprise: "sans id" }] });
    expect(r.added.map((p) => [p.id, p.pertinence])).toEqual([["pro_1", "correspond"], ["pro_2", "a_verifier"]]);
    expect(r.added[0]).toMatchObject({ citation: "« 6 salariés »", sourceRef: "ann_1", simule: true });
    expect(r).toMatchObject({ id: "src_1", planetId: "annuaire", alreadyPresent: 1, horsCible: 2, rejected: 1 });
    expect(adaptSearch({}, "x")).toMatchObject({ planetId: "x", added: [], alreadyPresent: 0, rejected: 0, horsCible: 0 });
  });
  it("codes d'erreur : contrat, repli par statut HTTP", () => {
    expect(codeFrom("PROFILE_INCOMPLETE", 422)).toBe("PROFILE_INCOMPLETE");
    expect(codeFrom("PLANET_LOCKED", 409)).toBe("PLANET_LOCKED");
    expect(codeFrom(undefined, 404)).toBe("NOT_FOUND");
    expect(codeFrom(undefined, 501)).toBe("NOT_IMPLEMENTED");
    expect(codeFrom("NOPE", 500)).toBe("UNKNOWN");
  });
});

describe("client des recherches", () => {
  it("lance et lit le résultat de la réponse ; n'envoie que lieu et précision, avec une clé d'idempotence", async () => {
    const { api, calls } = harness((c) => (c.method === "POST" ? json(SEARCH, 202) : json({}, 404)));
    let started = 0;
    const r = await api.run({ planetId: "annuaire", precision: "  le centre  " }, { onStarted: () => started++ });
    expect(started).toBe(1);
    expect(calls).toHaveLength(1); // aucune autre lecture : la réponse est déjà le résultat
    expect(calls[0]!.url).toBe("/api/searches");
    expect(calls[0]!.body).toEqual({ planet_id: "annuaire", precision: "le centre" });
    expect(calls[0]!.headers["Idempotency-Key"]).toMatch(/.{8,}/);
    expect(r.added).toHaveLength(2);
  });

  it("si la recherche est rendue encore en cours, relit GET /searches/{id} ; précision coupée à 300 caractères", async () => {
    let reads = 0;
    const { api, calls } = harness((c) => {
      if (c.method === "POST") return json({ ...SEARCH, status: "RUNNING", added: [] }, 202);
      if (c.url === "/api/searches/src_1") return json(++reads < 2 ? { ...SEARCH, status: "RUNNING" } : SEARCH);
      return json({}, 404);
    });
    const r = await api.run({ planetId: "annuaire", precision: "x".repeat(400) });
    expect((calls[0]!.body as { precision: string }).precision).toHaveLength(300);
    expect(calls.map((c) => c.url)).toEqual(["/api/searches", "/api/searches/src_1", "/api/searches/src_1"]);
    expect(r.added).toHaveLength(2);
  });

  it("refus du serveur : erreur à code stable (lieu fermé, fiche incomplète)", async () => {
    const { api } = harness(() => json({ error: { code: "PROFILE_INCOMPLETE", message: "m" } }, 422));
    await expect(api.run({ planetId: "annuaire" })).rejects.toMatchObject({ code: "PROFILE_INCOMPLETE" });
    const h2 = harness(() => json({ error: { code: "PLANET_LOCKED" } }, 409));
    await expect(h2.api.run({ planetId: "registre" })).rejects.toBeInstanceOf(SearchError);
  });

  it("recherche échouée : erreur du serveur relayée, rien d'ajouté", async () => {
    const { api } = harness((c) => (c.method === "POST" ? json({ id: "src_1", status: "FAILED", error: { code: "LLM_UNAVAILABLE", message: "m" } }, 202) : json({}, 404)));
    await expect(api.run({ planetId: "annuaire" })).rejects.toMatchObject({ code: "LLM_UNAVAILABLE" });
  });

  it("contact : route absente (404) ou non implémentée (501) donne un code exploitable ; succès renvoie l'identifiant", async () => {
    const ok = harness(() => json({ id: "conv_1", prospect_id: "p" }, 201));
    await expect(ok.api.contact("p")).resolves.toEqual({ conversationId: "conv_1" });
    expect(ok.calls[0]).toMatchObject({ method: "POST", url: "/api/prospects/p/contact", body: {} });
    const h404 = harness(() => json({ detail: "Not Found" }, 404));
    await expect(h404.api.contact("p")).rejects.toMatchObject({ code: "NOT_FOUND" });
    const h501 = harness(() => json({ error: { code: "NOT_IMPLEMENTED" } }, 501));
    await expect(h501.api.contact("p")).rejects.toMatchObject({ code: "NOT_IMPLEMENTED" });
  });

  it("réseau coupé : NETWORK", async () => {
    const api = createSearchesApi({ fetch: (async () => { throw new TypeError("x"); }) as unknown as typeof fetch });
    await expect(api.run({ planetId: "annuaire" })).rejects.toMatchObject({ code: "NETWORK" });
  });
});
