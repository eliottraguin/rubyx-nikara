import { describe, expect, it } from "vitest";
import actionMessage from "./__fixtures__/action-message.json";
import attemptEvaluated from "./__fixtures__/attempt-evaluated.json";
import attemptStart from "./__fixtures__/attempt-start.json";
import wireState from "./__fixtures__/state.json";
import { API_ERROR_CODES, briefToText, mapAction, mapAttempt, mapBuilding, mapErrorCode, mapState, type WireDetail, type WireState } from "./adapt";
import { createHttpClient } from "./http";

// Les fixtures sont des réponses RÉELLES de l'API (fournisseur mock), capturées après une livraison de M1 réussie.
const WS = wireState as unknown as WireState;
const DETAIL = attemptEvaluated as unknown as WireDetail;

type Call = { method: string; url: string; headers: Record<string, string>; body: unknown };
type Handler = (c: Call) => Response | Promise<Response> | "network";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function harness(handler: Handler) {
  const calls: Call[] = [];
  const f: typeof fetch = async (input, init) => {
    const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>));
    const call: Call = { method: init?.method ?? "GET", url: String(input), headers, body: init?.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(call);
    const r = await handler(call);
    if (r === "network") throw new TypeError("fetch failed");
    return r;
  };
  return { calls, client: createHttpClient({ fetch: f, storage: null, demoSecret: "" }) };
}

/** Réponses de lecture par défaut : l'état et le détail de tentative réels. */
function reads(c: Call): Response | null {
  if (c.method === "GET" && c.url === "/api/state") return json(WS);
  if (c.method === "GET" && c.url.startsWith("/api/attempts/")) return json(DETAIL);
  return null;
}

describe("erreurs", () => {
  it("lit { error: { code, message } } et reconnaît les 13 codes de l'API", () => {
    expect(API_ERROR_CODES).toHaveLength(13);
    for (const code of API_ERROR_CODES) expect(mapErrorCode(code), code).not.toBeNull();
    expect(mapErrorCode("INVALID_REQUEST")).toBe("VALIDATION");
    expect(mapErrorCode("SESSION_REQUIRED")).toBe("NO_SESSION");
    expect(mapErrorCode("NOT_FOUND")).toBe("NOT_FOUND");
    expect(mapErrorCode("INCONNU")).toBeNull();
  });

  it("conserve le code stable et le message français du serveur", async () => {
    const { client } = harness((c) => reads(c) ?? json({ error: { code: "MESSAGE_LIMIT", message: "Le nombre maximal de messages est atteint." } }, 409));
    await expect(client.sendMessage("att_1", { role: "writer", text: "x", document_ids: [], max_cost_confirmed: 0 })).rejects.toMatchObject({
      code: "MESSAGE_LIMIT",
      status: 409,
      message: "Le nombre maximal de messages est atteint.",
    });
  });
});

describe("requêtes envoyées", () => {
  it("createSession envoie company_name (contrat) et relit l'état serveur", async () => {
    const { client, calls } = harness((c) => reads(c) ?? json(WS, 201));
    const r = await client.createSession({ company: "Atelier", mode: "beginner" });
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.url).toBe("/api/sessions");
    expect(post.body).toEqual({ company_name: "Atelier", mode: "beginner" });
    expect(post.headers["Idempotency-Key"]).toMatch(/.{8,}/);
    expect(r.state.session?.company).toBe("Test"); // objet serveur → chaîne d'affichage
  });

  it("sendMessage partage les pièces d'abord, puis n'envoie que role, text, linked_artifact_ids", async () => {
    const { client, calls } = harness((c) => {
      if (c.url.endsWith("/shares")) return json({ id: "shr_1", artifact_version_id: "art_doc1" }, 201);
      if (c.url.endsWith("/messages")) return json(actionMessage, 202);
      return reads(c) ?? json({}, 404);
    });
    const r = await client.sendMessage("att_1", { role: "writer", text: "Rédige", document_ids: ["m1_doc_fiche"], max_cost_confirmed: 3 });
    const writes = calls.filter((c) => c.method === "POST");
    expect(writes.map((c) => c.url)).toEqual(["/api/attempts/att_1/shares", "/api/attempts/att_1/messages"]);
    expect(writes[0]!.body).toEqual({ role: "writer", document_id: "m1_doc_fiche" });
    expect(writes[1]!.body).toEqual({ role: "writer", text: "Rédige", linked_artifact_ids: ["art_doc1"] });
    expect(Object.keys(writes[1]!.body as object)).not.toContain("max_cost_confirmed"); // jamais de coût choisi par le navigateur
    expect(r.action?.status).toBe("SUCCEEDED");
  });

  it("saveArtifact envoie une version manuelle", async () => {
    const { client, calls } = harness((c) => (c.method === "POST" ? json({ id: "art_9" }, 201) : (reads(c) ?? json({}, 404))));
    await client.saveArtifact("att_1", { parent_id: "art_1", content: "Texte" });
    expect(calls.find((c) => c.method === "POST")!.body).toEqual({ kind: "manual", content: "Texte", parent_id: "art_1" });
  });

  it("hints et événements non pris en charge échouent proprement, en français", async () => {
    const { client } = harness((c) => reads(c) ?? json({}, 404));
    await expect(client.requestHint("att_1", 1)).rejects.toMatchObject({ code: "NOT_IMPLEMENTED" });
    await expect(client.demoEvent("preview_lead_plan")).rejects.toMatchObject({ code: "INVALID_STATE" });
  });
});

