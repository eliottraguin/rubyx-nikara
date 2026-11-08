import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AgentView, GameState } from "@/lib/api/types";
import { BasePanel } from "./BasePanel";

const agents: AgentView[] = [
  { role: "scout", label: "Éclaireur", section: "prospection", owned: true, price: 0, unlock_condition: "Disponible dès le départ", unlocked: true, teaches: "t" },
  { role: "triage", label: "Trieur de boîte", section: "clients", owned: false, price: 35, unlock_condition: "Obtenez 2 clients pour débloquer ce trieur", unlocked: false, teaches: "t" },
  { role: "replier", label: "Rédacteur", section: "clients", owned: false, price: 45, unlock_condition: "ok", unlocked: true, teaches: "t" },
  { role: "ads", label: "Directeur de campagne", section: "pub", owned: false, price: 50, unlock_condition: "ok", unlocked: true, teaches: "t" },
];
const mk = (available: number) => ({ balance: { booked: available, reserved: 0, available }, agents }) as unknown as GameState;

describe("Garage : 4 rôles du hangar", () => {
  it("groupe par section et explique chaque état", () => {
    render(<BasePanel state={mk(46)} busy={false} onBuy={async () => null} />);
    for (const t of ["Prospection", "Clients", "Pub"]) expect(screen.getByRole("heading", { name: t })).toBeInTheDocument();
    expect(screen.getByText("Possédé")).toBeInTheDocument();
    expect(screen.getByText("Verrouillé")).toBeInTheDocument();
    expect(screen.getByText("À acheter")).toBeInTheDocument();
    expect(screen.getByText("Fonds insuffisants")).toBeInTheDocument();
    expect(screen.getByText(/Verrouillé : Obtenez 2 clients/)).toBeInTheDocument();
    expect(screen.getByText(/Fonds insuffisants : prix/)).toBeInTheDocument();
  });

  it("achète un rôle débloqué après confirmation", async () => {
    const onBuy = vi.fn(async () => null);
    render(<BasePanel state={mk(100)} busy={false} onBuy={onBuy} />);
    const buttons = screen.getAllByRole("button", { name: "Acheter" });
    expect(buttons).toHaveLength(3);
    expect(buttons[0]).toBeDisabled();
    fireEvent.click(buttons[1]!);
    fireEvent.click(screen.getByRole("button", { name: "Confirmer l'achat" }));
    expect(onBuy).toHaveBeenCalledWith("replier");
  });
});
