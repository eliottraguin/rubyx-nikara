/**
 * Vue ville Three.js (ADR 0002) : squelette branché sur `MapViewModel` / `MapBus`, en parallèle de `WorldScene` (Phaser).
 * Socle = `CityScene` (renderer, caméra iso, boucle, `dispose()`), sans second moteur.
 *
 * AFFICHAGE seulement : aucune règle de jeu (états, prix, niveau, déblocage viennent du serveur via le viewmodel),
 * aucun appel réseau, aucun texte du modèle injecté en HTML (la scène ne dessine pas de texte).
 * Immeubles et façades procéduraux (BuildingFactory) par lieu + immeuble, sélection, survol, caméra. Bots, véhicules et piétons : BotLayer (GR3-32). Coupe d'immeuble,
 * rues et art final : tickets suivants.
 */
import {
  Color,
  Group,
  Mesh,
  MeshLambertMaterial,
  PlaneGeometry,
  Raycaster,
  RingGeometry,
  ShadowMaterial,
  Vector2,
  type Object3D,
} from "three";
import { CityScene, ISO_ELEVATION } from "@/game/login/CityScene";
import { appearanceFor } from "../building";
import { BuildingFactory, type BuildingStyle } from "./BuildingFactory";
import { seedFromId } from "./buildingPlan";
import { LAYOUT } from "../layout";
import { buildDecor } from "./DecorScene";
import { BotLayer } from "./BotLayer";
import { buildingHeightPx } from "../building";
import type { MapBus } from "../bus";
import type { MapViewModel, PlanetStatus } from "../viewmodel";

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;
const DRAG_THRESHOLD = 5;
const ROTATE_SPEED = 0.008;
const BASE_ID = "base";
/** Zoom final de la transition vers le bureau (au-delà du zoom de focus 2.4 : l'immeuble remplit l'écran). */
const ENTER_ZOOM = 4;
const STATUS_TINT: Record<PlanetStatus, string> = {
  locked: "#8a8f98",
  available: "#e8c46a",
  in_progress: "#5aa9e6",
  visited: "#6fbf8a",
};

interface Pickable {
  id: string;
  group: Group;
  meshes: Mesh[];
}

const PLACE_GLASS = "#cfe6f2";
const PLACE_TRIM = "#e8e2d4";

