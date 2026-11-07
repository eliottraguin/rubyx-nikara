import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/types";
import type { Prospect, ProspectDetail, ProspectsClient } from "@/lib/api/prospects";
import { ArchivesPanel } from "./ArchivesPanel";

const mk = (id: string, over: Partial<Prospect> = {}): Prospect => ({
  id, entreprise: `Ent ${id}`, source: "annuaire", source_ref: "r", raisons_fit: ["Proche"], pertinence: 80, fiabilite: "verifie", simule: false,
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
  it("état vide honnête et bandeau « rien n'a été envoyé »", async () => {
    render(<ArchivesPanel client={fake([])} />);
    expect(await screen.findByText(/Aucun prospect dans le carnet/)).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent("Rien n'a été envoyé");
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("tri : aria-sort et appel serveur avec l'ordre par défaut", async () => {
    const c = fake();
    render(<ArchivesPanel client={c} />);
    const table = await screen.findByRole("table");
    expect(within(table).getByRole("columnheader", { name: /Ajouté le/ })).toHaveAttribute("aria-sort", "descending");
    fireEvent.click(within(table).getByRole("button", { name: /Entreprise/ }));
    await waitFor(() => expect(c.list).toHaveBeenLastCalledWith(expect.objectContaining({ tri: "entreprise", ordre: "asc" })));
    expect(within(await screen.findByRole("table")).getByRole("columnheader", { name: /Entreprise/ })).toHaveAttribute("aria-sort", "ascending");
  });

  it("filtre par statut et recherche passent au serveur ; l'export est un lien vers la route serveur", async () => {
    const c = fake();
    render(<ArchivesPanel client={c} />);
    await screen.findByRole("table");
    fireEvent.click(screen.getByRole("button", { name: /^Contacté/ }));
    fireEvent.change(screen.getByLabelText("Rechercher dans le carnet"), { target: { value: "bar" } });
    fireEvent.click(screen.getByRole("button", { name: "Rechercher" }));
    await waitFor(() => expect(c.list).toHaveBeenLastCalledWith(expect.objectContaining({ statut: "contacte", q: "bar" })));
    const link = screen.getByRole("link", { name: "Exporter en CSV" });
    expect(link.getAttribute("href")).toBe("/api/prospects/export.csv?tri=date_ajout&ordre=desc&statut=contacte&q=bar");
  });

  it("détail : marquer contacté envoie la version ; texte API jamais interprété en HTML", async () => {
    const c = fake([mk("a", { entreprise: "<b>Gras</b>", notes: "<img src=x onerror=alert(1)>" })]);
    const { container } = render(<ArchivesPanel client={c} />);
    fireEvent.click(await screen.findByRole("button", { name: /Ouvrir la fiche/ }));
    await screen.findByText("Pourquoi ce prospect correspond");
    expect(container.querySelector("b, img")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Marquer contacté" }));
    await waitFor(() => expect(c.patch).toHaveBeenCalledWith("a", { version: 1, statut: "contacte" }));
  });

  it("VERSION_CONFLICT : message, notes conservées, rechargement possible", async () => {
    const c = fake();
    c.patch.mockRejectedValueOnce(new ApiError("VERSION_CONFLICT", "x", 409));
    render(<ArchivesPanel client={c} />);
    fireEvent.click((await screen.findAllByRole("button", { name: /Ouvrir la fiche/ }))[0]!);
    const notes = await screen.findByLabelText("Notes");
    fireEvent.change(notes, { target: { value: "mon texte" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer les notes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("modifiée ailleurs");
    expect(notes).toHaveValue("mon texte");
    fireEvent.click(screen.getByRole("button", { name: "Recharger la fiche" }));
    await waitFor(() => expect(c.get).toHaveBeenCalledTimes(2));
  });

  it("suppression : confirmation intégrée, rien avant le second clic", async () => {
    const c = fake();
    render(<ArchivesPanel client={c} />);
    fireEvent.click((await screen.findAllByRole("button", { name: /Ouvrir la fiche/ }))[0]!);
    fireEvent.click(await screen.findByRole("button", { name: "Supprimer ce prospect" }));
    expect(c.remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Oui, supprimer" }));
    await waitFor(() => expect(c.remove).toHaveBeenCalledWith("a"));
    expect(await screen.findByText("Prospect supprimé.")).toBeInTheDocument();
  });

  it("vider le carnet : confirmation puis purge", async () => {
    const c = fake();
    render(<ArchivesPanel client={c} />);
    await screen.findByRole("table");
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
    expect(await screen.findByRole("table")).toBeInTheDocument();
  });
});
