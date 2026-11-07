import { describe, expect, it } from "vitest";
import { LAYOUT } from "./layout";
import { legMsForPlace, pathPose, tripPath, type AirPath, type GroundPath } from "./paths";
import { LEG_MAX_MS, LEG_MIN_MS } from "./vehicles";

describe("trajets des bots", () => {
  it("à pied, à vélo, en skate : suit le graphe de rues, du seuil du garage à la rue du lieu", () => {
    for (const id of ["annuaire", "registre", "carte-locale", "linkedin", "glassdoor"]) {
      const place = LAYOUT.places.find((p) => p.id === id)!;
      const path = tripPath(LAYOUT, id) as GroundPath;
      expect(path.kind).toBe("ground");
      expect(path.vehicle).toBe(place.vehicle);
      expect(path.points[0]).toEqual(LAYOUT.hq.garageDoor.world);
      expect(path.points.at(-1)).toEqual(LAYOUT.graph.nodes.get(place.streetNode)!.world);
      // Chaque tronçon (après le seuil) est une arête du graphe : le bot ne coupe jamais à travers un îlot.
      const edgeSet = new Set(LAYOUT.streets.edges.flatMap(([a, b]) => [`${a}|${b}`, `${b}|${a}`]));
      const ids = path.points.slice(1).map((pt) => [...LAYOUT.graph.nodes.values()].find((n) => n.world.x === pt.x && n.world.y === pt.y)!.id);
      for (let i = 1; i < ids.length; i++) expect(edgeSet.has(`${ids[i - 1]}|${ids[i]}`), `${id} ${ids[i - 1]}->${ids[i]}`).toBe(true);
      expect(path.length).toBeGreaterThan(100);
    }
  });

  it("même lieu => même trajet (déterministe)", () => {
    expect(tripPath(LAYOUT, "linkedin")).toEqual(tripPath(LAYOUT, "linkedin"));
  });

  it("hélicoptère : décolle du toit de l'immeuble, courbe aérienne, se pose sur l'hélipad du lieu", () => {
    const path = tripPath(LAYOUT, "constellation", 120) as AirPath;
    expect(path.kind).toBe("air");
    expect(path.startAlt).toBe(120);
    const place = LAYOUT.places.find((p) => p.id === "constellation")!;
    expect(path.to).toEqual(place.helipad!.world);
    const a = pathPose(path, 0);
    expect(a.altitude).toBe(120);
    expect(a.ground).toEqual(LAYOUT.heliport.world);
    const mid = pathPose(path, 0.5);
    expect(mid.altitude).toBeGreaterThan(path.arc); // au-dessus de la ligne droite
    expect(mid.pos.y).toBeLessThan(mid.ground.y); // l'ombre est au sol, l'hélico plus haut à l'écran
    const end = pathPose(path, 1);
    expect(end.ground.x).toBeCloseTo(place.helipad!.world.x, 6);
    expect(end.altitude).toBeCloseTo(path.endAlt, 6);
  });

  it("trajet terrestre : pose le long de la polyligne, altitude nulle", () => {
    const path = tripPath(LAYOUT, "annuaire")!;
    const p0 = pathPose(path, 0);
    const p1 = pathPose(path, 1);
    expect(p0.altitude).toBe(0);
    expect(p0.pos).toEqual(LAYOUT.hq.garageDoor.world);
    expect(p1.pos).toEqual(LAYOUT.graph.nodes.get("n43")!.world);
    expect(Math.hypot(p0.heading.x, p0.heading.y)).toBeCloseTo(1, 6);
  });

  it("durée de trajet entre 2 et 4 s pour chaque lieu ; inconnu = indéfini", () => {
    for (const p of LAYOUT.places) {
      const ms = legMsForPlace(LAYOUT, p.id)!;
      expect(ms, p.id).toBeGreaterThanOrEqual(LEG_MIN_MS);
      expect(ms, p.id).toBeLessThanOrEqual(LEG_MAX_MS);
    }
    expect(legMsForPlace(LAYOUT, "nulle-part")).toBeUndefined();
    expect(tripPath(LAYOUT, "nulle-part")).toBeNull();
  });
});
