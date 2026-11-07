import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConvError, type ConversationDetail, type ConversationsApi } from "@/lib/api/conversations";
import type { GameState } from "@/lib/api/types";
import { CourrierPanel } from "./CourrierPanel";

const state = (mode: string) => ({ session: { id: "s", mode, company: "X", stage: 1, rules_version: "r" } }) as unknown as GameState;

const conv = { id: "c1", prospect_id: "p1", simule: true, statut_prospect: "contacte", entreprise: "Acme", etat: "ouverte", bac: "a_traiter", intention: null, dernier_message_le: null, tours_client: 1, tours_client_max: 6, created_at: "2026-01-01T00:00:00Z" } as const;
const detail = (over: Partial<ConversationDetail> = {}): ConversationDetail => ({
  ...conv,
  messages: [{ id: "m1", seq: 1, sens: "recu", etat: null, text: "<b>Bonjour</b> <script>x</script>", simule: true, draft_version_id: null, created_at: "2026-01-01T00:00:00Z" }],
  synthese: null,
  brouillons: [],
  resultat: null,
  bandeau: null,
  quota_restant: { triage: 5, replier: 5 },
  ...over,
});

function fakeApi(over: Partial<ConversationsApi> = {}): ConversationsApi {
  return {
    list: vi.fn(async () => ({ items: [conv], next_cursor: null, counts: { a_traiter: 1, en_attente: 0, a_ne_plus_contacter: 2, clos: 0 } })),
    create: vi.fn(async () => conv),
    detail: vi.fn(async () => detail()),
    send: vi.fn(async () => ({ conversation_id: "c1", messages: [], statut_prospect: null, etat: "ouverte" as const, resultat: null, client_error: null, simule: true })),
    triage: vi.fn(),
    reply: vi.fn(),
    editDraft: vi.fn(),
    remove: vi.fn(async () => undefined),
    prospects: vi.fn(async () => [{ id: "p1", entreprise: "Acme", statut: "nouveau", simule: true }, { id: "p2", entreprise: "Beta", statut: "nouveau", simule: true }]),
    ...over,
  } as ConversationsApi;
}

describe("CourrierPanel", () => {
  it("affiche les bacs et propose les prospects sans conversation", async () => {
    render(<CourrierPanel state={state("beginner")} api={fakeApi()} />);
    expect(await screen.findByRole("button", { name: "À ne plus contacter : 2" })).toBeTruthy();
    const opts = screen.getAllByRole("option").map((o) => o.textContent);
    expect(opts).toEqual(["Choisir…", "Beta"]);
  });

  it("rend le texte du client en texte, jamais en HTML", async () => {
    const { container } = render(<CourrierPanel state={state("beginner")} api={fakeApi()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Acme" }));
    await screen.findByText(/<script>x<\/script>/);
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
  });

  it("envoie en simulé avec le bandeau, et reprend le brouillon", async () => {
    const api = fakeApi({
      detail: vi.fn(async () => detail({ brouillons: [{ id: "d1", parent_id: null, auteur: "agent", objet: null, corps: "Merci !", a_verifier: [], controles: [], action_id: null, created_at: "2026-01-01T00:00:00Z" }] })),
    });
    render(<CourrierPanel state={state("beginner")} api={api} />);
    fireEvent.click(await screen.findByRole("button", { name: "Acme" }));
    fireEvent.click(await screen.findByRole("button", { name: "Utiliser ce brouillon" }));
    fireEvent.click(screen.getByRole("button", { name: "Envoyer (simulé)" }));
    expect(await screen.findByText("Rien n'est parti : client simulé.")).toBeTruthy();
    expect(api.send).toHaveBeenCalledWith("c1", "Merci !", "d1");
  });

  it("affiche le coût max et le quota, et désactive à 5/5", async () => {
    render(<CourrierPanel state={state("beginner")} api={fakeApi({ detail: vi.fn(async () => detail({ quota_restant: { triage: 0, replier: 3 } })) })} />);
    fireEvent.click(await screen.findByRole("button", { name: "Acme" }));
    expect(await screen.findByText(/Coût maximal 1 \$ · 5\/5 générations utilisées/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Résumer avec le trieur" })).toHaveProperty("disabled", true);
    expect(screen.getByText(/Coût maximal 2 \$ · 2\/5/)).toBeTruthy();
  });

  it("ROLE_LOCKED : message français et lien vers l'Accueil", async () => {
    const api = fakeApi({ triage: vi.fn(async () => { throw new ConvError("ROLE_LOCKED", "x", 409); }) });
    render(<CourrierPanel state={state("beginner")} api={api} />);
    fireEvent.click(await screen.findByRole("button", { name: "Acme" }));
    fireEvent.click(await screen.findByRole("button", { name: "Résumer avec le trieur" }));
    const link = await screen.findByRole("link", { name: /Accueil et garage/ });
    expect(link.getAttribute("href")).toBe("/immeuble?etage=accueil");
  });

  it("désinscrit : envoi impossible", async () => {
    render(<CourrierPanel state={state("beginner")} api={fakeApi({ detail: vi.fn(async () => detail({ etat: "desinscrit" })) })} />);
    fireEvent.click(await screen.findByRole("button", { name: "Acme" }));
    expect((await screen.findByRole("button", { name: "Envoyer (simulé)" })) as HTMLButtonElement).toHaveProperty("disabled", true);
  });

  it("Réel : pas de bouton d'envoi, explication", async () => {
    render(<CourrierPanel state={state("expert")} api={fakeApi()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Acme" }));
    expect(await screen.findByText(/pas encore disponible/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Envoyer/ })).toBeNull();
  });

  it("suppression avec confirmation intégrée", async () => {
    const api = fakeApi();
    render(<CourrierPanel state={state("beginner")} api={api} />);
    fireEvent.click(await screen.findByRole("button", { name: "Acme" }));
    fireEvent.click(await screen.findByRole("button", { name: "Supprimer la conversation" }));
    expect(api.remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Oui, supprimer" }));
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith("c1"));
    expect(await screen.findByRole("heading", { name: "Salle du courrier" })).toBeTruthy();
  });
});
