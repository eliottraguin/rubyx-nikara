import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DraftsError, type DraftsApi, type DraftsState, type DraftVersion } from "@/lib/api/drafts";
import type { SearchesApi } from "@/lib/api/searches";
import { DraftsPanel, copyText } from "./DraftsPanel";

const ver = (kind: "profile" | "message", id: string, over: Partial<DraftVersion> = {}): DraftVersion => ({
  id, kind, numero: 1, parentId: null, auteur: "agent", createdAt: "2026-11-08T10:00:00Z", checks: [], resume: kind === "profile" ? `Résumé ${id}` : "", pourquoi: [], accroches: [], aVerifier: [],
  objet: kind === "message" ? `Objet ${id}` : null, corps: kind === "message" ? `Corps ${id}` : "", ...over,
});
const state = (over: Partial<DraftsState> = {}): DraftsState => ({ profile: [], message: [], remaining: { profile: 5, message: 5 }, costs: { profile: 3, message: 2 }, ...over });

function fake(initial: DraftsState = state()) {
  let cur = initial;
  const api = {
    load: vi.fn(async () => cur),
    generate: vi.fn(async (_p: string, kind: "profile" | "message") => {
      const v = ver(kind, `n${cur[kind].length + 1}`);
      cur = { ...cur, [kind]: [...cur[kind], v], remaining: { ...cur.remaining, [kind]: cur.remaining[kind] - 1 } };
      return { state: cur, createdId: v.id, debited: cur.costs[kind] };
    }),
    edit: vi.fn(async (_p: string, kind: "profile" | "message", id: string, c: { corps?: string; objet?: string | null }) => {
      const v = ver(kind, `e${cur[kind].length + 1}`, { auteur: "joueur", parentId: id, ...(c.corps ? { corps: c.corps } : {}) });
      cur = { ...cur, [kind]: [...cur[kind], v] };
      return { state: cur, createdId: v.id };
    }),
    useAsFirstMessage: vi.fn(async () => ({ conversationId: "conv_9" })),
  };
  return api satisfies DraftsApi;
}
const contact: SearchesApi = { run: vi.fn(), contact: vi.fn(async () => ({ conversationId: "conv_1" })) };

async function setup(api: DraftsApi) {
  render(<DraftsPanel prospectId="p1" entreprise="Café" api={api} contact={contact} />);
  await screen.findByRole("button", { name: "Préparer la fiche client" });
}

