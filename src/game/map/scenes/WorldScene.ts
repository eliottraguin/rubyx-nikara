/**
 * Scène de la ville : immeuble du joueur au centre, six lieux, rues, parc, fleuves, bots et véhicules, caméra plein
 * écran (docs/VILLE-ET-BATIMENT.md, docs/CARTE-TECH.md). L'art est PLACEHOLDER (généré par le code, `art.ts`).
 * AFFICHAGE seulement : aucun appel réseau, aucune règle de jeu. La scène lit le MapViewModel et émet des
 * intentions (clic, survol) sur le bus ; React décide. Les graphismes ne passent que par les clés de `TEX`.
 * Les animations ne retardent jamais un résultat et se coupent en `prefers-reduced-motion`.
 * Les textes affichés (nom d'entreprise, rôles, lieux) sont rendus en TEXTE BRUT par `Phaser.GameObjects.Text`.
 */
import Phaser from "phaser";
import { ROLE_LABEL } from "@/lib/format";
import {
  BLOCK_S,
  CRANE_SIZE,
  blockArt,
  ensureHqTexture,
  generateMapTextures,
  hqRoof,
  hqSize,
  placeArt,
  rng,
  S,
  TEX,
  TREE_SIZE,
  VEHICLE_SIZE,
  GROUND_S,
} from "../art";
import type { MapBus } from "../bus";
import { PX_PER_FLOOR, bannerColor, buildingHeightPx, truncateSign } from "../building";
import { TILE_H, TILE_W, gridToScreen, type Pt } from "../iso";
import { LAYOUT } from "../layout";
import { pathPose, tripPath, type TripPath } from "../paths";
import { routePoint } from "../route";
import { polylinePoint } from "../streets";
import { tripFrame, type Trip } from "../trips";
import { buildMapViewModel, type MapViewModel, type PlanetStatus, type PlanetVM } from "../viewmodel";

const MAX_ZOOM = 2.4;
const TAP_DISTANCE = 10;
const DOUBLE_TAP_MS = 380;
/** Durée du chantier d'une montée de niveau (jamais bloquante : on peut passer). */
const CONSTRUCTION_MS = 3600;
/** Décalage de profondeur des bots à terre : ils restent visibles devant les îlots proches. */
const GROUND_BOT_DEPTH = 260;

const PILL_COLOR: Record<PlanetStatus, number> = {
  locked: 0x3a4650,
  available: 0x1f7a4a,
  in_progress: 0x9a5700,
  visited: 0x1d4f91,
};

const hex = (s: string) => Phaser.Display.Color.HexStringToColor(s).color;

interface PlaceNode {
  id: string;
  vm: PlanetVM;
  root: Phaser.GameObjects.Container;
  halo: Phaser.GameObjects.Image;
  body: Phaser.GameObjects.Image;
  lock: Phaser.GameObjects.Image;
  select: Phaser.GameObjects.Graphics;
  labels: Phaser.GameObjects.Container;
  name: Phaser.GameObjects.Text;
  platform: Phaser.GameObjects.Text;
  pill: Phaser.GameObjects.Graphics;
  status: Phaser.GameObjects.Text;
  pips: Phaser.GameObjects.Image[];
  hit: Phaser.GameObjects.Rectangle;
  roofY: number;
}

interface Bubble {
  c: Phaser.GameObjects.Container;
  text: Phaser.GameObjects.Text;
}

interface BotNode {
  id: string;
  root: Phaser.GameObjects.Container;
  img: Phaser.GameObjects.Image;
  rotor: Phaser.GameObjects.Image;
  tag: Phaser.GameObjects.Text;
  bubble: Bubble;
  greeter: Phaser.GameObjects.Image;
  folder: Phaser.GameObjects.Image;
  planetBubble: Bubble;
  shadow: Phaser.GameObjects.Image;
  smoke: Phaser.GameObjects.Graphics;
}

