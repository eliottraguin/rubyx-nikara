/**
 * Vue ville Three.js (ADR 0002) branchée sur `MapViewModel` / `MapBus`. Socle = `CityScene` (renderer, caméra
 * isométrique, boucle, `dispose()`) ; la ville elle-même (terrain, 36 blocs, rues, parc, circulation, piétons, lieux
 * et immeuble du joueur) est dessinée par `CityWorld`.
 *
 * AFFICHAGE seulement : aucune règle de jeu (états, prix, niveau, déblocage viennent du serveur via le viewmodel),
 * aucun appel réseau, aucun texte du modèle injecté en HTML. La scène n'émet que des intentions sur le bus.
 */
import { Color, Mesh, MeshBasicMaterial, Raycaster, RingGeometry, Vector2, type Object3D } from "three";
import { CityScene, ISO_ELEVATION } from "@/game/login/CityScene";
import { appearanceFor, buildingHeightPx } from "../building";
import type { MapBus } from "../bus";
import { takeHandoff } from "../handoff";
import { LAYOUT } from "../layout";
import type { MapViewModel } from "../viewmodel";
import { BotLayer } from "./BotLayer";
import { CityWorld } from "./world/CityWorld";
import type { Landmark } from "./world/landmarks";
import { DEFAULT_YAW, ENTER_ZOOM, SKY, SKY_BOTTOM, SKY_TOP } from "./world/scale";

const MIN_ZOOM = 0.55;
const MAX_ZOOM = 5;
const DRAG_THRESHOLD = 5;
const ROTATE_SPEED = 0.008;
const BASE_ID = "base";
/** Cadrage d'ensemble : la terre ferme entière tient à l'écran, grands immeubles compris. */
export const OVERVIEW_ZOOM = 1;
const fitSize = (aspect: number): number => Math.max(30, 40 / aspect);

export class MapView {
  private readonly city: CityScene;
  private readonly world: CityWorld;
  private readonly bots: BotLayer;
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
    this.city = new CityScene(canvas, null, { background: SKY, sky: [SKY_TOP, SKY_BOTTOM], viewSize: fitSize, ambient: 1.45, sun: 3.3, maxPixelRatio: 1.75 });
    this.world = new CityWorld(this.city, LAYOUT, { pins: true, seed: 2024 });
    this.bots = new BotLayer(this.city, LAYOUT);
    this.bots.setTrips(bus.trips, bus.vm ? buildingHeightPx(bus.vm.building.level) : undefined);

    this.ring = new Mesh(this.city.own(new RingGeometry(2.55, 2.85, 48)), this.city.own(new MeshBasicMaterial({ color: new Color("#ffffff"), transparent: true, opacity: 0.95 })));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.18;
    this.ring.visible = false;
    this.city.root.add(this.ring);

