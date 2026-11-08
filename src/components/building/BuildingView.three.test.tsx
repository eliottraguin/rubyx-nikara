import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GameState } from "@/lib/api/types";
import type { FloorId } from "@/game/building/floors";
import { BuildingView } from "./BuildingView";

/** La vraie scène exige WebGL : on la remplace par un canvas factice qui émet les mêmes intentions. */
let failScene: (() => void) | null = null;
vi.mock("./ThreeBuilding", () => ({
  default: ({ selected, onSelect, onError }: { selected: FloorId | null; onSelect: (id: FloorId) => void; onError: (m: string) => void }) => {
    failScene = () => onError("webgl");
    return (
      <div data-testid="three-building" data-selected={selected ?? ""}>
        {(["toit", "pub", "courrier", "archives", "accueil"] as const).map((id) => (
          <button key={id} type="button" data-testid={`zone-${id}`} onClick={() => onSelect(id)} />
        ))}
      </div>
    );
  },
}));

const state = {
  contract_version: "0.1",
  session: { id: "s", mode: "beginner", company: "Atelier Test", rules_version: "r" },
  simulated_provider: true,
  balance: { booked: 30, reserved: 0, available: 30 },
  agents: [{ role: "scout", owned: true, price: 0, unlock_condition: "", unlocked: true, teaches: "t" }],
  planets: [],
  attempt: null,
  actions_in_progress: [],
} as unknown as GameState;

const mount = () => render(<BuildingView state={state} busy={false} onBuy={async () => null} onLeave={() => {}} />);

afterEach(() => vi.unstubAllEnvs());

describe("vue Immeuble — scène Three.js (drapeau three)", () => {
  it("sans drapeau : pas de scène, la liste DOM ouvre toujours les panneaux", () => {
    mount();
    expect(screen.queryByTestId("three-building")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Studio pub/ }));
    expect(screen.getByText("Rien n'a été publié ni dépensé.")).toBeInTheDocument();
  });

  it("avec drapeau : un clic sur chaque zone ouvre le panneau correspondant", async () => {
    vi.stubEnv("NEXT_PUBLIC_BUILDING_ENGINE", "three");
    mount();
    const zone = async (id: string) => fireEvent.click(await screen.findByTestId(`zone-${id}`));
    await zone("pub");
    expect(screen.getByText("Rien n'a été publié ni dépensé.")).toBeInTheDocument();
    await zone("courrier");
    expect(screen.getByRole("heading", { name: "Salle du courrier" })).toBeInTheDocument();
    await zone("toit");
    expect(screen.getByTestId("toit-text")).toHaveTextContent("Immeuble niveau 1 sur 10");
    await zone("accueil");
    expect(screen.getByText("Éclaireur")).toBeInTheDocument();
    await zone("archives");
    expect(screen.getByTestId("three-building")).toHaveAttribute("data-selected", "archives");
  });

  it("avec drapeau : échec de la scène -> repli DOM, la liste reste utilisable", async () => {
    vi.stubEnv("NEXT_PUBLIC_BUILDING_ENGINE", "three");
    mount();
    await screen.findByTestId("three-building");
    fireEvent.click(await screen.findByTestId("zone-pub"));
    const { act } = await import("@testing-library/react");
    act(() => failScene?.());
    expect(screen.queryByTestId("three-building")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Salle du courrier/ }));
    expect(screen.getByRole("heading", { name: "Salle du courrier" })).toBeInTheDocument();
  });
});