export class MapView {
  private readonly city: CityScene;
  private readonly factory: BuildingFactory;
  private readonly bots: BotLayer;
  private readonly pickables = new Map<string, Pickable>();
  private readonly ring: Mesh;
  private readonly raycaster = new Raycaster();
  private readonly unsubs: (() => void)[] = [];
  private readonly cleanups: (() => void)[] = [];
  private hovered: string | null = null;
  private lastPlanned: MapViewModel | null = null;
  private disposed = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly bus: MapBus,
  ) {
    this.city = new CityScene(canvas, null);
    this.factory = new BuildingFactory(this.city);
    buildDecor(this.city, LAYOUT);
    this.bots = new BotLayer(this.city, LAYOUT);
    this.bots.setTrips(bus.trips, bus.vm ? buildingHeightPx(bus.vm.building.level) : undefined);
    const ground = new Mesh(
      this.city.own(new PlaneGeometry(200, 200)),
      this.city.own(new MeshLambertMaterial({ color: "#8fb07a" })),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    this.city.root.add(ground);

    // Ombres : la ville entière sur UNE shadow map modeste. Seuls les immeubles projettent ; seul un voile
    // ShadowMaterial transparent (au-dessus du décor, y = 0.04) les reçoit : pas d'auto-ombrage ni d'acné.
    const land = LAYOUT.land;
    this.city.enableShadows({ bounds: { x: land.x, z: land.y, w: land.w, h: land.h } });
    const veil = new Mesh(
      this.city.own(new PlaneGeometry(land.w, land.h)),
      this.city.own(new ShadowMaterial({ color: "#1b2a3a", opacity: 0.28 })),
    );
    veil.rotation.x = -Math.PI / 2;
    veil.position.set(land.x + land.w / 2, 0.04, land.y + land.h / 2);
    veil.receiveShadow = true;
    this.city.root.add(veil);

    this.ring = new Mesh(
      this.city.own(new RingGeometry(2.6, 3, 32)),
      this.city.own(new MeshLambertMaterial({ color: "#ffffff", emissive: new Color("#ffffff") })),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.02;
    this.ring.visible = false;
    this.city.root.add(this.ring);

    this.bindBus();
    this.bindPointer();
    this.city.start();
    bus.farewell = () => this.farewell();
    bus.enterBuilding = () => this.enterBuilding();
    if (bus.vm) this.applyVM(bus.vm);
    this.applySelected(bus.selectedId);
    bus.emit("scene:ready");
  }

  // --- React -> scène ------------------------------------------------------------------------------------------

  private bindBus(): void {
    const b = this.bus;
    this.unsubs.push(
      b.on("vm", (vm) => this.applyVM(vm)),
      b.on("selected", (id) => this.applySelected(id)),
      b.on("motion", (reduced) => this.bots.setReducedMotion(reduced)),
      b.on("trips", (trips) => this.bots.setTrips(trips, this.roofPx())),
      b.on("camera:pan", (dx, dy) => this.pan(dx, dy)),
      b.on("camera:zoom", (f) => this.zoomBy(f)),
      b.on("camera:reset", () => this.focusOn(BASE_ID)),
      b.on("camera:focus", (id) => this.focusOn(id)),
      b.on("view:enter", (id) => this.focusOn(id, 2.4)),
      b.on("view:leave", () => this.focusOn(BASE_ID, 1)),
    );
  }

  private applyVM(vm: MapViewModel): void {
    if (this.disposed) return;
    this.lastPlanned = vm;
    for (const p of this.pickables.values()) {
      // à chaque nouveau viewmodel : on retire l'immeuble ; géométries, matériaux et textures sont partagés et
      // libérés par CityScene.dispose() (cf. BuildingFactory, ADR 0002).
      p.group.removeFromParent();
    }
    this.pickables.clear();
    const ap = appearanceFor(vm.building.level);
    // niveau de l'immeuble du joueur : lu dans le viewmodel (ap), jamais calculé ici.
    this.addBuilding(BASE_ID, vm.base.grid, {
      size: ap.width,
      floors: ap.floors,
      features: ap.features,
      wall: ap.wall,
      glass: ap.glass,
      trim: ap.trim,
    });
    for (const pl of vm.places) {
      this.addBuilding(pl.id, pl.grid, { size: 4, floors: pl.floors, wall: STATUS_TINT[pl.status], glass: PLACE_GLASS, trim: PLACE_TRIM });
    }
    this.applySelected(this.bus.selectedId);
    this.city.refreshShadows();
    this.city.render();
  }

  private addBuilding(id: string, grid: { x: number; y: number }, style: Omit<BuildingStyle, "seed">): void {
    const { group, meshes } = this.factory.build({ ...style, seed: seedFromId(id) });
    group.position.set(grid.x, 0, grid.y);
    for (const m of meshes) m.castShadow = true;
    this.city.root.add(group);
    this.pickables.set(id, { id, group, meshes });
  }

  private applySelected(id: string | null): void {
    const target = id ? this.pickables.get(id) : undefined;
    this.ring.visible = !!target;
    if (target) this.ring.position.set(target.group.position.x, 0.02, target.group.position.z);
    this.city.render();
  }

  private roofPx(): number | undefined {
    return this.lastPlanned ? buildingHeightPx(this.lastPlanned.building.level) : undefined;
  }

  // --- Caméra --------------------------------------------------------------------------------------------------

  private pan(dx: number, dy: number): void {
    const v = this.city.view;
    const cam = this.city.orthoCamera;
    // pixels écran -> unités monde (caméra orthographique : hauteur visible = top - bottom).
    const unit = (cam.top - cam.bottom) / cam.zoom / (this.canvas.clientHeight || 1);
    // axes écran sur le plan XZ selon le yaw : h = vers la caméra, droite = (h.z, -h.x) ; vertical écrasé par l'élévation.
    const h = this.city.horizontalOffset;
    const ey = unit / Math.sin(ISO_ELEVATION);
    this.city.setView({ x: v.x - dx * unit * h.z - dy * ey * h.x, z: v.z + dx * unit * h.x - dy * ey * h.z }, v.zoom);
  }

  private zoomBy(factor: number): void {
    const v = this.city.view;
    this.city.setView(v, Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * factor)));
  }

  private focusOn(id: string, zoom = 1.2): void {
    const t = this.pickables.get(id);
    if (!t) return;
    void this.city.zoomToDistrict({ target: { x: t.group.position.x, z: t.group.position.z }, zoom });
  }

  /**
   * Zoom continu vers l'immeuble du joueur (transition ville -> bureau). `zoomToDistrict` raccourcit déjà la durée
   * en animations réduites (zoom court, sans coupure brute). Ne navigue pas : l'appelant enchaîne (router.push).
   */
  private enterBuilding(): Promise<void> {
    const t = this.pickables.get(BASE_ID);
    if (!t) return Promise.resolve();
    return this.city.zoomToDistrict({ target: { x: t.group.position.x, z: t.group.position.z }, zoom: ENTER_ZOOM });
  }

  /**
   * Dézoom au logout : la caméra remonte à la vue très haute (zoom 1) de la scène de connexion, avec la même
   * animation (`zoomToDistrict`, raccourcie en animations réduites). Ne navigue pas : l'appelant enchaîne.
   */
  private farewell(): Promise<void> {
    const land = LAYOUT.land;
    return this.city.zoomToDistrict({ target: { x: land.x + land.w / 2, z: land.y + land.h / 2 }, zoom: 1 });
  }

  // --- Scène -> React (intentions seulement) -------------------------------------------------------------------

  private bindPointer(): void {
    const toNdc = (e: PointerEvent): Vector2 => {
      const r = this.canvas.getBoundingClientRect();
      return new Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    };
    const onMove = (e: PointerEvent) => {
      const id = this.pick(toNdc(e));
      if (id !== this.hovered) {
        this.hovered = id;
        this.canvas.style.cursor = id ? "pointer" : "";
        this.bus.emit("planet:hover", id);
      }
    };
    // glisser = rotation ; un déplacement < DRAG_THRESHOLD px reste un clic (même intention planet:select qu'avant).
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
      this.city.setYaw(this.city.yaw - dx * ROTATE_SPEED);
      down = { ...down, x: e.clientX, y: e.clientY };
    };
    const onUp = (e: PointerEvent) => {
      if (!down || e.pointerId !== down.id) return;
      const wasDrag = dragging;
      down = null;
      dragging = false;
      if (!wasDrag && e.type === "pointerup") this.bus.emit("planet:select", this.pick(toNdc(e)));
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      this.zoomBy(e.deltaY > 0 ? 0.88 : 1.14);
    };
    this.canvas.addEventListener("pointermove", onMove);
    this.canvas.addEventListener("pointermove", onDrag);
    this.canvas.addEventListener("pointerdown", onDown);
    this.canvas.addEventListener("pointerup", onUp);
    this.canvas.addEventListener("pointercancel", onUp);
    this.canvas.addEventListener("wheel", onWheel, { passive: false });
    this.cleanups.push(() => {
      this.canvas.removeEventListener("pointermove", onMove);
      this.canvas.removeEventListener("pointermove", onDrag);
      this.canvas.removeEventListener("pointerdown", onDown);
      this.canvas.removeEventListener("pointerup", onUp);
      this.canvas.removeEventListener("pointercancel", onUp);
      this.canvas.removeEventListener("wheel", onWheel);
    });
  }

  private pick(ndc: Vector2): string | null {
    this.raycaster.setFromCamera(ndc, this.city.orthoCamera);
    const bodies: Object3D[] = [...this.pickables.values()].flatMap((p) => p.meshes);
    const hit = this.raycaster.intersectObjects(bodies, false)[0];
    if (!hit) return null;
    for (const p of this.pickables.values()) if (p.meshes.includes(hit.object as Mesh)) return p.id;
    return null;
  }

  /** Dernier viewmodel affiché (tests / diagnostic). */
  get current(): MapViewModel | null {
    return this.lastPlanned;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.bus.farewell = null;
    this.bus.enterBuilding = null;
    for (const off of this.unsubs) off();
    for (const fn of this.cleanups) fn();
    this.pickables.clear();
    this.bots.dispose();
    this.city.dispose();
  }
}
