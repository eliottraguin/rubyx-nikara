/**
 * Ville Three.js : terrain en diorama, rues, 36 blocs d'immeubles, parc, rivières et ponts, arbres, lampadaires,
 * circulation, piétons, bateaux et nuages. Lit `LAYOUT` (data/map/city_v1.json) et dessine tout dans une `CityScene`.
 *
 * AFFICHAGE seulement : aucune règle de jeu, aucun appel réseau, aucun texte du modèle. Les éléments statiques sont
 * fusionnés par matériau (quelques dessins au lieu de centaines) ; les éléments mobiles sont des instances.
 */
import {
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshLambertMaterial,
  RepeatWrapping,
  SphereGeometry,
  SRGBColorSpace,
  type Material,
  type Object3D,
} from "three";
import { mulberry32 } from "@/game/login/plan";
import type { CityScene } from "@/game/login/CityScene";
import type { MapLayout } from "../../layout";
import { heightScale, planBlock } from "./blocks";
import { InstanceGroup, mat4, StaticBatch, type Part } from "./geo";
import { Kit } from "./kit";
import { Landmarks } from "./landmarks";
import { CURB } from "./scale";
import { addTower } from "./tower";
import { buildLines, planCars, planWalkers, stepCar, stepWalker, type Car, type Line, type Walker } from "./traffic";

export interface WorldOptions {
  seed?: number;
  /** Nombre de nuages au-dessus de la ville (fond de connexion). */
  clouds?: number;
  /** Épingles, anneaux d'état et étiquettes des lieux (vue de jeu). */
  pins?: boolean;
  cars?: number;
}

const COL = {
  asphalt: "#4d5058",
  soil: "#8e7556",
  quay: "#5e6670",
  curb: "#d9d3c4",
  plaza: "#cfc7b2",
  grass: "#8fc276",
  park: "#78bb68",
  path: "#e8dfc4",
  sand: "#eadcae",
  dash: "#efe6bd",
  zebra: "#f2efe4",
  waterDeep: "#2f7f9c",
  rail: "#e9e4d6",
  bridge: "#6c717a",
} as const;

/** Les voitures et les personnes sont agrandies : à l'échelle de la ville elles seraient des points. */
const CAR_SCALE = 1.35;
const PERSON_SCALE = 1.75;
const SHIRTS = ["#e0463c", "#3b78d8", "#f5c518", "#4caf6a", "#9b59b6", "#f4f4f0", "#2b2f38", "#e58a2c"];
const SKINS = ["#f1c9a5", "#d9a37a", "#9a6a4a", "#6b4630"];
const CAR_COLORS = ["#e0463c", "#3b78d8", "#f2f2f2", "#2b2f38", "#4caf6a", "#e58a2c", "#9aa3ad", "#7a5aa8"];

function waterTexture(): CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  if (!g) return null;
  g.fillStyle = "#4db4d6";
  g.fillRect(0, 0, 256, 256);
  const rng = mulberry32(9);
  for (let i = 0; i < 46; i++) {
    const x = rng() * 256;
    const y = rng() * 256;
    g.strokeStyle = `rgba(255,255,255,${0.12 + rng() * 0.18})`;
    g.lineWidth = 2 + rng() * 2;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + 14, y - 5, x + 30 + rng() * 14, y);
    g.stroke();
  }
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.colorSpace = SRGBColorSpace;
  return t;
}

export class CityWorld {
  readonly root = new Group();
  readonly kit: Kit;
  readonly landmarks: Landmarks;
  /** Immeubles et décor statiques (hors lieux) : pour le picking de décor éventuel. */
  readonly staticMeshes: Object3D[] = [];
  private readonly rng: () => number;
  private time = 0;
  private lines: Line[] = [];
  private cars: Car[] = [];
  private carGroups: { group: InstanceGroup; cars: Car[] }[] = [];
  private walkers: Walker[] = [];
  private people: { body: InstanceGroup; head: InstanceGroup } | null = null;
  private boats: { group: InstanceGroup; x: number; z: number; dir: 1 | -1; speed: number }[] = [];
  private readonly waterTex: CanvasTexture[] = [];
  private clouds: { g: Group; speed: number }[] = [];
  private readonly off: () => void;

