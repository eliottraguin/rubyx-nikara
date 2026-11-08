/**
 * Lieux (ex-planètes) et immeuble du joueur : silhouettes distinctes, anneau d'état, épingle et étiquette.
 * AFFICHAGE seulement : l'état de chaque lieu et le niveau de l'immeuble viennent du serveur via le viewmodel ;
 * les couleurs ne portent aucun sens seules (l'état est aussi écrit sur l'étiquette).
 */
import {
  BoxGeometry,
  CanvasTexture,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  RingGeometry,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Color,
  type BufferGeometry,
  type Material,
} from "three";
import type { CityScene } from "@/game/login/CityScene";
import type { MapLayout, NavBuildingLayout, PlaceLayout } from "../../layout";
import type { PlanetStatus } from "../../viewmodel";
import { seedOf, type Tier, type TowerSpec } from "./blocks";
import { TILE_U, TILE_V } from "./facade";
import { boxParts, mat4, StaticBatch } from "./geo";
import type { Kit } from "./kit";
import { CURB, FLOOR, PALETTES, STATUS_COLOR, type Palette } from "./scale";
import { addRoof, addTower } from "./tower";
import { mulberry32 } from "@/game/login/plan";

export type { PlanetStatus };

export interface HqStyle {
  floors: number;
  width: number;
  wall: string;
  trim: string;
  glass: string;
  features: readonly string[];
  sign: "simple" | "lit";
}

/** Taille d'une étiquette à l'écran (pixels). */
const LABEL_PX_W = 156;
const LABEL_PX_H = 41;

const STATUS_TEXT: Record<PlanetStatus, string> = {
  locked: "Verrouillé",
  available: "Disponible",
  in_progress: "Expédition en cours",
  visited: "Visité",
};

/** Bâtiments cliquables sans état serveur (boutique, évaluateur) : toujours ouverts, couleur fixe par type. */
const NAV_COLOR: Record<NavBuildingLayout["kind"], string> = { shop: "#e0463c", academy: "#6b4fa0" };
const NAV_TEXT: Record<NavBuildingLayout["kind"], string> = { shop: "Boutique", academy: "Évaluateur" };

export class Landmark {
  readonly group = new Group();
  /** Pièces fusionnées du bâtiment : ce que le clic (raycaster) peut toucher. */
  meshes: Mesh[] = [];
  height = 0;
  status: PlanetStatus = "locked";
  ring: Mesh | null = null;
  pin: Group | null = null;
  label: Sprite | null = null;
  anim: ((t: number) => void)[] = [];
  private disposables: { dispose(): void }[] = [];

  constructor(
    readonly id: string,
    readonly name: string,
    readonly x: number,
    readonly z: number,
  ) {
    this.group.position.set(x, 0, z);
  }
  own<T extends { dispose(): void }>(o: T): T {
    this.disposables.push(o);
    return o;
  }
  clear(): void {
    this.group.clear();
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    this.meshes = [];
    this.anim = [];
    this.ring = this.pin = null;
    this.label = null;
  }
}

export function labelTexture(title: string, sub: string, color: string): CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = 640;
  c.height = 170;
  const g = c.getContext("2d");
  if (!g) return null;
  const r = 34;
  g.fillStyle = "rgba(255,255,255,0.96)";
  g.beginPath();
  g.roundRect(8, 8, 624, 154, r);
  g.fill();
  g.fillStyle = color;
  g.beginPath();
  g.roundRect(8, 8, 26, 154, [r, 0, 0, r]);
  g.fill();
  g.fillStyle = "#16191a";
  g.textBaseline = "middle";
  let size = 52;
  g.font = `700 ${size}px system-ui, sans-serif`;
  while (g.measureText(title).width > 550 && size > 32) {
    size -= 2;
    g.font = `700 ${size}px system-ui, sans-serif`;
  }
  let t = title;
  while (g.measureText(t).width > 550 && t.length > 4) t = t.slice(0, -2);
  g.fillText(t === title ? t : `${t}…`, 56, 64);
  g.fillStyle = "#4a5558";
  g.font = "600 36px system-ui, sans-serif";
  g.fillText(sub, 56, 118);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

