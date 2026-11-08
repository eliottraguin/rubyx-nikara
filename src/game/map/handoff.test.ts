import { describe, expect, it } from "vitest";
import { HANDOFF_MAX_AGE_MS, setHandoff, takeHandoff } from "./handoff";

describe("handoff caméra", () => {
  it("n'est consommé qu'une fois", () => {
    setHandoff({ from: "login", target: { x: 1, z: 2 }, zoom: 3 }, 1000);
    expect(takeHandoff(1500)).toEqual({ from: "login", target: { x: 1, z: 2 }, zoom: 3 });
    expect(takeHandoff(1500)).toBeNull();
  });
  it("est oublié s'il est trop vieux", () => {
    setHandoff({ from: "building", target: { x: 0, z: 0 }, zoom: 4 }, 1000);
    expect(takeHandoff(1000 + HANDOFF_MAX_AGE_MS + 1)).toBeNull();
  });
  it("null efface le relais en attente", () => {
    setHandoff({ from: "login", target: { x: 0, z: 0 }, zoom: 1 });
    setHandoff(null);
    expect(takeHandoff()).toBeNull();
  });
});
