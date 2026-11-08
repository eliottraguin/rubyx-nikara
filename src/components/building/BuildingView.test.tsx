import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { GameState } from "@/lib/api/types";
import { BuildingView } from "./BuildingView";

const state = {
  contract_version: "0.1",
  session: { id: "s", mode: "beginner", company: "Atelier Test",rules_version: "r" },
  simulated_provider: true,
  balance: { booked: 30, reserved: 0, available: 30 },
  agents: [
    { role: "scout", owned: true, price: 0, unlock_condition: "", unlocked: true, teaches: "t" },
    { role: "ads", owned: false, price: 45, unlock_condition: "x", unlocked: false, teaches: "t" },
  ],
  planets: [],
  attempt: null,
  actions_in_progress: [],
} as unknown as GameState;

const setup = (over: Partial<Parameters<typeof BuildingView>[0]> = {}) => {
  const onLeave = vi.fn();
  render(<BuildingView state={state} busy={false} onBuy={async () => null} onLeave={onLeave} {...over} />);
  return { onLeave, list: screen.getByRole("list", { name: "Liste des étages" }) };
};

describe("vue Immeuble", () => {
  it("liste les 5 étages dans l'ordre", () => {
    const { list } = setup();
    const names = within(list).getAllByRole("button").map((b) => b.querySelector("strong")?.textContent);
    expect(names).toEqual(["Toit", "Studio pub", "Salle du courrier", "Archives", "Accueil et garage"]);
  });

  it("flèches haut/bas déplacent la sélection, annoncée en aria-live", () => {
    const { list } = setup();
    const btns = within(list).getAllByRole("button");
    btns[0]!.focus();
    fireEvent.keyDown(list, { key: "ArrowDown" });
    expect(btns[1]).toHaveFocus();
    expect(screen.getByTestId("building-live")).toHaveTextContent("Étage : Studio pub.");
    fireEvent.keyDown(list, { key: "ArrowUp" });
    fireEvent.keyDown(list, { key: "ArrowUp" });
    expect(btns[0]).toHaveFocus();
  });

  it("Entrée ouvre le panneau de l'étage (Salle du courrier : état vide honnête)", () => {
    const onFloorChange = vi.fn();
    const { list } = setup({ onFloorChange });
    const btns = within(list).getAllByRole("button");
    btns[2]!.focus();
    fireEvent.keyDown(list, { key: "Enter" });
    expect(screen.getByRole("heading", { name: "Salle du courrier" })).toBeInTheDocument();
    expect(screen.getByText(/Clients simulés : rien n'est envoyé/)).toBeInTheDocument();
    expect(btns[2]).toHaveAttribute("aria-current", "true");
    expect(onFloorChange).toHaveBeenCalledWith(expect.objectContaining({ id: "courrier" }));
  });

  it("Studio pub : bandeau « Rien n'a été publié ni dépensé »", () => {
    setup({ initialFloor: "pub" });
    expect(screen.getByText("Rien n'a été publié ni dépensé.")).toBeInTheDocument();
  });

  it("Toit : niveau et total gagné ; Accueil : agents du hangar", () => {
    const { list } = setup({ initialFloor: "toit" });
    expect(screen.getByTestId("toit-text")).toHaveTextContent("Immeuble niveau 1 sur 10");
    fireEvent.click(within(list).getByRole("button", { name: /Accueil et garage/ }));
    expect(screen.getByText("Éclaireur")).toBeInTheDocument();
    expect(screen.getByText("Directeur de campagne")).toBeInTheDocument();
  });

  it("Échap revient à la ville, sauf depuis un champ de saisie", () => {
    const { onLeave } = setup();
    act(() => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
    expect(onLeave).toHaveBeenCalledTimes(1);
    const input = document.createElement("input");
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onLeave).toHaveBeenCalledTimes(1);
    input.remove();
  });

  it("Accueil : « Lancer une recherche » avec le choix du lieu, au clavier, sans mot technique", () => {
    setup({ initialFloor: "accueil", state: { ...state, planets: [{ id: "annuaire", label: "Annuaire", status: "AVAILABLE", reason: null }] } });
    expect(screen.getByRole("button", { name: "Lancer une recherche" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Lieu de la recherche/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Une précision/)).toBeInTheDocument();
    expect(screen.getByRole("note", { name: /Voici votre cible/ })).toBeInTheDocument(); // bulle du Tutoriel
  });
});