function signTexture(text: string, bg: string): CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 96;
  const g = c.getContext("2d");
  if (!g) return null;
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 96);
  g.fillStyle = "#fff8e0";
  g.font = "800 54px system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  let t = text.toUpperCase();
  while (g.measureText(t).width > 470 && t.length > 3) t = t.slice(0, -1);
  g.fillText(t, 256, 52);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

function billboardTexture(seed: number): CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 384;
  const g = c.getContext("2d");
  if (!g) return null;
  const rng = mulberry32(seed);
  const hues = [350, 45, 200, 280, 140];
  for (let i = 0; i < 6; i++) {
    g.fillStyle = `hsl(${hues[Math.floor(rng() * hues.length)]},85%,${45 + rng() * 15}%)`;
    g.fillRect(0, i * 64, 256, 64);
    g.fillStyle = "rgba(255,255,255,0.85)";
    g.fillRect(14 + rng() * 40, i * 64 + 18, 80 + rng() * 120, 14);
    g.fillRect(14 + rng() * 40, i * 64 + 40, 40 + rng() * 80, 8);
  }
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

const box = (w: number, h: number, d: number): BufferGeometry => new BoxGeometry(w, h, d);
const cyl = (r: number, h: number, seg = 14): BufferGeometry => new CylinderGeometry(r, r, h, seg);

function tiersFor(floors: number, w: number, d: number): Tier[] {
  if (floors < 8) return [{ w, d, floors }];
  if (floors < 14) {
    const a = Math.round(floors * 0.65);
    return [{ w, d, floors: a }, { w: w * 0.72, d: d * 0.72, floors: floors - a }];
  }
  const a = Math.round(floors * 0.5);
  const b = Math.round(floors * 0.3);
  return [{ w, d, floors: a }, { w: w * 0.78, d: d * 0.78, floors: b }, { w: w * 0.52, d: d * 0.52, floors: Math.max(1, floors - a - b) }];
}

const pal = (style: keyof typeof PALETTES, i = 0): Palette => PALETTES[style][i % PALETTES[style].length]!;

interface Ctx {
  city: CityScene;
  kit: Kit;
  layout: MapLayout;
  parent: Group;
  pins: boolean;
}

export class Landmarks {
  readonly hq: Landmark;
  readonly places = new Map<string, Landmark>();
  /** Boutique et évaluateur : bâtiments cliquables de la ville, sans état serveur. */
  readonly nav = new Map<string, Landmark>();
  private hqStyle: HqStyle | null = null;
  private company = "";

  constructor(private readonly ctx: Ctx) {
    this.hq = new Landmark("base", "Votre immeuble", ctx.layout.hq.grid.x, ctx.layout.hq.grid.y);
    ctx.parent.add(this.hq.group);
    this.setHq({ floors: 3, width: 3.2, wall: "#a5573d", trim: "#e8d9c4", glass: "#7aa6b8", features: [], sign: "simple" });
    for (const p of ctx.layout.places) {
      const lm = new Landmark(p.id, p.name, p.grid.x, p.grid.y);
      this.places.set(p.id, lm);
      ctx.parent.add(lm.group);
      this.buildPlace(lm, p);
      this.decorate(lm, "locked", false);
    }
    for (const n of ctx.layout.navBuildings) {
      const lm = new Landmark(n.id, n.name, n.grid.x, n.grid.y);
      this.nav.set(n.id, lm);
      ctx.parent.add(lm.group);
      this.buildNav(lm, n);
      this.decorateNav(lm, n.kind);
    }
  }

  all(): Landmark[] {
    return [this.hq, ...this.places.values(), ...this.nav.values()];
  }

  setHq(style: HqStyle, company = ""): void {
    const same = this.hqStyle && JSON.stringify(this.hqStyle) === JSON.stringify(style) && this.company === company;
    if (same) return;
    this.hqStyle = style;
    this.company = company;
    this.hq.clear();
    this.buildHq(this.hq, style, company);
    this.decorate(this.hq, "available", true);
  }

  setStatus(id: string, status: PlanetStatus): void {
    const lm = this.places.get(id);
    if (!lm || lm.status === status) return;
    this.decorate(lm, status, false);
  }

