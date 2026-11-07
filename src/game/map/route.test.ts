import { describe, expect, it } from "vitest";
import { BASE_ANCHOR, landingT, routeControl, routeLength, routePoint, routeTangent } from "./route";

const END = { x: -400, y: -150 };

describe("routes base -> planète", () => {
  it("part de la base et arrive au centre de la planète", () => {
    expect(routePoint(END, 0)).toEqual(BASE_ANCHOR);
    const e = routePoint(END, 1);
    expect(e.x).toBeCloseTo(END.x, 6);
    expect(e.y).toBeCloseTo(END.y, 6);
  });

  it("borne t à [0, 1]", () => {
    expect(routePoint(END, -3)).toEqual(routePoint(END, 0));
    expect(routePoint(END, 9).x).toBeCloseTo(END.x, 6);
  });

  it("la courbe passe au-dessus de la ligne droite (point de contrôle remonté)", () => {
    expect(routeControl(END).y).toBe(Math.min(BASE_ANCHOR.y, END.y) - 70);
  });

  it("la tangente est unitaire et pointe vers la planète", () => {
    for (const t of [0, 0.3, 0.7, 1]) {
      const d = routeTangent(END, t);
      expect(Math.hypot(d.x, d.y)).toBeCloseTo(1, 6);
    }
    expect(routeTangent(END, 0.5).x).toBeLessThan(0);
  });

  it("la longueur est au moins la distance directe", () => {
    expect(routeLength(END)).toBeGreaterThan(Math.hypot(END.x - BASE_ANCHOR.x, END.y - BASE_ANCHOR.y));
  });

  it("l'atterrissage se fait devant la planète, pas à son centre", () => {
    const t = landingT(END, 80);
    expect(t).toBeGreaterThan(0.5);
    expect(t).toBeLessThan(1);
    const p = routePoint(END, t);
    expect(Math.hypot(p.x - END.x, p.y - END.y)).toBeCloseTo(80 * 1.35, 0);
  });
});
