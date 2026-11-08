/**
 * Décor de la ville Three.js : routes, tirets, parc, étang, rivières, ponts, arbres. AFFICHAGE seulement.
 * Les éléments répétés (routes, tirets, troncs, feuillages) sont des `InstancedMesh` : un appel de dessin chacun.
 * Toutes les ressources passent par `own()` de CityScene (libérées par `dispose()`).
 */
import {
  BoxGeometry,
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  InstancedMesh,
  Matrix4,
  MeshLambertMaterial,
  Mesh,
  PlaneGeometry,
  Quaternion,
  Vector3,
  Color,
  Group,
} from "three";
import type { CityScene } from "@/game/login/CityScene";
import type { MapLayout } from "../layout";
import { dashSegments, roadSegments, treeSpots, type RoadSeg } from "./decor";

const ROAD_Y = 0.02;
const DASH_Y = 0.03;
const FOLIAGE = ["#4f9a5b", "#5fae63", "#3f8a55"];
const UP = new Vector3(0, 1, 0);

function instances(city: CityScene, segs: readonly RoadSeg[], width: number, h: number, y: number, color: string): InstancedMesh | null {
  if (segs.length === 0) return null;
  const mesh = new InstancedMesh(city.own(new BoxGeometry(1, h, 1)), city.own(new MeshLambertMaterial({ color })), segs.length);
  const m = new Matrix4();
  const q = new Quaternion();
  segs.forEach((s, i) => {
    q.setFromAxisAngle(UP, s.angle);
    m.compose(new Vector3(s.cx, y, s.cz), q, new Vector3(s.len, 1, width));
    mesh.setMatrixAt(i, m);
  });
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

function flat(city: CityScene, r: { x: number; y: number; w: number; h: number }, color: string, y: number): Mesh {
  const mesh = new Mesh(city.own(new PlaneGeometry(r.w, r.h)), city.own(new MeshLambertMaterial({ color })));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(r.x + r.w / 2, y, r.y + r.h / 2);
  return mesh;
}

/** Construit le décor sous `city.root` et renvoie le groupe (déjà ajouté à la scène). */
export function buildDecor(city: CityScene, layout: MapLayout): Group {
  const g = new Group();
  g.name = "decor";

  g.add(flat(city, layout.land, "#a9c48f", 0));
  for (const r of layout.shores) g.add(flat(city, r, "#e3d6a6", 0.005));
  for (const r of layout.rivers) g.add(flat(city, r, "#5aa9d6", 0.01));
  for (const b of layout.bridges) {
    const dx = b.to.x - b.from.x;
    const dz = b.to.y - b.from.y;
    const len = Math.hypot(dx, dz);
    if (len === 0) continue;
    const bridge = instances(city, [{ cx: (b.from.x + b.to.x) / 2, cz: (b.from.y + b.to.y) / 2, len, angle: -Math.atan2(dz, dx) }], b.width, 0.06, ROAD_Y + 0.01, "#9a8f80");
    if (bridge) g.add(bridge);
  }

  const park = layout.park;
  g.add(flat(city, park, "#7fb36b", 0.015));
  const pond = new Mesh(city.own(new CircleGeometry(1, 32)), city.own(new MeshLambertMaterial({ color: "#5aa9d6" })));
  pond.rotation.x = -Math.PI / 2;
  pond.scale.set(park.pond.rx, park.pond.ry, 1);
  pond.position.set(park.pond.x, 0.025, park.pond.y);
  g.add(pond);

  const roads = roadSegments(layout);
  const asphalt = instances(city, roads, layout.streetWidth, 0.04, ROAD_Y, "#5b6068");
  if (asphalt) g.add(asphalt);
  const dashes = instances(city, dashSegments(roads), 0.08, 0.02, DASH_Y + 0.02, "#f2e9b8");
  if (dashes) g.add(dashes);

  const trees = treeSpots(park);
  if (trees.length > 0) {
    const trunks = new InstancedMesh(city.own(new CylinderGeometry(0.08, 0.1, 0.5, 6)), city.own(new MeshLambertMaterial({ color: "#7a5a3a" })), trees.length);
    const crowns = new InstancedMesh(city.own(new ConeGeometry(0.4, 1, 8)), city.own(new MeshLambertMaterial({ color: "#ffffff" })), trees.length);
    const m = new Matrix4();
    const c = new Color();
    trees.forEach((t, i) => {
      m.makeScale(t.scale, t.scale, t.scale).setPosition(t.x, 0.25 * t.scale, t.z);
      trunks.setMatrixAt(i, m);
      m.makeScale(t.scale, t.scale, t.scale).setPosition(t.x, (0.5 + 0.5) * t.scale, t.z);
      crowns.setMatrixAt(i, m);
      crowns.setColorAt(i, c.set(FOLIAGE[t.variant % FOLIAGE.length]!));
    });
    trunks.instanceMatrix.needsUpdate = true;
    crowns.instanceMatrix.needsUpdate = true;
    if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;
    g.add(trunks, crowns);
  }

  city.root.add(g);
  return g;
}
