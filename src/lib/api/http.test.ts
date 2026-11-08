import { describe, expect, it } from "vitest";
import actionMessage from "./__fixtures__/action-message.json";
import wireState from "./__fixtures__/state.json";
import { API_ERROR_CODES, mapAction, mapBuilding, mapErrorCode, mapState, type WireState } from "./adapt";
import { createHttpClient } from "./http";

// Les fixtures sont des réponses de l'API (fournisseur mock) : état et action terminée.
const WS = wireState as unknown as WireState;

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
  return { calls, client: createHttpClient({ fetch: f, storage: null }) };
}

/** Réponses de lecture par défaut : l'état. */
function reads(c: Call): Response | null {
  if (c.method === "GET" && c.url === "/api/state") return json(WS);
  return null;
}

describe("erreurs", () => {
  it("lit { error: { code, message } } et reconnaît les 14 codes de l'API", () => {
    expect(API_ERROR_CODES).toHaveLength(14);
    for (const code of API_ERROR_CODES) expect(mapErrorCode(code), code).not.toBeNull();
    expect(mapErrorCode("INVALID_REQUEST")).toBe("VALIDATION");
    expect(mapErrorCode("SESSION_REQUIRED")).toBe("NO_SESSION");
    expect(mapErrorCode("NOT_FOUND")).toBe("NOT_FOUND");
    expect(mapErrorCode("INCONNU")).toBeNull();
  });

  it("conserve le code stable et le message français du serveur", async () => {
    const { client } = harness((c) => reads(c) ?? json({ error: { code: "INSUFFICIENT_FUNDS", message: "Fonds insuffisants." } }, 409));
    await expect(client.purchaseAgent("triage")).rejects.toMatchObject({ code: "INSUFFICIENT_FUNDS", status: 409, message: "Fonds insuffisants." });
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

  it("purchaseAgent n'envoie que le rôle (jamais de prix) ; plus aucun lancement par mission", async () => {
    const { client, calls } = harness((c) => (c.method === "POST" ? json({ ok: true }, 201) : (reads(c) ?? json({}, 404))));
    await client.purchaseAgent("triage");
    expect("startMission" in client).toBe(false);
    const writes = calls.filter((c) => c.method === "POST");
    expect(writes.map((c) => c.url)).toEqual(["/api/agents/purchase"]);
    expect(writes[0]!.body).toEqual({ role: "triage" });
  });

  it("aucune route de l'ancien parcours n'est exposée par le client", () => {
    const { client } = harness((c) => reads(c) ?? json({}, 404));
    for (const name of ["startMission", "getAttempt", "sendMessage", "submit", "retryMission", "askClarification", "saveArtifact", "listNotebook", "saveNotebook", "demoEvent", "requestHint"]) {
      expect(name in client, name).toBe(false);
    }
  });
});

describe("clé d'idempotence stable par intention", () => {
  const buy = (c: ReturnType<typeof harness>["client"]) => c.purchaseAgent("triage");
  const key = (calls: Call[], i: number) => calls.filter((c) => c.url.endsWith("/purchase"))[i]!.headers["Idempotency-Key"];

  it("réutilise la clé quand la réponse s'est perdue (réseau coupé), puis en change une fois la réponse reçue", async () => {
    let down = true;
    const { client, calls } = harness((c) => {
      if (c.url.endsWith("/purchase")) return down ? "network" : json({}, 201);
      return reads(c) ?? json({}, 404);
    });
    await expect(buy(client)).rejects.toMatchObject({ code: "NETWORK" });
    down = false;
    await buy(client); // « Réessayer » : même intention
    expect(key(calls, 1)).toBe(key(calls, 0));
    await buy(client); // nouvel envoi volontaire après succès : nouvelle intention
    expect(key(calls, 2)).not.toBe(key(calls, 0));
  });

  it("une réponse métier clôt l'intention : le clic suivant part avec une nouvelle clé", async () => {
    let fail = true;
    const { client, calls } = harness((c) => {
      if (c.url.endsWith("/purchase")) return fail ? json({ error: { code: "INSUFFICIENT_FUNDS", message: "Fonds insuffisants." } }, 409) : json({}, 201);
      return reads(c) ?? json({}, 404);
    });
    await expect(buy(client)).rejects.toMatchObject({ code: "INSUFFICIENT_FUNDS" });
    fail = false;
    await buy(client);
    expect(key(calls, 1)).not.toBe(key(calls, 0));
  });

  it("des intentions différentes ont des clés différentes", async () => {
    const { client, calls } = harness((c) => (c.method === "POST" ? json({}, 201) : (reads(c) ?? json({}, 404))));
    await buy(client);
    await client.purchaseAgent("ads");
    expect(key(calls, 0)).not.toBe(key(calls, 1));
  });
});

describe("adaptation de l'état réel", () => {
  const state = mapState(WS, { actions: [] });

  it("GameState : session objet → chaîne, contracts_version, llm.simulated, hangar", () => {
    expect(state.contract_version).toBe(WS.contracts_version);
    expect(state.session).toMatchObject({ company: "Test", mode: "beginner" });
    expect(state.simulated_provider).toBe(true);
    expect(state.balance).toEqual(WS.balance);
    expect(state.agents.map((a) => a.role)).toEqual(["scout", "triage"]);
    expect(state.agents[1]).toMatchObject({ section: "clients", price: 35, unlocked: false, unlock_condition: "Obtenez 2 clients pour débloquer ce trieur" });
    expect(state.planets).toEqual([
      { id: "annuaire", label: "Annuaire", status: "AVAILABLE", reason: null },
      { id: "registre", label: "Registre", status: "LOCKED", reason: "Trouvez d'abord 3 prospects qui correspondent à « Annuaire »." },
    ]);
    expect(state).not.toHaveProperty("missions"); // ancien moteur d'expédition retiré
    expect(state).not.toHaveProperty("attempt");
  });

  it("hangar : condition levée en mode Réel", () => {
    const real = mapState(
      { ...WS, hangar: [{ role: "ads", label: "Directeur de campagne", section: "pub", price: 50, owned: false, unlock_clients: 3, unlock_condition: "Obtenez 3 clients pour débloquer ce directeur de campagne", clients_condition_waived: true, unlocked: true }] },
      { actions: [] },
    );
    expect(real.agents[0]).toMatchObject({ clients_condition_waived: true, unlocked: true });
    expect(real.agents[0]!.unlock_condition).toContain("Mode Réel");
  });

  it("immeuble : niveau 1 par défaut tant que l'API ne le renvoie pas, valeurs du serveur sinon (bornées)", () => {
    expect(state.building).toEqual({ level: 2, clients_obtained: 1, next_level_at: 2 });
    expect(mapBuilding(null)).toEqual({ level: 1, clients_obtained: 0, next_level_at: null });
    expect(mapBuilding({ level: 5, clients_obtained: 7, next_level_at: 11 })).toEqual({ level: 5, clients_obtained: 7, next_level_at: 11 });
    expect(mapBuilding({ level: 99, clients_obtained: -4, next_level_at: 700 })).toEqual({ level: 10, clients_obtained: 0, next_level_at: null });
    expect(mapBuilding({ level: Number.NaN, clients_obtained: 20 })).toMatchObject({ level: 1, clients_obtained: 20 });
  });

  it("action : statut, débit, étapes", () => {
    const v = mapAction(actionMessage as never);
    expect(v).toMatchObject({ type: "prospect_message", status: "SUCCEEDED", role: "replier", debited: 2 });
    expect(v).not.toHaveProperty("attempt_id");
  });
});
