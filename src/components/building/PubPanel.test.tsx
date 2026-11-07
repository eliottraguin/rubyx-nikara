import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Campaign, CampaignsClient, CampaignVersion } from "@/lib/api/campaigns";
import { ApiError, type GameState } from "@/lib/api/types";
import { PubPanel } from "./PubPanel";

const state = (owned: boolean) =>
  ({ balance: { booked: 30, reserved: 0, available: 30 }, agents: [{ role: "ads", owned }] }) as unknown as GameState;

const version = (over: Partial<CampaignVersion> = {}): CampaignVersion => ({
  id: "v1",
  numero: 1,
  parent_id: null,
  auteur: "ads",
  kit: {
    positionnement: "<b>Gras</b> positionnement",
    audience_resume: "PME",
    accroches: [{ texte: "Accroche un", fiche: "offre" }],
    textes: [{ format: "sponsored_content", champs: { titre: ["x".repeat(80)] } }],
    brief_visuel: { sujet: "s", style: "st", texte_image: "t", format_dimensions: "1x1", prompt: "p" },
    plan: { calendrier: ["S1"], repartition_budget: ["50 %"], indicateurs: ["clics"] },
    checklist: [{ id: "c1", label: "Relire", essential: true }],
    a_verifier: ["Vérifier le prix"],
  },
  controles: [
    { id: "c1", label: "Limites respectées", essential: true, passed: true, detail: null },
    { id: "c2", label: "Faits de la fiche", essential: false, passed: false, detail: "chiffre inconnu" },
  ],
  consigne: null,
  profile_version: 1,
  simule: true,
  action_id: "act_1",
  cree_le: "2026-11-07T10:00:00Z",
  ...over,
});

const camp = (over: Partial<Campaign> = {}): Campaign => ({
  id: "c1",
  nom: "Lancement",
  objectif: "leads",
  plateforme: "linkedin",
  audience: "PME",
  budget_indicatif: null,
  consigne: null,
  version: 3,
  versions: [version()],
  generations_remaining: 4,
  generation_cost: 5,
  cree_le: "2026-11-07T10:00:00Z",
  modifie_le: "2026-11-07T10:00:00Z",
  ...over,
});

const summary = { id: "c1", nom: "Lancement", objectif: "leads", plateforme: "linkedin", version: 3, versions_count: 1, derniere_version: 1, generations_remaining: 4, modifie_le: "" };

function mk(over: Partial<CampaignsClient> = {}): CampaignsClient {
  return {
    list: vi.fn(async () => ({ items: [summary], total: 1, max: 20, generation_cost: 5 })),
    get: vi.fn(async () => camp()),
    create: vi.fn(async () => camp({ versions: [] })),
    patch: vi.fn(async () => camp()),
    remove: vi.fn(async () => undefined),
    generate: vi.fn(async () => ({ versionId: "v1" })),
    editVersion: vi.fn(async () => version({ id: "v2", numero: 2, auteur: "joueur" })),
    ...over,
  };
}

async function openCampaign(client: CampaignsClient, owned = true) {
  render(<PubPanel state={state(owned)} client={client} />);
  fireEvent.click(await screen.findByRole("button", { name: /Lancement/ }));
  await screen.findByText("Versions du kit");
}

