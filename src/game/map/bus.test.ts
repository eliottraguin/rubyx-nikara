import { describe, expect, it, vi } from "vitest";
import { MapBus } from "./bus";
import { buildMapViewModel } from "./viewmodel";

describe("bus React <-> scène", () => {
  it("transmet les événements typés et se désabonne", () => {
    const bus = new MapBus();
    const fn = vi.fn();
    const off = bus.on("planet:select", fn);
    bus.emit("planet:select", "annuaire");
    off();
    bus.emit("planet:select", "registre");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("annuaire");
  });

  it("garde le dernier état pour une scène créée après coup", () => {
    const bus = new MapBus();
    const vm = buildMapViewModel(null);
    bus.setVM(vm);
    bus.setSelected("registre");
    bus.setReducedMotion(true);
    expect(bus.vm).toBe(vm);
    expect(bus.selectedId).toBe("registre");
    expect(bus.reducedMotion).toBe(true);
  });

  it("un abonné qui se désabonne pendant l'émission ne casse pas les autres", () => {
    const bus = new MapBus();
    const calls: string[] = [];
    const off = bus.on("scene:ready", () => {
      calls.push("a");
      off();
    });
    bus.on("scene:ready", () => calls.push("b"));
    bus.emit("scene:ready");
    bus.emit("scene:ready");
    expect(calls).toEqual(["a", "b", "b"]);
  });

  it("clear retire tous les abonnés", () => {
    const bus = new MapBus();
    const fn = vi.fn();
    bus.on("scene:ready", fn);
    bus.clear();
    bus.emit("scene:ready");
    expect(fn).not.toHaveBeenCalled();
  });

  it("relaie le chantier (scène -> React) et « passer » (React -> scène), et garde le décalage du panneau", () => {
    const bus = new MapBus();
    const construction = vi.fn();
    const skip = vi.fn();
    bus.on("building:construction", construction);
    bus.on("building:skip", skip);
    bus.emit("building:construction", true);
    bus.emit("building:skip");
    bus.emit("building:construction", false);
    expect(construction.mock.calls).toEqual([[true], [false]]);
    expect(skip).toHaveBeenCalledTimes(1);
    bus.setInsetRight(448);
    expect(bus.insetRight).toBe(448);
  });
});

describe("MapBus.farewell", () => {
  it("est absent par défaut et posé/retiré par la scène", async () => {
    const bus = new MapBus();
    expect(bus.farewell).toBeNull();
    bus.farewell = () => Promise.resolve();
    await expect(bus.farewell()).resolves.toBeUndefined();
  });
});
