import { describe, expect, it } from "vitest";
import { mulberry32 } from "@/game/login/plan";
import { LAYOUT } from "../../layout";
import { heightScale, planBlock, totalFloors } from "./blocks";
import { CAMERA_DIR } from "./scale";
import { buildLines, carTarget, planCars, planWalkers, rectPoint, stepCar, stepWalker, walkerLength } from "./traffic";

describe("planBlock", () => {
  it("garde chaque immeuble dans son bloc et reste déterministe", () => {
    for (const b of LAYOUT.blocks) {
      const a = planBlock(b);
      expect(JSON.stringify(planBlock(b))).toBe(JSON.stringify(a));
      expect(a.length).toBeGreaterThanOrEqual(1);
      for (const t of a) {
        const w = Math.max(...t.tiers.map((x) => x.w));
        const d = Math.max(...t.tiers.map((x) => x.d));
        expect(t.x - w / 2).toBeGreaterThanOrEqual(b.x - 1e-9);
        expect(t.x + w / 2).toBeLessThanOrEqual(b.x + b.w + 1e-9);
        expect(t.z - d / 2).toBeGreaterThanOrEqual(b.y - 1e-9);
        expect(t.z + d / 2).toBeLessThanOrEqual(b.y + b.h + 1e-9);
        expect(totalFloors(t)).toBeGreaterThanOrEqual(1);
      }
    }
  });
  it("respecte le gabarit de la donnée : le plus haut immeuble du bloc a les étages demandés", () => {
    for (const b of LAYOUT.blocks) expect(Math.max(...planBlock(b).map(totalFloors))).toBe(b.floors);
  });
});

describe("circulation", () => {
  const lines = buildLines(LAYOUT);
  it("construit 8 lignes par axe, les ponts prolongeant les rues de y = ±9", () => {
    expect(lines.filter((l) => l.axis === 0)).toHaveLength(8);
    expect(lines.filter((l) => l.axis === 1)).toHaveLength(8);
    const bridge = lines.find((l) => l.axis === 0 && l.fixed === 9)!;
    expect(bridge.min).toBe(-33);
    expect(bridge.max).toBe(33);
  });
  it("les voitures restent sur leur ligne, sans sortir de la carte, et roulent à droite", () => {
    const rng = mulberry32(5);
    const cars = planCars(lines, rng, 40);
    for (let i = 0; i < 3000; i++) for (const c of cars) stepCar(c, cars, lines, 1 / 30, rng);
    for (const c of cars) {
      const l = lines[c.line]!;
      expect(c.t).toBeGreaterThanOrEqual(l.min - 1e-6);
      expect(c.t).toBeLessThanOrEqual(l.max + 1e-6);
      expect(Math.abs(c.x)).toBeLessThan(35);
      expect(Math.abs(c.z)).toBeLessThan(35);
    }
    const east = carTarget({ line: lines.findIndex((l) => l.axis === 0), t: 0, dir: 1 }, lines);
    const west = carTarget({ line: lines.findIndex((l) => l.axis === 0), t: 0, dir: -1 }, lines);
    expect(east.z).toBeGreaterThan(west.z); // sens opposés : voies opposées
  });
  it("deux voitures qui se suivent ne se chevauchent pas", () => {
    const rng = mulberry32(1);
    const li = lines.findIndex((l) => l.axis === 0 && l.fixed === -3);
    const a = { line: li, t: 0, dir: 1 as const, speed: 4, kind: 0, x: 0, z: 0, yaw: 0 };
    const b = { ...a, t: 1.2, speed: 0.3 };
    for (let i = 0; i < 200; i++) {
      stepCar(a, [a, b], lines, 1 / 30, () => 1);
      b.t += 0.3 / 30;
    }
    void rng;
    expect(b.t - a.t).toBeGreaterThan(0.5);
  });
});

describe("piétons", () => {
  it("restent sur le rectangle de leur trottoir", () => {
    const ws = planWalkers(LAYOUT, mulberry32(3));
    expect(ws.length).toBeGreaterThan(40);
    for (const w of ws) {
      for (let i = 0; i < 50; i++) {
        const p = stepWalker(w, 0.5);
        const onX = Math.abs(Math.abs(p.x - w.cx) - w.hw) < 1e-6 || Math.abs(p.x - w.cx) <= w.hw + 1e-6;
        const onZ = Math.abs(Math.abs(p.z - w.cz) - w.hd) < 1e-6 || Math.abs(p.z - w.cz) <= w.hd + 1e-6;
        expect(onX && onZ).toBe(true);
      }
    }
  });
  it("rectPoint boucle sur le périmètre", () => {
    const w = { cx: 0, cz: 0, hw: 2, hd: 1 };
    const a = rectPoint(w, 0.3);
    const b = rectPoint(w, 0.3 + walkerLength(w));
    expect(b.x).toBeCloseTo(a.x);
    expect(b.z).toBeCloseTo(a.z);
  });
});

describe("heightScale", () => {
  it("garde le siège visible : les voisins entre le siège et la caméra restent bas", () => {
    for (const b of LAYOUT.blocks) {
      const dx = b.x + b.w / 2;
      const dz = b.y + b.h / 2;
      const d = Math.hypot(dx, dz);
      const shown = Math.max(2, Math.round(b.floors * heightScale(b)));
      expect(heightScale(b)).toBeGreaterThan(0);
      expect(heightScale(b)).toBeLessThanOrEqual(1);
      if (d <= 8.7 && dx * CAMERA_DIR.x + dz * CAMERA_DIR.z > -2) expect(shown).toBeLessThanOrEqual(5);
    }
  });
  it("les blocs lointains restent de vrais gratte-ciel (au moins 8 étages ou leur hauteur de donnée)", () => {
    const far = LAYOUT.blocks.filter((b) => Math.hypot(b.x + b.w / 2, b.y + b.h / 2) > 20);
    expect(far.length).toBeGreaterThan(0);
    for (const b of far) expect(Math.round(b.floors * heightScale(b))).toBeGreaterThanOrEqual(Math.min(b.floors, 8));
  });
});