  constructor(
    private readonly city: CityScene,
    private readonly layout: MapLayout,
    private readonly opts: WorldOptions = {},
  ) {
    this.kit = new Kit(city);
    this.rng = mulberry32(opts.seed ?? 2024);
    city.root.add(this.root);
    this.buildTerrain();
    this.buildBlocks();
    this.buildTraffic();
    this.buildBoats();
    this.landmarks = new Landmarks({ city, kit: this.kit, layout, parent: this.root, pins: opts.pins ?? true });
    if (opts.clouds) this.buildClouds(opts.clouds);
    const land = layout.land;
    city.enableShadows({ bounds: { x: land.x, z: land.y, w: land.w, h: land.h }, mapSize: 2048 });
    this.off = city.addTick((dt) => this.tick(dt));
    this.tick(0);
    city.refreshShadows();
  }

  /** À rappeler quand un lieu ou l'immeuble du joueur a changé (recalcule les ombres, redessine). */
  refresh(): void {
    this.city.refreshShadows();
    this.city.render();
  }

  // --- Terrain ---------------------------------------------------------------------------------------------------

  private slab(x: number, z: number, w: number, d: number, yTop: number, depth: number, top: Material | Material[], side: Material): Mesh {
    const g = this.city.own(new BoxGeometry(w, depth, d));
    const mats = Array.isArray(top) ? top : [side, side, top, side, side, side];
    const m = new Mesh(g, mats);
    m.position.set(x, yTop - depth / 2, z);
    m.receiveShadow = true;
    this.root.add(m);
    return m;
  }

