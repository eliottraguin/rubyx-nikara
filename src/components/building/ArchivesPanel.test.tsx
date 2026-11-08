/**
 * Migration (GR3-65) : le carnet passe d'un tableau dense à des cartes (vue par défaut), avec une vue liste
 * compacte en option, des puces de filtre, des favoris (réglage local, hors API) et un panneau latéral pour
 * la fiche détaillée. Les requêtes serveur (tri, filtres, recherche, export, purge, patch, suppression) et les
 * règles de fiabilité (texte jamais interprété en HTML, pertinence jamais un nombre) sont inchangées : ce
 * fichier remplace ArchivesPanel.test.tsx en adaptant les requêtes DOM à la nouvelle structure (cartes au lieu
 * de lignes de tableau), sans réduire la couverture.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/types";
import type { Prospect, ProspectDetail, ProspectsClient } from "@/lib/api/prospects";
import { ArchivesPanel } from "./ArchivesPanel";

const mk = (id: string, over: Partial<Prospect> = {}): Prospect => ({
  id, entreprise: `Ent ${id}`, source: "annuaire", source_ref: "r", raisons_fit: ["Proche"], pertinence_etiquette: "correspond", pertinence_citation: "« 6 salariés »", fiabilite: "verifie", simule: false,
  statut: "nouveau", notes: "", collecte_le: "2026-01-02T00:00:00Z", possible_doublon: false, cree_le: "2026-01-03T00:00:00Z", version: 1, ...over,
});
const detail = (p: Prospect): ProspectDetail => ({ ...p, historique_statut: [{ statut: "nouveau", le: "2026-01-03T00:00:00Z" }] });

function fake(items: Prospect[] = [mk("a"), mk("b")]) {
  const c = {
    list: vi.fn(async () => ({ items, next_cursor: null, counts: { nouveau: items.length }, total: items.length })),
    get: vi.fn(async (id: string) => detail(items.find((i) => i.id === id)!)),
    patch: vi.fn(async (id: string, b: { version: number; statut?: string; notes?: string }) => detail({ ...items.find((i) => i.id === id)!, ...b, version: b.version + 1 })),
    remove: vi.fn(async () => undefined),
    purge: vi.fn(async () => undefined),
  };
  return c satisfies ProspectsClient;
}

describe("Archives", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_API_MODE", "mock");
    window.localStorage.clear();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("état vide engageant, bandeau « rien n'a été envoyé » et lien vers la carte", async () => {
    render(<ArchivesPanel client={fake([])} />);
    expect(await screen.findByText(/Envoyez un agent chercher vos premiers clients/)).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent("Rien n'a été envoyé");
    expect(screen.getByRole("link", { name: "Lancer une recherche" })).toHaveAttribute("href", "/carte");
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("vue par défaut = cartes ; bascule vers la liste compacte et son tri accessible", async () => {
    const c = fake();
    render(<ArchivesPanel client={c} />);
    expect(await screen.findAllByRole("button", { name: /^Ouvrir la fiche/ })).toHaveLength(2);
    expect(screen.queryByRole("table")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Liste compacte" }));
    const table = await screen.findByRole("table");
    expect(within(table).getByRole("columnheader", { name: /Ajouté le/ })).toHaveAttribute("aria-sort", "descending");
    fireEvent.click(within(table).getByRole("button", { name: /Entreprise/ }));
    await waitFor(() => expect(c.list).toHaveBeenLastCalledWith(expect.objectContaining({ tri: "entreprise", ordre: "asc" })));
    expect(within(await screen.findByRole("table")).getByRole("columnheader", { name: /Entreprise/ })).toHaveAttribute("aria-sort", "ascending");
  });

  it("compteur de prospects", async () => {
    render(<ArchivesPanel client={fake()} />);
    expect(await screen.findByText("2 prospects")).toBeInTheDocument();
  });

  it("filtre par statut, par lieu et recherche passent au serveur ; l'export reste un lien vers la route serveur", async () => {
    const c = fake();
    render(<ArchivesPanel client={c} />);
    await screen.findAllByRole("button", { name: /^Ouvrir la fiche/ });
    fireEvent.click(screen.getByRole("button", { name: /^Contacté/ }));
    fireEvent.click(screen.getByRole("button", { name: "Registre" }));
    fireEvent.change(screen.getByLabelText("Rechercher dans le carnet"), { target: { value: "bar" } });
    fireEvent.click(screen.getByRole("button", { name: "Rechercher" }));
    await waitFor(() => expect(c.list).toHaveBeenLastCalledWith(expect.objectContaining({ statut: "contacte", source: "registre", q: "bar" })));
    const link = screen.getByRole("link", { name: "Exporter en CSV" });
    expect(link.getAttribute("href")).toBe("/api/prospects/export.csv?tri=date_ajout&ordre=desc&statut=contacte&source=registre&q=bar");
  });

  it("favoris : réglage local (hors API), étoile sur la carte et puce de filtre", async () => {
    const c = fake();
    render(<ArchivesPanel client={c} />);
    await screen.findAllByRole("button", { name: /^Ouvrir la fiche/ });
    fireEvent.click(screen.getByRole("button", { name: "Ajouter Ent a aux favoris" }));
    expect(screen.getByRole("button", { name: "Retirer Ent a des favoris" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Favoris/ }));
    expect(c.list).not.toHaveBeenLastCalledWith(expect.objectContaining({ favoris: expect.anything() }));
    expect(screen.queryByRole("button", { name: "Ouvrir la fiche : Ent b" })).toBeNull();
    expect(screen.getByRole("button", { name: "Ouvrir la fiche : Ent a" })).toBeInTheDocument();
  });

  it("carte : correspondance en texte seul (jamais un nombre) et action rapide « Contacter »", async () => {
    const c = fake([mk("a"), mk("b", { pertinence_etiquette: "hors_cible" })]);
    const { container } = render(<ArchivesPanel client={c} />);
    await screen.findAllByRole("button", { name: /^Ouvrir la fiche/ });
    expect(screen.getByRole("img", { name: /Correspondance avec votre cible : Correspond/ })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Correspondance avec votre cible : Hors cible/ })).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\/ 100/);

    fireEvent.click(screen.getByRole("button", { name: "Marquer Ent a contacté" }));
    await waitFor(() => expect(c.patch).toHaveBeenCalledWith("a", { version: 1, statut: "contacte" }));
  });

  it("fiche prospect en panneau latéral : étiquette et citation de la source en texte seul ; sans citation, message prudent", async () => {
    const c = fake([mk("a", { pertinence_citation: "<b>gras</b>" }), mk("b", { pertinence_citation: null, pertinence_etiquette: "a_verifier" })]);
    const { container } = render(<ArchivesPanel client={c} />);
    fireEvent.click(await screen.findByRole("button", { name: "Ouvrir la fiche : Ent a" }));
    await screen.findByText("Citation de la source");
    expect(screen.getByText("<b>gras</b>")).toBeInTheDocument();
    expect(container.querySelector("b")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Ouvrir la fiche : Ent b" }));
    await screen.findByText(/Pas de citation de la source/);
  });

  it("détail : marquer contacté depuis la fiche envoie la version ; texte API jamais interprété en HTML", async () => {
    const c = fake([mk("a", { entreprise: "<b>Gras</b>", notes: "<img src=x onerror=alert(1)>" })]);
    const { container } = render(<ArchivesPanel client={c} />);
    fireEvent.click(await screen.findByRole("button", { name: /^Ouvrir la fiche/ }));
    await screen.findByText("Pourquoi ce prospect correspond");
    expect(container.querySelector("img")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Marquer contacté" }));
    await waitFor(() => expect(c.patch).toHaveBeenCalledWith("a", { version: 1, statut: "contacte" }));
  });

  it("VERSION_CONFLICT : message, notes conservées, rechargement possible", async () => {
    const c = fake();
    c.patch.mockRejectedValueOnce(new ApiError("VERSION_CONFLICT", "x", 409));
    render(<ArchivesPanel client={c} />);
    fireEvent.click((await screen.findAllByRole("button", { name: /^Ouvrir la fiche/ }))[0]!);
    const notes = await screen.findByLabelText("Notes");
    fireEvent.change(notes, { target: { value: "mon texte" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer les notes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("modifiée ailleurs");
    expect(notes).toHaveValue("mon texte");
    fireEvent.click(screen.getByRole("button", { name: "Recharger la fiche" }));
    await waitFor(() => expect(c.get).toHaveBeenCalledTimes(2));
  });

  it("suppression : confirmation intégrée, rien avant le second clic ; toujours accessible", async () => {
    const c = fake();
    render(<ArchivesPanel client={c} />);
    fireEvent.click((await screen.findAllByRole("button", { name: /^Ouvrir la fiche/ }))[0]!);
    fireEvent.click(await screen.findByRole("button", { name: "Supprimer ce prospect" }));
    expect(c.remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Oui, supprimer" }));
    await waitFor(() => expect(c.remove).toHaveBeenCalledWith("a"));
    expect(await screen.findByText("Prospect supprimé.")).toBeInTheDocument();
  });

  it("vider le carnet : confirmation puis purge, jamais conditionné", async () => {
    const c = fake();
    render(<ArchivesPanel client={c} />);
    await screen.findAllByRole("button", { name: /^Ouvrir la fiche/ });
    fireEvent.click(screen.getByRole("button", { name: "Vider le carnet" }));
    expect(c.purge).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Oui, vider le carnet" }));
    await waitFor(() => expect(c.purge).toHaveBeenCalled());
  });

  it("erreur de chargement : alerte et réessai", async () => {
    const c = fake();
    c.list.mockRejectedValueOnce(new ApiError("NETWORK", "Connexion perdue."));
    render(<ArchivesPanel client={c} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Connexion perdue.");
    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    await screen.findAllByRole("button", { name: /^Ouvrir la fiche/ });
  });
});
