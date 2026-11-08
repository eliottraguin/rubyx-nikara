/**
 * Scène intérieure « bureau » Three.js (ADR 0003), derrière `NEXT_PUBLIC_BUILDING_ENGINE=three`.
 * Socle = `CityScene` (renderer, caméra iso, boucle, `dispose()`), sans second moteur.
 *
 * AFFICHAGE seulement : une dalle cliquable par étage de `FLOORS`. La scène n'émet que des INTENTIONS
 * (`hover`, `select`) ; aucune règle de jeu, aucun appel réseau, aucun texte du modèle (la scène ne dessine pas de texte).
 */
import { BoxGeometry, Color, Group, Mesh, MeshLambertMaterial, Raycaster, Vector2 } from "three";
import { CityScene } from "@/game/login/CityScene";
import type { FloorId } from "../floors";
import { BUILDING_HEIGHT, FLOOR_DEPTH, FLOOR_HEIGHT, FLOOR_WIDTH, ZONES } from "./layout";

export interface BuildingIntents {
  onHover?: (floor: FloorId | null) => void;
  onSelect?: (floor: FloorId) => void;
}

const DRAG_THRESHOLD = 5;
const SLAB_GAP = 0.08;
const HOVER_EMISSIVE = 0.35;
const SELECTED_EMISSIVE = 0.2;

export class BuildingScene {
  private readonly city: CityScene;
  private readonly raycaster = new Raycaster();
  private readonly slabs = new Map<FloorId, { mesh: Mesh; mat: MeshLambertMaterial }>();
  private readonly cleanups: (() => void)[] = [];
  private hovered: FloorId | null = null;
  private selected: FloorId | null = null;
  private disposed = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly intents: BuildingIntents = {},
  ) {
    this.city = new CityScene(canvas, null);
    const group = new Group();
    const geo = this.city.own(new BoxGeometry(FLOOR_WIDTH, FLOOR_HEIGHT - SLAB_GAP, FLOOR_DEPTH));
    for (const z of ZONES) {
      const mat = this.city.own(new MeshLambertMaterial({ color: z.color, emissive: new Color("#ffffff"), emissiveIntensity: 0 }));
      const mesh = new Mesh(geo, mat);
      mesh.position.y = z.y + FLOOR_HEIGHT / 2;
      group.add(mesh);
      this.slabs.set(z.id, { mesh, mat });
    }
    group.position.y = -BUILDING_HEIGHT / 2; // centré sur le point visé
    this.city.root.add(group);
    this.city.setView({ x: 0, z: 0 }, 1.6);
    this.bindPointer();
    this.city.start();
  }

  /** Étage ouvert côté React (surbrillance). Ne déclenche aucune intention. */
  setSelected(id: FloorId | null): void {
    if (this.disposed) return;
    this.selected = id;
    this.paint();
  }

  private paint(): void {
    for (const [id, s] of this.slabs) {
      s.mat.emissiveIntensity = id === this.hovered ? HOVER_EMISSIVE : id === this.selected ? SELECTED_EMISSIVE : 0;
    }
    this.city.render();
  }

  private pick(ndc: Vector2): FloorId | null {
    this.raycaster.setFromCamera(ndc, this.city.orthoCamera);
    const hit = this.raycaster.intersectObjects([...this.slabs.values()].map((s) => s.mesh), false)[0];
    if (!hit) return null;
    for (const [id, s] of this.slabs) if (s.mesh === hit.object) return id;
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
    let down: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => {
      if (e.button === 0) down = { x: e.clientX, y: e.clientY };
    };
    const onUp = (e: PointerEvent) => {
      const d = down;
      down = null;
      if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) >= DRAG_THRESHOLD) return;
      const id = this.pick(toNdc(e));
      if (id) this.intents.onSelect?.(id);
    };
    this.canvas.addEventListener("pointermove", onMove);
    this.canvas.addEventListener("pointerleave", onLeave);
    this.canvas.addEventListener("pointerdown", onDown);
    this.canvas.addEventListener("pointerup", onUp);
    this.cleanups.push(() => {
      this.canvas.removeEventListener("pointermove", onMove);
      this.canvas.removeEventListener("pointerleave", onLeave);
      this.canvas.removeEventListener("pointerdown", onDown);
      this.canvas.removeEventListener("pointerup", onUp);
      this.canvas.style.cursor = "";
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const fn of this.cleanups) fn();
    this.slabs.clear();
    this.city.dispose();
  }
}