  private buildTerrain(): void {
    const { kit, layout } = this;
    const L = layout.land;
    const asphalt = kit.lambert(COL.asphalt);
    const base = waterTexture();
    for (const r of layout.rivers) {
      let tex: CanvasTexture | null = null;
      if (base) {
        tex = base.clone();
        tex.needsUpdate = true;
        tex.repeat.set(r.w / 6, r.h / 6);
        this.city.own(tex);
        this.waterTex.push(tex);
      }
      const t = this.city.own(new MeshLambertMaterial(tex ? { map: tex } : { color: COL.waterDeep }));
      this.slab(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h, -0.4, 3, t, kit.lambert(COL.waterDeep));
    }
    base?.dispose();
    this.slab(L.x + L.w / 2, L.y + L.h / 2, L.w, L.h, 0, 3, asphalt, kit.lambert(COL.quay));
    for (const s of layout.shores) this.slab(s.x + s.w / 2, s.y + s.h / 2, s.w, s.h, 0, 3, kit.lambert(COL.grass), kit.lambert(COL.soil));

    const b = new StaticBatch();
    const curb = kit.lambert(COL.curb);
    const box = (w: number, h: number, d: number) => new BoxGeometry(w, h, d);
    // quai : bandes de trottoir en bordure de terre ferme, interrompues par les ponts
    const gap = (zc: number) => [zc - 1.2, zc + 1.2];
    const cuts = layout.bridges.map((br) => br.from.y).filter((v, i, a) => a.indexOf(v) === i).sort((p, q) => p - q);
    const segs: [number, number][] = [];
    let cur = L.y;
    for (const c of cuts) {
      const [a, e] = gap(c);
      segs.push([cur, a!]);
      cur = e!;
    }
    segs.push([cur, L.y + L.h]);
    for (const [a, e] of segs) {
      for (const side of [L.x + 1, L.x + L.w - 1]) b.add(box(2, CURB, e - a), curb, mat4(side, CURB / 2, (a + e) / 2));
    }
    for (const side of [L.y + 1, L.y + L.h - 1]) b.add(box(L.w - 4, CURB, 2), curb, mat4(L.x + L.w / 2, CURB / 2, side));

    // trottoirs de chaque case (4×4) ; le parc a son propre sol
    const P = layout.park;
    const inPark = (cx: number, cz: number) => cx > P.x && cx < P.x + P.w && cz > P.y && cz < P.y + P.h;
    for (let x = -20; x <= 16; x += 6) {
      for (let z = -20; z <= 16; z += 6) {
        if (inPark(x + 2, z + 2)) continue;
        b.add(box(4, CURB, 4), curb, mat4(x + 2, CURB / 2, z + 2));
        b.add(box(3.4, 0.02, 3.4), kit.lambert(COL.plaza), mat4(x + 2, CURB + 0.01, z + 2));
      }
    }
    // parc : pelouse, allées, étang, bancs
    const px = P.x + P.w / 2;
    const pz = P.y + P.h / 2;
    b.add(box(P.w, CURB, P.h), curb, mat4(px, CURB / 2, pz));
    b.add(box(P.w - 0.5, 0.04, P.h - 0.5), kit.lambert(COL.park), mat4(px, CURB + 0.02, pz));
    const path = kit.lambert(COL.path);
    b.add(box(P.w - 0.6, 0.03, 0.9), path, mat4(px, CURB + 0.05, pz));
    b.add(box(0.9, 0.03, P.h - 0.6), path, mat4(px, CURB + 0.055, pz));
    const lw = P.w / 2 - 1.2;
    const lh = P.h / 2 - 1.2;
    for (const [w, d, ox, oz] of [[2 * lw, 0.5, 0, -lh], [2 * lw, 0.5, 0, lh], [0.5, 2 * lh, -lw, 0], [0.5, 2 * lh, lw, 0]] as const) b.add(box(w, 0.03, d), path, mat4(px + ox, CURB + 0.06, pz + oz));
    const pond = P.pond;
    const pondTop = this.city.own(new CylinderGeometry(1, 1, 0.06, 36));
    b.add(new CylinderGeometry(1.1, 1.1, 0.07, 36), kit.lambert(COL.sand), mat4(pond.x, CURB + 0.045, pond.y, pond.rx + 0.3, 1, pond.ry + 0.3));
    b.add(pondTop, kit.lambert("#4db4d6"), mat4(pond.x, CURB + 0.085, pond.y, pond.rx, 1, pond.ry));
    const bench = kit.lambert("#8a5f3c");
    for (const [bx, bz, r] of [[-5, -13.2, 0], [5, -13.2, 0], [-5, -16.8, 0], [5, -16.8, 0], [0, -11.2, 1.57], [0, -18.8, 1.57]] as const) {
      b.add(box(0.7, 0.1, 0.22), bench, mat4(bx, CURB + 0.28, bz, 1, 1, 1, r));
      b.add(box(0.7, 0.2, 0.05), bench, mat4(bx, CURB + 0.42, bz - 0.1, 1, 1, 1, r));
    }

    // marquage : passages piétons aux carrefours
    this.lines = buildLines(layout);
    const zebra = kit.lambert(COL.zebra);
    for (const l of this.lines) {
      if (l.axis !== 0) continue;
      for (const j of l.junctions) {
        const cx = j.at;
        const cz = l.fixed;
        for (const arm of [-1, 1]) {
          for (let i = -3; i <= 3; i++) {
            b.add(box(0.28, 0.012, 0.15), zebra, mat4(cx + arm * 1.3, 0.008, cz + i * 0.24));
            b.add(box(0.15, 0.012, 0.28), zebra, mat4(cx + i * 0.24, 0.008, cz + arm * 1.3));
          }
        }
      }
    }
    // ponts : tablier, garde-corps, piles
    for (const br of layout.bridges) {
      const len = Math.abs(br.to.x - br.from.x) || Math.abs(br.to.y - br.from.y);
      const horiz = br.from.y === br.to.y;
      const mx = (br.from.x + br.to.x) / 2;
      const mz = (br.from.y + br.to.y) / 2;
      const w = br.width + 0.4;
      const dims = (l: number, t: number, h: number): [number, number, number] => (horiz ? [l, h, t] : [t, h, l]);
      b.add(box(...dims(len, w, 0.3)), kit.lambert(COL.bridge), mat4(mx, -0.15, mz));
      for (const s of [-1, 1]) {
        const off = (w / 2 - 0.05) * s;
        b.add(box(...dims(len, 0.08, 0.28)), kit.lambert(COL.rail), horiz ? mat4(mx, 0.14, mz + off) : mat4(mx + off, 0.14, mz));
      }
      for (const s of [-0.3, 0.3]) {
        const px2 = horiz ? mx + len * s : mx;
        const pz2 = horiz ? mz : mz + len * s;
        b.add(new CylinderGeometry(0.28, 0.34, 3, 10), kit.lambert(COL.bridge), mat4(px2, -1.6, pz2));
      }
    }
    this.staticMeshes.push(...b.build(this.root, (o) => this.city.own(o), { cast: false, receive: true }, Mesh));
    this.buildMarkings();
  }