describe("clé d'idempotence stable par intention", () => {
  const send = (c: ReturnType<typeof harness>["client"]) => c.sendMessage("att_1", { role: "writer", text: "Même texte", document_ids: [], max_cost_confirmed: 0 });
  const key = (calls: Call[], i: number) => calls.filter((c) => c.url.endsWith("/messages"))[i]!.headers["Idempotency-Key"];

  it("réutilise la clé quand la réponse s'est perdue (réseau coupé), puis en change une fois la réponse reçue", async () => {
    let down = true;
    const { client, calls } = harness((c) => {
      if (c.url.endsWith("/messages")) return down ? "network" : json(actionMessage, 202);
      return reads(c) ?? json({}, 404);
    });
    await expect(send(client)).rejects.toMatchObject({ code: "NETWORK" });
    down = false;
    await send(client); // « Réessayer » : même intention
    expect(key(calls, 1)).toBe(key(calls, 0));
    await send(client); // nouvel envoi volontaire après succès : nouvelle intention
    expect(key(calls, 2)).not.toBe(key(calls, 0));
  });

  it("une réponse métier (même LLM_UNAVAILABLE) clôt l'intention : le clic suivant part avec une nouvelle clé", async () => {
    let fail = true;
    const { client, calls } = harness((c) => {
      if (c.url.endsWith("/messages")) return fail ? json({ error: { code: "LLM_UNAVAILABLE", message: "Indisponible." } }, 503) : json(actionMessage, 202);
      return reads(c) ?? json({}, 404);
    });
    await expect(send(client)).rejects.toMatchObject({ code: "LLM_UNAVAILABLE" });
    fail = false;
    await send(client);
    expect(key(calls, 1)).not.toBe(key(calls, 0));
  });

  it("des intentions différentes ont des clés différentes", async () => {
    const { client, calls } = harness((c) => (c.url.endsWith("/messages") ? json(actionMessage, 202) : (reads(c) ?? json({}, 404))));
    await send(client);
    await client.sendMessage("att_1", { role: "writer", text: "Autre texte", document_ids: [], max_cost_confirmed: 0 });
    expect(key(calls, 0)).not.toBe(key(calls, 1));
  });
});

