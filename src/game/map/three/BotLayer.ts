/**
 * Couche d'animation Three.js : les bots (voyages) en petits robots à pied, à vélo, en skate, en voiture, en
 * hélicoptère ou en drone (GR3-72). AFFICHAGE seulement : les voyages viennent de `MapBus` (trips.ts), le
 * mouvement de `motion.ts` (pur). Aucun texte du modèle, aucun appel réseau. Géométries et matériaux partagés,
 * libérés par `CityScene.dispose()`. En `prefers-reduced-motion` il n'y a pas de boucle : on redessine à la
 * demande (bots statiques, rotor figé).
 *
 * Retour : une pastille au-dessus de l'agent indique ce qu'il rapporte (`trip.resultCount`, GR3-59) pendant la
 * phase de retour ; un dossier apparaît brièvement au garage à l'arrivée. Ces deux effets sont des Sprites/Mesh
 * EN PLUS des bots, gérés avec une durée de vie bornée (pas de fuite mémoire sur une longue partie) : les
 * matériaux de pastille sont mis en cache par valeur entière (ensemble borné), les dossiers déposés ont une durée
 * de vie fixe et sont retirés du groupe une fois écoulée.
 */
import { BoxGeometry, CanvasTexture, CylinderGeometry, Group, Mesh, MeshLambertMaterial, SphereGeometry, Sprite, SpriteMaterial, TorusGeometry, type BufferGeometry, type Material } from "three";
import type { CityScene } from "@/game/login/CityScene";
import type { MapLayout } from "../layout";
import type { Trip } from "../trips";
import type { VehicleId } from "../vehicles";
import { botPose, clampDt } from "./motion";

const ACCENT: Record<VehicleId, string> = { foot: "#f2c14e", bike: "#4aa3df", skate: "#e86f9a", car: "#df7a3a", drone: "#5ad1a0", helicopter: "#9a7be0" };
const SCALE = 1.5;
/** Durée (ms) de l'effet « dossier déposé au garage », jamais joué en animations réduites. */
const DROP_MS = 900;

function badgeTexture(n: number): CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = 96;
  c.height = 96;
  const g = c.getContext("2d");
  if (!g) return null;
  g.fillStyle = "#1f8f5f";
  g.beginPath();
  g.arc(48, 48, 44, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "#eafff2";
  g.lineWidth = 4;
  g.stroke();
  g.fillStyle = "#eafff2";
  g.font = "700 48px system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(String(Math.max(0, Math.round(n))), 48, 52);
  return new CanvasTexture(c);
}

interface Bot {
  g: Group;
  rotor: Mesh | null;
  rotor2: Mesh | null;
  vehicle: VehicleId;
  badge: Sprite | null;
  badgeValue: number | null;
}

interface Drop {
  mesh: Mesh;
  /** Clone du matériau partagé (chaque dossier fane à son propre rythme) : détruit avec le dossier. */
  mat: Material & { opacity: number; transparent: boolean };
  start: number;
}

