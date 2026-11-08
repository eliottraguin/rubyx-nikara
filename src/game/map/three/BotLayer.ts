/**
 * Couche d'animation Three.js : les bots (voyages) en petits robots à pied, à vélo, en skate ou en hélicoptère.
 * AFFICHAGE seulement : les voyages viennent de `MapBus` (trips.ts), le mouvement de `motion.ts` (pur). Aucun texte
 * du modèle, aucun appel réseau. Géométries et matériaux partagés, libérés par `CityScene.dispose()`. En
 * `prefers-reduced-motion` il n'y a pas de boucle : on redessine à la demande (bots statiques, rotor figé).
 */
import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshLambertMaterial, SphereGeometry, TorusGeometry, type BufferGeometry, type Material } from "three";
import type { CityScene } from "@/game/login/CityScene";
import type { MapLayout } from "../layout";
import type { Trip } from "../trips";
import type { VehicleId } from "../vehicles";
import { botPose, clampDt } from "./motion";

const ACCENT: Record<VehicleId, string> = { foot: "#f2c14e", bike: "#4aa3df", skate: "#e86f9a", helicopter: "#9a7be0" };
const SCALE = 1.5;

export class BotLayer {
  private readonly group = new Group();
  private readonly bots = new Map<string, { g: Group; rotor: Mesh | null; vehicle: VehicleId }>();
  private readonly geo: Record<string, BufferGeometry> = {};
  private readonly mat: Record<string, Material> = {};
  private trips: Trip[] = [];
  private reduced: boolean;
  private time = 0;
  private hqRoofPx: number | undefined;
  private readonly off: () => void;

  constructor(
    private readonly city: CityScene,
    private readonly layout: MapLayout,
  ) {
    this.reduced = city.reducedMotion;
    const own = <T extends { dispose(): void }>(o: T) => city.own(o);
    this.geo.torso = own(new BoxGeometry(0.2, 0.22, 0.14));
    this.geo.head = own(new SphereGeometry(0.1, 12, 10));
    this.geo.eye = own(new BoxGeometry(0.03, 0.03, 0.02));
    this.geo.ant = own(new CylinderGeometry(0.008, 0.008, 0.12, 5));
    this.geo.wheel = own(new TorusGeometry(0.12, 0.022, 6, 14));
    this.geo.board = own(new BoxGeometry(0.46, 0.04, 0.17));
    this.geo.cabin = own(new SphereGeometry(0.2, 12, 8));
    this.geo.boom = own(new BoxGeometry(0.42, 0.04, 0.04));
    this.geo.rotor = own(new BoxGeometry(0.7, 0.012, 0.06));
    this.geo.bar = own(new BoxGeometry(0.03, 0.16, 0.03));
    this.mat.body = own(new MeshLambertMaterial({ color: "#e8eef0" }));
    this.mat.dark = own(new MeshLambertMaterial({ color: "#26303a" }));
    this.mat.eye = own(new MeshLambertMaterial({ color: "#38e0c6", emissive: "#38e0c6" }));
    for (const v of Object.keys(ACCENT) as VehicleId[]) this.mat[v] = own(new MeshLambertMaterial({ color: ACCENT[v] }));
    city.root.add(this.group);
    this.off = city.addTick((dt) => this.step(dt));
    this.step(0);
  }

  private make(vehicle: VehicleId): { g: Group; rotor: Mesh | null } {
    const g = new Group();
    const add = (geo: string, mat: string, x: number, y: number, z: number, rz = 0, rx = 0) => {
      const m = new Mesh(this.geo[geo], this.mat[mat]);
      m.position.set(x, y, z);
      m.rotation.set(rx, 0, rz);
      g.add(m);
      return m;
    };
    let rotor: Mesh | null = null;
    // le robot : torse, tête, yeux (+X = avant), antenne
    const base = vehicle === "foot" ? 0.12 : vehicle === "bike" ? 0.3 : vehicle === "skate" ? 0.12 : 0.34;
    add("torso", "body", 0, base + 0.11, 0);
    add("head", "body", 0.01, base + 0.34, 0);
    add("eye", "eye", 0.09, base + 0.36, 0.045);
    add("eye", "eye", 0.09, base + 0.36, -0.045);
    add("ant", "dark", -0.02, base + 0.5, 0);
    add("torso", vehicle, 0, base + 0.08, 0).scale.set(1.05, 0.35, 1.05);
    if (vehicle === "foot") {
      add("bar", "dark", 0, 0.04, 0.05).scale.set(1, 0.7, 1);
      add("bar", "dark", 0, 0.04, -0.05).scale.set(1, 0.7, 1);
    } else if (vehicle === "bike") {
      const w1 = add("wheel", "dark", 0.2, 0.14, 0);
      const w2 = add("wheel", "dark", -0.2, 0.14, 0);
      w1.rotation.y = w2.rotation.y = Math.PI / 2;
      add("board", "bike", 0, 0.2, 0).scale.set(0.8, 1.6, 0.18);
    } else if (vehicle === "skate") {
      add("board", "skate", 0, 0.05, 0);
    } else {
      add("cabin", "helicopter", 0, 0.28, 0).scale.set(1.3, 0.9, 0.9);
      add("boom", "helicopter", -0.36, 0.3, 0);
      rotor = add("rotor", "dark", 0, 0.62, 0);
      add("rotor", "dark", -0.56, 0.34, 0.03, 0, 0).scale.set(0.18, 1, 4);
    }
    g.scale.setScalar(SCALE);
    return { g, rotor };
  }

  setTrips(trips: Trip[], hqRoofPx?: number): void {
    this.trips = trips;
    this.hqRoofPx = hqRoofPx;
    this.update();
  }

  setReducedMotion(reduced: boolean): void {
    this.reduced = reduced;
    this.update();
  }

  /** Avance l'animation (dt en secondes, plafonné). */
  step(dt: number): void {
    this.time += clampDt(dt) * 1000;
    this.apply(Date.now());
  }

  private update(): void {
    this.apply(Date.now());
    this.city.render();
  }

  private apply(wall: number): void {
    const alive = new Set<string>();
    for (const trip of this.trips) {
      const pose = botPose(this.layout, trip, wall, this.reduced, this.hqRoofPx);
      if (!pose) continue;
      alive.add(trip.id);
      let b = this.bots.get(trip.id);
      if (!b || b.vehicle !== pose.vehicle) {
        b?.g.removeFromParent();
        const m = this.make(pose.vehicle);
        b = { ...m, vehicle: pose.vehicle };
        this.group.add(b.g);
        this.bots.set(trip.id, b);
      }
      b.g.position.set(pose.x, pose.y + 0.1, pose.z);
      b.g.rotation.y = pose.yaw;
      if (b.rotor && !this.reduced) b.rotor.rotation.y = this.time / 40;
    }
    for (const [id, b] of this.bots) {
      if (alive.has(id)) continue;
      b.g.removeFromParent();
      this.bots.delete(id);
    }
  }

  dispose(): void {
    this.off();
    this.group.removeFromParent();
    this.bots.clear();
  }
}
