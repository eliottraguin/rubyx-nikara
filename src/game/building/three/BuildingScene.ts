/**
 * Scène intérieure « immeuble » Three.js (ADR 0003) : une coupe d'immeuble meublée, cinq étages cliquables
 * (terrasse, studio pub, salle du courrier, archives, accueil et garage), des petits robots au travail, un ascenseur.
 * Socle = `CityScene` (renderer, caméra isométrique, boucle, `dispose()`), sans second moteur.
 *
 * AFFICHAGE seulement : la scène n'émet que des INTENTIONS (`hover`, `select`) ; aucune règle de jeu, aucun appel
 * réseau, aucun texte du modèle (les étiquettes viennent de `FLOORS`, des données statiques).
 */
import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, Raycaster, Sprite, SpriteMaterial, Vector2, type Material } from "three";
import { CityScene } from "@/game/login/CityScene";
import { LAYOUT } from "@/game/map/layout";
import { setHandoff } from "@/game/map/handoff";
import { InstanceGroup, mat4, StaticBatch } from "@/game/map/three/world/geo";
import { Kit } from "@/game/map/three/world/kit";
import { labelTexture } from "@/game/map/three/world/landmarks";
import { DEFAULT_YAW, ENTER_ZOOM, SKY, SKY_BOTTOM, SKY_TOP } from "@/game/map/three/world/scale";
import { FLOORS, type FloorId } from "../floors";
import { BUILDING_HEIGHT, FLOOR_DEPTH, FLOOR_HEIGHT, FLOOR_WIDTH, ZONES } from "./layout";
import { buildRoom } from "./rooms";

export interface BuildingIntents {
  onHover?: (floor: FloorId | null) => void;
  onSelect?: (floor: FloorId) => void;
}

const DRAG_THRESHOLD = 5;
const ROTATE_SPEED = 0.006;
const YAW_RANGE = 0.55;
const MIN_ZOOM = 0.7;
const MAX_ZOOM = 2.8;
/** Zoom de repos et zoom de cadrage d'un étage. */
const REST_ZOOM = 1;
const FOCUS_ZOOM = 1.9;
const LABEL_PX_W = 150;
const LABEL_PX_H = 40;
const LABEL_MAX_ZOOM = 1.45;
/** Caméra plus basse que l'isométrique de la ville : on voit dans les pièces au lieu des dalles. */
const VIEW_ELEVATION = (24 * Math.PI) / 180;
const fitSize = (aspect: number): number => Math.max(8.6, 11.5 / aspect);
const ease = (t: number): number => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;

interface FloorVis {
  id: FloorId;
  group: Group;
  hit: Mesh;
  glow: Mesh[];
  mat: MeshBasicMaterial;
  label: Sprite | null;
  baseY: number;
  delay: number;
  anims: ((t: number) => void)[];
}