  /** Pointillés d'axe de chaussée (instances). */
  private buildMarkings(): void {
    const dashes: [number, number, number][] = [];
    for (const l of this.lines) {
      const stops = l.junctions.map((j) => j.at);
      for (let t = l.min + 0.6; t < l.max - 0.4; t += 0.9) {
        if (stops.some((s) => Math.abs(t - s) < 1.55)) continue;
        dashes.push(l.axis === 0 ? [t, l.fixed, 0] : [l.fixed, t, 1]);
      }
    }
    const g = new InstanceGroup([{ geo: new BoxGeometry(0.5, 0.012, 0.07), mat: this.kit.lambert(COL.dash) }], dashes.length, this.root, { receive: true });
    this.city.own(g.meshes[0]!.geometry);
    dashes.forEach(([x, z, vert], i) => g.set(i, x, 0.008, z, vert ? Math.PI / 2 : 0));
    g.commit();
  }

  // --- Immeubles, arbres, lampadaires ------------------------------------------------------------------------------

  private buildBlocks(): void {
    const { kit, layout } = this;
    const b = new StaticBatch();
    for (const block of layout.blocks) for (const spec of planBlock(block, this.opts.seed ?? 0, heightScale(block, layout.hq.grid))) addTower(b, kit, spec);
    this.staticMeshes.push(...b.build(this.root, (o) => this.city.own(o), { cast: true, receive: true }, Mesh));

    // arbres : pelouse du parc, coins de trottoir, berges
    const rng = this.rng;
    const trees: { x: number; z: number; s: number }[] = [];
    const P = layout.park;
    const pond = P.pond;
    let guard = 0;
    while (trees.length < P.trees && guard++ < 2000) {
      const x = P.x + 0.9 + rng() * (P.w - 1.8);
      const z = P.y + 0.9 + rng() * (P.h - 1.8);
      if (Math.abs(x - (P.x + P.w / 2)) < 0.7 || Math.abs(z - (P.y + P.h / 2)) < 0.7) continue; // allées
      if (((x - pond.x) / (pond.rx + 0.7)) ** 2 + ((z - pond.y) / (pond.ry + 0.7)) ** 2 < 1) continue;
      trees.push({ x, z, s: 0.8 + rng() * 0.7 });
    }
    for (let x = -20; x <= 16; x += 6) {
      for (let z = -20; z <= 16; z += 6) {
        if (x + 2 > P.x && x + 2 < P.x + P.w && z + 2 > P.y && z + 2 < P.y + P.h) continue;
        for (const [cx, cz] of [[-1.82, -1.82], [1.82, -1.82], [-1.82, 1.82], [1.82, 1.82]] as const) if (rng() < 0.35) trees.push({ x: x + 2 + cx, z: z + 2 + cz, s: 0.5 + rng() * 0.3 });
      }
    }
    for (const s of layout.shores) {
      for (let i = 0; i < 18; i++) trees.push({ x: s.x + 0.8 + rng() * (s.w - 1.6), z: s.y + 1 + rng() * (s.h - 2), s: 0.9 + rng() * 0.9 });
    }
    const white = kit.lambert("#ffffff", { flat: true });
    const treeG = new InstanceGroup(
      [
        { geo: new CylinderGeometry(0.05, 0.08, 0.5, 6), mat: kit.lambert("#7a5a3c"), local: mat4(0, 0.25, 0) },
        { geo: new IcosahedronGeometry(0.4, 0), mat: white, local: mat4(0, 0.78, 0), tint: true },
        { geo: new IcosahedronGeometry(0.3, 0), mat: white, local: mat4(0.06, 1.1, 0.04), tint: true },
      ],
      trees.length,
      this.root,
      { cast: true },
    );
    for (const p of treeG.meshes) this.city.own(p.geometry);
    const greens = ["#5aa84c", "#6cbb58", "#4a9a47", "#7bc462", "#8ac96a"].map((c) => new Color(c));
    trees.forEach((t, i) => treeG.set(i, t.x, CURB, t.z, rng() * 6.28, t.s, greens[Math.floor(rng() * greens.length)]));
    treeG.commit();

    const lamps: [number, number][] = [];
    for (let x = -20; x <= 16; x += 6) {
      for (let z = -20; z <= 16; z += 6) {
        if (x + 2 > P.x && x + 2 < P.x + P.w && z + 2 > P.y && z + 2 < P.y + P.h) continue;
        lamps.push([x + 0.12, z + 0.12], [x + 3.88, z + 3.88]);
      }
    }
    const lampG = new InstanceGroup(
      [
        { geo: new CylinderGeometry(0.02, 0.03, 1.1, 6), mat: kit.lambert("#59606a"), local: mat4(0, 0.55, 0) },
        { geo: new SphereGeometry(0.07, 8, 6), mat: kit.basic("#fff0b8"), local: mat4(0, 1.14, 0) },
      ],
      lamps.length,
      this.root,
    );
    for (const p of lampG.meshes) this.city.own(p.geometry);
    lamps.forEach(([x, z], i) => lampG.set(i, x, CURB, z));
    lampG.commit();
  }