describe("Studio pub", () => {
  it("bandeau permanent, compteur et aucun bouton Publier", async () => {
    render(<PubPanel state={state(true)} client={mk()} />);
    expect(screen.getByText(/Rien n'a été publié ni dépensé/)).toBeTruthy();
    expect(await screen.findByText(/1 campagne sur 20/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /publier/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /publier/i })).toBeNull();
  });

  it("affiche le kit en texte, compteur de limite, contrôles, badge simulé, export serveur", async () => {
    await openCampaign(mk());
    expect(screen.getByText("<b>Gras</b> positionnement")).toBeTruthy();
    expect(screen.getByText(/80 \/ 70 caractères : limite dépassée/)).toBeTruthy();
    expect(screen.getByText("1 réussi, 1 échoué.")).toBeTruthy();
    expect(screen.getByText("Simulé")).toBeTruthy();
    expect(screen.getByText(/chiffre inconnu/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Exporter en Markdown" }).getAttribute("href")).toBe("/api/campaigns/c1/export.md?version=1");
    expect(screen.getByText(/Fiche : offre/)).toBeTruthy();
    expect(screen.getByText("Vérifier le prix")).toBeTruthy();
  });

  it("copie un bloc en texte brut", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    await openCampaign(mk());
    fireEvent.click(screen.getByRole("button", { name: "Copier : Positionnement" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("<b>Gras</b> positionnement"));
  });

  it("annonce coût max et quota avant génération, puis génère avec la consigne", async () => {
    const client = mk();
    const onSpent = vi.fn();
    render(<PubPanel state={state(true)} client={client} onSpent={onSpent} />);
    fireEvent.click(await screen.findByRole("button", { name: /Lancement/ }));
    await screen.findByText("Versions du kit");
    expect(screen.getByText("5 $")).toBeTruthy();
    expect(screen.getByText("2 sur 5")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Consigne facultative"), { target: { value: "ton sobre" } });
    fireEvent.click(screen.getByRole("button", { name: /Générer un kit/ }));
    await waitFor(() => expect(client.generate).toHaveBeenCalledWith("c1", "ton sobre"));
    await waitFor(() => expect(onSpent).toHaveBeenCalled());
  });

  it("bloque la génération au quota (jamais 6) et sans agent ads", async () => {
    await openCampaign(mk({ get: vi.fn(async () => camp({ generations_remaining: 0 })) }));
    expect((screen.getByRole("button", { name: /Générer un kit/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("5 sur 5 : quota atteint")).toBeTruthy();
  });

  it("ROLE_LOCKED : message d'achat à l'Accueil", async () => {
    await openCampaign(mk(), false);
    expect(screen.getByRole("alert").textContent).toMatch(/Accueil et garage/);
    expect((screen.getByRole("button", { name: /Générer un kit/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it.each([
    ["INSUFFICIENT_FUNDS", /Solde insuffisant/],
    ["MESSAGE_LIMIT", /5 générations/],
    ["INVALID_OUTPUT", /contrôles essentiels/],
    ["ROLE_LOCKED", /Accueil et garage/],
  ])("erreur %s en français", async (code, re) => {
    const client = mk({ generate: vi.fn(async () => { throw new ApiError(code as never, "msg", 409); }) });
    await openCampaign(client);
    fireEvent.click(screen.getByRole("button", { name: /Générer un kit/ }));
    expect((await screen.findAllByRole("alert")).some((a) => re.test(a.textContent ?? ""))).toBe(true);
  });

  it("copie éditée : envoie la version de la campagne ; VERSION_CONFLICT recharge", async () => {
    const editVersion = vi.fn(async () => { throw new ApiError("VERSION_CONFLICT", "x", 409); });
    const client = mk({ editVersion });
    await openCampaign(client);
    fireEvent.click(screen.getByRole("button", { name: "Modifier une copie" }));
    fireEvent.change(screen.getByLabelText("Positionnement"), { target: { value: "Nouveau" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer la copie" }));
    await waitFor(() => expect(editVersion).toHaveBeenCalled());
    const call = editVersion.mock.calls[0] as unknown as [string, string, number, { positionnement: string; checklist: unknown[] }];
    expect(call[2]).toBe(3);
    expect(call[3].positionnement).toBe("Nouveau");
    expect(call[3].checklist).toEqual([{ id: "c1" }]);
    expect((await screen.findAllByRole("alert")).some((a) => /changé depuis/.test(a.textContent ?? ""))).toBe(true);
    await waitFor(() => expect((client.get as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(1));
  });

  it("suppression avec confirmation intégrée", async () => {
    const client = mk();
    await openCampaign(client);
    fireEvent.click(screen.getByRole("button", { name: "Supprimer" }));
    expect(client.remove).not.toHaveBeenCalled();
    const dlg = screen.getByRole("alertdialog");
    fireEvent.click(within(dlg).getByRole("button", { name: "Oui, supprimer" }));
    await waitFor(() => expect(client.remove).toHaveBeenCalledWith("c1"));
    expect(await screen.findByRole("button", { name: "Nouvelle campagne" })).toBeTruthy();
  });

  it("création : envoie le formulaire ; maximum atteint désactive le bouton", async () => {
    const client = mk();
    render(<PubPanel state={state(true)} client={client} />);
    fireEvent.click(await screen.findByRole("button", { name: "Nouvelle campagne" }));
    fireEvent.change(screen.getByLabelText("Nom de la campagne"), { target: { value: "Rentrée" } });
    fireEvent.click(screen.getByRole("button", { name: "Créer la campagne" }));
    await waitFor(() => expect(client.create).toHaveBeenCalledWith(expect.objectContaining({ nom: "Rentrée", objectif: "leads", plateforme: "linkedin" })));
  });

  it("maximum de campagnes : création désactivée", async () => {
    render(<PubPanel state={state(true)} client={mk({ list: vi.fn(async () => ({ items: [summary], total: 20, max: 20, generation_cost: 5 })) })} />);
    const b = (await screen.findByRole("button", { name: "Nouvelle campagne" })) as HTMLButtonElement;
    expect(b.disabled).toBe(true);
  });
});