export class BuildingScene {
  private readonly city: CityScene;
  private readonly kit: Kit;
  private readonly root = new Group();
  private readonly raycaster = new Raycaster();
  private readonly floors = new Map<FloorId, FloorVis>();
  private readonly cleanups: (() => void)[] = [];
  private cabin: Mesh | null = null;
  private hovered: FloorId | null = null;
  private selected: FloorId | null = null;
  private time = 0;
  /** Horloge réelle (s) : l'entrée et la sortie durent le même temps à 10 ou à 60 images/s. */
  private readonly t0 = performance.now();
  private leaving: { start: number } | null = null;
  private disposed = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly intents: BuildingIntents = {},
  ) {
    this.city = new CityScene(canvas, null, { background: SKY, sky: [SKY_TOP, SKY_BOTTOM], viewSize: fitSize, elevation: VIEW_ELEVATION, ambient: 1.6, sun: 2.7, maxPixelRatio: 1.75 });
    this.kit = new Kit(this.city);
    this.root.position.y = -BUILDING_HEIGHT / 2;
    this.city.root.add(this.root);
    this.buildSurroundings();
    for (const z of ZONES) this.buildFloor(z.id, z.y, z.color);
    this.buildElevator();
    this.city.enableShadows({ bounds: { x: -9, z: -9, w: 18, h: 18 }, mapSize: 2048 });
    this.city.sunLight.position.set(-6, 22, 14);
    this.city.sunLight.target.position.set(0, 0, 0);
    this.city.setYaw(DEFAULT_YAW);
    this.city.setView(this.focusTarget(BUILDING_HEIGHT / 2), REST_ZOOM);
    this.placeFloors();
    this.bindPointer();
    this.city.addTick((dt) => this.tick(dt));
    this.city.start();
    this.city.refreshShadows();
    this.fitLabels();
    this.city.render();
  }

  // --- Construction ----------------------------------------------------------------------------------------------

  private buildSurroundings(): void {
    const { kit } = this;
    const b = new StaticBatch();
    const y0 = 0;
    b.add(new BoxGeometry(34, 0.6, 22), kit.lambert("#9ccf7e"), mat4(0, y0 - 0.3, 0));
    b.add(new BoxGeometry(12, 0.12, 8), kit.lambert("#d9d3c4"), mat4(0, y0 + 0.06, 0.3));
    b.add(new BoxGeometry(11, 0.2, 0.3), kit.lambert("#b9b3a4"), mat4(0, y0 + 0.1, 4.45));
    b.add(new BoxGeometry(34, 0.04, 3), kit.lambert("#4d5058"), mat4(0, y0 + 0.02, 7.2));
    for (let i = 0; i < 9; i++) b.add(new BoxGeometry(1.0, 0.01, 0.12), kit.lambert("#efe6bd"), mat4(-14 + i * 3.5, y0 + 0.05, 7.2));
    b.build(this.root, (o) => this.city.own(o), { cast: false, receive: true }, Mesh);
    const trees = new InstanceGroup(
      [
        { geo: new CylinderGeometry(0.07, 0.1, 0.7, 6), mat: kit.lambert("#7a5a3c"), local: mat4(0, 0.35, 0) },
        { geo: new CylinderGeometry(0.0, 0.7, 1.7, 8), mat: kit.lambert("#ffffff", { flat: true }), local: mat4(0, 1.3, 0), tint: true },
      ],
      8,
      this.root,
      { cast: true },
    );
    for (const m of trees.meshes) this.city.own(m.geometry);
    const spots: [number, number, number][] = [[-6.6, -3.2, 1.1], [-7.4, 1.6, 0.9], [6.8, 3.6, 1], [7.6, -1.8, 1.2], [-5.4, 5.2, 0.8], [5.6, 5.4, 0.9], [0, -5.2, 1.3], [-9, -2, 1.4]];
    const greens = ["#5aa84c", "#6cbb58", "#4a9a47", "#7bc462"];
    spots.forEach(([x, z, s], i) => trees.set(i, x, 0.12, z, 0, s, greens[i % greens.length]));
    trees.commit();
  }

  private buildFloor(id: FloorId, y: number, color: string): void {
    const group = new Group();
    const anims: ((t: number) => void)[] = [];
    const meshes: Mesh[] = [];
    buildRoom(id, { kit: this.kit, group, own: (o) => this.city.own(o), anims, meshes });
    const hit = new Mesh(this.city.own(new BoxGeometry(FLOOR_WIDTH + 0.4, FLOOR_HEIGHT, FLOOR_DEPTH + 0.4)), this.city.own(new MeshBasicMaterial({ visible: false })));
    hit.position.set(0, FLOOR_HEIGHT / 2, 0);
    group.add(hit);
    // lueur de survol / sélection : voile sur la dalle et liseré sur le pourtour
    const mat = this.city.own(new MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false }));
    const veil = new Mesh(this.city.own(new BoxGeometry(FLOOR_WIDTH, 0.02, FLOOR_DEPTH)), mat);
    veil.position.set(0, 0.2, 0);
    group.add(veil);
    const glow: Mesh[] = [veil];
    for (const [w, d, x, z] of [[FLOOR_WIDTH + 0.5, 0.12, 0, FLOOR_DEPTH / 2 + 0.2], [0.12, FLOOR_DEPTH + 0.5, -FLOOR_WIDTH / 2 - 0.2, 0], [FLOOR_WIDTH + 0.5, 0.12, 0, -FLOOR_DEPTH / 2], [0.12, FLOOR_DEPTH + 0.5, FLOOR_WIDTH / 2, 0]] as const) {
      const bar = new Mesh(this.city.own(new BoxGeometry(w, 0.1, d)), mat);
      bar.position.set(x, FLOOR_HEIGHT - 0.06, z);
      group.add(bar);
      glow.push(bar);
    }
    const f = FLOORS.find((x) => x.id === id)!;
    let label: Sprite | null = null;
    const tex = labelTexture(f.label, f.section, color);
    if (tex) {
      this.city.own(tex);
      label = new Sprite(this.city.own(new SpriteMaterial({ map: tex, transparent: true, depthTest: false })) as Material as SpriteMaterial);
      label.position.set(-FLOOR_WIDTH / 2 - 2.0, FLOOR_HEIGHT * 0.5, -FLOOR_DEPTH / 2 - 0.8);
      label.renderOrder = 20;
      group.add(label);
    }
    for (const m of meshes) m.userData.floor = id;
    group.position.y = y;
    this.root.add(group);
    this.floors.set(id, { id, group, hit, glow, mat, label, baseY: y, delay: (ZONES.length - 1 - ZONES.findIndex((z) => z.id === id)) * 0.2, anims });
  }

  /** Gaine vitrée et cabine d'ascenseur sur le flanc gauche de la coupe. */
  private buildElevator(): void {
    const { kit } = this;
    const tube = new Mesh(this.city.own(new BoxGeometry(0.9, BUILDING_HEIGHT, 0.9)), this.city.own(kit.lambert("#bfe6f5", { opacity: 0.35 }).clone()));
    tube.position.set(-FLOOR_WIDTH / 2 - 0.9, BUILDING_HEIGHT / 2, -FLOOR_DEPTH / 2 + 0.6);
    this.root.add(tube);
    const cab = new Mesh(this.city.own(new BoxGeometry(0.7, 0.9, 0.7)), kit.lambert("#ff7a1a"));
    cab.castShadow = true;
    cab.position.set(tube.position.x, 0.6, tube.position.z);
    this.root.add(cab);
    this.cabin = cab;
  }

  // --- Caméra ----------------------------------------------------------------------------------------------------

  /** Point visé (sol) pour que le point de hauteur `hy` (repère centré de la scène) apparaisse au centre de l'écran. */
  private focusTarget(heightFromBase: number, dx = 0): { x: number; z: number } {
    const hy = heightFromBase - BUILDING_HEIGHT / 2;
    const away = hy / Math.tan(this.city.elevationAngle);
    const h = this.city.horizontalOffset;
    return { x: -h.x * away + dx, z: -h.z * away };
  }

  private placeFloors(): void {
    const reduced = this.city.reducedMotion;
    for (const f of this.floors.values()) {
      f.group.position.y = f.baseY;
      f.group.visible = reduced;
    }
    if (reduced) this.city.render();
  }

  /** Cadre l'étage `id` (ou l'immeuble entier si null). */
  private frame(id: FloorId | null): void {
    if (id === null) {
      void this.city.zoomToDistrict({ target: this.focusTarget(BUILDING_HEIGHT / 2), zoom: REST_ZOOM, durationMs: 700 });
      return;
    }
    const z = ZONES.find((x) => x.id === id)!;
    void this.city.zoomToDistrict({ target: this.focusTarget(z.y + FLOOR_HEIGHT / 2, -0.4), zoom: FOCUS_ZOOM, durationMs: 700 });
  }

  /**
   * Dézoom animé (retour à la ville) : les étages s'envolent, la caméra s'éloigne, puis le relais est posé pour que
   * la carte reprenne devant l'immeuble. `zoomToDistrict` raccourcit la durée en animations réduites. Ne navigue pas.
   */
  leave(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.leaving = { start: this.wall() };
    const hq = LAYOUT.hq.grid;
    return this.city.zoomToDistrict({ target: this.focusTarget(BUILDING_HEIGHT / 2), zoom: 0.55, durationMs: 800 }).then(() => {
      setHandoff({ from: "building", target: { x: hq.x, z: hq.y }, zoom: ENTER_ZOOM });
    });
  }

  /** Étage ouvert côté React (surbrillance + cadrage). Ne déclenche aucune intention. */
  setSelected(id: FloorId | null): void {
    if (this.disposed || id === this.selected) return;
    this.selected = id;
    this.frame(id);
    this.paint();
  }

  private paint(): void {
    for (const f of this.floors.values()) f.mat.opacity = f.id === this.selected ? 0.42 : f.id === this.hovered ? 0.3 : 0;
    this.city.render();
  }

  private wall(): number {
    return (performance.now() - this.t0) / 1000;
  }

  private fitLabels(): void {
    const cam = this.city.orthoCamera;
    const k = (2 * cam.top) / ((this.canvas.clientHeight || 1) * cam.zoom);
    for (const f of this.floors.values()) {
      if (!f.label) continue;
      f.label.scale.set(LABEL_PX_W * k, LABEL_PX_H * k, 1);
      f.label.visible = cam.zoom < LABEL_MAX_ZOOM; // zoomé sur un étage, les étiquettes sortiraient du cadre
    }
  }

  private tick(dt: number): void {
    this.time += dt;
    const wall = this.wall();
    const out = this.leaving ? Math.min(1, (wall - this.leaving.start) / 0.7) : 0;
    for (const f of this.floors.values()) {
      const k = ease((wall - f.delay) / 0.75);
      f.group.visible = wall >= f.delay;
      f.group.position.y = f.baseY + (1 - k) * 9 + ease(out) * 7 * (1 + f.baseY / BUILDING_HEIGHT);
      if (f.id === this.selected) f.mat.opacity = 0.34 + Math.sin(this.time * 3) * 0.08;
      for (const a of f.anims) a(this.time);
    }
    if (this.cabin) this.cabin.position.y = 0.6 + (0.5 + 0.5 * Math.sin(this.time * 0.45)) * (BUILDING_HEIGHT - 1.2);
    this.fitLabels();
  }

  // --- Scène -> React (intentions seulement) -------------------------------------------------------------------

  private pick(ndc: Vector2): FloorId | null {
    this.raycaster.setFromCamera(ndc, this.city.orthoCamera);
    const hit = this.raycaster.intersectObjects([...this.floors.values()].map((f) => f.hit), false)[0];
    if (!hit) return null;
    for (const f of this.floors.values()) if (f.hit === hit.object) return f.id;
    return null;
  }

  private bindPointer(): void {
    const toNdc = (e: PointerEvent): Vector2 => {
      const r = this.canvas.getBoundingClientRect();
      return new Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    };
    const onMove = (e: PointerEvent) => {
      const id = this.pick(toNdc(e));
      if (id === this.hovered) return;
      this.hovered = id;
      this.canvas.style.cursor = id ? "pointer" : "";
      this.paint();
      this.intents.onHover?.(id);
    };
    const onLeave = () => onMove({ clientX: -1e9, clientY: -1e9 } as PointerEvent);
    let down: { x: number; y: number; id: number } | null = null;
    let dragging = false;
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      down = { x: e.clientX, y: e.clientY, id: e.pointerId };
      dragging = false;
    };
    const onDrag = (e: PointerEvent) => {
      if (!down || e.pointerId !== down.id) return;
      const dx = e.clientX - down.x;
      if (!dragging && Math.hypot(dx, e.clientY - down.y) < DRAG_THRESHOLD) return;
      if (!dragging) {
        dragging = true;
        this.canvas.setPointerCapture?.(e.pointerId);
      }
      const yaw = Math.min(DEFAULT_YAW + YAW_RANGE, Math.max(DEFAULT_YAW - YAW_RANGE, this.city.yaw - dx * ROTATE_SPEED));
      this.city.setYaw(yaw);
      down = { ...down, x: e.clientX, y: e.clientY };
    };
    const onUp = (e: PointerEvent) => {
      const d = down;
      const wasDrag = dragging;
      down = null;
      dragging = false;
      if (!d || wasDrag || e.type !== "pointerup") return;
      const id = this.pick(toNdc(e));
      if (id) this.intents.onSelect?.(id);
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const v = this.city.view;
      this.city.setView({ x: v.x, z: v.z }, Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * (e.deltaY > 0 ? 0.9 : 1.1))));
    };
    this.canvas.addEventListener("pointermove", onMove);
    this.canvas.addEventListener("pointermove", onDrag);
    this.canvas.addEventListener("pointerleave", onLeave);
    this.canvas.addEventListener("pointerdown", onDown);
    this.canvas.addEventListener("pointerup", onUp);
    this.canvas.addEventListener("pointercancel", onUp);
    this.canvas.addEventListener("wheel", onWheel, { passive: false });
    this.cleanups.push(() => {
      this.canvas.removeEventListener("pointermove", onMove);
      this.canvas.removeEventListener("pointermove", onDrag);
      this.canvas.removeEventListener("pointerleave", onLeave);
      this.canvas.removeEventListener("pointerdown", onDown);
      this.canvas.removeEventListener("pointerup", onUp);
      this.canvas.removeEventListener("pointercancel", onUp);
      this.canvas.removeEventListener("wheel", onWheel);
      this.canvas.style.cursor = "";
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const fn of this.cleanups) fn();
    this.floors.clear();
    this.city.dispose();
  }
}
