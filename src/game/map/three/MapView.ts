/**
 * Vue ville Three.js (ADR 0002) : squelette branché sur `MapViewModel` / `MapBus`, en parallèle de `WorldScene` (Phaser).
 * Socle = `CityScene` (renderer, caméra iso, boucle, `dispose()`), sans second moteur.
 *
 * AFFICHAGE seulement : aucune règle de jeu (états, prix, niveau, déblocage viennent du serveur via le viewmodel),
 * aucun appel réseau, aucun texte du modèle injecté en HTML (la scène ne dessine pas de texte).
 * Squelette : volumes simples par lieu + immeuble, sélection, survol, caméra. Bots, véhicules, coupe d'immeuble,
 * rues et art final : tickets suivants.
 */
import {
  BoxGeometry,
  Color,
  Group,
  Mesh,
  MeshLambertMaterial,
  PlaneGeometry,
  Raycaster,
  RingGeometry,
  Vector2,
  type Object3D,
} from "three";
import { CityScene } from "@/game/login/CityScene";
import { appearanceFor } from "../building";
import type { MapBus } from "../bus";
import type { MapViewModel, PlanetStatus } from "../viewmodel";

const FLOOR_H = 0.6;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;
const BASE_ID = "base";
const STATUS_TINT: Record<PlanetStatus, string> = {
  locked: "#8a8f98",
  available: "#e8c46a",
  in_progress: "#5aa9e6",
  visited: "#6fbf8a",
};

interface Pickable {
  id: string;
  group: Group;
  body: Mesh;
  mat: MeshLambertMaterial;
}

export class MapView {
  private readonly city: CityScene;
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
    const ground = new Mesh(
      this.city.own(new PlaneGeometry(200, 200)),
      this.city.own(new MeshLambertMaterial({ color: "#a9c48f" })),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    this.city.root.add(ground);

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
      b.on("motion", () => {
        /* la préférence système est lue par CityScene ; la boucle ne démarre pas en mouvement réduit. */
      }),
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
      // à chaque nouveau viewmodel : on retire ET libère (évite la fuite mémoire WebGL, cf. ADR 0002).
      p.group.removeFromParent();
      p.body.geometry.dispose();
      p.mat.dispose();
    }
    this.pickables.clear();
    const ap = appearanceFor(vm.building.level);
    this.addBuilding(BASE_ID, vm.base.grid, vm.base.size, ap.floors, ap.wall);
    for (const pl of vm.places) {
      this.addBuilding(pl.id, pl.grid, 4, pl.floors, STATUS_TINT[pl.status]);
    }
    this.applySelected(this.bus.selectedId);
    this.city.render();
  }

  private addBuilding(id: string, grid: { x: number; y: number }, size: number, floors: number, color: string): void {
    const h = Math.max(1, floors) * FLOOR_H;
    const mat = this.city.own(new MeshLambertMaterial({ color }));
    const body = new Mesh(this.city.own(new BoxGeometry(size, h, size)), mat);
    body.position.y = h / 2;
    const group = new Group();
    group.add(body);
    group.position.set(grid.x, 0, grid.y);
    this.city.root.add(group);
    this.pickables.set(id, { id, group, body, mat });
  }

  private applySelected(id: string | null): void {
    const target = id ? this.pickables.get(id) : undefined;
    this.ring.visible = !!target;
    if (target) this.ring.position.set(target.group.position.x, 0.02, target.group.position.z);
    this.city.render();
  }

  // --- Caméra --------------------------------------------------------------------------------------------------

  private pan(dx: number, dy: number): void {
    const v = this.city.view;
    const cam = this.city.orthoCamera;
    // pixels écran -> unités monde (caméra orthographique : hauteur visible = top - bottom).
    const unit = (cam.top - cam.bottom) / cam.zoom / (this.canvas.clientHeight || 1);
    // l'axe écran horizontal est la diagonale (1,0,-1)/√2 du plan XZ ; le vertical (1,0,1)/√2 écrasé par l'élévation.
    const k = Math.SQRT1_2;
    const ey = unit / Math.sin(Math.atan(1 / Math.SQRT2));
    this.city.setView({ x: v.x - (dx * unit * k) - dy * ey * k, z: v.z + dx * unit * k - dy * ey * k }, v.zoom);
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
    const onClick = (e: PointerEvent) => this.bus.emit("planet:select", this.pick(toNdc(e)));
    this.canvas.addEventListener("pointermove", onMove);
    this.canvas.addEventListener("click", onClick as unknown as EventListener);
    this.cleanups.push(() => {
      this.canvas.removeEventListener("pointermove", onMove);
      this.canvas.removeEventListener("click", onClick as unknown as EventListener);
    });
  }

  private pick(ndc: Vector2): string | null {
    this.raycaster.setFromCamera(ndc, this.city.orthoCamera);
    const bodies: Object3D[] = [...this.pickables.values()].map((p) => p.body);
    const hit = this.raycaster.intersectObjects(bodies, false)[0];
    if (!hit) return null;
    for (const p of this.pickables.values()) if (p.body === hit.object) return p.id;
    return null;
  }

  /** Dernier viewmodel affiché (tests / diagnostic). */
  get current(): MapViewModel | null {
    return this.lastPlanned;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const off of this.unsubs) off();
    for (const fn of this.cleanups) fn();
    this.pickables.clear();
    this.city.dispose();
  }
}