describe("DraftsPanel", () => {
  it("affiche le bandeau, les coûts et les essais restants", async () => {
    await setup(fake(state({ remaining: { profile: 4, message: 5 } })));
    expect(screen.getByText("Rien n'est envoyé : vous relisez et vous envoyez vous-même.")).toBeInTheDocument();
    expect(screen.getByText(/Coût : 3 \$ par essai réussi/)).toBeInTheDocument();
    expect(screen.getByText(/Coût : 2 \$ par essai réussi/)).toBeInTheDocument();
    expect(screen.getByText(/Il vous reste 4 essais\./)).toBeInTheDocument();
  });

  it("lit les coûts dans les données du serveur, pas dans l'interface", async () => {
    await setup(fake(state({ costs: { profile: 7, message: null } })));
    expect(screen.getByText(/Coût : 7 \$ par essai réussi/)).toBeInTheDocument();
    expect(screen.queryByText(/Coût : 3 \$/)).toBeNull();
    expect(screen.getByText(/Coût indiqué par le serveur/)).toBeInTheDocument();
  });

  it("génère un premier message et l'affiche en texte seul", async () => {
    const api = fake();
    await setup(api);
    fireEvent.click(screen.getByRole("button", { name: "Écrire un premier message" }));
    expect(await screen.findByText("Corps n1")).toBeInTheDocument();
    expect(api.generate).toHaveBeenCalledWith("p1", "message", "");
    expect(screen.getByText("Objet n1")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/Il vous reste 4 essais\./)).toBeInTheDocument());
  });

  it("ne rend jamais de HTML venu du modèle", async () => {
    const evil = ver("message", "x", { corps: "<img src=x onerror=alert(1)><b>gras</b>", objet: "<script>1</script>" });
    await setup(fake(state({ message: [evil] })));
    expect(document.querySelector("img")).toBeNull();
    expect(document.querySelector("script")).toBeNull();
    expect(screen.getByText("<img src=x onerror=alert(1)><b>gras</b>")).toBeInTheDocument();
  });

  it("états des contrôles en phrases simples", async () => {
    const v = ver("profile", "f1", { checks: [{ id: "a", label: "Chaque fait a une source", essentiel: true, reussi: true, detail: null }, { id: "b", label: "Longueurs respectées", essentiel: true, reussi: false, detail: "trop long" }] });
    await setup(fake(state({ profile: [v] })));
    expect(screen.getByText("Réussi")).toBeInTheDocument();
    expect(screen.getByText("À corriger")).toBeInTheDocument();
    expect(screen.getByText(/trop long/)).toBeInTheDocument();
  });

  it.each([
    ["ROLE_LOCKED", /Obtenez 2 clients pour débloquer ce rédacteur/],
    ["INSUFFICIENT_FUNDS", /solde est insuffisant/],
    ["MESSAGE_LIMIT", /5 essais/],
    ["INVALID_OUTPUT", /n'a pas réussi cette fois, rien n'a été dépensé/],
  ])("erreur %s lisible, sans code", async (code, re) => {
    const api = fake();
    api.generate.mockRejectedValueOnce(new DraftsError(code as "ROLE_LOCKED"));
    await setup(api);
    fireEvent.click(screen.getByRole("button", { name: "Préparer la fiche client" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(re);
    expect(alert.textContent).not.toContain(code);
    if (code === "ROLE_LOCKED") expect(within(alert).getByRole("link", { name: /Accueil et garage/ })).toHaveAttribute("href", "/immeuble?etage=accueil");
  });

  it("essais épuisés : le bouton est désactivé, la lecture et la copie restent possibles", async () => {
    await setup(fake(state({ profile: [ver("profile", "f1")], remaining: { profile: 0, message: 5 } })));
    expect(screen.getByRole("button", { name: "Préparer la fiche client" })).toBeDisabled();
    expect(screen.getByText(/Plus d'essai pour ce prospect\./)).toBeInTheDocument();
    expect(screen.getByText("Résumé f1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Copier : la fiche client/ })).toBeEnabled();
  });

  it("édition : crée une nouvelle version écrite par le joueur et garde l'ancienne", async () => {
    const api = fake(state({ message: [ver("message", "m1")] }));
    await setup(api);
    fireEvent.click(screen.getByRole("button", { name: "Modifier (nouvelle version)" }));
    const box = screen.getByLabelText("Message");
    fireEvent.change(box, { target: { value: "Mon texte" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer comme nouvelle version" }));
    await waitFor(() => expect(api.edit).toHaveBeenCalled());
    expect(await screen.findByText("Mon texte")).toBeInTheDocument();
    expect(api.edit).toHaveBeenCalledWith("p1", "message", "m1", { objet: "Objet m1", corps: "Mon texte" });
    expect(screen.getByText(/modifiée par vous/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Version 1 (rédacteur)" }));
    expect(screen.getByText("Corps m1")).toBeInTheDocument();
  });

  it("copie le texte seul", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    await setup(fake(state({ message: [ver("message", "m1")] })));
    fireEvent.click(screen.getByRole("button", { name: /Copier : le message/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("Objet : Objet m1\n\nCorps m1"));
    expect(copyText(ver("profile", "f"))).toBe("Résumé f");
  });

  it("« Utiliser ce message » ouvre la conversation, ou dit que ce n'est pas disponible", async () => {
    const api = fake(state({ message: [ver("message", "m1")] }));
    await setup(api);
    fireEvent.click(screen.getByRole("button", { name: "Utiliser ce message comme premier message" }));
    const link = await screen.findByRole("link", { name: "Ouvrir la conversation" });
    expect(api.useAsFirstMessage).toHaveBeenCalledWith("p1", "m1", "Corps m1");
    expect(link).toHaveAttribute("href", "/immeuble?etage=courrier&conversation=conv_9");

    const api2 = fake(state({ message: [ver("message", "m1")] }));
    api2.useAsFirstMessage.mockRejectedValueOnce(new DraftsError("NOT_IMPLEMENTED"));
    document.body.innerHTML = "";
    render(<DraftsPanel prospectId="p2" entreprise="B" api={api2} contact={contact} />);
    fireEvent.click(await screen.findByRole("button", { name: "Utiliser ce message comme premier message" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("pas encore disponible");
  });

  it("« Contacter » passe par la conversation du prospect", async () => {
    await setup(fake());
    fireEvent.click(screen.getByRole("button", { name: "Contacter ce prospect" }));
    expect(await screen.findByRole("link", { name: "Ouvrir la conversation" })).toHaveAttribute("href", expect.stringContaining("conv_1"));
    expect(contact.contact).toHaveBeenCalledWith("p1");
  });
});
