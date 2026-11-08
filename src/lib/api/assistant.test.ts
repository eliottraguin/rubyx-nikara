import { describe, expect, it } from "vitest";
import { adaptPlan, AssistantError, codeFrom, createAssistantApi } from "./assistant";

interface Call { method: string; url: string; headers: Record<string, string>; body: unknown }
function harness(handler: (c: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetch = (async (url: string, init?: RequestInit) => {
    const c: Call = { method: init?.method ?? "GET", url, headers: (init?.headers ?? {}) as Record<string, string>, body: init?.body ? JSON.parse(init.body as string) : undefined };
    calls.push(c);
    return handler(c);
  }) as unknown as typeof globalThis.fetch;
  return { api: createAssistantApi({ fetch, pollMs: 5 }), calls };
}
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

const STEP = { index: 0, type: "ad_campaign", target_id: "c1", target_label: "Lancement", title: "Préparer le kit", who: "Léa", you_get: "Un kit", instruction: "", cost: 5, blocked_reason: null, status: "READY", action_id: null, result_text: null, tries: 0 };
const PLAN = { id: "p1", assistant: "assistant_pub", assistant_label: "Assistant Pub", headline: "Voici", banner: "Rien", summary: "S", status: "PROPOSED", steps: [STEP, { ...STEP, index: 1, blocked_reason: "Pas assez", status: "BLOCKED" }], total_cost: 5, balance: 30, balance_after: 25, plans_left: 4, simule: true, created_at: "2026-11-08T10:00:00Z" };

describe("adaptation des plans", () => {
  it("convertit les champs, statuts inconnus : repli prudent", () => {
    const p = adaptPlan({ ...PLAN, status: "???", steps: [{ ...STEP, status: "???" }, { ...STEP, status: "???", blocked_reason: "x" }] });
    expect(p).toMatchObject({ id: "p1", assistantLabel: "Assistant Pub", totalCost: 5, balanceAfter: 25, plansLeft: 4, simule: true, status: "PROPOSED" });
    expect(p.steps.map((s) => s.status)).toEqual(["READY", "BLOCKED"]);
    expect(p.steps[0]).toMatchObject({ targetLabel: "Lancement", youGet: "Un kit", cost: 5 });
    expect(adaptPlan(null).steps).toEqual([]);
  });
  it("codes d'erreur : contrat puis statut HTTP", () => {
    expect(codeFrom("MESSAGE_LIMIT", 409)).toBe("MESSAGE_LIMIT");
    expect(codeFrom("INVALID_OUTPUT", 422)).toBe("INVALID_OUTPUT");
    expect(codeFrom(undefined, 404)).toBe("NOT_FOUND");
    expect(codeFrom("VALIDATION", 422)).toBe("INVALID_REQUEST");
    expect(codeFrom("??", 500)).toBe("UNKNOWN");
  });
});

describe("client des assistants", () => {
  it("propose : envoie assistant et message, avec une clé d'idempotence", async () => {
    const { api, calls } = harness(() => json(PLAN, 201));
    const p = await api.propose("assistant_pub", "  Prépare ma pub  ");
    expect(p.steps).toHaveLength(2);
    expect(calls[0]).toMatchObject({ method: "POST", url: "/api/assistant/plans", body: { assistant: "assistant_pub", message: "Prépare ma pub" } });
    expect(calls[0]!.headers["Idempotency-Key"]).toBeTruthy();
  });
  it("même intention renvoyée après une coupure : même clé ; après une réponse : nouvelle clé", async () => {
    let fail = true;
    const { api, calls } = harness(() => {
      if (fail) throw new Error("réseau");
      return json(PLAN, 202);
    });
    await expect(api.confirm("p1")).rejects.toMatchObject({ code: "NETWORK" });
    fail = false;
    await api.confirm("p1");
    await api.confirm("p1");
    const keys = calls.filter((c) => c.method === "POST").map((c) => c.headers["Idempotency-Key"]);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[1]);
  });
  it("erreurs : code stable dans AssistantError", async () => {
    const { api } = harness(() => json({ error: { code: "MESSAGE_LIMIT", message: "x" } }, 409));
    const e = await api.propose("assistant_pub", "a").catch((x) => x);
    expect(e).toBeInstanceOf(AssistantError);
    expect(e).toMatchObject({ code: "MESSAGE_LIMIT", status: 409 });
  });
  it("liste, lecture et refus", async () => {
    const { api, calls } = harness((c) => (c.url.endsWith("/plans") ? json({ items: [PLAN], plans_left: 3 }) : json({ ...PLAN, status: "REJECTED" })));
    expect(await api.list()).toMatchObject({ plansLeft: 3, items: [{ id: "p1" }] });
    expect((await api.get("p1")).id).toBe("p1");
    expect((await api.reject("p1")).status).toBe("REJECTED");
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual(["GET /api/assistant/plans", "GET /api/assistant/plans/p1", "POST /api/assistant/plans/p1/reject"]);
  });
  it("confirmation : relit le plan pendant l'exécution puis rend le plan final", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { api, calls } = harness(async (c) => {
      if (c.method === "POST") {
        await gate;
        return json({ ...PLAN, status: "DONE" }, 202);
      }
      return json({ ...PLAN, status: "RUNNING" });
    });
    const seen: string[] = [];
    const p = api.confirm("p1", { onProgress: (x) => { seen.push(x.status); if (seen.length === 2) release(); } });
    const final = await p;
    expect(final.status).toBe("DONE");
    expect(seen.length).toBeGreaterThanOrEqual(2);
    expect(seen.every((s) => s === "RUNNING")).toBe(true);
    expect(calls.some((c) => c.method === "GET" && c.url === "/api/assistant/plans/p1")).toBe(true);
  });
});