type CamPose = { cx: number; cy: number; zoom: number };

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export class WorldScene extends Phaser.Scene {
  private bus!: MapBus;
  private font = "sans-serif";
  private dpr = 1;
  private vm!: MapViewModel;
  private reduced = false;
  private selectedId: string | null = null;
  private nodes = new Map<string, PlaceNode>();
  private routes!: Phaser.GameObjects.Graphics;
  // Immeuble du joueur.
  private hqRoot!: Phaser.GameObjects.Container;
  private hqBody!: Phaser.GameObjects.Image;
  private hqHalo!: Phaser.GameObjects.Image;
  private hqSign!: Phaser.GameObjects.Container;
  private hqSignBg!: Phaser.GameObjects.Graphics;
  private hqSignText!: Phaser.GameObjects.Text;
  private hqFlag!: Phaser.GameObjects.Graphics;
  private hqArrow!: Phaser.GameObjects.Container;
  private hqLabels!: Phaser.GameObjects.Container;
  private hqLevel!: Phaser.GameObjects.Text;
  private hqPill!: Phaser.GameObjects.Graphics;
  private hqStatus!: Phaser.GameObjects.Text;
  private hqSelect!: Phaser.GameObjects.Graphics;
  private hqHit!: Phaser.GameObjects.Rectangle;
  private crane!: Phaser.GameObjects.Image;
  private scaffold!: Phaser.GameObjects.Graphics;
  private shownLevel = 0;
  private construction: { from: number; to: number; startedAt: number } | null = null;
  private arrowUntil = 0;
  private lastTapAt = 0;
  private tooltip!: Phaser.GameObjects.Container;
  private tooltipBg!: Phaser.GameObjects.Graphics;
  private tooltipText!: Phaser.GameObjects.Text;
  private hoverId: string | null = null;
  private ambient: Phaser.Tweens.Tween[] = [];
  private cur = { cx: 0, cy: 0, zoom: 1 };
  private target = { cx: 0, cy: 0, zoom: 1 };
  private zoomLimits = { min: 0.15, max: MAX_ZOOM, initial: 0.6 };
  private userMoved = false;
  private dragging = false;
  private pinchDist = 0;
  private pinching = false;
  private unsubs: (() => void)[] = [];
  private dead = false;
  // Vue d'un lieu (travelling) et voyages des bots.
  private trips: Trip[] = [];
  private bots = new Map<string, BotNode>();
  private paths = new Map<string, TripPath>();
  private viewId: string | null = null;
  private preView: CamPose | null = null;
  private diving = false;
  private dive: Phaser.Tweens.Tween | null = null;

  constructor() {
    super("world");
  }

  create(): void {
    this.bus = this.registry.get("bus") as MapBus;
    this.font = (this.registry.get("font") as string | undefined) ?? "system-ui, sans-serif";
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    generateMapTextures(this, LAYOUT);
    this.cameras.main.setBackgroundColor("#8dbbd6");
    this.vm = this.bus.vm ?? buildMapViewModel(null);
    this.reduced = this.bus.reducedMotion;
    this.selectedId = this.bus.selectedId;
    this.trips = this.bus.trips;

    this.buildCity();
    this.buildHq();
    this.buildTooltip();
    this.ensureNodes();
    this.setupCamera();
    this.setupInput();
    this.subscribe();
    this.applyAll();
    this.arrowUntil = Date.now() + 12000;

    this.scale.on("resize", this.onResize, this);
    // `game.destroy(true)` émet DESTROY (pas SHUTDOWN) : sans ce double abonnement la scène détruite resterait
    // branchée sur le bus et planterait au prochain événement (ex. retour de la vue liste vers la carte).
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.cleanup, this);
    this.bus.emit("scene:ready");
  }

  // ───────────── Construction ─────────────

  private text(size: number, style: Phaser.Types.GameObjects.Text.TextStyle = {}): Phaser.GameObjects.Text {
    return this.add
      .text(0, 0, "", {
        fontFamily: this.font,
        fontSize: `${size}px`,
        color: "#ffffff",
        stroke: "#10202a",
        strokeThickness: Math.round(size / 4),
        resolution: this.dpr,
        ...style,
      })
      .setOrigin(0.5, 0);
  }

  /** Sol cuit, îlots, arbres du parc. */
  private buildCity(): void {
    const g = LAYOUT.ground;
    this.add.image(g.minX, g.minY, TEX.ground).setOrigin(0, 0).setScale(1 / GROUND_S).setDepth(-2000);
    this.routes = this.add.graphics().setDepth(-1500);
    const half = TILE_H / 2;
    for (const b of LAYOUT.blocks) {
      const c = gridToScreen({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
      const a = blockArt(b.floors);
      this.add
        .image(c.x, c.y, TEX.block(b.style, b.floors))
        .setOrigin(a.ox / a.w, a.oy / a.h)
        .setScale(1 / BLOCK_S)
        .setDepth(c.y + (b.w / 2 + b.h / 2) * half);
    }
    // Arbres du parc (décor, graine fixe : même parc à chaque chargement).
    const pk = LAYOUT.park;
    const rand = rng(pk.seed);
    let placed = 0;
    for (let tries = 0; placed < pk.trees && tries < pk.trees * 6; tries++) {
      const gx = pk.x + 0.6 + rand() * (pk.w - 1.2);
      const gy = pk.y + 0.6 + rand() * (pk.h - 1.2);
      const dx = (gx - pk.pond.x) / (pk.pond.rx + 0.6);
      const dy = (gy - pk.pond.y) / (pk.pond.ry + 0.6);
      if (dx * dx + dy * dy < 1) continue;
      if (Math.abs(gx - (pk.x + pk.w / 2)) < 0.8 || Math.abs(gy - (pk.y + pk.h / 2)) < 0.8) continue; // allées
      const p = gridToScreen({ x: gx, y: gy });
      this.add
        .image(p.x, p.y, TEX.tree(Math.floor(rand() * 3)))
        .setOrigin(TREE_SIZE.ox / TREE_SIZE.w, TREE_SIZE.oy / TREE_SIZE.h)
        .setScale((0.9 + rand() * 0.5) / S)
        .setDepth(p.y);
      placed++;
    }
  }

  private buildHq(): void {
    const hq = LAYOUT.hq;
    const southY = hq.world.y + ((hq.footprint.w + hq.footprint.h) / 2) * (TILE_H / 2);
    this.hqHalo = this.add.image(0, 0, TEX.halo).setBlendMode(Phaser.BlendModes.ADD).setTint(0xffd25a).setAlpha(0.55).setScale(520 / (256 * S), 260 / (256 * S));
    this.hqBody = this.add.image(0, 0, TEX.hq(1)).setScale(1 / S);
    this.hqSelect = this.add.graphics();
    this.hqFlag = this.add.graphics();

    this.hqSignBg = this.add.graphics();
    this.hqSignText = this.text(15, { fontStyle: "bold", color: "#fff6d6", stroke: "#000000", strokeThickness: 0 }).setOrigin(0.5, 0.5);
    this.hqSign = this.add.container(hq.world.x, hq.world.y, [this.hqSignBg, this.hqSignText]).setDepth(89000);

    const arrowText = this.text(17, { fontStyle: "bold", color: "#1d1400", stroke: "#000000", strokeThickness: 0 }).setText("Votre siège").setOrigin(0.5, 0.5);
    const w = arrowText.width + 22;
    const arrowBg = this.add.graphics();
    arrowBg.fillStyle(0xffd25a, 1).fillRoundedRect(-w / 2, -16, w, 32, 10).fillTriangle(-9, 15, 9, 15, 0, 30);
    arrowBg.lineStyle(2, 0x7a4a00, 0.9).strokeRoundedRect(-w / 2, -16, w, 32, 10);
    this.hqArrow = this.add.container(0, 0, [arrowBg, arrowText]);

    this.hqLevel = this.text(16, { fontStyle: "bold" });
    this.hqPill = this.add.graphics();
    this.hqStatus = this.text(13, { fontStyle: "bold", stroke: "#000000", strokeThickness: 0 });
    this.hqLabels = this.add.container(hq.world.x, hq.world.y, [this.hqLevel, this.hqPill, this.hqStatus]).setDepth(90000);
    this.hqStatus.setPosition(0, 24);

    this.hqHit = this.add.rectangle(0, 0, 230, 200, 0xffffff, 0.001);
    this.hqHit.setInteractive({ useHandCursor: true });
    this.hqHit.on("pointerover", () => this.setHover("base"));
    this.hqHit.on("pointerout", () => this.setHover(null));
    this.hqHit.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      if (this.pinching || pointer.getDistance() >= TAP_DISTANCE) return;
      const now = Date.now();
      // Double clic sur l'immeuble : recentrer la caméra sur le siège.
      if (now - this.lastTapAt < DOUBLE_TAP_MS) this.goHome();
      this.lastTapAt = now;
      this.bus.emit("planet:select", "base");
    });

    this.crane = this.add.image(0, 0, TEX.crane).setScale(1 / S).setOrigin(CRANE_SIZE.ox / CRANE_SIZE.w, CRANE_SIZE.oy / CRANE_SIZE.h).setVisible(false);
    this.scaffold = this.add.graphics().setVisible(false);

    this.hqRoot = this.add.container(hq.world.x, hq.world.y, [this.hqHalo, this.hqSelect, this.hqBody, this.hqFlag, this.crane, this.scaffold, this.hqHit]);
    this.hqRoot.setDepth(southY);
    this.hqArrow.setDepth(99000);
    this.hqRoot.setPosition(hq.world.x, hq.world.y);
    this.applyHqLevel(this.vm.building.level);
  }

  private buildTooltip(): void {
    this.tooltipBg = this.add.graphics();
    this.tooltipText = this.text(14, { align: "center", stroke: "#000000", strokeThickness: 0, lineSpacing: 3 }).setOrigin(0.5, 0.5);
    this.tooltip = this.add.container(0, 0, [this.tooltipBg, this.tooltipText]).setDepth(100000).setVisible(false);
  }

  private ensureNodes(): void {
    const ids = new Set<string>(this.vm.planets.map((p) => p.id));
    for (const [id, node] of this.nodes) {
      if (!ids.has(id)) {
        node.root.destroy();
        node.labels.destroy();
        this.nodes.delete(id);
      }
    }
    for (const p of this.vm.planets) if (!this.nodes.has(p.id)) this.nodes.set(p.id, this.createNode(p));
  }

  private createNode(p: PlanetVM): PlaceNode {
    const art = placeArt(p.floors);
    const roofY = -p.floors * PX_PER_FLOOR;
    const south = ((4 + 4) / 2) * (TILE_H / 2);
    const halo = this.add.image(0, 0, TEX.halo).setBlendMode(Phaser.BlendModes.ADD).setScale(360 / (256 * S), 180 / (256 * S));
    const body = this.add.image(0, 0, TEX.place(p.id)).setOrigin(art.ox / art.w, art.oy / art.h).setScale(1 / S);
    const lock = this.add.image(0, roofY * 0.55, TEX.lock).setScale(1 / S);
    const select = this.add.graphics();

    const name = this.text(17, { fontStyle: "bold" }).setText(p.placeName);
    const platform = this.text(13, { color: "#dff2f7" }).setText(`Plateforme : ${p.name}`).setPosition(0, 21);
    const pill = this.add.graphics();
    const status = this.text(13, { fontStyle: "bold", stroke: "#000000", strokeThickness: 0 });
    const pips = [0, 1, 2].map((i) => this.add.image((i - 1) * 26, 70, TEX.pipOff).setScale(1 / S).setOrigin(0.5, 0));
    const labels = this.add.container(p.world.x, p.world.y + south + 26, [name, platform, pill, status, ...pips]).setDepth(90000);
    status.setPosition(0, 44);

    const hitH = -roofY + 100;
    const hit = this.add.rectangle(0, roofY / 2 - 10, 220, hitH, 0xffffff, 0.001);
    hit.setInteractive({ useHandCursor: true });
    hit.on("pointerover", () => this.setHover(p.id));
    hit.on("pointerout", () => this.setHover(null));
    hit.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      if (!this.pinching && pointer.getDistance() < TAP_DISTANCE) this.bus.emit("planet:select", p.id);
    });

    const root = this.add.container(p.world.x, p.world.y, [halo, select, body, lock, hit]);
    root.setDepth(p.world.y + south);
    return { id: p.id, vm: p, root, halo, body, lock, select, labels, name, platform, pill, status, pips, hit, roofY };
  }

  // ───────────── État -> affichage ─────────────

  private applyAll(): void {
    this.stopAmbient();
    this.drawRoutes();
    const v = this.vm;
    this.applyHq();
    for (const p of v.planets) {
      const n = this.nodes.get(p.id);
      if (n) this.applyNode(n, p);
    }
    this.onZoomChanged();
    this.startAmbient();
    this.applyDim(false);
  }

  private drawPill(g: Phaser.GameObjects.Graphics, text: Phaser.GameObjects.Text, label: string, color: number, y: number): void {
    text.setText(label);
    const w = text.width + 18;
    g.clear().fillStyle(color, 1).fillRoundedRect(-w / 2, y - 2, w, text.height + 4, 10);
    g.lineStyle(1.5, 0xffffff, 0.45).strokeRoundedRect(-w / 2, y - 2, w, text.height + 4, 10);
  }

  private applyNode(n: PlaceNode, p: PlanetVM): void {
    n.vm = p;
    const locked = p.status === "locked";
    n.body.setTexture(locked ? TEX.placeLocked(p.id) : TEX.place(p.id));
    n.lock.setVisible(locked);
    n.halo.setTint(hex(p.palette.glow)).setAlpha(locked ? 0 : p.status === "visited" ? 0.3 : 0.6);
    // Texte d'état + pastille (jamais la couleur seule : libellé toujours écrit).
    this.drawPill(n.pill, n.status, p.statusLabel, PILL_COLOR[p.status], 44);
    const showPips = p.status === "visited";
    n.pips.forEach((pip, i) => pip.setVisible(showPips).setTexture(i < p.stars ? TEX.pipOn : TEX.pipOff));
    // Sélection : losange doré autour du bâtiment, au sol.
    n.select.clear();
    const sel = this.selectedId === p.id;
    if (sel) this.drawFootprint(n.select, 4, 4, 0xffd25a, 5);
    n.name.setColor(sel ? "#ffe9a8" : "#ffffff");
    n.root.setDepth(p.world.y + (4 + 4) * (TILE_H / 4) + (sel ? 1 : 0));
  }

  /** Losange de l'emprise au sol (cases w × h) centré en (0, 0). */
  private drawFootprint(g: Phaser.GameObjects.Graphics, w: number, h: number, color: number, lw: number): void {
    const P = (gx: number, gy: number) => gridToScreen({ x: gx, y: gy });
    g.lineStyle(lw, color, 1).strokePoints([P(-w / 2, -h / 2), P(w / 2, -h / 2), P(w / 2, h / 2), P(-w / 2, h / 2)], true, true);
  }

  private roofPx(): number {
    return buildingHeightPx(this.shownLevel || this.vm.building.level);
  }

  private pathFor(placeId: string): TripPath | null {
    const key = `${placeId}:${this.shownLevel}`;
    let p = this.paths.get(key);
    if (!p) {
      p = tripPath(LAYOUT, placeId, this.roofPx()) ?? undefined;
      if (p) this.paths.set(key, p);
    }
    return p ?? null;
  }

  /** Trajets en pointillés vers les lieux ouverts (aide visuelle : les bots suivent ces tracés). */
  private drawRoutes(): void {
    const g = this.routes;
    g.clear();
    for (const p of this.vm.planets) {
      if (p.status === "locked") continue;
      const path = this.pathFor(p.id);
      if (!path) continue;
      g.fillStyle(0xffd25a, 0.8);
      const steps = Math.max(8, Math.round(path.length / 22));
      for (let i = 1; i < steps; i++) {
        const u = i / steps;
        // Pointillés au sol : pour l'hélicoptère, la projection au sol de la ligne de vol.
        const pt = path.kind === "ground" ? polylinePoint(path.points, u) : pathPose(path, u).ground;
        g.fillCircle(pt.x, pt.y, path.kind === "ground" ? 3 : 2);
      }
    }
  }

  // ───────────── Immeuble ─────────────

  private applyHqLevel(level: number): void {
    ensureHqTexture(this, level);
    const sz = hqSize(level);
    const roof = hqRoof(level);
    this.shownLevel = level;
    this.hqBody.setTexture(TEX.hq(level)).setOrigin(sz.ox / sz.w, sz.oy / sz.h);
    const baseHalf = (roof.baseW * TILE_H) / 2; // distance du centre au coin avant (px)
    // Enseigne : sur la façade, au-dessus de l'entrée, côté coin avant.
    this.hqSign.setPosition(LAYOUT.hq.world.x, LAYOUT.hq.world.y + baseHalf - roof.podium - 16);
    // Fanion : sur le coin arrière du toit.
    this.drawFlag(0, -roof.h - (roof.topW * TILE_H) / 2);
    this.hqArrow.setPosition(LAYOUT.hq.world.x, LAYOUT.hq.world.y - roof.h - 120);
    // Zone cliquable et étiquettes.
    this.hqHit.setSize(230, roof.h + 120).setPosition(0, -roof.h / 2 + 10);
    const area = this.hqHit.input?.hitArea as Phaser.Geom.Rectangle | undefined;
    area?.setSize(230, roof.h + 120);
    this.crane.setPosition(110, 20);
    this.paths.clear();
  }

  private drawFlag(x: number, y: number, phase = 0): void {
    const color = hex(bannerColor(this.vm.company));
    const g = this.hqFlag;
    g.clear();
    g.lineStyle(3, 0x2a323a, 1).lineBetween(x, y, x, y - 42);
    const wave = this.reduced ? 0 : Math.sin(phase) * 4;
    g.fillStyle(color, 1).fillTriangle(x, y - 42, x + 30, y - 35 + wave, x, y - 26);
    g.lineStyle(1.5, 0xffffff, 0.8).strokeTriangle(x, y - 42, x + 30, y - 35 + wave, x, y - 26);
  }

  private applyHq(): void {
    const v = this.vm;
    const b = v.building;
    if (!this.construction) {
      if (this.shownLevel === 0) this.applyHqLevel(b.level);
      else if (b.level !== this.shownLevel) {
        if (b.level > this.shownLevel && !this.reduced) this.startConstruction(this.shownLevel, b.level);
        else this.applyHqLevel(b.level); // animations réduites, ou valeur plus basse : pas de chantier
      }
    } else this.construction.to = b.level;
    const sign = truncateSign(v.company);
    this.hqSignText.setText(sign);
    const w = this.hqSignText.width + 18;
    const lit = b.level >= 4;
    this.hqSignBg.clear();
    this.hqSignBg.fillStyle(lit ? 0x16212b : 0x3a2c22, 0.96).fillRoundedRect(-w / 2, -13, w, 26, 6);
    this.hqSignBg.lineStyle(2, lit ? 0xffd25a : 0xe8d9c4, 1).strokeRoundedRect(-w / 2, -13, w, 26, 6);
    this.hqLevel.setText(`Niveau ${b.level} sur ${b.maxLevel}`);
    const owned = v.base.agentsOwned;
    this.drawPill(this.hqPill, this.hqStatus, `Garage : ${owned} bot${owned > 1 ? "s" : ""}`, 0x0b5c63, 24);
    this.hqSelect.clear();
    if (this.selectedId === "base") this.drawFootprint(this.hqSelect, 4, 4, 0xffd25a, 5);
    this.drawFlag(0, -hqRoof(this.shownLevel || 1).h - (hqRoof(this.shownLevel || 1).topW * TILE_H) / 2);
  }

  /** Chantier (grue, échafaudage) puis nouvelle apparence : non bloquant, désactivable (`building:skip`). */
  private startConstruction(from: number, to: number): void {
    this.construction = { from, to, startedAt: Date.now() };
    this.crane.setVisible(true);
    this.scaffold.setVisible(true);
    this.bus.emit("building:construction", true);
  }

  private finishConstruction(): void {
    const c = this.construction;
    if (!c) return;
    this.construction = null;
    this.crane.setVisible(false);
    this.scaffold.setVisible(false);
    this.applyHqLevel(this.vm.building.level);
    this.applyHq();
    if (!this.reduced) {
      // Éclat d'inauguration.
      this.hqBody.setAlpha(0.35);
      this.tweens.add({ targets: this.hqBody, alpha: 1, duration: 600, ease: "Sine.Out" });
      this.tweens.add({ targets: this.hqHalo, alpha: { from: 1, to: 0.55 }, duration: 900 });
    }
    this.bus.emit("building:construction", false);
  }

  private updateConstruction(now: number): void {
    const c = this.construction;
    if (!c) return;
    const t = (now - c.startedAt) / CONSTRUCTION_MS;
    if (t >= 1) {
      this.finishConstruction();
      return;
    }
    const h = buildingHeightPx(c.from);
    const g = this.scaffold;
    g.clear();
    g.lineStyle(2, 0xd9a21a, 0.95);
    const w = 2.0;
    const P = (gx: number, gy: number, z: number): Pt => ({ x: (gx - gy) * (TILE_W / 2), y: (gx + gy) * (TILE_H / 2) - z });
    const ground = [P(-w, w, 0), P(w, w, 0), P(w, -w, 0)];
    for (const p of ground) g.lineBetween(p.x, p.y, p.x, p.y - h - 10);
    for (let z = 0; z <= h + 10; z += 24) {
      g.lineBetween(ground[0]!.x, ground[0]!.y - z, ground[1]!.x, ground[1]!.y - z);
      g.lineBetween(ground[1]!.x, ground[1]!.y - z, ground[2]!.x, ground[2]!.y - z);
    }
    // Poussière et grue qui oscille.
    this.crane.setScale(Math.max(1, h / 150) / S).setAngle(Math.sin(now / 420) * 1.5);
    const dust = (now / 90) % 1;
    g.fillStyle(0xe8e0d0, 0.5 * (1 - dust));
    g.fillCircle(-60 + dust * 20, 30 - dust * 20, 8 + dust * 8);
    g.fillCircle(70 - dust * 25, 28 - dust * 25, 7 + dust * 7);
  }

  // ───────────── Animations d'ambiance (coupées en reduced-motion) ─────────────

  private stopAmbient(): void {
    for (const t of this.ambient) t.remove();
    this.ambient = [];
    this.hqHalo.setScale(520 / (256 * S), 260 / (256 * S));
    this.hqArrow.setScale(1);
    for (const n of this.nodes.values()) n.halo.setScale(360 / (256 * S), 180 / (256 * S));
  }

  private startAmbient(): void {
    if (this.reduced) return;
    this.ambient.push(this.tweens.add({ targets: this.hqHalo, alpha: { from: 0.35, to: 0.75 }, duration: 1600, yoyo: true, repeat: -1, ease: "Sine.InOut" }));
    let i = 0;
    for (const n of this.nodes.values()) {
      if (n.vm.status !== "locked") {
        const sx = 360 / (256 * S);
        this.ambient.push(this.tweens.add({ targets: n.halo, scaleX: { from: sx * 0.94, to: sx * 1.08 }, duration: 1500 + i * 120, yoyo: true, repeat: -1, ease: "Sine.InOut" }));
      }
      i++;
    }
  }

  // ───────────── Survol / infobulle ─────────────

  private setHover(id: string | null): void {
    if (this.hoverId === id) return;
    this.hoverId = id;
    this.bus.emit("planet:hover", id);
    if (!id) {
      this.tooltip.setVisible(false);
      return;
    }
    let lines: string[];
    let anchor: Pt;
    if (id === "base") {
      lines = [truncateSign(this.vm.company), `Immeuble niveau ${this.vm.building.level} sur ${this.vm.building.maxLevel}`, "Entrer dans votre immeuble"];
      anchor = { x: LAYOUT.hq.world.x, y: LAYOUT.hq.world.y - hqRoof(this.shownLevel || 1).h - 30 };
    } else {
      const n = this.nodes.get(id);
      if (!n) {
        this.tooltip.setVisible(false);
        return;
      }
      const p = n.vm;
      lines = [p.title, `${p.district} · ${p.statusLabel}`, `Trajet : ${p.vehicleManner}`];
      if (p.status === "locked") lines.push(p.unlockText);
      else if (p.maxReward !== null) lines.push(`Gain max ${p.maxReward} $`);
      anchor = { x: p.world.x, y: p.world.y + n.roofY - 24 };
    }
    this.tooltipText.setText(lines.join("\n"));
    const w = this.tooltipText.width + 22;
    const h = this.tooltipText.height + 14;
    this.tooltipBg.clear().fillStyle(0x10202a, 0.94).fillRoundedRect(-w / 2, -h / 2, w, h, 10).lineStyle(2, 0xffd25a, 0.9).strokeRoundedRect(-w / 2, -h / 2, w, h, 10);
    this.tooltip.setVisible(true);
    this.tooltipAnchor = anchor;
    this.onZoomChanged();
  }

  private tooltipAnchor: Pt = { x: 0, y: 0 };

  // ───────────── Caméra ─────────────

  private computeLimits(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    const b = this.vm.bounds;
    const fitAll = Math.min(w / (b.maxX - b.minX), h / (b.maxY - b.minY));
    // Cadrage de départ : l'immeuble et les lieux (sans les berges).
    const pts = [LAYOUT.hq.world, ...this.vm.places.map((p) => p.world)];
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const bw = Math.max(...xs) - Math.min(...xs) + 520;
    const bh = Math.max(...ys) - Math.min(...ys) + 760;
    const initial = Phaser.Math.Clamp(Math.min(w / bw, h / bh), Math.max(0.2, fitAll), 1.1);
    this.zoomLimits = { min: Math.max(0.12, fitAll), max: MAX_ZOOM, initial };
  }

  private homeCenter(): { cx: number; cy: number } {
    // Centré sur l'immeuble (au centre de la ville), un peu relevé pour voir sa hauteur.
    return { cx: LAYOUT.hq.world.x, cy: LAYOUT.hq.world.y - 70 };
  }

  private setupCamera(): void {
    this.computeLimits();
    const home = this.homeCenter();
    this.target = { ...home, zoom: this.zoomLimits.initial };
    this.cur = { ...this.target };
    this.applyCamera(true);
  }

  private goHome(): void {
    this.computeLimits();
    if (this.viewId) {
      this.enterView(this.viewId);
      return;
    }
    this.target = { ...this.homeCenter(), zoom: this.zoomLimits.initial };
    this.userMoved = false;
    this.arrowUntil = Date.now() + 6000;
  }

  private clampTarget(): void {
    const t = this.target;
    t.zoom = Phaser.Math.Clamp(t.zoom, this.zoomLimits.min, this.zoomLimits.max);
    const b = this.vm.bounds;
    const halfW = this.scale.width / t.zoom / 2;
    const halfH = this.scale.height / t.zoom / 2;
    const clampAxis = (v: number, lo: number, hi: number, half: number) => (hi - lo <= half * 2 ? (lo + hi) / 2 : Phaser.Math.Clamp(v, lo + half, hi - half));
    t.cx = clampAxis(t.cx, b.minX, b.maxX, halfW);
    t.cy = clampAxis(t.cy, b.minY, b.maxY, halfH);
  }

  private applyCamera(immediate = false): void {
    this.clampTarget();
    const k = immediate || this.reduced ? 1 : 0.2;
    const c = this.cur;
    const t = this.target;
    const zoomBefore = c.zoom;
    c.zoom += (t.zoom - c.zoom) * k;
    c.cx += (t.cx - c.cx) * k;
    c.cy += (t.cy - c.cy) * k;
    if (Math.abs(t.zoom - c.zoom) < 0.0005) c.zoom = t.zoom;
    if (Math.abs(t.cx - c.cx) < 0.05) c.cx = t.cx;
    if (Math.abs(t.cy - c.cy) < 0.05) c.cy = t.cy;
    const cam = this.cameras.main;
    cam.setZoom(c.zoom);
    cam.centerOn(c.cx, c.cy);
    if (zoomBefore !== c.zoom) this.onZoomChanged();
  }

  update(): void {
    const now = Date.now();
    if (!this.diving) this.applyCamera();
    this.updateConstruction(now);
    this.updateHqFx(now);
    this.updateBots(now);
  }

  /** Fanion qui flotte, flèche « Votre siège » (au début, après un recentrage, et quand la caméra s'éloigne). */
  private updateHqFx(now: number): void {
    const roof = hqRoof(this.shownLevel || 1);
    if (!this.reduced) this.drawFlag(0, -roof.h - (roof.topW * TILE_H) / 2, now / 220);
    const far = this.cur.zoom < 0.62;
    const show = far || now < this.arrowUntil;
    const s = Phaser.Math.Clamp(1 / this.cur.zoom, 0.9, 2.2);
    const bob = this.reduced ? 0 : Math.sin(now / 340) * 5;
    this.hqArrow.setVisible(show).setScale(s).setPosition(LAYOUT.hq.world.x, LAYOUT.hq.world.y - roof.h - 90 * s + bob);
  }

  /** Étiquettes lisibles à toute échelle et zones de toucher d'au moins 44 px d'écran. */
  private onZoomChanged(): void {
    const z = this.cur.zoom;
    const s = Phaser.Math.Clamp(1 / z, 0.85, 2.4);
    const south = ((4 + 4) / 2) * (TILE_H / 2);
    for (const n of this.nodes.values()) {
      n.labels.setScale(s).setPosition(n.vm.world.x, n.vm.world.y + south + 14 + 14 * s);
      // Aire cliquable ≥ 44 px d'écran même très dézoomé.
      const wpx = Math.max(220, 44 / z);
      n.hit.setSize(wpx, Math.max(-n.roofY + 100, 44 / z));
      const area = n.hit.input?.hitArea as Phaser.Geom.Rectangle | undefined;
      area?.setSize(n.hit.width, n.hit.height);
    }
    const roof = hqRoof(this.shownLevel || 1);
    const baseHalf = (roof.baseW * TILE_H) / 2;
    this.hqLabels.setScale(s).setPosition(LAYOUT.hq.world.x, LAYOUT.hq.world.y + baseHalf + 14 + 16 * s);
    this.hqSign.setScale(Phaser.Math.Clamp(1 / z, 1, 1.8)).setPosition(LAYOUT.hq.world.x, LAYOUT.hq.world.y + baseHalf - roof.podium - 16);
    this.tooltip.setScale(s).setPosition(this.tooltipAnchor.x, this.tooltipAnchor.y - 14 * s);
  }

  private zoomAt(factor: number, sx?: number, sy?: number): void {
    const t = this.target;
    const z1 = t.zoom;
    const z2 = Phaser.Math.Clamp(z1 * factor, this.zoomLimits.min, this.zoomLimits.max);
    if (sx !== undefined && sy !== undefined) {
      t.cx += (sx - this.scale.width / 2) * (1 / z1 - 1 / z2);
      t.cy += (sy - this.scale.height / 2) * (1 / z1 - 1 / z2);
    }
    t.zoom = z2;
    this.userMoved = true;
  }

  private setupInput(): void {
    this.input.addPointer(1);
    this.input.on("wheel", (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => this.zoomAt(dy > 0 ? 0.88 : 1.14, p.x, p.y));
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      const p1 = this.input.pointer1;
      const p2 = this.input.pointer2;
      if (p1.isDown && p2.isDown) {
        this.pinching = true;
        const d = Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y);
        if (this.pinchDist > 0 && d > 0) this.zoomAt(d / this.pinchDist, (p1.x + p2.x) / 2, (p1.y + p2.y) / 2);
        this.pinchDist = d;
        return;
      }
      this.pinchDist = 0;
      if (!p.isDown || this.pinching) return;
      if (!this.dragging && p.getDistance() > 6) this.dragging = true;
      if (this.dragging) {
        const z = this.cur.zoom;
        this.target.cx -= (p.x - p.prevPosition.x) / z;
        this.target.cy -= (p.y - p.prevPosition.y) / z;
        this.userMoved = true;
      }
    });
    this.input.on("pointerup", (p: Phaser.Input.Pointer, over: unknown[]) => {
      const wasTap = !this.dragging && !this.pinching && p.getDistance() < TAP_DISTANCE;
      if (!this.input.pointer1.isDown && !this.input.pointer2.isDown) {
        this.dragging = false;
        this.pinching = false;
        this.pinchDist = 0;
      }
      if (wasTap && over.length === 0) this.bus.emit("planet:select", null);
    });
  }

  private onResize(): void {
    this.computeLimits();
    if (!this.userMoved) {
      const home = this.homeCenter();
      this.target = { ...home, zoom: this.zoomLimits.initial };
    }
    this.applyCamera(true);
  }

  // ───────────── Vue d'un lieu ou de l'immeuble : travelling, effets ─────────────

  private viewPose(id: string): CamPose | null {
    const w = this.scale.width;
    const h = this.scale.height;
    // Le panneau latéral se superpose à droite : on cadre le centre de la partie visible.
    const inset = this.bus.insetRight;
    const usable = Math.max(200, w - inset);
    let wx: number;
    let wy: number;
    let zoom: number;
    if (id === "base") {
      const bh = hqRoof(this.shownLevel || 1).h;
      zoom = Phaser.Math.Clamp(Math.min((usable * 0.8) / 380, (h * 0.8) / (bh + 260)), this.zoomLimits.min, MAX_ZOOM);
      wx = LAYOUT.hq.world.x;
      wy = LAYOUT.hq.world.y - bh / 2 + 20;
    } else {
      const n = this.nodes.get(id);
      if (!n) return null;
      zoom = Phaser.Math.Clamp(Math.min((usable * 0.7) / 380, (h * 0.78) / (-n.roofY + 260)), 0.6, MAX_ZOOM);
      wx = n.vm.world.x;
      wy = n.vm.world.y + n.roofY / 2 + 30;
    }
    return { cx: wx + inset / 2 / zoom, cy: wy, zoom };
  }

  private enterView(id: string): void {
    const to = this.viewPose(id);
    if (!to) return;
    if (!this.viewId) this.preView = { ...this.target };
    const switching = this.viewId !== null && this.viewId !== id;
    this.viewId = id;
    this.userMoved = true;
    this.runDive({ ...this.cur }, to, id, switching);
    this.applyDim(true);
  }

  private leaveView(): void {
    if (!this.viewId) return;
    this.computeLimits();
    const saved = this.preView;
    const back = saved ?? { ...this.homeCenter(), zoom: this.zoomLimits.initial };
    this.viewId = null;
    this.preView = null;
    this.userMoved = !!saved;
    this.runDive({ ...this.cur }, back, null, false);
    this.applyDim(true);
  }

  /** Travelling : interpolation douce de la caméra avec un léger recul au milieu (effet de « plongée »). */
  private runDive(from: CamPose, to: CamPose, pulseId: string | null, quick: boolean): void {
    this.dive?.stop();
    this.dive = null;
    const finish = () => {
      this.diving = false;
      this.dive = null;
      this.cur = { ...to };
      this.target = { ...to };
      this.applyCamera(true);
      if (pulseId) this.pulse(pulseId);
    };
    if (this.reduced) {
      finish();
      return;
    }
    this.diving = true;
    const dist = Math.hypot(to.cx - from.cx, to.cy - from.cy);
    const dip = Phaser.Math.Clamp(dist / 2600, 0.05, 0.26);
    const duration = Phaser.Math.Clamp((quick ? 600 : 800) + dist * 0.35, 800, 1500);
    const holder = { v: 0 };
    this.target = { ...to };
    this.dive = this.tweens.add({
      targets: holder,
      v: 1,
      duration,
      ease: "Cubic.InOut",
      onUpdate: () => {
        const e = holder.v;
        this.cur = { cx: lerp(from.cx, to.cx, e), cy: lerp(from.cy, to.cy, e), zoom: lerp(from.zoom, to.zoom, e) * (1 - dip * Math.sin(Math.PI * e)) };
        const cam = this.cameras.main;
        cam.setZoom(this.cur.zoom);
        cam.centerOn(this.cur.cx, this.cur.cy);
        this.onZoomChanged();
      },
      onComplete: finish,
    });
  }

  /** Onde de choc dorée à l'arrivée (coupée en animations réduites). */
  private pulse(id: string): void {
    if (this.reduced) return;
    const n = id === "base" ? null : this.nodes.get(id);
    const x = n ? n.vm.world.x : LAYOUT.hq.world.x;
    const y = n ? n.vm.world.y : LAYOUT.hq.world.y;
    const ring = this.add.graphics().setPosition(x, y).setDepth(99000);
    ring.lineStyle(6, 0xffd25a, 1).strokeEllipse(0, 0, 260, 130);
    this.tweens.add({ targets: ring, scale: 2.3, alpha: 0, duration: 900, ease: "Cubic.Out", onComplete: () => ring.destroy() });
    if (n) this.tweens.add({ targets: n.halo, alpha: 1, duration: 260, yoyo: true, ease: "Sine.Out" });
  }

  /** Estompe le reste de la ville pendant la vue d'un lieu. */
  private applyDim(animate: boolean): void {
    const dim = this.viewId !== null;
    const set = (obj: Phaser.GameObjects.Container, a: number) => {
      if (!animate || this.reduced) obj.setAlpha(a);
      else this.tweens.add({ targets: obj, alpha: a, duration: 500, ease: "Sine.InOut" });
    };
    for (const n of this.nodes.values()) {
      const a = dim && this.viewId !== n.id ? 0.45 : 1;
      set(n.root, a);
      set(n.labels, a);
    }
    const ha = dim && this.viewId !== "base" ? 0.5 : 1;
    set(this.hqRoot, ha);
    set(this.hqLabels, ha);
    set(this.hqSign, ha);
  }

  // ───────────── Bots et véhicules (voyages visuels) ─────────────

  private makeBubble(color: number): Bubble {
    const g = this.add.graphics();
    g.fillStyle(color, 0.95).fillRoundedRect(-27, -26, 54, 26, 10).fillTriangle(-6, 0, 6, 0, 0, 9);
    g.lineStyle(2, 0xffffff, 0.9).strokeRoundedRect(-27, -26, 54, 26, 10);
    const text = this.text(18, { fontStyle: "bold", stroke: "#000000", strokeThickness: 0 }).setOrigin(0.5, 0.5).setPosition(0, -13);
    const c = this.add.container(0, 0, [g, text]).setVisible(false);
    return { c, text };
  }

  private createBot(trip: Trip): BotNode {
    const shadow = this.add.image(0, 0, TEX.shadow).setScale(70 / (200 * S)).setAlpha(0.7);
    const img = this.add.image(0, 0, TEX.vehicle("foot")).setScale(1 / S).setOrigin(VEHICLE_SIZE.ox / VEHICLE_SIZE.w, VEHICLE_SIZE.oy / VEHICLE_SIZE.h);
    const rotor = this.add.image(0, 0, TEX.rotor).setScale(1 / S).setVisible(false);
    const tag = this.text(13, { fontStyle: "bold" }).setText(ROLE_LABEL[trip.role] ?? trip.role).setOrigin(0.5, 1);
    const bubble = this.makeBubble(0x0b5c63);
    const folder = this.add.image(0, 0, TEX.folder).setScale(1 / S).setVisible(false);
    const smoke = this.add.graphics();
    const root = this.add.container(0, 0, [shadow, img, rotor, folder, smoke, tag, bubble.c]);
    const greeter = this.add.image(0, 0, TEX.greeter).setScale(1 / S).setOrigin(0.5, 1).setVisible(false);
    const planetBubble = this.makeBubble(0x9a5700);
    planetBubble.c.setDepth(99995);
    return { id: trip.id, root, img, rotor, tag, bubble, greeter, folder, planetBubble, shadow, smoke };
  }

  private destroyBot(node: BotNode): void {
    node.root.destroy();
    node.greeter.destroy();
    node.planetBubble.c.destroy();
  }

  private updateBots(now: number): void {
    const alive = new Set<string>();
    const zoom = this.cur.zoom;
    const labelScale = Phaser.Math.Clamp(1 / zoom, 0.85, 2.2);
    const spriteScale = Math.max(1, 0.9 / zoom);
    for (const trip of this.trips) {
      const place = this.nodes.get(trip.planetId)?.vm;
      const path = place ? this.pathFor(trip.planetId) : null;
      if (!place || !path) continue;
      const f = tripFrame(trip, now, this.reduced);
      if (f.phase === "home") continue;
      alive.add(trip.id);
      let node = this.bots.get(trip.id);
      if (!node) {
        node = this.createBot(trip);
        this.bots.set(trip.id, node);
      }
      const pose = pathPose(path, f.u);
      const onSite = f.phase === "dialogue" || (f.phase === "failed" && f.u >= 1);
      const flying = path.kind === "air";
      // Le véhicule vient de la donnée du lieu ; sur place, les bots à pied/vélo/skate mettent pied à terre.
      const vehicle = place.vehicle;
      const showVehicle = flying || !onSite ? vehicle : "foot";
      node.img.setTexture(TEX.vehicle(showVehicle));
      const returning = f.phase === "return";
      const heading = returning ? { x: -pose.heading.x, y: -pose.heading.y } : pose.heading;
      const flip = heading.x < 0;
      const moving = f.phase === "outbound" || f.phase === "return";
      const bob = this.reduced ? 0 : moving ? (flying ? Math.sin(now / 180) * 3 : showVehicle === "foot" ? Math.abs(Math.sin(now / 110)) * -3.2 : showVehicle === "bike" ? Math.sin(now / 90) * 1 : 0) : flying ? Math.sin(now / 300) * 2 : 0;
      node.root.setPosition(pose.pos.x, pose.pos.y + bob).setScale(spriteScale);
      node.img.setFlipX(flip);
      // Les bots restent visibles au-dessus des îlots voisins (lisibilité) : profondeur décalée vers l'avant.
      node.root.setDepth(flying ? 99990 : pose.ground.y + GROUND_BOT_DEPTH);
      // Ombre au sol (l'hélicoptère est en altitude : ombre décalée vers le bas, plus petite et plus pâle).
      const alt = pose.altitude;
      node.shadow.setPosition(0, (pose.ground.y - pose.pos.y) / spriteScale).setAlpha(Math.max(0.25, 0.75 - alt / 700)).setScale(((flying ? 130 : 64) * Math.max(0.55, 1 - alt / 900)) / (200 * S), ((flying ? 130 : 64) * Math.max(0.55, 1 - alt / 900)) / (200 * S));
      node.tag.setScale(labelScale / spriteScale).setPosition(0, -(flying ? 62 : 58));
      // Rotor (hélicoptère) : sprite qui bat ; immobile en animations réduites.
      node.rotor.setVisible(flying);
      if (flying) {
        const flick = this.reduced ? 1 : 0.55 + 0.45 * Math.abs(Math.cos(now / 35));
        node.rotor.setPosition(flip ? 3 : -3, -38).setScale(flick / S, 1 / S);
      }
      // Panne : véhicule penché, fumée.
      const broke = f.phase === "failed";
      node.img.setAngle(broke ? (flip ? -14 : 14) : 0);
      node.smoke.clear();
      if (broke) {
        for (let i = 0; i < 3; i++) {
          const t = this.reduced ? 0.4 + i * 0.2 : ((now / 1400 + i / 3) % 1);
          node.smoke.fillStyle(0x4b5560, 0.55 * (1 - t));
          node.smoke.fillCircle(Math.sin(t * 4 + i) * 6, -24 - t * 34, 5 + t * 7);
        }
      }
      // Retour : le dossier sous le bras.
      node.folder.setVisible(returning).setPosition(flip ? -12 : 12, -20);
      // Dialogue avec l'agent du lieu : bulles à tour de rôle (le contenu est dans le panneau, pas ici).
      node.bubble.c.setVisible(false);
      node.planetBubble.c.setVisible(false);
      node.greeter.setVisible(onSite && !broke);
      if (onSite && !broke) {
        const dx = place.world.x - pose.ground.x;
        const dy = place.world.y - pose.ground.y;
        const d = Math.hypot(dx, dy) || 1;
        const gx = pose.pos.x + (dx / d) * 44 * spriteScale;
        const gy = pose.pos.y + (dy / d) * 22 * spriteScale + 2;
        node.greeter.setPosition(gx, gy).setScale(spriteScale / S).setDepth(flying ? 99991 : pose.ground.y + GROUND_BOT_DEPTH + 0.1);
        const dots = ".".repeat(1 + (Math.floor(now / 280) % 3));
        const botSpeaks = Math.floor(now / 900) % 2 === 0;
        node.bubble.text.setText(dots);
        node.planetBubble.text.setText(dots);
        node.bubble.c.setPosition(0, -(flying ? 70 : 62)).setScale(1 / spriteScale).setVisible(botSpeaks);
        node.planetBubble.c.setVisible(!botSpeaks).setPosition(gx, gy - 56 * spriteScale).setScale(spriteScale);
      }
    }
    for (const [id, node] of this.bots) {
      if (!alive.has(id)) {
        this.destroyBot(node);
        this.bots.delete(id);
      }
    }
  }

  /** Gain crédité : « +N $ » monte au-dessus du lieu et des pièces filent vers l'immeuble. */
  private rewardFx(id: string, amount: number): void {
    const n = this.nodes.get(id);
    if (!n || amount <= 0) return;
    const p = n.vm.world;
    const s = Phaser.Math.Clamp(1 / this.cur.zoom, 0.9, 2.2);
    const label = this.text(24, { fontStyle: "bold", color: "#ffe08a" }).setText(`+${amount} $`).setOrigin(0.5, 0.5).setPosition(p.x, p.y + n.roofY - 20).setScale(s).setDepth(100001);
    this.tweens.add({ targets: label, y: label.y - 70, alpha: 0, duration: this.reduced ? 1800 : 1600, ease: "Cubic.Out", onComplete: () => label.destroy() });
    if (this.reduced) return;
    for (let i = 0; i < 7; i++) {
      const coin = this.add.circle(p.x, p.y, 6, 0xffd25a).setStrokeStyle(2, 0x7a4a00).setDepth(100000).setAlpha(0);
      const holder = { v: 0 };
      this.tweens.add({
        targets: holder,
        v: 1,
        duration: 1300,
        delay: 250 + i * 110,
        ease: "Sine.InOut",
        onStart: () => coin.setAlpha(1),
        onUpdate: () => {
          const pt = routePoint(p, 1 - holder.v, LAYOUT.hq.world);
          coin.setPosition(pt.x, pt.y - Math.sin(holder.v * Math.PI) * 18).setScale(1 - holder.v * 0.4);
        },
        onComplete: () => coin.destroy(),
      });
    }
  }

  // ───────────── Bus ─────────────

  private subscribe(): void {
    const b = this.bus;
    this.unsubs.push(
      b.on("vm", (vm) => {
        this.vm = vm;
        this.ensureNodes();
        this.applyAll();
      }),
      b.on("selected", (id) => {
        this.selectedId = id;
        for (const n of this.nodes.values()) this.applyNode(n, n.vm);
        this.applyHq();
      }),
      b.on("motion", (reduced) => {
        this.reduced = reduced;
        this.stopAmbient();
        this.startAmbient();
        this.applyCamera(true);
        if (reduced && this.construction) this.finishConstruction();
      }),
      b.on("camera:pan", (dx, dy) => {
        this.target.cx += dx / this.cur.zoom;
        this.target.cy += dy / this.cur.zoom;
        this.userMoved = true;
      }),
      b.on("camera:zoom", (f) => this.zoomAt(f)),
      b.on("camera:reset", () => this.goHome()),
      b.on("view:enter", (id) => this.enterView(id)),
      b.on("view:leave", () => this.leaveView()),
      b.on("trips", (trips) => {
        this.trips = trips;
      }),
      b.on("reward", (id, amount) => this.rewardFx(id, amount)),
      b.on("building:skip", () => this.finishConstruction()),
      b.on("camera:focus", (id) => {
        const n = this.nodes.get(id);
        if (!n) return;
        this.target.cx = n.vm.world.x;
        this.target.cy = n.vm.world.y;
        this.target.zoom = Math.max(this.target.zoom, 0.7);
        this.userMoved = true;
      }),
    );
  }

  private cleanup(): void {
    if (this.dead) return;
    this.dead = true;
    for (const u of this.unsubs) u();
    this.unsubs = [];
    this.scale.off("resize", this.onResize, this);
    this.dive?.stop();
    this.dive = null;
    for (const node of this.bots.values()) this.destroyBot(node);
    this.bots.clear();
    this.ambient = [];
    this.nodes.clear();
  }
}
