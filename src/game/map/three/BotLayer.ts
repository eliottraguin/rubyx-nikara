/**
 * Couche d'animation Three.js : bots (voyages), véhicules et piétons. AFFICHAGE seulement : les voyages viennent de
 * `MapBus` (trips.ts), le mouvement de `motion.ts` (pur). Aucun texte du modèle, aucun appel réseau.
 * Géométries et matériaux partagés, libérés par `CityScene.dispose()` (own). Boucle = tick de CityScene (dt plafonné) ;
 * en `prefers-reduced-motion` il n'y a pas de boucle : on redessine à la demande (bots statiques, sans rebond).
 */
import { BoxGeometry, ConeGeometry, CylinderGeometry, Group, Mesh, MeshLambertMaterial, type BufferGeometry, type Material } from "three";
import type { CityScene } from "@/game/login/CityScene";
import type { MapLayout } from "../layout";
import type { Trip } from "../trips";
import type { VehicleId } from "../vehicles";
import { botPose, clampDt, planWalkers, walkerPose, type Walker } from "./motion";

const VEHICLE_COLOR: Record<VehicleId, string> = { foot: "#f2c14e", bike: "#4aa3df", skate: "#e86f9a", helicopter: "#9a7be0" };

export class BotLayer {
  private readonly group = new Group();
  private readonly bots = new Map<string, Group>();
  private readonly walkers: { w: Walker; mesh: Mesh }[] = [];
  private readonly mats = new Map<VehicleId, MeshLambertMaterial>();
  private readonly botGeo: Record<VehicleId, BufferGeometry>;
  private readonly walkerGeo: BufferGeometry;
  private readonly walkerMat: Material;
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
    this.botGeo = {
      foot: city.own(new BoxGeometry(0.3, 0.5, 0.3)),
      bike: city.own(new BoxGeometry(0.6, 0.3, 0.25)),
      skate: city.own(new BoxGeometry(0.5, 0.2, 0.25)),
      helicopter: city.own(new CylinderGeometry(0.3, 0.3, 0.25, 12)),
    };
    for (const id of Object.keys(VEHICLE_COLOR) as VehicleId[]) this.mats.set(id, city.own(new MeshLambertMaterial({ color: VEHICLE_COLOR[id] })));
    this.walkerGeo = city.own(new ConeGeometry(0.12, 0.4, 8));
    this.walkerMat = city.own(new MeshLambertMaterial({ color: "#d9d4c7" }));
    for (const w of planWalkers(layout)) {
      const mesh = new Mesh(this.walkerGeo, this.walkerMat);
      this.group.add(mesh);
      this.walkers.push({ w, mesh });
    }
    city.root.add(this.group);
    this.off = city.addTick((dt) => this.step(dt));
    this.step(0);
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

  /** Redessine à la demande (nécessaire sans boucle, i.e. en mouvement réduit). */
  private update(): void {
    this.apply(Date.now());
    this.city.render();
  }

  private apply(wall: number): void {
    for (const { w, mesh } of this.walkers) {
      const p = walkerPose(w, this.time, this.reduced);
      mesh.position.set(p.x, 0.2 + p.y, p.z);
      mesh.rotation.y = p.yaw;
    }
    const alive = new Set<string>();
    for (const trip of this.trips) {
      const pose = botPose(this.layout, trip, wall, this.reduced, this.hqRoofPx);
      if (!pose) continue;
      alive.add(trip.id);
      let g = this.bots.get(trip.id);
      if (!g) {
        g = new Group();
        g.add(new Mesh(this.botGeo.foot, this.mats.get("foot")));
        this.group.add(g);
        this.bots.set(trip.id, g);
      }
      const mesh = g.children[0] as Mesh;
      mesh.geometry = this.botGeo[pose.vehicle];
      mesh.material = this.mats.get(pose.vehicle)!;
      g.position.set(pose.x, pose.y + 0.25, pose.z);
      g.rotation.y = pose.yaw;
    }
    for (const [id, g] of this.bots) {
      if (alive.has(id)) continue;
      g.removeFromParent();
      this.bots.delete(id);
    }
  }

  dispose(): void {
    this.off();
    this.group.removeFromParent();
    this.bots.clear();
    this.walkers.length = 0;
  }
}