    this.city.addTick(() => this.fitLabels());
    this.bindBus();
    this.bindPointer();
    this.city.setYaw(DEFAULT_YAW);
    this.city.setView(this.overviewTarget(), OVERVIEW_ZOOM);
    this.city.start();
    bus.farewell = () => this.farewell();
    bus.enterBuilding = () => this.enterBuilding();
    bus.enterNav = (id) => this.enterNav(id);
    if (bus.vm) this.applyVM(bus.vm);
    this.applySelected(bus.selectedId);
    this.fitLabels();
    this.intro();
    bus.emit("scene:ready");
  }

  /** Taille constante des étiquettes : unités monde par pixel = (2 × demi-hauteur visible) / (hauteur écran × zoom). */
  private fitLabels(): void {
    const cam = this.city.orthoCamera;
    this.world.landmarks.scaleLabels((2 * cam.top) / ((this.canvas.clientHeight || 1) * cam.zoom));
  }

  /** Entrée en scène : on reprend là où l'écran précédent s'est arrêté (connexion, bureau) puis on s'éloigne. */
  private intro(): void {
    const h = takeHandoff();
    const from = h ?? { from: "login" as const, target: { x: 0, z: 0 }, zoom: 1.7 };
    this.city.setView(from.target, from.zoom);
    void this.city.zoomToDistrict({ target: this.overviewTarget(), zoom: OVERVIEW_ZOOM, durationMs: h ? 1700 : 1100 });
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
      b.on("camera:reset", () => void this.city.zoomToDistrict({ target: this.overviewTarget(), zoom: OVERVIEW_ZOOM, durationMs: 700 })),
      b.on("camera:focus", (id) => this.focusOn(id)),
      b.on("view:enter", (id) => this.focusOn(id, 2.6)),
      b.on("view:leave", () => void this.city.zoomToDistrict({ target: this.overviewTarget(), zoom: OVERVIEW_ZOOM })),
    );
  }

  private applyVM(vm: MapViewModel): void {
    if (this.disposed) return;
    this.lastPlanned = vm;
    const ap = appearanceFor(vm.building.level);
    // niveau de l'immeuble du joueur : lu dans le viewmodel (ap), jamais calculé ici.
    this.world.landmarks.setHq({ floors: ap.floors, width: ap.width, wall: ap.wall, trim: ap.trim, glass: ap.glass, features: ap.features, sign: ap.sign }, vm.company ?? "");
    for (const pl of vm.places) this.world.landmarks.setStatus(pl.id, pl.status);
    this.applySelected(this.bus.selectedId);
    this.world.refresh();
  }

  private landmark(id: string): Landmark | undefined {
    return id === BASE_ID ? this.world.landmarks.hq : this.world.landmarks.places.get(id);
  }

  private applySelected(id: string | null): void {
    const lm = id ? this.landmark(id) : undefined;
    this.ring.visible = !!lm;
    if (lm) this.ring.position.set(lm.x, 0.18, lm.z);
    this.city.render();
  }

  private roofPx(): number | undefined {
    return this.lastPlanned ? buildingHeightPx(this.lastPlanned.building.level) : undefined;
  }

  // --- Caméra --------------------------------------------------------------------------------------------------

  /** Centre de la terre ferme, décalé pour garder la ville à gauche du panneau latéral en surimpression. */
  private overviewTarget(): { x: number; z: number } {
    return this.shifted({ x: 4.5, z: -4.5 }, OVERVIEW_ZOOM); // un peu vers l'arrière : les grandes tours tiennent à l'écran
  }

  /**
   * Décale le point visé pour que le sujet apparaisse au centre de la zone LIBRE (à gauche du panneau latéral) :
   * le panneau recouvre `insetRight` pixels, donc le centre libre est `insetRight / 2` plus à gauche.
   */
  private shifted(t: { x: number; z: number }, zoom: number): { x: number; z: number } {
    const inset = this.bus.insetRight;
    if (!inset) return t;
    const cam = this.city.orthoCamera;
    const unit = (cam.top - cam.bottom) / zoom / (this.canvas.clientHeight || 1); // unités monde par pixel
    const h = this.city.horizontalOffset;
    const dx = (inset / 2) * unit;
    // « droite écran » sur le plan XZ = (h.z, -h.x) ; on déplace la caméra vers la droite pour décaler le sujet à gauche
    return { x: t.x + dx * h.z, z: t.z - dx * h.x };
  }

  private pan(dx: number, dy: number): void {
    const v = this.city.view;
    const cam = this.city.orthoCamera;
    const unit = (cam.top - cam.bottom) / cam.zoom / (this.canvas.clientHeight || 1);
    const h = this.city.horizontalOffset;
    const ey = unit / Math.sin(ISO_ELEVATION);
    this.city.setView({ x: v.x - dx * unit * h.z - dy * ey * h.x, z: v.z + dx * unit * h.x - dy * ey * h.z }, v.zoom);
  }

  private zoomBy(factor: number): void {
    const v = this.city.view;
    this.city.setView(v, Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * factor)));
  }

  private focusOn(id: string, zoom = 1.6): void {
    const lm = this.landmark(id);
    if (!lm) return;
    void this.city.zoomToDistrict({ target: this.shifted({ x: lm.x, z: lm.z }, zoom), zoom });
  }

  /**
   * Zoom continu vers l'immeuble du joueur (transition ville -> bureau). `zoomToDistrict` raccourcit déjà la durée
   * en animations réduites. Ne navigue pas : l'appelant enchaîne (router.push).
   */
  private enterBuilding(): Promise<void> {
    const hq = this.world.landmarks.hq;
    return this.city.zoomToDistrict({ target: { x: hq.x, z: hq.z }, zoom: ENTER_ZOOM, durationMs: 1300 });
  }

  /** Même mécanique que `enterBuilding`, vers la boutique ou l'évaluateur. Résolu même si l'id est inconnu. */
  private enterNav(id: string): Promise<void> {
    const lm = this.world.landmarks.nav.get(id);
    if (!lm) return Promise.resolve();
    return this.city.zoomToDistrict({ target: { x: lm.x, z: lm.z }, zoom: ENTER_ZOOM, durationMs: 1300 });
  }

  /** Dézoom au logout : la caméra remonte à la vue d'ensemble de la page de connexion. */
  private farewell(): Promise<void> {
    return this.city.zoomToDistrict({ target: { x: 0, z: 0 }, zoom: 0.78, durationMs: 1400 });
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
    const all = this.world.landmarks.all();
    const bodies: Object3D[] = all.flatMap((l) => l.meshes);
    const hit = this.raycaster.intersectObjects(bodies, false)[0];
    if (!hit) return null;
    for (const l of all) if (l.meshes.includes(hit.object as Mesh)) return l.id;
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
    this.bus.enterNav = null;
    for (const off of this.unsubs) off();
    for (const fn of this.cleanups) fn();
    this.world.dispose();
    this.bots.dispose();
    this.city.dispose();
  }
}