  /** Étiquettes à taille constante à l'écran : `k` = unités monde par pixel écran. */
  scaleLabels(k: number): void {
    for (const lm of this.all()) lm.label?.scale.set(LABEL_PX_W * k, LABEL_PX_H * k, 1);
  }

  update(t: number): void {
    for (const lm of this.all()) {
      for (const f of lm.anim) f(t);
      if (lm.pin) lm.pin.position.y = lm.height + 1.5 + Math.sin(t * 2.4 + lm.x) * 0.18;
      if (lm.ring) {
        const m = lm.ring.material as Material & { opacity: number };
        m.opacity = lm.status === "available" || lm.status === "in_progress" || lm.id === "base" ? 0.55 + Math.sin(t * 3) * 0.25 : 0.5;
      }
    }
  }

  // --- Anneau, épingle, étiquette --------------------------------------------------------------------------------

  private decorate(lm: Landmark, status: PlanetStatus, isHq: boolean): void {
    lm.status = status;
    const { kit, city } = this.ctx;
    if (lm.ring) lm.group.remove(lm.ring);
    if (lm.pin) lm.group.remove(lm.pin);
    if (lm.label) lm.group.remove(lm.label);
    const color = isHq ? "#ff7a1a" : STATUS_COLOR[status];
    const ring = new Mesh(lm.own(new RingGeometry(2.2, 2.55, 48)), lm.own(kit.basic(color, 0.6).clone()));
    (ring.material as Material).transparent = true;
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = CURB + 0.03;
    lm.group.add(ring);
    lm.ring = ring;
    if (!this.ctx.pins && !isHq) {
      lm.ring.visible = false;
      return;
    }
    const pin = new Group();
    const cone = new Mesh(lm.own(new ConeGeometry(0.34, 0.7, 14)), lm.own(kit.basic(color).clone()));
    cone.rotation.x = Math.PI;
    pin.add(cone);
    const head = new Mesh(lm.own(new SphereGeometry(0.26, 14, 10)), lm.own(kit.basic(color).clone()));
    head.position.y = 0.55;
    pin.add(head);
    pin.position.y = lm.height + 1.5;
    pin.scale.setScalar(1.5);
    lm.group.add(pin);
    lm.pin = pin;
    if (this.ctx.pins) {
      const tex = labelTexture(isHq ? this.company || "Votre immeuble" : lm.name, isHq ? "Votre immeuble" : STATUS_TEXT[status], color);
      if (tex) {
        lm.own(tex);
        const sp = new Sprite(lm.own(new SpriteMaterial({ map: tex, transparent: true, depthTest: false })));
        sp.scale.set(7.6, 2.02, 1);
        sp.position.y = lm.height + 3.2;
        sp.renderOrder = 20;
        lm.group.add(sp);
        lm.label = sp;
      }
    } else ring.visible = true;
    void city;
    void Color;
  }

  /** Anneau et étiquette de la boutique / de l'évaluateur : toujours disponibles, couleur fixe par type. */
  private decorateNav(lm: Landmark, kind: NavBuildingLayout["kind"]): void {
    lm.status = "available";
    const { kit } = this.ctx;
    const color = NAV_COLOR[kind];
    const ring = new Mesh(lm.own(new RingGeometry(2.2, 2.55, 48)), lm.own(kit.basic(color, 0.6).clone()));
    (ring.material as Material).transparent = true;
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = CURB + 0.03;
    lm.group.add(ring);
    lm.ring = ring;
    const pin = new Group();
    const cone = new Mesh(lm.own(new ConeGeometry(0.34, 0.7, 14)), lm.own(kit.basic(color).clone()));
    cone.rotation.x = Math.PI;
    pin.add(cone);
    const head = new Mesh(lm.own(new SphereGeometry(0.26, 14, 10)), lm.own(kit.basic(color).clone()));
    head.position.y = 0.55;
    pin.add(head);
    pin.position.y = lm.height + 1.5;
    pin.scale.setScalar(1.5);
    lm.group.add(pin);
    lm.pin = pin;
    const tex = labelTexture(lm.name, NAV_TEXT[kind], color);
    if (tex) {
      lm.own(tex);
      const sp = new Sprite(lm.own(new SpriteMaterial({ map: tex, transparent: true, depthTest: false })));
      sp.scale.set(7.6, 2.02, 1);
      sp.position.y = lm.height + 3.2;
      sp.renderOrder = 20;
      lm.group.add(sp);
      lm.label = sp;
    }
  }

