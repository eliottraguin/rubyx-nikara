import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { buildMapViewModel } from "@/game/map/viewmodel";
import { PlanetList } from "./AccessibleLayer";
import { PlanetPanel } from "./PlanetPanel";

describe("couche DOM accessible de la carte", () => {
  const vm = buildMapViewModel(null);

  it("liste les 6 planètes avec leur état en TEXTE et agit comme la carte", () => {
    const onSelect = vi.fn();
    render(<PlanetList vm={vm} selectedId="annuaire" onSelect={onSelect} />);
    const list = screen.getByRole("list", { name: "Planètes" });
    const items = within(list).getAllByRole("button");
    expect(items).toHaveLength(6);
    expect(items[0]).toHaveTextContent("Annuaire");
    expect(items[0]).toHaveTextContent("Disponible");
    expect(items[1]).toHaveTextContent("Verrouillée");
    expect(items[0]).toHaveAttribute("aria-pressed", "true");
    expect(items[1]).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(items[3]!);
    expect(onSelect).toHaveBeenCalledWith("linkedin");
  });

  it("une planète verrouillée explique sa condition en texte, sans bouton d'action", () => {
    const registre = vm.planets.find((p) => p.id === "registre")!;
    render(<PlanetPanel planet={registre} vm={vm} />);
    expect(screen.getByRole("note")).toHaveTextContent("Condition de déblocage");
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("sans sélection, le panneau invite à choisir une planète", () => {
    render(<PlanetPanel planet={null} vm={vm} />);
    expect(screen.getByRole("heading", { name: "Choisissez une planète" })).toBeInTheDocument();
  });
});
