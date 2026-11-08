import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Trip } from "@/game/map/trips";
import { buildMapViewModel } from "@/game/map/viewmodel";
import { BotList, BuildingStatus, PlanetList } from "./AccessibleLayer";
import { PlanetPanel } from "./PlanetPanel";

describe("couche DOM accessible de la ville", () => {
  const vm = buildMapViewModel(null);

  it("liste les 6 lieux avec leur état et leur trajet en TEXTE et agit comme la carte", () => {
    const onSelect = vi.fn();
    render(<PlanetList vm={vm} selectedId="annuaire" onSelect={onSelect} />);
    const list = screen.getByRole("list", { name: "Lieux" });
    const items = within(list).getAllByRole("button");
    expect(items).toHaveLength(6);
    expect(items[0]).toHaveTextContent("Bibliothèque publique : Annuaire");
    expect(items[0]).toHaveTextContent("trajet à pied");
    expect(items[0]).toHaveTextContent("Disponible");
    expect(items[1]).toHaveTextContent("Verrouillée");
    expect(items[3]).toHaveTextContent("Midtown : LinkedIn");
    expect(items[5]).toHaveTextContent("en hélicoptère");
    expect(items[0]).toHaveAttribute("aria-pressed", "true");
    expect(items[1]).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(items[3]!);
    expect(onSelect).toHaveBeenCalledWith("linkedin");
  });

  it("un lieu verrouillé explique sa condition en texte, sans bouton d'action", () => {
    const registre = vm.planets.find((p) => p.id === "registre")!;
    render(<PlanetPanel planet={registre} vm={vm} />);
    expect(screen.getByRole("note")).toHaveTextContent("Pas encore ouvert");
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("sans sélection, le panneau invite à choisir un lieu", () => {
    render(<PlanetPanel planet={null} vm={vm} />);
    expect(screen.getByRole("heading", { name: "Choisissez un lieu" })).toBeInTheDocument();
  });

  it("l'immeuble : équivalent texte permanent du niveau et bouton « Entrer » au clavier", () => {
    const withBuilding = buildMapViewModel({ session: { company: "Atelier Test" }, balance: { available: 5 }, agents: [], planets: [], simulated_provider: true, building: { level: 5, clients_obtained: 7, next_level_at: 11 } } as never);
    const onEnter = vi.fn();
    render(<BuildingStatus vm={withBuilding} onEnter={onEnter} />);
    expect(screen.getByTestId("building-text").textContent).toBe("Immeuble niveau 5 sur 10, 7 clients obtenus, encore 4 clients pour le niveau suivant");
    fireEvent.click(screen.getByRole("button", { name: "Entrer dans votre immeuble" }));
    expect(onEnter).toHaveBeenCalled();
  });

  it("l'immeuble sans champ serveur affiche le niveau 1 par défaut et le dit", () => {
    render(<BuildingStatus vm={vm} onEnter={() => {}} />);
    expect(screen.getByTestId("building-text")).toHaveTextContent("Immeuble niveau 1 sur 10");
    expect(screen.getByText(/en attente du serveur/)).toBeInTheDocument();
  });

  it("le chantier est annoncé et peut être passé", () => {
    const onSkip = vi.fn();
    render(<BuildingStatus vm={vm} onEnter={() => {}} constructing onSkip={onSkip} />);
    expect(screen.getByRole("status")).toHaveTextContent("Chantier en cours");
    fireEvent.click(screen.getByRole("button", { name: "Passer" }));
    expect(onSkip).toHaveBeenCalled();
  });

  it("les bots : au garage ou en route, état en toutes lettres", () => {
    const t0 = 1_000_000;
    const trip: Trip = { id: "t", planetId: "linkedin", role: "scout", startedAt: t0, doneAt: null, legMs: 2000 };
    render(<BotList vm={vm} ownedRoles={["scout", "ads"]} trips={[trip]} now={t0 + 500} reduced={false} />);
    const items = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(items).toEqual(["Éclaireur : part à vélo vers Midtown", "Directeur de campagne : au garage"]);
  });
});
