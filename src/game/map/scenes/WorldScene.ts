/**
 * Scène du monde : base, planètes, routes, fond étoilé, caméra (docs/CARTE-TECH.md).
 * AFFICHAGE seulement : aucun appel réseau, aucune règle de jeu. La scène lit le MapViewModel et émet des
 * intentions (clic, survol) sur le bus ; React décide. Les graphismes ne passent que par les clés de `TEX`.
 */
import Phaser from "phaser";
import { ROLE_LABEL } from "@/lib/format";
import { BASE_ART, generateMapTextures, rng, S, SHIP_SIZE, TEX } from "../art";
import type { MapBus } from "../bus";
import { PLANETS } from "../planets";
import { BASE_ANCHOR, landingT, routePoint, routeTangent } from "../route";
import { tripFrame, type Trip } from "../trips";
import { buildMapViewModel, type MapViewModel, type PlanetStatus, type PlanetVM } from "../viewmodel";

const MAX_ZOOM = 2.4;
const TAP_DISTANCE = 10;

const PILL_COLOR: Record<PlanetStatus, number> = {
  locked: 0x2a3942,
  available: 0x1f7a4a,
  in_progress: 0x9a5700,
  visited: 0x1d4f91,
};

interface PlanetNode {
  id: string;
  vm: PlanetVM;
  root: Phaser.GameObjects.Container;
  float: Phaser.GameObjects.Container;
  halo: Phaser.GameObjects.Image;
  body: Phaser.GameObjects.Image;
  lock: Phaser.GameObjects.Image;
  select: Phaser.GameObjects.Graphics;
  orbit: Phaser.GameObjects.Graphics;
  orbitDots: Phaser.GameObjects.Arc[];
  labels: Phaser.GameObjects.Container;
  name: Phaser.GameObjects.Text;
  pill: Phaser.GameObjects.Graphics;
  status: Phaser.GameObjects.Text;
  pips: Phaser.GameObjects.Image[];
  hit: Phaser.GameObjects.Arc;
}

interface Bubble {
  c: Phaser.GameObjects.Container;
  text: Phaser.GameObjects.Text;
}

interface ShipNode {
  id: string;
  root: Phaser.GameObjects.Container;
  img: Phaser.GameObjects.Image;
  tag: Phaser.GameObjects.Text;
  bubble: Bubble;
  drone: Phaser.GameObjects.Image;
  planetBubble: Bubble;
  trail: Phaser.GameObjects.Graphics;
  history: { x: number; y: number }[];
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
  private nodes = new Map<string, PlanetNode>();
  private routes!: Phaser.GameObjects.Graphics;
  private baseImage!: Phaser.GameObjects.Image;
  private baseLabel!: Phaser.GameObjects.Container;
  private baseName!: Phaser.GameObjects.Text;
  private basePill!: Phaser.GameObjects.Graphics;
  private baseStatus!: Phaser.GameObjects.Text;
  private tooltip!: Phaser.GameObjects.Container;
  private tooltipBg!: Phaser.GameObjects.Graphics;
  private tooltipText!: Phaser.GameObjects.Text;
  private hoverId: string | null = null;
  private twinkles: Phaser.GameObjects.Image[] = [];
  private ambient: Phaser.Tweens.Tween[] = [];
  private cur = { cx: 0, cy: 0, zoom: 1 };
  private target = { cx: 0, cy: 0, zoom: 1 };
  private zoomLimits = { min: 0.2, max: MAX_ZOOM, initial: 1 };
  private userMoved = false;
  private dragging = false;
  private pinchDist = 0;
  private pinching = false;
  private unsubs: (() => void)[] = [];
  private dead = false;
  // Vue d'une planète (travelling) et voyages des agents.
  private trips: Trip[] = [];
  private ships = new Map<string, ShipNode>();
  private viewId: string | null = null;
  private preView: CamPose | null = null;
  private diving = false;
  private dive: Phaser.Tweens.Tween | null = null;
  private baseHit!: Phaser.GameObjects.Rectangle;

  constructor() {
    super("world");
  }