  // --- Lieux -----------------------------------------------------------------------------------------------------

  private finish(lm: Landmark, b: StaticBatch, height: number): void {
    lm.height = height;
    lm.meshes = b.build(lm.group, (o) => lm.own(o), { cast: true, receive: true }, Mesh) as Mesh[];
  }

  private spec(p: PlaceLayout, style: keyof typeof PALETTES, idx: number, w = 3.0): TowerSpec {
    return { x: 0, z: 0, tiers: tiersFor(p.floors, w, w), roof: "flat", palette: pal(style, idx), awning: false };
  }

  private buildPlace(lm: Landmark, p: PlaceLayout): void {
    const { kit } = this.ctx;
    const b = new StaticBatch();
    const trim = kit.lambert("#f4efe0");
    let h: number;
    switch (p.id) {
      case "annuaire": {
        // bibliothèque néoclassique : péristyle de colonnes, fronton triangulaire, grand escalier
        const s = this.spec(p, "stone", 0, 3.1);
        s.tiers = [{ w: 3.1, d: 2.7, floors: 4 }];
        s.roof = "flat";
        h = addTower(b, kit, { ...s, z: -0.2 });
        for (let i = 0; i < 6; i++) b.add(cyl(0.11, 1.8, 10), trim, mat4(-1.25 + i * 0.5, 1.1, 1.35));
        b.add(box(3.1, 0.16, 0.7), trim, mat4(0, 2.05, 1.35));
        const ped = new CylinderGeometry(1.0, 1.0, 3.1, 3);
        ped.rotateZ(Math.PI / 2);
        ped.rotateY(Math.PI / 2);
        b.add(ped, trim, mat4(0, 2.45, 1.35, 1, 0.42, 0.14));
        for (let i = 0; i < 4; i++) b.add(box(2.4 - i * 0.2, 0.08, 0.28), trim, mat4(0, CURB + i * 0.08, 1.9 + (3 - i) * 0.1));
        break;
      }
      case "registre": {
        // hôtel de ville : corps en brique, tour d'horloge centrale et dôme de cuivre
        const s = this.spec(p, "stone", 1, 3.2);
        s.tiers = [{ w: 3.2, d: 2.6, floors: 4 }];
        s.roof = "flat";
        addTower(b, kit, { ...s, z: 0.1 });
        const tw = { x: 0, z: 0.1, tiers: [{ w: 1.2, d: 1.2, floors: 3 }], roof: "flat" as const, palette: pal("stone", 2), awning: false };
        let y0 = 4 * FLOOR;
        const clock = boxParts(1.2, 3 * FLOOR, 1.2, { uTile: TILE_U, vTile: TILE_V, vOffset: y0 });
        b.add(clock.sides, kit.facade(tw.palette), mat4(0, y0, 0.1));
        b.add(clock.top, kit.lambert(tw.palette.roof), mat4(0, y0, 0.1));
        y0 += 3 * FLOOR;
        b.add(cyl(0.5, 0.2, 16), kit.lambert("#8aa79a"), mat4(0, y0 + 0.1, 0.1));
        b.add(new SphereGeometry(0.55, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), kit.lambert("#5fae9a"), mat4(0, y0 + 0.2, 0.1));
        b.add(cyl(0.02, 0.5, 6), kit.lambert("#9aa3ad"), mat4(0, y0 + 1.0, 0.1));
        b.add(cyl(0.34, 0.05, 20), kit.lambert("#fffbe8"), mat4(0, 4 * FLOOR + 1.9, 0.72, 1, 1, 1, 0));
        h = y0 + 1.2;
        break;
      }
      case "carte-locale": {
        // loft en brique de SoHo : escalier de secours en fonte, réservoir sur le toit
        const s = this.spec(p, "brick", 0, 3.0);
        s.roof = "tank";
        h = addTower(b, kit, { ...s, awning: true });
        const fe = kit.lambert("#2f3338");
        for (let f = 1; f < p.floors; f++) {
          b.add(box(0.08, 0.04, 1.5), fe, mat4(1.58, f * FLOOR, 0));
          b.add(box(0.5, 0.03, 1.5), fe, mat4(1.78, f * FLOOR, 0));
          b.add(box(0.03, 0.2, 1.5), fe, mat4(2.0, f * FLOOR + 0.1, 0));
          b.add(box(0.04, FLOOR, 0.04), fe, mat4(1.95, f * FLOOR - FLOOR / 2, 0.7));
        }
        b.add(box(0.9, 0.36, 0.06), kit.basic("#ff4d6d"), mat4(0, 0.9, 1.58));
        break;
      }
      case "linkedin": {
        // tour de verre de Midtown : retraits, antenne, bande lumineuse en couronnement
        const s = this.spec(p, "glass", 0, 3.0);
        h = addTower(b, kit, { ...s, roof: "crown" });
        b.add(box(3.05, 0.1, 3.05), kit.basic("#7fd6ff"), mat4(0, 0.95 + 0.04, 0));
        break;
      }
      case "glassdoor": {
        // Wall Street : tour de pierre à retraits et toit pyramidal doré
        const s = this.spec(p, "concrete", 1, 2.9);
        h = addTower(b, kit, { ...s, roof: "pyramid" });
        const last = s.tiers[s.tiers.length - 1]!;
        b.add(new ConeGeometry(Math.SQRT1_2, 1.1, 4).rotateY(Math.PI / 4).translate(0, 0.55, 0), kit.lambert("#e0b03c", { flat: true }), mat4(0, h + 0.0, 0, last.w * 0.6, 1, last.d * 0.6));
        h += 1.1;
        break;
      }
      default: {
        // Times Square : tour sombre couverte d'écrans publicitaires, héliport au sommet
        const s = this.spec(p, "glass", 1, 3.0);
        h = addTower(b, kit, { ...s, roof: "flat" });
        b.add(cyl(0.95, 0.1, 24), kit.lambert("#6b7078"), mat4(0, h + 0.05, 0));
        b.add(new RingGeometry(0.6, 0.72, 24).rotateX(-Math.PI / 2), kit.basic("#ffffff"), mat4(0, h + 0.11, 0));
        b.add(box(0.1, 0.01, 0.5), kit.basic("#ffffff"), mat4(-0.18, h + 0.12, 0));
        b.add(box(0.1, 0.01, 0.5), kit.basic("#ffffff"), mat4(0.18, h + 0.12, 0));
        b.add(box(0.36, 0.01, 0.08), kit.basic("#ffffff"), mat4(0, h + 0.12, 0));
        for (let i = 0; i < 3; i++) {
          const tex = billboardTexture(seedOf(`${p.id}${i}`));
          if (!tex) continue;
          lm.own(tex);
          const bb = new Mesh(lm.own(new BoxGeometry(0.95, 3.2, 0.12)), lm.own(kit.basic("#ffffff").clone()));
          (bb.material as unknown as { map: CanvasTexture }).map = tex;
          bb.position.set(i === 1 ? 1.56 : 0, 3.4 + i * 0.4, i === 1 ? 0 : 1.54);
          bb.rotation.y = i === 1 ? Math.PI / 2 : 0;
          if (i === 2) bb.position.set(-0.9, 5.2, 1.54);
          lm.group.add(bb);
        }
        break;
      }
    }
    // socle de place
    b.add(box(3.7, 0.05, 3.7), kit.lambert("#e4dccb"), mat4(0, CURB + 0.025, 0));
    this.finish(lm, b, h);
  }

