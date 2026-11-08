import { describe, expect, it } from "vitest";
import { FPS_WARMUP_S, createFpsGuard, mapEngine } from "./engine";

describe("mapEngine", () => {
  it("Three.js par défaut, Phaser seulement sur drapeau explicite", () => {
    expect(mapEngine(undefined)).toBe("three");
    expect(mapEngine("")).toBe("three");
    expect(mapEngine("autre")).toBe("three");
    expect(mapEngine("phaser")).toBe("phaser");
  });
});

describe("createFpsGuard", () => {
  const run = (dt: number, seconds: number) => {
    const g = createFpsGuard();
    let slow = false;
    for (let t = 0; t < seconds && !slow; t += dt) slow = g.push(dt);
    return slow;
  };
  it("ne déclenche pas à 60 et 30 images/s", () => {
    expect(run(1 / 60, 30)).toBe(false);
    expect(run(1 / 30, 30)).toBe(false);
  });
  it("déclenche à 5 images/s soutenues, après échauffement et deux fenêtres", () => {
    expect(run(0.2, FPS_WARMUP_S + 3)).toBe(false);
    expect(run(0.2, 20)).toBe(true);
  });
  it("une seule fenêtre lente ne suffit pas", () => {
    const g = createFpsGuard();
    for (let t = 0; t < FPS_WARMUP_S; t += 0.1) g.push(0.1);
    let slow = false;
    for (let t = 0; t < 3; t += 0.2) slow = g.push(0.2) || slow;
    for (let t = 0; t < 6; t += 1 / 60) slow = g.push(1 / 60) || slow;
    expect(slow).toBe(false);
  });
  it("ignore les pauses (onglet masqué)", () => {
    const g = createFpsGuard();
    for (let i = 0; i < 20; i++) expect(g.push(5)).toBe(false);
  });
});