  // --- Circulation, piétons, bateaux -----------------------------------------------------------------------------

  private buildTraffic(): void {
    const { kit } = this;
    const rng = this.rng;
    this.cars = planCars(this.lines, rng, this.opts.cars ?? 56);
    const glass = kit.lambert("#2d3a48");
    const tyre = kit.lambert("#1c1d20");
    const white = kit.lambert("#ffffff");
    const wheelGeo = new CylinderGeometry(0.085, 0.085, 0.06, 10);
    wheelGeo.rotateX(Math.PI / 2);
    const wheels = (l: number, w: number) => [
      [l * 0.3, w / 2],
      [l * 0.3, -w / 2],
      [-l * 0.3, w / 2],
      [-l * 0.3, -w / 2],
    ].map(([x, z]) => ({ geo: wheelGeo, mat: tyre, local: mat4(x, 0.085, z) }));
    const model = (kind: number) => {
      const dims: [number, number, number][] = [[0.86, 0.46, 0.2], [0.86, 0.46, 0.2], [1.0, 0.5, 0.42], [1.9, 0.54, 0.5]];
      const [L, W, H] = dims[kind]!;
      const parts: Part[] = [{ geo: new BoxGeometry(L, H, W), mat: white, local: mat4(0, 0.1 + H / 2, 0), tint: true }, ...wheels(L, W)];
      if (kind <= 1) parts.push({ geo: new BoxGeometry(L * 0.5, 0.16, W * 0.86), mat: glass, local: mat4(-0.04, 0.1 + H + 0.08, 0) });
      if (kind === 1) parts.push({ geo: new BoxGeometry(0.16, 0.06, 0.1), mat: kit.basic("#fff0a0"), local: mat4(-0.04, 0.1 + H + 0.19, 0) });
      if (kind === 3) parts.push({ geo: new BoxGeometry(L * 0.92, 0.14, W * 1.02), mat: glass, local: mat4(0, 0.1 + H * 0.62, 0) });
      return parts;
    };
    for (let kind = 0; kind < 4; kind++) {
      const list = this.cars.filter((c) => c.kind === kind);
      if (!list.length) continue;
      const group = new InstanceGroup(model(kind), list.length, this.root, { cast: false });
      for (const m of group.meshes) this.city.own(m.geometry);
      const col = (i: number) => (kind === 1 ? "#f3c623" : kind === 3 ? (i % 2 ? "#3b8f6a" : "#d9573b") : kind === 2 ? "#f4f4f0" : CAR_COLORS[(i * 3 + 1) % CAR_COLORS.length]!);
      list.forEach((_, i) => group.set(i, 0, 0, 0, 0, CAR_SCALE, col(i)));
      group.commit();
      this.carGroups.push({ group, cars: list });
    }

    this.walkers = planWalkers(this.layout, rng, 3);
    const body = new InstanceGroup(
      [
        { geo: new CylinderGeometry(0.07, 0.085, 0.3, 8), mat: kit.lambert("#ffffff"), local: mat4(0, 0.33, 0), tint: true },
        { geo: new BoxGeometry(0.05, 0.2, 0.06), mat: kit.lambert("#33363d"), local: mat4(0, 0.1, 0.035) },
        { geo: new BoxGeometry(0.05, 0.2, 0.06), mat: kit.lambert("#33363d"), local: mat4(0, 0.1, -0.035) },
      ],
      this.walkers.length,
      this.root,
    );
    const head = new InstanceGroup([{ geo: new SphereGeometry(0.075, 10, 8), mat: kit.lambert("#ffffff"), local: mat4(0, 0.56, 0), tint: true }], this.walkers.length, this.root);
    for (const m of [...body.meshes, ...head.meshes]) this.city.own(m.geometry);
    this.people = { body, head };
  }