  // --- Boutique et évaluateur (bâtiments de la ville, sans lien avec la prospection) -----------------------------

  private buildNav(lm: Landmark, n: NavBuildingLayout): void {
    const { kit } = this.ctx;
    const b = new StaticBatch();
    const trim = kit.lambert("#f4efe0");
    let h: number;
    if (n.kind === "shop") {
      // boutique : grande vitrine vitrée au rez-de-chaussée, étage en brique, auvent et enseigne
      const w = 3.1;
      const d = 2.8;
      const groundH = 1.15;
      const glass = kit.lambert("#2f6a8c", { opacity: 0.85 });
      const gp = boxParts(w, groundH, d, { uTile: TILE_U, vTile: TILE_V, vOffset: 0 });
      b.add(gp.sides, glass, mat4(0, 0, 0));
      b.add(gp.top, trim, mat4(0, 0, 0));
      const upperFloors = Math.max(1, n.floors - 1);
      const upperPal = pal("brick", 1);
      const up = boxParts(w * 0.94, upperFloors * FLOOR, d * 0.94, { uTile: TILE_U, vTile: TILE_V, vOffset: groundH });
      b.add(up.sides, kit.facade(upperPal), mat4(0, groundH, 0));
      b.add(up.top, kit.lambert(upperPal.roof), mat4(0, groundH, 0));
      const top = groundH + upperFloors * FLOOR;
      h = addRoof(b, kit, "flat", 0, top, 0, w * 0.94, d * 0.94, upperPal.roof, upperPal.trim, mulberry32(seedOf(n.id)));
      // auvent au-dessus de la vitrine
      b.add(box(w * 0.96, 0.08, 0.6), kit.basic("#e0463c"), mat4(0, groundH + 0.1, d / 2 + 0.28));
      b.add(box(w * 0.96, 0.03, 0.08), kit.lambert("#fff6dc"), mat4(0, groundH - 0.06, d / 2 + 0.56));
      for (const sx of [-1, 1]) b.add(cyl(0.02, 0.9, 6), kit.lambert("#5d636c"), mat4(sx * (w / 2 - 0.2), groundH / 2, d / 2 + 0.02));
    } else {
      // évaluateur : académie, péristyle de colonnes, fronton triangulaire et lanterne vitrée au sommet
      const w = 3.0;
      const d = 2.6;
      const bodyFloors = Math.max(2, n.floors);
      const bodyPal = pal("stone", 3);
      const bp = boxParts(w, bodyFloors * FLOOR, d, { uTile: TILE_U, vTile: TILE_V, vOffset: 0 });
      b.add(bp.sides, kit.facade(bodyPal), mat4(0, 0, 0));
      b.add(bp.top, kit.lambert(bodyPal.roof), mat4(0, 0, 0));
      const top = bodyFloors * FLOOR;
      for (let i = 0; i < 4; i++) b.add(cyl(0.1, 1.6, 10), trim, mat4(-1.05 + i * 0.7, top - 0.8, d / 2 + 0.12));
      b.add(box(w, 0.14, 0.6), trim, mat4(0, top + 0.07, d / 2 + 0.12));
      const ped = new CylinderGeometry(0.95, 0.95, w, 3);
      ped.rotateZ(Math.PI / 2);
      ped.rotateY(Math.PI / 2);
      b.add(ped, trim, mat4(0, top + 0.5, d / 2 + 0.12, 1, 0.42, 0.12));
      // lanterne vitrée, éclairée
      const lanY = top + 0.9;
      b.add(cyl(0.4, 0.18, 14), trim, mat4(0, lanY, 0));
      b.add(cyl(0.3, 0.5, 10), kit.lambert("#cfe8f4", { opacity: 0.6, emissive: "#ffe9a0", emissiveIntensity: 0.6 }), mat4(0, lanY + 0.34, 0));
      b.add(new ConeGeometry(0.34, 0.3, 10), kit.lambert(bodyPal.roof), mat4(0, lanY + 0.74, 0));
      h = lanY + 0.9;
    }
    b.add(box(3.7, 0.05, 3.7), kit.lambert("#e4dccb"), mat4(0, CURB + 0.025, 0));
    this.finish(lm, b, h);
  }

