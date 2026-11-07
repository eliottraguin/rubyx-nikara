import { describe, expect, it } from "vitest";
import { buildLayout, LAYOUT } from "./layout";
import { PLANETS } from "./planets";
import { shortestPath } from "./streets";
import { isVehicleId } from "./vehicles";

describe("disposition cosmétique de la ville (data/map/city_v1.json)", () => {
  it("place les 6 lieux du catalogue, chacun une fois, dans l'ordre de déblocage", () => {
    expect(LAYOUT.places.map((p) => p.id)).toEqual(PLANETS.map((p) => p.id));
    expect(new Set(LAYOUT.places.map((p) => p.id)).size).toBe(6);
  });

  it("donne à chaque lieu un nom, un quartier et un véhicule valide (donnée, jamais le serveur)", () => {
    const veh = Object.fromEntries(LAYOUT.places.map((p) => [p.id, p.vehicle]));
    expect(veh).toEqual({ annuaire: "foot", registre: "bike", "carte-locale": "skate", linkedin: "bike", glassdoor: "skate", constellation: "helicopter" });
    for (const p of LAYOUT.places) {
      expect(isVehicleId(p.vehicle)).toBe(true);
      expect(p.name.length).toBeGreaterThan(2);
      expect(p.district.length).toBeGreaterThan(2);
    }
  });

  it("l'immeuble du joueur est au centre de la ville", () => {
    expect(LAYOUT.hq.grid).toEqual({ x: 0, y: 0 });
    expect(LAYOUT.hq.world).toEqual({ x: 0, y: 0 });
    expect(LAYOUT.heliport.onRoof).toBe(true);
    expect(LAYOUT.bounds.minX).toBeLessThan(0);
    expect(LAYOUT.bounds.maxX).toBeGreaterThan(0);
  });

  it("aucun îlot, lieu ni l'immeuble ne se chevauchent, ni ne mordent sur le parc ou les fleuves", () => {
    const rects = [
      { id: "hq", x: -2, y: -2, w: 4, h: 4 },
      ...LAYOUT.blocks,
      ...LAYOUT.places.map((p) => ({ id: p.id, x: p.grid.x - p.footprint.w / 2, y: p.grid.y - p.footprint.h / 2, w: p.footprint.w, h: p.footprint.h })),
    ];
    const hit = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) expect(hit(rects[i]!, rects[j]!), `${rects[i]!.id} / ${rects[j]!.id}`).toBe(false);
      expect(hit(rects[i]!, LAYOUT.park), `${rects[i]!.id} / parc`).toBe(false);
      LAYOUT.rivers.forEach((r, ri) => expect(hit(rects[i]!, r), `${rects[i]!.id} / fleuve ${ri}`).toBe(false));
    }
  });

  it("le graphe de rues est connexe et relie l'immeuble à chaque lieu", () => {
    const all = [...LAYOUT.graph.nodes.keys()];
    for (const id of all) expect(shortestPath(LAYOUT.graph, LAYOUT.hq.doorNode, id), id).not.toBeNull();
    for (const p of LAYOUT.places) expect(LAYOUT.graph.nodes.has(p.streetNode), p.id).toBe(true);
    expect(LAYOUT.graph.nodes.has(LAYOUT.hq.doorNode)).toBe(true);
  });

  it("aucune rue ne traverse le parc", () => {
    const p = LAYOUT.park;
    for (const n of LAYOUT.streets.nodes) {
      const inside = n.grid.x > p.x && n.grid.x < p.x + p.w && n.grid.y > p.y && n.grid.y < p.y + p.h;
      expect(inside, n.id).toBe(false);
    }
  });

  it("ne contient aucune règle de jeu (prix, gains, quotas, déblocages)", async () => {
    const raw = JSON.stringify((await import("../../../data/map/city_v1.json")).default).toLowerCase();
    for (const word of ["price", "prix", "reward", "gain", "quota", "unlock", "score", "level"]) expect(raw, word).not.toContain(`"${word}`);
  });

  it("ignore un identifiant inconnu du catalogue et un véhicule inconnu devient « à pied »", () => {
    const base = {
      version: 1,
      tile: { w: 64, h: 32 },
      bounds: { minX: -10, minY: -10, maxX: 10, maxY: 10 },
      land: { x: -8, y: -8, w: 16, h: 16 },
      rivers: [],
      shores: [],
      bridges: [],
      park: { id: "p", name: "Parc", x: 0, y: 0, w: 1, h: 1, seed: 1, trees: 0, pond: { x: 0, y: 0, rx: 1, ry: 1 } },
      districts: [],
      street_width: 2,
      streets: { nodes: [{ id: "a", x: 0, y: 0 }], edges: [] as [string, string][] },
      hq: { id: "base", name: "Siège", grid: { x: 0, y: 0 }, footprint: { w: 4, h: 4 }, door_node: "a", garage_door: { x: 2, y: 2 } },
      heliport: { grid: { x: 0, y: 0 }, on_roof: true },
      blocks: [],
    };
    const l = buildLayout({
      ...base,
      places: [
        { id: "annuaire", name: "A", district: "D", vehicle: "jetpack", grid: { x: 1, y: 1 }, footprint: { w: 4, h: 4 }, floors: 3, street_node: "a" },
        { id: "inconnue", name: "X", district: "D", vehicle: "bike", grid: { x: 2, y: 2 }, footprint: { w: 4, h: 4 }, floors: 3, street_node: "a" },
      ],
    });
    expect(l.places.map((p) => p.id)).toEqual(["annuaire"]);
    expect(l.places[0]!.vehicle).toBe("foot");
  });
});
