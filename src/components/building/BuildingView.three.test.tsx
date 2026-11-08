import { act, fireEvent, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GameState } from "@/lib/api/types";
import type { FloorId } from "@/game/building/floors";
import { BuildingView } from "./BuildingView";

/** La vraie scène exige WebGL : on la remplace par un canvas factice qui émet les mêmes intentions. */
let failScene: (() => void) | null = null;
let sceneLeave: () => Promise<void> = () => Promise.resolve();
vi.mock("./ThreeBuilding", () => ({
  default: function MockThreeBuilding({ selected, onSelect, onError, leaveRef }: { selected: FloorId | null; onSelect: (id: FloorId) => void; onError: (m: string) => void; leaveRef?: { current: (() => Promise<void>) | null } }) {
    failScene = () => onError("webgl");
    // Comme le vrai ThreeBuilding : enregistré au montage, remis à null au démontage (échec WebGL -> navigation immédiate).
    useEffect(() => {
      if (leaveRef) leaveRef.current = () => sceneLeave();
      return () => {
        if (leaveRef) leaveRef.current = null;
      };
    }, [leaveRef]);
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

const mount = (onLeave: () => void = () => {}) => render(<BuildingView state={state} busy={false} onBuy={async () => null} onLeave={onLeave} />);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  sceneLeave = () => Promise.resolve();
});

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
    act(() => failScene?.());
    expect(screen.queryByTestId("three-building")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Salle du courrier/ }));
    expect(screen.getByRole("heading", { name: "Salle du courrier" })).toBeInTheDocument();
  });

  it("retour : dézoom de la scène puis navigation, un second déclenchement est ignoré", async () => {
    vi.stubEnv("NEXT_PUBLIC_BUILDING_ENGINE", "three");
    let end!: () => void;
    sceneLeave = vi.fn(() => new Promise<void>((r) => (end = r)));
    const onLeave = vi.fn();
    mount(onLeave);
    await screen.findByTestId("three-building");
    const btn = screen.getByRole("button", { name: /Retour à la ville/ });
    fireEvent.click(btn);
    fireEvent.click(btn);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(sceneLeave).toHaveBeenCalledTimes(1);
    expect(onLeave).not.toHaveBeenCalled();
    expect(screen.getByTestId("building-live")).toHaveTextContent("Retour à la ville.");
    await act(async () => end());
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it("retour : une scène qui ne rend jamais la main ne bloque pas (délai max)", async () => {
    vi.stubEnv("NEXT_PUBLIC_BUILDING_ENGINE", "three");
    sceneLeave = () => new Promise<void>(() => {});
    const onLeave = vi.fn();
    mount(onLeave);
    await screen.findByTestId("three-building");
    vi.useFakeTimers();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onLeave).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it("retour : une scène qui échoue (rejet) navigue quand même", async () => {
    vi.stubEnv("NEXT_PUBLIC_BUILDING_ENGINE", "three");
    sceneLeave = () => Promise.reject(new Error("webgl perdu"));
    const onLeave = vi.fn();
    mount(onLeave);
    await screen.findByTestId("three-building");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Retour à la ville/ }));
    });
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it("retour sans drapeau (DOM) : navigation immédiate, une seule fois", () => {
    const onLeave = vi.fn();
    mount(onLeave);
    const btn = screen.getByRole("button", { name: /Retour à la ville/ });
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it("retour après échec de la scène (sans WebGL) : navigation immédiate", async () => {
    vi.stubEnv("NEXT_PUBLIC_BUILDING_ENGINE", "three");
    const onLeave = vi.fn();
    mount(onLeave);
    await screen.findByTestId("three-building");
    act(() => failScene?.());
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onLeave).toHaveBeenCalledTimes(1);
  });
});
