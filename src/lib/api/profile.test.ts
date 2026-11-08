import { describe, expect, it } from "vitest";
import { adaptFiche, createProfileApi, FICHE_VIDE, fieldErrors, ProfileError } from "./profile";

interface Call { method: string; url: string; headers: Record<string, string>; body: unknown }
function harness(handler: (c: Call) => Response) {
  const calls: Call[] = [];
  const fetch = (async (url: string, init?: RequestInit) => {
    const c: Call = { method: init?.method ?? "GET", url, headers: (init?.headers ?? {}) as Record<string, string>, body: init?.body ? JSON.parse(init.body as string) : undefined };
    calls.push(c);
    return handler(c);
  }) as unknown as typeof globalThis.fetch;
  return { api: createProfileApi({ fetch }), calls };
}
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

const OUT = {
  profile_version: 3, entreprise_nom: "Acme", offre: "Des vélos", besoin: "", cible_secteurs: ["industrie"], cible_zone: ["Lyon"],
  cible_taille: { effectif_min: 5, effectif_max: 50 }, cible_fonctions: [], exclusions: [], ton: "tutoiement", modifie_le: "2026-11-08T10:00:00Z", complete: true,
};

describe("client fiche entreprise et cible", () => {
  it("adapte la fiche de façon tolérante", () => {
    const f = adaptFiche(OUT);
    expect(f).toMatchObject({ version: 3, ton: "tutoiement", complete: true, cible_taille: { effectif_min: 5, effectif_max: 50 } });
    const vide = adaptFiche({ ton: "inconnu", cible_taille: { effectif_min: "x" } });
    expect(vide).toMatchObject({ version: 1, ton: "vouvoiement_formel", cible_taille: null, complete: false, cible_secteurs: [] });
  });

  it("lit la fiche dans GET /api/state", async () => {
    const { api, calls } = harness(() => json({ target_profile: OUT }));
    expect((await api.get()).version).toBe(3);
    expect(calls[0]).toMatchObject({ method: "GET", url: "/api/state" });
  });

  it("PUT : version attendue + fiche, Idempotency-Key, aucun champ d'argent", async () => {
    const { api, calls } = harness(() => json(OUT));
    const f = await api.save({ ...FICHE_VIDE, offre: "Des vélos" }, 2);
    expect(f.version).toBe(3);
    expect(calls[0]!.method).toBe("PUT");
    expect(calls[0]!.url).toBe("/api/profile");
    expect(calls[0]!.headers["Idempotency-Key"]).toBeTruthy();
    expect(calls[0]!.body).toMatchObject({ expected_version: 2, offre: "Des vélos", ton: "vouvoiement_formel" });
    expect(Object.keys(calls[0]!.body as object).sort()).toEqual(["besoin", "cible_fonctions", "cible_secteurs", "cible_taille", "cible_zone", "entreprise_nom", "exclusions", "expected_version", "offre", "ton"]);
  });

  it("409 => VERSION_CONFLICT ; 422 => erreurs par champ ; réseau => NETWORK", async () => {
    const conflict = harness(() => json({ error: { code: "VERSION_CONFLICT", message: "périmée" } }, 409));
    await expect(conflict.api.save(FICHE_VIDE, 1)).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    const bad = harness(() => json({ error: { code: "INVALID_REQUEST", message: "x", details: [{ loc: ["body", "offre"], message: "Champ obligatoire." }, { loc: ["body", "cible_zone"], message: "Au moins un élément est requis." }] } }, 422));
    await expect(bad.api.save(FICHE_VIDE, 1)).rejects.toMatchObject({ code: "INVALID_REQUEST", fields: { offre: "Champ obligatoire.", cible_zone: "Au moins un élément est requis." } });
    const down = createProfileApi({ fetch: (async () => { throw new TypeError("x"); }) as unknown as typeof fetch });
    await expect(down.get()).rejects.toBeInstanceOf(ProfileError);
    await expect(down.get()).rejects.toMatchObject({ code: "NETWORK" });
  });

  it("fieldErrors ignore les formes inattendues", () => {
    expect(fieldErrors(null)).toEqual({});
    expect(fieldErrors([{ loc: ["body", "inconnu"], message: "x" }, 3])).toEqual({});
  });
});