  // --- Immeuble du joueur ----------------------------------------------------------------------------------------

  private buildHq(lm: Landmark, st: HqStyle, company: string): void {
    const { kit } = this.ctx;
    const b = new StaticBatch();
    const has = (f: string) => st.features.includes(f);
    const W = Math.min(3.2, st.width);
    const punched: Palette = { wall: st.wall, glass: st.glass === "#7aa6b8" ? "#2f3e4d" : "#2c4a63", lit: "#ffe2a0", roof: "#6c4a3c", trim: st.trim, kind: "punched" };
    const curtain: Palette = { wall: st.wall, glass: "#2a5778", lit: "#e0f4ff", roof: "#40647f", trim: st.trim, kind: "curtain" };
    const tiers = tiersFor(st.floors, W, W);
    let y = 0;
    let top = 0;
    tiers.forEach((t, i) => {
      const half = tiers.length > 1 && i >= Math.ceil(tiers.length / 2);
      const p = has("glass_full") ? curtain : has("glass_partial") && half ? curtain : punched;
      const parts = boxParts(t.w, t.floors * FLOOR, t.d, { uTile: TILE_U, vTile: TILE_V, vOffset: y });
      b.add(parts.sides, kit.facade(p), mat4(0, y, 0));
      b.add(parts.top, kit.lambert(p.roof), mat4(0, y, 0));
      b.add(box(t.w + 0.14, 0.1, t.d + 0.14), kit.lambert("#f2c35a"), mat4(0, y + t.floors * FLOOR - 0.05, 0));
      y += t.floors * FLOOR;
      top = y;
    });
    const last = tiers[tiers.length - 1]!;
    // podium et escalier
    b.add(box(3.7, 0.16, 3.7), kit.lambert("#efe6c8"), mat4(0, CURB + 0.08, 0));
    for (let i = 0; i < 3; i++) b.add(box(1.6 - i * 0.2, 0.06, 0.22), kit.lambert("#efe6c8"), mat4(0, CURB + 0.03 + i * 0.06, 1.9 - i * 0.12));
    b.add(box(0.7, 0.62, 0.06), kit.lambert("#2b2f38"), mat4(0, 0.43, W / 2 + 0.03));
    if (has("big_lobby")) b.add(box(W * 0.8, 0.8, 0.3), kit.basic("#ffe9b0"), mat4(0, 0.5, W / 2 + 0.16));
    if (has("grand_hall")) for (let i = 0; i < 5; i++) b.add(cyl(0.09, 1.1, 10), kit.lambert("#fff6dc"), mat4(-1.2 + i * 0.6, 0.7, W / 2 + 0.5));
    if (has("awning")) {
      b.add(box(1.5, 0.06, 0.5), kit.lambert("#e0463c"), mat4(0, 0.82, W / 2 + 0.3));
      b.add(box(1.5, 0.03, 0.1), kit.lambert("#fff6dc"), mat4(0, 0.76, W / 2 + 0.52));
    }
    if (has("plants")) {
      for (const sx of [-1.35, 1.35]) {
        b.add(box(0.5, 0.24, 0.4), kit.lambert("#8a5f3c"), mat4(sx, 0.28, W / 2 + 0.35));
        b.add(new SphereGeometry(0.3, 10, 8), kit.lambert("#5aa84c", { flat: true }), mat4(sx, 0.55, W / 2 + 0.35));
      }
    }
    if (has("facade_lights")) {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add(box(0.05, top - 0.5, 0.05), kit.basic("#ffe9a0"), mat4(sx * (W / 2 - 0.02), 0.3 + (top - 0.5) / 2, sz * (W / 2 - 0.02)));
    }
    if (has("hanging_garden")) {
      for (let f = 3; f < st.floors - 2; f += 4) {
        b.add(box(W * 0.9, 0.06, 0.55), kit.lambert("#d8d2c0"), mat4(0, f * FLOOR, W / 2 + 0.27));
        for (let i = 0; i < 4; i++) b.add(new SphereGeometry(0.17, 8, 6), kit.lambert("#5aa84c", { flat: true }), mat4(-1.0 + i * 0.66, f * FLOOR + 0.16, W / 2 + 0.3));
      }
    }
    if (has("rooftop_terrace") || has("heliport")) {
      const rail = kit.lambert("#f6efd9");
      b.add(box(last.w, 0.18, 0.05), rail, mat4(0, top + 0.09, last.d / 2 - 0.03));
      b.add(box(last.w, 0.18, 0.05), rail, mat4(0, top + 0.09, -last.d / 2 + 0.03));
    }
    let h = top;
    if (has("heliport")) {
      b.add(cyl(Math.min(1.05, last.w * 0.42), 0.1, 28), kit.lambert("#5d636c"), mat4(0, top + 0.05, 0));
      b.add(new RingGeometry(0.7, 0.8, 28).rotateX(-Math.PI / 2), kit.basic("#ffffff"), mat4(0, top + 0.11, 0));
      for (const [bx, bz, bw, bd] of [[-0.2, 0, 0.1, 0.55], [0.2, 0, 0.1, 0.55], [0, 0, 0.4, 0.09]] as const) b.add(box(bw, 0.01, bd), kit.basic("#ffffff"), mat4(bx, top + 0.12, bz));
      h = top + 0.3;
    } else if (has("rooftop_terrace")) {
      for (const [bx, bz] of [[-0.6, -0.5], [0.5, 0.4], [-0.3, 0.6]] as const) b.add(new SphereGeometry(0.22, 8, 6), kit.lambert("#5aa84c", { flat: true }), mat4(bx, top + 0.3, bz));
      b.add(cyl(0.02, 0.9, 6), kit.lambert("#9aa3ad"), mat4(0.55, top + 0.45, -0.5));
      b.add(new ConeGeometry(0.5, 0.25, 12), kit.lambert("#e0463c"), mat4(0.55, top + 0.95, -0.5));
      h = top + 1.1;
    } else if (has("crown")) {
      h = addRoof(b, kit, "crown", 0, top, 0, last.w, last.d, "#40647f", st.trim, mulberry32(7));
    } else {
      h = addRoof(b, kit, "flat", 0, top, 0, last.w, last.d, "#6c4a3c", st.trim, mulberry32(3));
    }
    // mât et fanion orange (la couleur de l'entreprise)
    b.add(cyl(0.025, 1.5, 6), kit.lambert("#9aa3ad"), mat4(last.w / 2 - 0.3, h + 0.75, -last.d / 2 + 0.3));
    b.add(box(0.55, 0.3, 0.03), kit.basic("#ff7a1a"), mat4(last.w / 2 - 0.02, h + 1.25, -last.d / 2 + 0.3));
    h += 1.5;
    // enseigne
    const tex = signTexture(company || "Votre entreprise", st.sign === "lit" ? "#c24d0a" : "#6c4a3c");
    if (tex) {
      lm.own(tex);
      const sign = new Mesh(lm.own(new BoxGeometry(2.0, 0.37, 0.08)), lm.own(kit.basic("#ffffff").clone()));
      (sign.material as unknown as { map: CanvasTexture }).map = tex;
      sign.position.set(0, 1.35, W / 2 + 0.06);
      lm.group.add(sign);
    }
    if (has("panoramic_elevator")) {
      const tube = new Mesh(lm.own(new BoxGeometry(0.46, top, 0.46)), lm.own(kit.lambert("#bfe6f5", { opacity: 0.45 }).clone()));
      tube.position.set(W / 2 + 0.28, top / 2, 0.9);
      lm.group.add(tube);
      const cab = new Mesh(lm.own(new BoxGeometry(0.34, 0.4, 0.34)), lm.own(kit.lambert("#ff7a1a").clone()));
      cab.position.set(W / 2 + 0.28, 0.4, 0.9);
      lm.group.add(cab);
      lm.anim.push((t) => (cab.position.y = 0.3 + (0.5 + 0.5 * Math.sin(t * 0.5)) * (top - 0.6)));
    }
    if (has("decor_drones")) {
      for (let i = 0; i < 3; i++) {
        const d = new Mesh(lm.own(new BoxGeometry(0.32, 0.07, 0.32)), lm.own(kit.basic(["#ff7a1a", "#3b9be9", "#46b36b"][i]!).clone()));
        lm.group.add(d);
        lm.anim.push((t) => d.position.set(Math.cos(t * 0.8 + i * 2.1) * 2.6, h + 0.6 + Math.sin(t * 1.7 + i) * 0.3, Math.sin(t * 0.8 + i * 2.1) * 2.6));
      }
    }
    this.finish(lm, b, h);
  }
}
