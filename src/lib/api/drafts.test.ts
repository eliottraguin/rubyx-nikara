import { describe, expect, it, vi } from "vitest";
import { DraftsError, adaptState, createDraftsApi } from "./drafts";

const ctrl = { id: "c", label: "Longueurs", essentiel: true, reussi: false, detail: "trop long" };
const fiche = (id: string, numero: number, auteur = "agent") => ({
  id, kind: "fiche", numero, parent_id: null, auteur, created_at: "2026-11-08T10:00:00Z",
  fiche: { resume: `R ${id}`, pourquoi_ce_prospect: [{ texte: "Bon secteur", critere: "cible_secteurs", champ: "secteur" }], points_d_accroche: ["b"], a_verifier: [], sources: ["ann_1"] },
  message: null, controles: [ctrl],
});
const message = (id: string, numero: number) => ({
  id, kind: "message", numero, parent_id: null, auteur: "agent", created_at: "2026-11-08T10:00:00Z", fiche: null,
  message: { canal_cible: "email_generique", objet: "Bonjour", corps: "Corps", mentions: ["origine"] }, controles: [],
});
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
const drafts = (over: object = {}) => ({ fiches: [], messages: [], quota_restant: { prospect_profile: 5, prospect_message: 5 }, couts: { prospect_profile: 3, prospect_message: 2 }, ...over });

describe("adaptState", () => {
  it("adapte les versions réelles, trie par numéro et lit quota et coûts du serveur", () => {
    const s = adaptState(drafts({ fiches: [fiche("v2", 2, "joueur"), fiche("v1", 1)], messages: [message("m1", 1)], quota_restant: { prospect_profile: 3, prospect_message: 4 } }));
    expect(s.profile.map((v) => v.id)).toEqual(["v1", "v2"]);
    expect(s.remaining).toEqual({ profile: 3, message: 4 });
    expect(s.costs).toEqual({ profile: 3, message: 2 });
    expect(s.profile[0]).toMatchObject({ kind: "profile", resume: "R v1", pourquoi: ["Bon secteur"], accroches: ["b"] });
    expect(s.profile[0]!.checks[0]).toMatchObject({ reussi: false, detail: "trop long" });
    expect(s.message[0]).toMatchObject({ kind: "message", objet: "Bonjour", corps: "Corps" });
  });
  it("tolère un corps vide : 5 essais, coût inconnu", () => {
    const s = adaptState(null);
    expect(s.remaining).toEqual({ profile: 5, message: 5 });
    expect(s.costs).toEqual({ profile: null, message: null });
  });
});