  private buildBoats(): void {
    const kit = this.kit;
    const defs: [number, number, 1 | -1][] = [[-28.5, -14, 1], [-28.5, 16, -1], [28.5, 6, 1], [28.5, -18, -1]];
    const g = new InstanceGroup(
      [
        { geo: new BoxGeometry(1.5, 0.22, 0.6), mat: kit.lambert("#ffffff"), local: mat4(0, -0.2, 0), tint: true },
        { geo: new BoxGeometry(0.6, 0.3, 0.46), mat: kit.lambert("#f4efe3"), local: mat4(-0.1, 0.05, 0) },
        { geo: new BoxGeometry(0.2, 0.06, 0.5), mat: kit.lambert("#2d3a48"), local: mat4(0.28, 0.12, 0) },
      ],
      defs.length,
      this.root,
      { cast: false },
    );
    for (const m of g.meshes) this.city.own(m.geometry);
    const cols = ["#d9573b", "#3b78d8", "#f5c518", "#4caf6a"];
    defs.forEach(([x, z, d], i) => {
      g.set(i, x, -0.4, z, d > 0 ? Math.PI / 2 : -Math.PI / 2, 1, cols[i]);
      this.boats.push({ group: g, x, z, dir: d, speed: 0.8 + i * 0.15 });
    });
    g.commit();
  }

  // --- Nuages ----------------------------------------------------------------------------------------------------

  private buildClouds(n: number): void {
    const rng = this.rng;
    const mat = this.kit.lambert("#ffffff", { opacity: 0.93, flat: true, emissive: "#ffffff", emissiveIntensity: 0.55 });
    const blob = this.city.own(new IcosahedronGeometry(1, 1));
    for (let i = 0; i < n; i++) {
      const g = new Group();
      const parts = 3 + Math.floor(rng() * 2);
      for (let k = 0; k < parts; k++) {
        const m = new Mesh(blob, mat);
        const s = 1.2 + rng() * 1.3;
        m.scale.set(s * 1.5, s * 0.62, s);
        m.position.set((k - parts / 2) * 1.9, rng() * 0.5, (rng() - 0.5) * 1.3);
        g.add(m);
      }
      // anneau autour de la ville : les nuages passent sur les bords et dans le ciel, sans masquer le centre.
      // La ligne de visée isométrique ramène un nuage haut vers l'écran : on le décale vers la caméra.
      const a = rng() * Math.PI * 2;
      const r = 34 + rng() * 26;
      const h = 16 + rng() * 10;
      g.position.set(Math.cos(a) * r + h * 0.7, h, Math.sin(a) * r - h * 0.7);
      this.root.add(g);
      this.clouds.push({ g, speed: 0.35 + rng() * 0.6 });
    }
  }

  // --- Animation ---------------------------------------------------------------------------------------------------

  private tick(dt: number): void {
    this.time += dt;
    for (const c of this.cars) stepCar(c, this.cars, this.lines, dt, this.rng);
    for (const { group, cars } of this.carGroups) {
      cars.forEach((c, i) => group.set(i, c.x, 0, c.z, c.yaw, CAR_SCALE, undefined));
      group.commit();
    }
    if (this.people) {
      this.walkers.forEach((w, i) => {
        const p = stepWalker(w, dt);
        const hop = Math.abs(Math.sin(this.time * 7 + w.phase)) * 0.025;
        this.people!.body.set(i, p.x, CURB + hop, p.z, p.yaw, PERSON_SCALE, SHIRTS[w.shirt]);
        this.people!.head.set(i, p.x, CURB + hop, p.z, p.yaw, PERSON_SCALE, SKINS[w.skin]);
      });
      this.people.body.commit();
      this.people.head.commit();
    }
    this.boats.forEach((b, i) => {
      b.z += b.dir * b.speed * dt;
      if (b.z > 25) b.dir = -1;
      if (b.z < -25) b.dir = 1;
      b.group.set(i, b.x, -0.4 + Math.sin(this.time * 1.6 + i) * 0.02, b.z, b.dir > 0 ? Math.PI / 2 : -Math.PI / 2, 1, ["#d9573b", "#3b78d8", "#f5c518", "#4caf6a"][i]);
    });
    if (this.boats.length) this.boats[0]!.group.commit();
    for (const t of this.waterTex) t.offset.y -= dt * 0.03;
    for (const c of this.clouds) {
      c.g.position.x += c.speed * dt;
      if (c.g.position.x > 80) c.g.position.x = -80;
    }
    this.landmarks.update(this.time);
  }

  dispose(): void {
    this.off();
  }
}