describe("adaptation de l'état réel", () => {
  const state = mapState(WS, { detail: DETAIL, clarifications: [], payments: { m1: 20 }, actions: [], demo: { enabled: false, events: [] } });

  it("GameState : session objet → chaîne, stage chaîne → numéro, contracts_version, llm.simulated, progress", () => {
    expect(state.contract_version).toBe(WS.contracts_version);
    expect(state.session).toMatchObject({ company: "Test", stage: 2, mode: "beginner" });
    expect(state.simulated_provider).toBe(true);
    expect(state.stage).toEqual({ index: 2, total: 6, label: "Étape 2 sur 6" });
    expect(state.next_action).toBe("Acceptez la prochaine commande.");
    expect(state.balance).toEqual(WS.balance);
    expect(state.agents.find((a) => a.role === "prospector")).toMatchObject({ unlocked: true, unlock_condition: "Réussir la commande M1" });
    expect(state.missions.find((m) => m.id === "m1")).toMatchObject({ status: "COMPLETED", best_payment: 20 });
    expect(state.hints_enabled).toBe(false);
  });

  it("immeuble : niveau 1 par défaut tant que l'API ne le renvoie pas, valeurs du serveur sinon (bornées)", () => {
    expect(state.building).toEqual({ level: 1, total_earned: 0, next_level_at: null });
    expect(mapBuilding(null)).toEqual({ level: 1, total_earned: 0, next_level_at: null });
    expect(mapBuilding({ level: 5, total_earned: 112, next_level_at: 125 })).toEqual({ level: 5, total_earned: 112, next_level_at: 125 });
    expect(mapBuilding({ level: 99, total_earned: -4, next_level_at: 700 })).toEqual({ level: 10, total_earned: 0, next_level_at: null });
    expect(mapBuilding({ level: Number.NaN, total_earned: 20 })).toMatchObject({ level: 1, total_earned: 20 });
  });

  it("tentative : brief lisible, documents, quotas du serveur, livrables, livraison évaluée", () => {
    const a = state.attempt!;
    expect(a.status).toBe("COMPLETED");
    expect(a.brief.text).toContain("Le Petit Comptoir");
    expect(a.brief.text).toContain("9,90 €");
    expect(a.documents[0]).toMatchObject({ id: "m1_doc_fiche", content: expect.stringContaining("Fiche client") });
    expect(a.roles.find((r) => r.role === "writer")).toMatchObject({ used: 1, limit: WS.quotas.messages_per_agent_per_attempt, owned: true });
    expect(a.artifacts).toHaveLength(1);
    expect(a.artifacts[0]).toMatchObject({ number: 1, author: "player" });
    expect(a.criteria.length).toBeGreaterThan(0);
    expect(a.criteria.every((c) => c.weight > 0)).toBe(true); // grille pondérée figée par la livraison
  });

  it("évaluation : lit report + criteria + evidence", () => {
    const ev = state.attempt!.submission!.evaluation!;
    expect(state.attempt!.submission!.status).toBe("EVALUATED");
    expect(ev).toMatchObject({ score: 100, passed: true, capped_by_essential: false, out_of_scope: false, rubric_version: "m1_v1" });
    expect(ev.client_feedback).toContain("Retour simulé");
    expect(ev.payment).toEqual({ max_reward: 20, target: 20, already_acquired: 0, credited: 20, already_awarded: false });
    expect(ev.criteria_labels.price).toEqual({ label: "Prix exact", essential: true });
    expect(ev.criteria[0]).toMatchObject({ id: "price", rating: 1, evidence: expect.stringContaining("9,90") });
  });

  it("avant livraison, les critères viennent du brief public (sans pondération inventée)", () => {
    const start = attemptStart as unknown as WireDetail;
    const a = mapAttempt(start, { ...WS, attempts: [start.attempt] }, []);
    expect(a.submission).toBeNull();
    expect(a.criteria.length).toBeGreaterThan(0);
    expect(a.criteria.every((c) => c.weight === 0)).toBe(true);
  });

  it("briefToText sans contenu : message explicite", () => {
    expect(briefToText(null)).toContain("pas disponible");
  });

  it("action : statut, débit, étapes", () => {
    const v = mapAction(actionMessage as never);
    expect(v).toMatchObject({ type: "message", status: "SUCCEEDED", role: "writer", debited: 0 });
  });

  it("action de plan à confirmer : plan, coût maximal, coûts par rôle", () => {
    const v = mapAction({
      id: "act_p",
      attempt_id: "att_1",
      type: "lead_plan",
      status: "AWAITING_CONFIRMATION",
      steps: [
        { index: 0, kind: "plan", role: "lead", status: "DONE", cost: 0, task: null, source_ids: [], depends_on: null },
        { index: 1, kind: "delegation", role: "writer", status: "PENDING", cost: 2, task: "Rédiger", source_ids: ["d1"], depends_on: null },
        { index: 2, kind: "delegation", role: "qa", status: "PENDING", cost: 2, task: "Contrôler", source_ids: [], depends_on: 1 },
      ],
      error: null,
      debited: 0,
      pending_cost: 4,
      plan_summary: "Deux étapes",
      answer: null,
      reservations: [],
    });
    expect(v.role).toBe("lead");
    expect(v.plan).toMatchObject({ summary: "Deux étapes", extra_cost_max: 4, roles_cost_max: { writer: 2, qa: 2 } });
    expect(v.plan!.steps).toHaveLength(2);
    expect(v.plan!.steps[1]).toMatchObject({ role: "qa", depends_on: 1 });
  });

  it("brief v2 : diff champ par champ avec motif", () => {
    const d = structuredClone(DETAIL);
    d.brief.version = 2;
    d.brief.changes = [{ version: 2, description: "Le client change de cible.", diff: [{ field: "Public visé", before: "Salariés", after: "Familles" }] }];
    const a = mapAttempt(d, WS, []);
    expect(a.brief.diff).toEqual([
      { type: "remove", text: "Public visé : Salariés" },
      { type: "add", text: "Public visé : Familles" },
    ]);
    expect(a.brief.change_reason).toBe("Le client change de cible.");
  });
});
