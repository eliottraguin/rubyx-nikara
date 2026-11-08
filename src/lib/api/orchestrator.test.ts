import { describe, expect, it } from "vitest";
import { adaptInstance, adaptPlan, codeFrom, createOrchestratorApi, OrchestratorError } from "./orchestrator";

interface Call { method: string; url: string; headers: Record<string, string>; body: unknown }
function harness(handler: (c: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetch = (async (url: string, init?: RequestInit) => {
    const c: Call = { method: init?.method ?? "GET", url, headers: (init?.headers ?? {}) as Record<string, string>, body: init?.body ? JSON.parse(init.body as string) : undefined };
    calls.push(c);
    return handler(c);
  }) as unknown as typeof globalThis.fetch;
  return { api: createOrchestratorApi({ fetch, pollMs: 5 }), calls };
}
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

const STEP = { index: 0, type: "scout_search", target_id: "annuaire", target_label: "Bibliothèque publique", instance_id: "agi_scout_01", role: "scout", tier: 1, duration_estimate_s: 35, title: "Chercher des prospects", who: "votre éclaireur", you_get: "des prospects", instruction: "", cost: 0, blocked_reason: null, status: "READY", action_id: null, result_text: null, tries: 0 };
const PLAN = { id: "orp_01", headline: "Voici", banner: "Rien", summary: "S", status: "PROPOSED", steps: [STEP, { ...STEP, index: 1, instance_id: null, blocked_reason: "Pas assez", status: "BLOCKED" }], total_cost: 0, balance: 60, balance_after: 60, plans_left: 4, simule: true, created_at: "2026-11-08T10:00:00Z", evaluation: { score: 80, feedback: "Clair. Précisez un lieu." } };
const INSTANCE = { id: "agi_scout_01", role: "scout", tier: 1, status: "idle", label: null, active_config_id: "acf_1", config: { version: 1, instructions: "Soyez bref.", context_note: null, tools: [], tier_cap: 2 }, price_paid: 0, purchased_at: "2026-11-01T00:00:00Z" };

describe("adaptation des plans et instances", () => {
  it("convertit les champs d'un plan, y compris les nouveaux (instance, rôle, palier, durée, évaluation)", () => {
    const p = adaptPlan(PLAN);
    expect(p).toMatchObject({ id: "orp_01", totalCost: 0, plansLeft: 4, simule: true, evaluation: { score: 80 } });
    expect(p.steps[0]).toMatchObject({ instanceId: "agi_scout_01", role: "scout", tier: 1, durationEstimateS: 35 });
    expect(p.steps[1]).toMatchObject({ status: "BLOCKED", instanceId: null });
    expect(adaptPlan(null).steps).toEqual([]);
  });
  it("aucune consigne : pas d'évaluation", () => {
    expect(adaptPlan({ ...PLAN, evaluation: null }).evaluation).toBeNull();
    expect(adaptPlan({ ...PLAN, evaluation: { score: 10, feedback: "" } }).evaluation).toBeNull();
  });
  it("convertit une instance, repli sur scout/idle pour des valeurs inconnues", () => {
    const i = adaptInstance(INSTANCE);
    expect(i).toMatchObject({ id: "agi_scout_01", role: "scout", tier: 1, status: "idle" });
    expect(i.config).toMatchObject({ version: 1, instructions: "Soyez bref.", tierCap: 2 });
    expect(adaptInstance({ role: "???", status: "???" })).toMatchObject({ role: "scout", status: "idle" });
  });
  it("codes d'erreur : contrat puis statut HTTP", () => {
    expect(codeFrom("INSUFFICIENT_FUNDS", 409)).toBe("INSUFFICIENT_FUNDS");
    expect(codeFrom(undefined, 404)).toBe("NOT_FOUND");
    expect(codeFrom("??", 500)).toBe("UNKNOWN");
  });
});

describe("client de l'orchestrateur", () => {
  it("propose : envoie le message, avec une clé d'idempotence", async () => {
    const { api, calls } = harness(() => json(PLAN, 201));
    const p = await api.propose("  Trouve des clients  ");
    expect(p.steps).toHaveLength(2);
    expect(calls[0]).toMatchObject({ method: "POST", url: "/api/orchestrator/plans", body: { message: "Trouve des clients" } });
    expect(calls[0]!.headers["Idempotency-Key"]).toBeTruthy();
  });
  it("erreurs : code stable dans OrchestratorError", async () => {
    const { api } = harness(() => json({ error: { code: "MESSAGE_LIMIT", message: "x" } }, 409));
    const e = await api.propose("a").catch((x) => x);
    expect(e).toBeInstanceOf(OrchestratorError);
    expect(e).toMatchObject({ code: "MESSAGE_LIMIT", status: 409 });
  });
  it("liste, lecture et refus", async () => {
    const { api, calls } = harness((c) => (c.url.endsWith("/plans") ? json({ items: [PLAN], plans_left: 3 }) : json({ ...PLAN, status: "REJECTED" })));
    expect(await api.list()).toMatchObject({ plansLeft: 3, items: [{ id: "orp_01" }] });
    expect((await api.get("orp_01")).id).toBe("orp_01");
    expect((await api.reject("orp_01")).status).toBe("REJECTED");
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual(["GET /api/orchestrator/plans", "GET /api/orchestrator/plans/orp_01", "POST /api/orchestrator/plans/orp_01/reject"]);
  });
  it("instances : liste les exemplaires possédés", async () => {
    const { api, calls } = harness(() => json({ items: [INSTANCE] }));
    const items = await api.instances();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: "agi_scout_01", role: "scout" });
    expect(calls[0]).toMatchObject({ method: "GET", url: "/api/agents/instances" });
  });
  it("improve : envoie le retour, relit l'instance pour le texte en clair du diff", async () => {
    const improved = { ...INSTANCE, config: { ...INSTANCE.config, version: 2, instructions: "Soyez bref. Et précis." } };
    const { api, calls } = harness((c) => (c.url.includes("/improve") ? json({ instance_id: "agi_scout_01", config_version: 2, price_paid: 60, summary: "Mis à jour." }, 202) : json({ items: [improved] })));
    const res = await api.improve("agi_scout_01", "trop générique");
    expect(res).toMatchObject({ instanceId: "agi_scout_01", configVersion: 2, pricePaid: 60 });
    expect(res.instance.config.instructions).toBe("Soyez bref. Et précis.");
    expect(calls[0]).toMatchObject({ method: "POST", url: "/api/agents/instances/agi_scout_01/improve", body: { feedback: "trop générique" } });
  });
  it("rollback : envoie la version demandée", async () => {
    const { api, calls } = harness(() => json(INSTANCE));
    const inst = await api.rollback("agi_scout_01", 1);
    expect(inst.id).toBe("agi_scout_01");
    expect(calls[0]).toMatchObject({ method: "POST", url: "/api/agents/instances/agi_scout_01/rollback", body: { config_version: 1 } });
  });
});