  create(): void {
    this.bus = this.registry.get("bus") as MapBus;
    this.font = (this.registry.get("font") as string | undefined) ?? "system-ui, sans-serif";
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    generateMapTextures(this, PLANETS);
    this.cameras.main.setBackgroundColor("#08141b");
    this.vm = this.bus.vm ?? buildMapViewModel(null);
    this.reduced = this.bus.reducedMotion;
    this.selectedId = this.bus.selectedId;
    this.trips = this.bus.trips;

    this.buildBackdrop();
    this.routes = this.add.graphics().setDepth(-50);
    this.buildBase();
    this.buildTooltip();
    this.ensureNodes();
    this.setupCamera();
    this.setupInput();
    this.subscribe();
    this.applyAll();

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
        stroke: "#07131a",
        strokeThickness: Math.round(size / 4),
        resolution: this.dpr,
        ...style,
      })
      .setOrigin(0.5, 0);
  }

  private buildBackdrop(): void {
    const b = this.vm.bounds;
    const rand = rng(42);
    const spanX = b.maxX - b.minX + 2600;
    const spanY = b.maxY - b.minY + 2000;
    for (let i = 0; i < 3; i++) {
      this.add
        .image(b.minX + (i + 0.3) * ((b.maxX - b.minX) / 3), (b.minY + b.maxY) / 2 + (i % 2 ? 160 : -200), TEX.nebula(i))
        .setScale((3.2 + i * 0.5) / S)
        .setScrollFactor(0.35)
        .setAlpha(0.8)
        .setDepth(-900);
    }
    for (let i = 0; i < 280; i++) {
      const big = rand() > 0.92;
      const img = this.add
        .image(b.minX - 1300 + rand() * spanX, b.minY - 1000 + rand() * spanY, TEX.star(big ? 2 : rand() > 0.5 ? 1 : 0))
        .setScrollFactor(0.45 + rand() * 0.2)
        .setAlpha(0.35 + rand() * 0.65)
        .setScale((big ? 0.9 : 0.5 + rand() * 0.5) / S)
        .setDepth(-1000);
      if (rand() > 0.7) img.setTint(rand() > 0.5 ? 0xbfd9ff : 0xffe7b0);
      if (i < 46) this.twinkles.push(img);
    }
  }

  private buildBase(): void {
    this.baseImage = this.add
      .image(0, 0, TEX.base)
      .setOrigin(BASE_ART.originX / BASE_ART.w, BASE_ART.originY / BASE_ART.h)
      .setScale(1 / S)
      .setDepth(0);
    this.baseName = this.text(18, { fontStyle: "bold" });
    this.basePill = this.add.graphics();
    this.baseStatus = this.text(13, { fontStyle: "bold", stroke: "#000000", strokeThickness: 0 });
    this.baseLabel = this.add.container(0, 150, [this.baseName, this.basePill, this.baseStatus]).setDepth(1);
    this.baseName.setPosition(0, 0);
    this.baseStatus.setPosition(0, 25);
    // Zone cliquable de la base : ouvre le hangar et le coffre côté React (intention seulement).
    this.baseHit = this.add.rectangle(0, -30, 440, 290, 0xffffff, 0.001).setDepth(2);
    this.baseHit.setInteractive({ useHandCursor: true });
    this.baseHit.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      if (!this.pinching && pointer.getDistance() < TAP_DISTANCE) this.bus.emit("planet:select", "base");
    });
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
        this.nodes.delete(id);
      }
    }
    for (const p of this.vm.planets) if (!this.nodes.has(p.id)) this.nodes.set(p.id, this.createNode(p));
  }

  private createNode(p: PlanetVM): PlanetNode {
    const R = p.radius;
    const shadow = this.add.image(0, R * 1.18, TEX.shadow).setScale((R * 2.9) / (200 * S));
    const halo = this.add.image(0, 0, TEX.halo).setScale((R * 4.6) / (256 * S)).setBlendMode(Phaser.BlendModes.ADD);
    const body = this.add.image(0, 0, TEX.planet(p.id)).setScale(1 / S);
    const lock = this.add.image(0, 0, TEX.lock).setScale(1 / S);
    const select = this.add.graphics();
    const orbit = this.add.graphics();
    const orbitDots = [0, 1, 2].map(() => this.add.circle(0, 0, 4.5, 0xffd25a));
    const float = this.add.container(0, 0, [halo, body, lock, orbit, ...orbitDots]);

    const name = this.text(18, { fontStyle: "bold" }).setText(p.name);
    const pill = this.add.graphics();
    const status = this.text(13, { fontStyle: "bold", stroke: "#000000", strokeThickness: 0 });
    // Étoiles de score : texture 44 px physiques (22 px ×S), affichée à ~22 px.
    const pips = [0, 1, 2].map((i) => this.add.image((i - 1) * 26, 52, TEX.pipOff).setScale(1 / S).setOrigin(0.5, 0));
    const labels = this.add.container(0, R * 1.0 + 30, [name, pill, status, ...pips]);
    status.setPosition(0, 25);

    const hit = this.add.circle(0, 0, R * 1.2, 0xffffff, 0.001);
    const root = this.add.container(p.world.x, p.world.y, [shadow, select, float, labels, hit]);
    root.setDepth(p.world.y);

    const r = R * 1.2;
    hit.setInteractive({ hitArea: new Phaser.Geom.Circle(r, r, r), hitAreaCallback: Phaser.Geom.Circle.Contains, useHandCursor: true });
    hit.on("pointerover", () => this.setHover(p.id));
    hit.on("pointerout", () => this.setHover(null));
    hit.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      if (!this.pinching && pointer.getDistance() < TAP_DISTANCE) this.bus.emit("planet:select", p.id);
    });

    return { id: p.id, vm: p, root, float, halo, body, lock, select, orbit, orbitDots, labels, name, pill, status, pips, hit };
  }

  // ───────────── État -> affichage ─────────────

  private applyAll(): void {
    this.stopAmbient();
    this.drawRoutes();
    const v = this.vm;
    const base = v.company ? `Base : ${v.company}` : "Votre base";
    this.baseName.setText(base);
    const owned = v.base.agentsOwned;
    this.drawPill(this.basePill, this.baseStatus, `Hangar : ${owned} agent${owned > 1 ? "s" : ""}`, 0x0b5c63, 25);
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
    g.lineStyle(1.5, 0xffffff, 0.35).strokeRoundedRect(-w / 2, y - 2, w, text.height + 4, 10);
  }

  private applyNode(n: PlanetNode, p: PlanetVM): void {
    n.vm = p;
    const R = p.radius;
    const locked = p.status === "locked";
    n.body.setTexture(locked ? TEX.planetLocked(p.id) : TEX.planet(p.id));
    n.lock.setVisible(locked).setPosition(0, 0);
    n.halo.setTint(Phaser.Display.Color.HexStringToColor(p.palette.glow).color).setAlpha(locked ? 0 : p.status === "visited" ? 0.3 : 0.6);
    // Texte d'état + pastille (jamais la couleur seule : libellé toujours écrit).
    const icon = locked ? "Verrouillée" : p.statusLabel;
    this.drawPill(n.pill, n.status, icon, PILL_COLOR[p.status], 25);
    const showPips = p.status === "visited";
    n.pips.forEach((pip, i) => pip.setVisible(showPips).setTexture(i < p.stars ? TEX.pipOn : TEX.pipOff));
    // Orbite de l'expédition en cours.
    n.orbit.clear();
    const orbiting = p.status === "in_progress";
    n.orbit.setVisible(orbiting);
    n.orbitDots.forEach((d) => d.setVisible(orbiting));
    if (orbiting) n.orbit.lineStyle(2, 0xffd25a, 0.55).strokeEllipse(0, 0, R * 3.1, R * 1.05);
    // Sélection : anneau au sol + cadre doré autour de la sphère.
    n.select.clear();
    const sel = this.selectedId === p.id;
    if (sel) {
      n.select.lineStyle(4, 0xffd25a, 1).strokeEllipse(0, R * 1.0, R * 2.6, R * 0.7);
      n.select.lineStyle(2.5, 0xffffff, 0.9).strokeCircle(0, 0, R * 1.22);
    }
    n.name.setColor(sel ? "#ffe9a8" : "#ffffff");
    n.root.setDepth(p.world.y + (sel ? 1 : 0));
  }

  private drawRoutes(): void {
    const g = this.routes;
    g.clear();
    for (const p of this.vm.planets) {
      const active = p.status !== "locked";
      const len = Math.hypot(p.world.x - BASE_ANCHOR.x, p.world.y - BASE_ANCHOR.y);
      const steps = Math.max(8, Math.round(len / 18));
      g.fillStyle(active ? 0xffd25a : 0xb4c8d2, active ? 0.7 : 0.22);
      for (let i = 1; i < steps; i++) {
        const pt = routePoint(p.world, i / steps);
        g.fillCircle(pt.x, pt.y, active ? 3 : 2.2);
      }
    }
  }

  // ───────────── Animations d'ambiance (coupées en reduced-motion) ─────────────

  private stopAmbient(): void {
    for (const t of this.ambient) t.remove();
    this.ambient = [];
    for (const n of this.nodes.values()) {
      n.float.setY(0);
      n.halo.setScale((n.vm.radius * 4.6) / (256 * S));
    }
    this.twinkles.forEach((s) => s.setAlpha(Math.max(0.5, s.alpha)));
    this.placeOrbitDots(0);
  }

  private placeOrbitDots(phase: number): void {
    for (const n of this.nodes.values()) {
      if (n.vm.status !== "in_progress") continue;
      n.orbitDots.forEach((d, i) => {
        const a = phase + (i * Math.PI * 2) / n.orbitDots.length;
        d.setPosition(Math.cos(a) * n.vm.radius * 1.55, Math.sin(a) * n.vm.radius * 0.52);
      });
    }
  }

  private startAmbient(): void {
    const hasOrbit = [...this.nodes.values()].some((n) => n.vm.status === "in_progress");
    if (this.reduced) return;
    let i = 0;
    for (const n of this.nodes.values()) {
      const locked = n.vm.status === "locked";
      this.ambient.push(
        this.tweens.add({ targets: n.float, y: { from: -4, to: 4 }, duration: 2600 + i * 230, yoyo: true, repeat: -1, ease: "Sine.InOut" }),
      );
      if (!locked) {
        const base = (n.vm.radius * 4.6) / (256 * S);
        this.ambient.push(
          this.tweens.add({ targets: n.halo, scale: { from: base * 0.94, to: base * 1.08 }, duration: 1500 + i * 120, yoyo: true, repeat: -1, ease: "Sine.InOut" }),
        );
      }
      i++;
    }
    this.twinkles.forEach((s, k) => {
      this.ambient.push(
        this.tweens.add({ targets: s, alpha: { from: 0.25, to: 1 }, duration: 900 + (k % 7) * 330, yoyo: true, repeat: -1, delay: (k * 137) % 1500, ease: "Sine.InOut" }),
      );
    });
    if (hasOrbit) {
      const holder = { phase: 0 };
      this.ambient.push(
        this.tweens.add({ targets: holder, phase: Math.PI * 2, duration: 3600, repeat: -1, onUpdate: () => this.placeOrbitDots(holder.phase) }),
      );
    }
  }

  // ───────────── Survol / infobulle ─────────────

  private setHover(id: string | null): void {
    if (this.hoverId === id) return;
    this.hoverId = id;
    this.bus.emit("planet:hover", id);
    const n = id ? this.nodes.get(id) : undefined;
    if (!n) {
      this.tooltip.setVisible(false);
      return;
    }
    const p = n.vm;
    const lines = [p.name, p.statusLabel];
    if (p.maxReward !== null && p.status !== "locked") lines.push(`Gain max ${p.maxReward} $`);
    this.tooltipText.setText(lines.join("\n"));
    const w = this.tooltipText.width + 22;
    const h = this.tooltipText.height + 14;
    this.tooltipBg.clear().fillStyle(0x07131a, 0.92).fillRoundedRect(-w / 2, -h / 2, w, h, 10).lineStyle(2, 0xffd25a, 0.9).strokeRoundedRect(-w / 2, -h / 2, w, h, 10);
    this.tooltip.setVisible(true).setPosition(p.world.x, p.world.y - p.radius * 1.5 - 24);
    this.onZoomChanged();
  }

  // ───────────── Caméra ─────────────

  private computeLimits(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    const b = this.vm.bounds;
    const fit = Math.min(w / (b.maxX - b.minX), h / (b.maxY - b.minY));
    const narrow = w < 600;
    const initial = Phaser.Math.Clamp(narrow ? Math.max(fit, 0.5) : fit, 0.25, 1.3);
    this.zoomLimits = { min: Math.max(0.12, Math.min(fit, initial) * 0.8), max: MAX_ZOOM, initial };
  }

  private homeCenter(): { cx: number; cy: number } {
    const b = this.vm.bounds;
    // Sur écran étroit : zoom lisible centré entre la base et la première planète (Annuaire) ; sinon toute la carte.
    return this.scale.width < 600 ? { cx: 0, cy: -110 } : { cx: (b.minX + b.maxX) / 2, cy: (b.minY + b.maxY) / 2 };
  }

  private setupCamera(): void {
    this.computeLimits();
    const home = this.homeCenter();
    this.target = { ...home, zoom: this.zoomLimits.initial };
    this.cur = { ...this.target };
    this.applyCamera(true);
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
    if (!this.diving) this.applyCamera();
    this.updateShips(Date.now());
  }

  /** Étiquettes lisibles à toute échelle et zones de toucher d'au moins 44 px d'écran. */
  private onZoomChanged(): void {
    const z = this.cur.zoom;
    const s = Phaser.Math.Clamp(1 / z, 0.85, 2.4);
    for (const n of this.nodes.values()) {
      n.labels.setScale(s);
      n.labels.setY(n.vm.radius * 1.0 + 30 * s);
      const r = Math.max(n.vm.radius * 1.2, 24 / z);
      n.hit.setRadius(r);
      const area = n.hit.input?.hitArea as Phaser.Geom.Circle | undefined;
      area?.setTo(r, r, r);
    }
    this.baseLabel.setScale(s).setY(150 + 6 * s);
    this.tooltip.setScale(s);
    const hn = this.hoverId ? this.nodes.get(this.hoverId) : undefined;
    if (hn) this.tooltip.setPosition(hn.vm.world.x, hn.vm.world.y - hn.vm.radius * 1.5 - 24 * s);
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

  // ───────────── Vue d'une planète : travelling, effets ─────────────

  private viewPose(id: string): CamPose | null {
    const w = this.scale.width;
    const h = this.scale.height;
    if (id === "base") {
      const zoom = Phaser.Math.Clamp(Math.min((w * 0.8) / 460, (h * 0.78) / 330), this.zoomLimits.min, MAX_ZOOM);
      return { cx: 0, cy: -20, zoom };
    }
    const n = this.nodes.get(id);
    if (!n) return null;
    const R = n.vm.radius;
    const zoom = Phaser.Math.Clamp(Math.min((h * 0.36) / R, (w * 0.7) / (R * 2.7)), 0.6, MAX_ZOOM);
    return { cx: n.vm.world.x, cy: n.vm.world.y + R * 0.25, zoom };
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

  /** Onde de choc dorée à l'arrivée sur une planète (coupée en animations réduites). */
  private pulse(id: string): void {
    if (this.reduced) return;
    const n = id === "base" ? null : this.nodes.get(id);
    const x = n ? n.vm.world.x : 0;
    const y = n ? n.vm.world.y : -10;
    const R = n ? n.vm.radius : 150;
    const ring = this.add.graphics().setPosition(x, y).setDepth(99000);
    ring.lineStyle(6, 0xffd25a, 1).strokeCircle(0, 0, R * 1.05);
    this.tweens.add({ targets: ring, scale: 2.3, alpha: 0, duration: 900, ease: "Cubic.Out", onComplete: () => ring.destroy() });
    if (n) {
      const base = (R * 4.6) / (256 * S);
      this.tweens.add({ targets: n.halo, scale: base * 1.5, duration: 260, yoyo: true, ease: "Sine.Out" });
    }
  }

  /** Estompe le reste de la carte pendant la vue d'une planète. */
  private applyDim(animate: boolean): void {
    const dim = this.viewId !== null;
    const set = (obj: Phaser.GameObjects.Image | Phaser.GameObjects.Container, a: number) => {
      if (!animate || this.reduced) obj.setAlpha(a);
      else this.tweens.add({ targets: obj, alpha: a, duration: 500, ease: "Sine.InOut" });
    };
    for (const n of this.nodes.values()) set(n.root, dim && this.viewId !== n.id ? 0.35 : 1);
    set(this.baseImage, dim && this.viewId !== "base" ? 0.4 : 1);
    set(this.baseLabel, dim && this.viewId !== "base" ? 0.4 : 1);
  }

  // ───────────── Navettes des agents (voyages visuels) ─────────────

  private makeBubble(color: number): Bubble {
    const g = this.add.graphics();
    g.fillStyle(color, 0.95).fillRoundedRect(-27, -26, 54, 26, 10).fillTriangle(-6, 0, 6, 0, 0, 9);
    g.lineStyle(2, 0xffffff, 0.9).strokeRoundedRect(-27, -26, 54, 26, 10);
    const text = this.text(18, { fontStyle: "bold", stroke: "#000000", strokeThickness: 0 }).setOrigin(0.5, 0.5).setPosition(0, -13);
    const c = this.add.container(0, 0, [g, text]).setVisible(false);
    return { c, text };
  }

  private createShip(trip: Trip): ShipNode {
    const img = this.add.image(0, 0, TEX.ship).setScale(1 / S).setOrigin(0.5, 0.5);
    const tag = this.text(13, { fontStyle: "bold" }).setText(ROLE_LABEL[trip.role] ?? trip.role).setPosition(0, SHIP_SIZE.h * 0.7);
    const bubble = this.makeBubble(0x0b5c63);
    bubble.c.setPosition(0, -SHIP_SIZE.h * 0.5);
    const root = this.add.container(0, 0, [img, tag, bubble.c]).setDepth(99990);
    const drone = this.add.image(0, 0, TEX.drone).setScale(1 / S).setDepth(99985).setVisible(false);
    const planetBubble = this.makeBubble(0x9a5700);
    planetBubble.c.setDepth(99995);
    const trail = this.add.graphics().setDepth(99980);
    return { id: trip.id, root, img, tag, bubble, drone, planetBubble, trail, history: [] };
  }

  private destroyShip(node: ShipNode): void {
    node.root.destroy();
    node.drone.destroy();
    node.planetBubble.c.destroy();
    node.trail.destroy();
  }

  private updateShips(now: number): void {
    const alive = new Set<string>();
    const zoom = this.cur.zoom;
    const labelScale = Phaser.Math.Clamp(1 / zoom, 0.85, 2.2);
    for (const trip of this.trips) {
      const planet = this.nodes.get(trip.planetId)?.vm;
      if (!planet) continue;
      const f = tripFrame(trip, now, this.reduced);
      if (f.phase === "home") continue;
      alive.add(trip.id);
      let node = this.ships.get(trip.id);
      if (!node) {
        node = this.createShip(trip);
        this.ships.set(trip.id, node);
      }
      const tLand = landingT(planet.world, planet.radius);
      const t = f.u * tLand;
      const pos = routePoint(planet.world, t);
      const dialogue = f.phase === "dialogue";
      const bob = dialogue ? Math.sin(now / 260) * 3 : 0;
      const shipScale = Math.max(1, 0.85 / zoom);
      node.root.setPosition(pos.x, pos.y + bob).setScale(shipScale);
      node.tag.setScale(labelScale / shipScale);
      // Cap : le long de la route (retour : à l'envers) ; sur place : face à la planète.
      let ang: number;
      if (dialogue) ang = Math.atan2(planet.world.y - pos.y, planet.world.x - pos.x);
      else {
        const tan = routeTangent(planet.world, t);
        ang = Math.atan2(tan.y, tan.x) + (f.phase === "return" ? Math.PI : 0);
      }
      node.img.setRotation(ang).setFlipY(Math.cos(ang) < 0);
      node.root.setAlpha(this.reduced ? 1 : Math.min(1, f.phase === "outbound" ? f.p * 12 : 1));
      // Traînée lumineuse pendant le vol.
      node.trail.clear();
      if (!dialogue && !this.reduced) {
        node.history.push({ x: pos.x, y: pos.y });
        if (node.history.length > 16) node.history.shift();
        node.history.forEach((h, i) => node!.trail.fillStyle(0xffd25a, (i / node!.history.length) * 0.5).fillCircle(h.x, h.y, 2 + (i / node!.history.length) * 3));
      } else node.history.length = 0;
      // Dialogue : la sentinelle de la planète apparaît et les deux bulles se répondent à tour de rôle.
      node.drone.setVisible(dialogue);
      node.bubble.c.setVisible(false);
      node.planetBubble.c.setVisible(false);
      if (dialogue) {
        const dx = planet.world.x - pos.x;
        const dy = planet.world.y - pos.y;
        const d = Math.hypot(dx, dy) || 1;
        const dronePos = { x: planet.world.x - (dx / d) * planet.radius * 1.02, y: planet.world.y - (dy / d) * planet.radius * 1.02 - 26 + Math.sin(now / 320) * 4 };
        node.drone.setPosition(dronePos.x, dronePos.y).setScale((1 / S) * Math.max(1, 0.9 / zoom));
        const dots = ".".repeat(1 + (Math.floor(now / 280) % 3));
        const shipSpeaks = Math.floor(now / 900) % 2 === 0;
        const bs = Math.max(1, 0.9 / zoom);
        node.bubble.text.setText(dots);
        node.planetBubble.text.setText(dots);
        node.bubble.c.setVisible(shipSpeaks).setScale(1 / shipScale * bs);
        node.planetBubble.c.setVisible(!shipSpeaks).setPosition(dronePos.x, dronePos.y - 18).setScale(bs);
      }
    }
    for (const [id, node] of this.ships) {
      if (!alive.has(id)) {
        this.destroyShip(node);
        this.ships.delete(id);
      }
    }
  }

  /** Gain crédité : « +N $ » monte au-dessus de la planète et des pièces filent vers la base. */
  private rewardFx(id: string, amount: number): void {
    const n = this.nodes.get(id);
    if (!n || amount <= 0) return;
    const p = n.vm.world;
    const s = Phaser.Math.Clamp(1 / this.cur.zoom, 0.9, 2.2);
    const label = this.text(24, { fontStyle: "bold", color: "#ffe08a" }).setText(`+${amount} $`).setOrigin(0.5, 0.5).setPosition(p.x, p.y - n.vm.radius * 1.5).setScale(s).setDepth(100001);
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
          const pt = routePoint(p, 1 - holder.v);
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
      }),
      b.on("motion", (reduced) => {
        this.reduced = reduced;
        this.stopAmbient();
        this.startAmbient();
        this.applyCamera(true);
      }),
      b.on("camera:pan", (dx, dy) => {
        this.target.cx += dx / this.cur.zoom;
        this.target.cy += dy / this.cur.zoom;
        this.userMoved = true;
      }),
      b.on("camera:zoom", (f) => this.zoomAt(f)),
      b.on("camera:reset", () => {
        this.computeLimits();
        // Dans la vue d'une planète, « Recentrer » rejoue le travelling vers elle.
        if (this.viewId) {
          this.enterView(this.viewId);
          return;
        }
        this.target = { ...this.homeCenter(), zoom: this.zoomLimits.initial };
        this.userMoved = false;
      }),
      b.on("view:enter", (id) => this.enterView(id)),
      b.on("view:leave", () => this.leaveView()),
      b.on("trips", (trips) => {
        this.trips = trips;
      }),
      b.on("reward", (id, amount) => this.rewardFx(id, amount)),
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
    for (const node of this.ships.values()) this.destroyShip(node);
    this.ships.clear();
    this.ambient = [];
    this.twinkles = [];
    this.nodes.clear();
  }
}
