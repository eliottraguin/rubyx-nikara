import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MapBus } from "@/game/map/bus";
import { MapScreen } from "./MapScreen";

/**
 * Reproduit en jsdom (sans navigateur, interdit sur cette machine) les transitions carte -> immeuble / boutique /
 * évaluateur : une scène Three.js factice pose les mêmes points d'attache sur le bus que la vraie (`MapView.ts`),
 * pour mesurer ce qu'une lecture de code ne peut pas garantir : déclenchements réels, minuteurs et écouteurs restants.
 */
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  usePathname: () => "/carte",
  useSearchParams: () => new URLSearchParams(),
}));

const gameCtx = {
  state: null,
  account: null,
  setAccount: vi.fn(),
  farewellRef: { current: null } as { current: (() => Promise<void>) | null },
  live: {},
  connectionLost: false,
  busy: false,
  api: null,
  refresh: vi.fn(async () => undefined),
  setState: vi.fn(),
  mutate: vi.fn(async () => ({ ok: false as const, error: new Error("non utilisé") as never })),
};
vi.mock("@/lib/game-context", () => ({ useGame: () => gameCtx }));

let liveBus: MapBus | null = null;
vi.mock("@/components/map/ThreeMap", () => ({
  // Équivalent du mock de `ThreeBuilding` dans BuildingView.three.test.tsx : pose les points d'attache réels
  // (`enterBuilding`, `enterNav`, `farewell`) sans WebGL, et les retire au démontage comme `MapView.dispose()`.
  default: function MockThreeMap({ bus }: { bus: MapBus }) {
    liveBus = bus;
    bus.enterBuilding = () => Promise.resolve();
    bus.enterNav = () => Promise.resolve();
    bus.farewell = () => Promise.resolve();
    bus.emit("scene:ready");
    return <div data-testid="three-map" />;
  },
}));

beforeEach(() => {
  push.mockClear();
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  liveBus = null;
});

describe("transitions carte -> immeuble / boutique / évaluateur (jsdom, sans navigateur)", () => {
  it("un clic répété sur Garage pendant le zoom ne déclenche qu'une seule navigation", async () => {
    render(<MapScreen />);
    const garage = screen.getByRole("button", { name: /Garage/ });
    fireEvent.click(garage);
    fireEvent.click(garage);
    fireEvent.click(garage);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100);
    });
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("un clic répété sur Boutique pendant le zoom ne déclenche qu'une seule navigation", async () => {
    render(<MapScreen />);
    const boutique = screen.getByRole("button", { name: /Boutique/ });
    fireEvent.click(boutique);
    fireEvent.click(boutique);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100);
    });
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/boutique");
  });

  it("après la navigation, le démontage de l'écran ne laisse ni minuteur ni écouteur fenêtre", async () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const { unmount } = render(<MapScreen />);
    fireEvent.click(screen.getByRole("button", { name: /Évaluateur/ }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100);
    });
    expect(push).toHaveBeenCalledWith("/evaluateur");
    unmount();
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    expect(vi.getTimerCount()).toBe(0);
    const added = addSpy.mock.calls.filter(([type]) => type === "keydown").length;
    const removed = removeSpy.mock.calls.filter(([type]) => type === "keydown").length;
    expect(removed).toBe(added);
  });

  it("la scène n'est montée qu'une seule fois par cycle de vie de l'écran (pas de double instance)", () => {
    let mounts = 0;
    liveBus = null;
    render(<MapScreen />);
    mounts = liveBus ? 1 : 0;
    expect(mounts).toBe(1);
    expect(screen.getAllByTestId("three-map")).toHaveLength(1);
  });
});