describe("createDraftsApi", () => {
  it("generate : une seule requête d'action (aucun suivi), clé d'idempotence, puis relecture des versions", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const f = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url === "/api/prospects/p1/drafts") return json(drafts({ fiches: calls.length > 1 ? [fiche("v1", 1)] : [], quota_restant: { prospect_profile: 4, prospect_message: 5 } }));
      if (url === "/api/prospects/p1/profile") return json({ id: "act1", status: "SUCCEEDED", debited: 3, version: fiche("v1", 1) }, 202);
      throw new Error(url);
    });
    const api = createDraftsApi({ fetch: f as unknown as typeof fetch });
    const r = await api.generate("p1", "profile", "  gain de temps ");
    expect(r).toMatchObject({ createdId: "v1", debited: 3 });
    expect(r.state.remaining.profile).toBe(4);
    expect(calls.some((c) => c.url.startsWith("/api/actions/"))).toBe(false);
    const post = calls.find((c) => c.url.endsWith("/profile"))!;
    expect((post.init!.headers as Record<string, string>)["Idempotency-Key"]).toBeTruthy();
    expect(JSON.parse(post.init!.body as string)).toEqual({ instruction: "gain de temps" });
  });

  it("réseau coupé : la même clé est rejouée, une fois répondu elle est renouvelée", async () => {
    const keys: string[] = [];
    let n = 0;
    const f = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/message")) {
        keys.push((init!.headers as Record<string, string>)["Idempotency-Key"]!);
        if (n++ === 0) throw new TypeError("offline");
        return json({ id: "a", status: "SUCCEEDED", version: message("m1", 1) }, 202);
      }
      return json(drafts());
    });
    const api = createDraftsApi({ fetch: f as unknown as typeof fetch });
    await expect(api.generate("p1", "message")).rejects.toMatchObject({ code: "NETWORK" });
    await api.generate("p1", "message");
    await api.generate("p1", "message");
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[1]);
  });

  it.each([
    [409, "ROLE_LOCKED"],
    [402, "INSUFFICIENT_FUNDS"],
    [409, "MESSAGE_LIMIT"],
    [422, "INVALID_OUTPUT"],
    [503, "LLM_UNAVAILABLE"],
  ])("erreur HTTP %i %s", async (status, code) => {
    const f = async (url: string) => (url.endsWith("/profile") ? json({ error: { code, message: "x" } }, status) : json({}));
    const api = createDraftsApi({ fetch: f as unknown as typeof fetch });
    await expect(api.generate("p1", "profile")).rejects.toMatchObject({ code });
  });

  it("une action FAILED se lit comme une erreur typée", async () => {
    const f = async (url: string) => (url.endsWith("/message") ? json({ id: "a", status: "FAILED", error: { code: "INVALID_OUTPUT" } }, 202) : json({}));
    const api = createDraftsApi({ fetch: f as unknown as typeof fetch });
    await expect(api.generate("p1", "message")).rejects.toBeInstanceOf(DraftsError);
  });

  it("edit : PATCH des seuls champs modifiables, puis relecture", async () => {
    const bodies: unknown[] = [];
    const f = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        bodies.push([url, JSON.parse(init.body as string)]);
        return json({ ...fiche("v2", 2, "joueur") }, 201);
      }
      return json(drafts());
    });
    const api = createDraftsApi({ fetch: f as unknown as typeof fetch });
    const r = await api.edit("p1", "profile", "v1", { resume: "Nouveau", accroches: ["x"], aVerifier: [] });
    expect(r.createdId).toBe("v2");
    expect(bodies[0]).toEqual(["/api/prospects/p1/drafts/v1", { resume: "Nouveau", points_d_accroche: ["x"], a_verifier: [] }]);
    await api.edit("p1", "message", "m1", { objet: "O", corps: "C" });
    expect(bodies[1]).toEqual(["/api/prospects/p1/drafts/m1", { objet: "O", corps: "C" }]);
  });

  it("« Utiliser ce message » : ouvre la conversation puis y poste {text, draft_version_id}", async () => {
    const seen: [string, unknown][] = [];
    const f = vi.fn(async (url: string, init?: RequestInit) => {
      seen.push([url, init?.body ? JSON.parse(init.body as string) : null]);
      return url.endsWith("/contact") ? json({ id: "conv_1" }, 201) : json({ conversation_id: "conv_1", messages: [] }, 201);
    });
    const api = createDraftsApi({ fetch: f as unknown as typeof fetch });
    expect(await api.useAsFirstMessage("p1", "m1", "Mon texte")).toEqual({ conversationId: "conv_1" });
    expect(seen[1]).toEqual(["/api/conversations/conv_1/messages", { text: "Mon texte", draft_version_id: "m1" }]);
  });

  it("un refus du serveur sur la conversation est une erreur typée", async () => {
    const f = async (url: string) => (url.endsWith("/contact") ? json({ id: "conv_1" }, 201) : json({ error: { code: "INVALID_STATE", message: "x" } }, 409));
    const api = createDraftsApi({ fetch: f as unknown as typeof fetch });
    await expect(api.useAsFirstMessage("p1", "m1", "t")).rejects.toMatchObject({ code: "INVALID_STATE" });
  });
});