export class BotLayer {
  private readonly group = new Group();
  private readonly bots = new Map<string, Bot>();
  private readonly drops: Drop[] = [];
  private readonly geo: Record<string, BufferGeometry> = {};
  private readonly mat: Record<string, Material> = {};
  private readonly badgeMat = new Map<number, SpriteMaterial>();
  private dropGeo: BufferGeometry | null = null;
  private dropMat: Material | null = null;
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
    this.geo.chassis = own(new BoxGeometry(0.52, 0.14, 0.28));
    this.geo.roof = own(new BoxGeometry(0.3, 0.14, 0.24));
    this.geo.wheelSmall = own(new TorusGeometry(0.08, 0.02, 6, 12));
    this.geo.hub = own(new BoxGeometry(0.16, 0.06, 0.16));
    this.geo.arm = own(new BoxGeometry(0.46, 0.018, 0.03));
    this.geo.blade = own(new BoxGeometry(0.2, 0.01, 0.035));
    this.geo.pod = own(new BoxGeometry(0.12, 0.08, 0.1));
    this.dropGeo = own(new BoxGeometry(0.34, 0.03, 0.24));
    this.mat.body = own(new MeshLambertMaterial({ color: "#e8eef0" }));
    this.mat.dark = own(new MeshLambertMaterial({ color: "#26303a" }));
    this.mat.eye = own(new MeshLambertMaterial({ color: "#38e0c6", emissive: "#38e0c6" }));
    this.dropMat = own(new MeshLambertMaterial({ color: "#c7a56a" }));
    for (const v of Object.keys(ACCENT) as VehicleId[]) this.mat[v] = own(new MeshLambertMaterial({ color: ACCENT[v] }));
    city.root.add(this.group);
    this.off = city.addTick((dt) => this.step(dt));
    this.step(0);
  }

  private make(vehicle: VehicleId): { g: Group; rotor: Mesh | null; rotor2: Mesh | null } {
    const g = new Group();
    const add = (geo: string, mat: string, x: number, y: number, z: number, rz = 0, rx = 0) => {
      const m = new Mesh(this.geo[geo], this.mat[mat]);
      m.position.set(x, y, z);
      m.rotation.set(rx, 0, rz);
      g.add(m);
      return m;
    };
    if (vehicle === "drone") {
      // engin autonome, sans pilote : moyeu central, 2 bras croisés, 4 hélices, nacelle de fret suspendue.
      add("hub", "drone", 0, 0.3, 0);
      add("pod", "dark", 0, 0.2, 0);
      const rotor = add("arm", "dark", 0, 0.33, 0);
      const rotor2 = add("arm", "dark", 0, 0.33, 0, Math.PI / 2);
      for (const [dx, dz] of [
        [0.23, 0],
        [-0.23, 0],
        [0, 0.23],
        [0, -0.23],
      ] as const)
        add("blade", "drone", dx, 0.34, dz);
      g.scale.setScalar(SCALE);
      return { g, rotor, rotor2 };
    }
    let rotor: Mesh | null = null;
    // le robot : torse, tête, yeux (+X = avant), antenne
    const base = vehicle === "foot" ? 0.12 : vehicle === "bike" ? 0.3 : vehicle === "skate" ? 0.12 : vehicle === "car" ? 0.28 : 0.34;
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
    } else if (vehicle === "car") {
      add("chassis", "car", 0, 0.14, 0);
      add("roof", "dark", -0.02, 0.26, 0);
      for (const [dx, dz] of [
        [0.17, 0.15],
        [0.17, -0.15],
        [-0.17, 0.15],
        [-0.17, -0.15],
      ] as const) {
        const w = add("wheelSmall", "dark", dx, 0.08, dz);
        w.rotation.y = Math.PI / 2;
      }
    } else {
      add("cabin", "helicopter", 0, 0.28, 0).scale.set(1.3, 0.9, 0.9);
      add("boom", "helicopter", -0.36, 0.3, 0);
      rotor = add("rotor", "dark", 0, 0.62, 0);
      add("rotor", "dark", -0.56, 0.34, 0.03, 0, 0).scale.set(0.18, 1, 4);
    }
    g.scale.setScalar(SCALE);
    return { g, rotor, rotor2: null };
  }

  private badgeMaterial(n: number): SpriteMaterial | null {
    let m = this.badgeMat.get(n);
    if (m) return m;
    const tex = badgeTexture(n);
    if (!tex) return null;
    m = this.city.own(new SpriteMaterial({ map: this.city.own(tex), transparent: true, depthTest: false }));
    this.badgeMat.set(n, m);
    return m;
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
      if (!pose) {
        // Le voyage vient de se terminer (rentré) : dépose le dossier au garage s'il rapporte quelque chose.
        if (this.bots.has(trip.id) && !this.reduced && trip.resultCount !== null && trip.resultCount !== undefined) this.spawnDrop(wall);
        continue;
      }
      alive.add(trip.id);
      let b = this.bots.get(trip.id);
      if (!b || b.vehicle !== pose.vehicle) {
        b?.g.removeFromParent();
        const m = this.make(pose.vehicle);
        b = { ...m, vehicle: pose.vehicle, badge: null, badgeValue: null };
        this.group.add(b.g);
        this.bots.set(trip.id, b);
      }
      b.g.position.set(pose.x, pose.y + 0.1, pose.z);
      b.g.rotation.y = pose.yaw;
      if (!this.reduced) {
        if (b.rotor) b.rotor.rotation.y = this.time / 40;
        if (b.rotor2) b.rotor2.rotation.y = this.time / 40 + Math.PI / 2;
      }
      this.applyBadge(b, pose.phase === "return" ? pose.cargo : null);
    }
    for (const [id, b] of this.bots) {
      if (alive.has(id)) continue;
      b.g.removeFromParent();
      this.bots.delete(id);
    }
    this.stepDrops(wall);
  }

  /** Pastille au-dessus de l'agent pendant le retour (ce qu'il rapporte, GR3-59) ; absente sinon. */
  private applyBadge(b: Bot, cargo: number | null): void {
    if (cargo === null) {
      if (b.badge) {
        b.badge.removeFromParent();
        b.badge = null;
        b.badgeValue = null;
      }
      return;
    }
    if (b.badgeValue === cargo && b.badge) return;
    const mat = this.badgeMaterial(cargo);
    if (!mat) return;
    b.badge?.removeFromParent();
    const sprite = new Sprite(mat);
    sprite.scale.setScalar(0.42);
    sprite.position.set(0, 0.56, 0);
    sprite.renderOrder = 20;
    b.g.add(sprite);
    b.badge = sprite;
    b.badgeValue = cargo;
  }

  private spawnDrop(wall: number): void {
    if (!this.dropGeo || !this.dropMat) return;
    // Clone propre à ce dossier : plusieurs retours en parallèle fanent chacun à leur rythme, sans se gêner ;
    // détruit avec le dossier (durée de vie bornée par DROP_MS, aucune accumulation sur une longue partie).
    const mat = (this.dropMat as MeshLambertMaterial).clone();
    mat.transparent = true;
    const mesh = new Mesh(this.dropGeo, mat);
    const g = this.layout.hq.garageDoor.grid;
    mesh.position.set(g.x, 0.12, g.y);
    this.group.add(mesh);
    this.drops.push({ mesh, mat, start: wall });
  }

  /** Les dossiers déposés montent légèrement puis disparaissent ; retirés du groupe une fois écoulés. */
  private stepDrops(wall: number): void {
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i]!;
      const t = Math.min(1, (wall - d.start) / DROP_MS);
      d.mesh.position.y = 0.12 + t * 0.22;
      d.mat.opacity = 1 - t;
      if (t >= 1) {
        d.mesh.removeFromParent();
        d.mat.dispose();
        this.drops.splice(i, 1);
      }
    }
  }

  dispose(): void {
    this.off();
    this.group.removeFromParent();
    this.bots.clear();
    for (const d of this.drops) d.mat.dispose();
    this.drops.length = 0;
  }
}
