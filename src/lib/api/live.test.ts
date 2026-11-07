/**
 * Parcours réel M1 → M5 de l'adaptateur HTTP contre une API lancée (fournisseur `mock`).
 * Ignoré par défaut (aucun appel réseau en test automatisé) ; pour l'exécuter :
 *   cd api && RUBIX_DB_PATH=/tmp/live.db RUBIX_DEMO_SECRET=demo-secret-0123456789 uv run uvicorn app.main:app --port 8011
 *   LIVE_API_URL=http://localhost:8011 LIVE_DEMO_SECRET=demo-secret-0123456789 pnpm vitest run src/lib/api/live.test.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createHttpClient } from "./http";

const BASE = process.env.LIVE_API_URL;

function cookieFetch(base: string): typeof fetch {
  let cookie = "";
  return async (input, init) => {
    const headers = new Headers(init?.headers);
    if (cookie) headers.set("Cookie", cookie);
    const res = await fetch(`${base}${String(input)}`, { ...init, headers });
    const set = res.headers.getSetCookie?.() ?? [];
    if (set.length) cookie = set.map((c) => c.split(";")[0]).join("; ");
    return res;
  };
}

const annotated = (n: number): string =>
  (JSON.parse(readFileSync(path.resolve(process.cwd(), `data/annotated/ann_m${n}_complete.json`), "utf8")) as { deliverable_text: string }).deliverable_text;

describe.skipIf(!BASE)("parcours réel via l'adaptateur HTTP", () => {
  it("joue M1 à M5 (création, partage de pièce, message, livrable, livraison, paiement)", async () => {
    const api = createHttpClient({ fetch: cookieFetch(BASE!), storage: null, demoSecret: process.env.LIVE_DEMO_SECRET ?? "" });

    let r = await api.createSession({ company: "Atelier Test", mode: "beginner" });
    expect(r.state.session?.company).toBe("Atelier Test");
    expect(r.state.simulated_provider).toBe(true);
    expect(r.state.balance.available).toBe(30);
    expect(r.state.attempt).toBeNull();

    let balance = r.state.balance.booked;
    for (let n = 1; n <= 5; n++) {
      const id = `m${n}`;
      r = await api.startMission(id);
      const a = r.state.attempt!;
      expect(a.mission_id).toBe(id);
      expect(a.status).toBe("ACTIVE");
      expect(a.brief.text.length).toBeGreaterThan(20);
      expect(a.documents.length).toBeGreaterThan(0);
      expect(a.roles.find((x) => x.role === "writer")!.limit).toBe(5);

      // pièce partagée + message au rédacteur
      r = await api.sendMessage(a.id, { role: "writer", text: "Rédige le livrable demandé.", document_ids: [a.documents[0]!.id], max_cost_confirmed: a.unit_price });
      expect(r.action?.status).toBe("SUCCEEDED");
      const after = r.state.attempt!;
      expect(after.roles.find((x) => x.role === "writer")!.used).toBe(1);
      expect(after.messages.filter((m) => m.author === "agent")).toHaveLength(1);
      expect(after.artifacts.every((x) => x.content.length > 0)).toBe(true); // la pièce partagée n'apparaît pas comme livrable
      expect(r.state.balance.available).toBe(balance - after.unit_price);

      r = await api.saveArtifact(a.id, { parent_id: null, content: annotated(n) });
      const art = r.state.attempt!.artifacts.at(-1)!;
      expect(art.author).toBe("player");
      r = await api.submit(a.id, { artifact_version_id: art.id, brief_version: r.state.attempt!.brief.version });
      const sub = r.state.attempt!.submission!;
      expect(sub.status).toBe("EVALUATED");
      expect(sub.evaluation!.score).toBeGreaterThan(0);
      expect(sub.evaluation!.criteria.length).toBeGreaterThan(0);
      expect(Object.keys(sub.evaluation!.criteria_labels).length).toBeGreaterThan(0);
      expect(sub.evaluation!.payment.max_reward).toBeGreaterThan(0);
      expect(r.state.attempt!.status).toBe(sub.evaluation!.passed ? "COMPLETED" : "FAILED");
      expect(sub.evaluation!.passed, `M${n} réussie`).toBe(true);
      expect(r.state.missions.find((m) => m.id === id)!.best_payment).toBe(sub.evaluation!.payment.credited + sub.evaluation!.payment.already_acquired);
      balance = r.state.balance.booked;
      expect(r.state.stage.index).toBe(n + 1);
    }
    expect(r.state.bilan.results.length).toBeGreaterThanOrEqual(5);

    r = await api.startMission("m6");
    expect(r.state.demo_enabled).toBe(false); // l'événement de démo n'existe que sur M5

    // clarification (gratuite) : la réponse est conservée dans l'état
    r = await api.askClarification(r.state.attempt!.id, "Pouvez-vous préciser la cible ?");
    expect(r.state.attempt!.clarifications.used).toBe(1);
    expect(r.state.attempt!.clarifications.items[0]!.question).toContain("cible");

    // erreur stable lue depuis { error: { code } }
    // achat côté serveur : le chef est débloqué par M5 et le solde le permet ; un second achat est refusé (code stable)
    r = await api.purchaseAgent("lead");
    expect(r.state.agents.find((x) => x.role === "lead")!.owned).toBe(true);
    await expect(api.purchaseAgent("lead")).rejects.toMatchObject({ code: expect.stringMatching(/^[A-Z_]+$/), status: expect.any(Number) });
    await expect(api.listNotebook()).rejects.toMatchObject({ code: "NOT_IMPLEMENTED" });
    await expect(api.requestHint("x", 1)).rejects.toMatchObject({ code: "NOT_IMPLEMENTED" });
  }, 120_000);

  it("événement de démo (M5) : nouvelle version du brief avec diff, livraison sur la version 2", async () => {
    const api = createHttpClient({ fetch: cookieFetch(BASE!), storage: null, demoSecret: process.env.LIVE_DEMO_SECRET ?? "secret-absent" });
    let r = await api.createSession({ company: "Atelier Démo", mode: "beginner" });
    for (let n = 1; n <= 4; n++) {
      r = await api.startMission(`m${n}`);
      r = await api.saveArtifact(r.state.attempt!.id, { parent_id: null, content: annotated(n) });
      r = await api.submit(r.state.attempt!.id, { artifact_version_id: r.state.attempt!.artifacts[0]!.id, brief_version: r.state.attempt!.brief.version });
    }
    r = await api.startMission("m5");
    expect(r.state.demo_events).toEqual(["target_change"]);
    r = await api.demoEvent("target_change");
    const a = r.state.attempt!;
    expect(a.brief.version).toBe(2);
    expect(a.brief.diff?.length).toBeGreaterThan(0);
    expect(r.state.demo_events).toEqual([]);
    // livrer sur l'ancienne version du brief est refusé, sur la nouvelle c'est accepté
    r = await api.saveArtifact(a.id, { parent_id: null, content: annotated(5) });
    const art = r.state.attempt!.artifacts[0]!;
    await expect(api.submit(a.id, { artifact_version_id: art.id, brief_version: 1 })).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    r = await api.submit(a.id, { artifact_version_id: art.id, brief_version: 2 });
    expect(r.state.attempt!.submission!.brief_version).toBe(2);
  }, 120_000);
});
