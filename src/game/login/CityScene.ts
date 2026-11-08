/**
 * Scène Three.js décorative du fond de connexion : ville vue de très haut en projection isométrique, nuages
 * par-dessus. AFFICHAGE seulement : aucun appel réseau, aucune règle de jeu. Les nuages ne bougent pas en
 * `prefers-reduced-motion`.
 */
import {
  AmbientLight,
  BoxGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  DirectionalLight,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  OrthographicCamera,
  PCFShadowMap,
  PCFSoftShadowMap,
  PlaneGeometry,
  RepeatWrapping,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type BufferGeometry,
  type Material,
  type Texture,
} from "three";
import { FACADE_PALETTE, ROOF_PALETTE, planCity, type CityPlan } from "./plan";

/** Élévation isométrique : atan(1/√2) ≈ 35,264°. */
export const ISO_ELEVATION = Math.atan(1 / Math.SQRT2);
const VIEW_SIZE = 22;

function facadeTexture(color: string): CanvasTexture | null {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = "rgba(30, 40, 60, 0.75)";
  ctx.fillRect(14, 14, 36, 30);
  ctx.fillStyle = "rgba(255, 240, 180, 0.35)";
  ctx.fillRect(14, 14, 36, 8);
  const tex = new CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

function cloudTexture(): CanvasTexture | null {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new CanvasTexture(canvas);
}

/** Réglages du zoom caméra (vue très haute -> vue de quartier). */
export interface ZoomOptions {
  /** Point de la ville visé (plan XZ, unités de scène). Défaut : un quartier légèrement décentré. */
  target?: { x: number; z: number };
  /** Facteur de zoom final de la caméra orthographique (1 = vue très haute). Défaut 3,2. */
  zoom?: number;
  /** Durée en ms. Raccourcie (REDUCED_MOTION_ZOOM_MS) en `prefers-reduced-motion`. Défaut 1400. */
  durationMs?: number;
  /**
   * Appelé quand la caméra atteint la vue de quartier, AVANT la résolution de la promesse. Point d'accroche
   * pour la scène cible (GR3-17 / GR3-35) : s'y brancher pour enchaîner sans refaire l'animation.
   */
  onZoomEnd?: () => void;
}

export const DEFAULT_ZOOM_MS = 1400;
export const REDUCED_MOTION_ZOOM_MS = 200;
const DEFAULT_ZOOM = 3.2;
const DEFAULT_TARGET = { x: 4, z: 4 };
const easeInOutCubic = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** Ombres : budget GPU (ADR 0002 : >= 30 images/s sur portable sans GPU dédié). */
export interface ShadowOptions {
  /** Emprise de la ville (plan XZ) que la lumière doit couvrir. */
  bounds: { x: number; z: number; w: number; h: number };
  /** Côté de la shadow map au niveau de qualité maximal (défaut 1024). */
  mapSize?: number;
}
const SHADOW_SLOW_DT = 1 / 26; // sous ~26 images/s en moyenne : on dégrade
const SHADOW_WARMUP_FRAMES = 30;
const SHADOW_SLOW_FRAMES = 60;

export class CityScene {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera: OrthographicCamera;
  private readonly clouds: { mesh: Mesh; speed: number }[] = [];
  private readonly disposables: { dispose(): void }[] = [];
  private raf = 0;
  private last = 0;
  private readonly reduceMotion: boolean;
  private readonly baseOffset: Vector3;
  private readonly cameraOffset: Vector3;
  private yawAngle = 0;
  private zoomRaf = 0;
  private cancelZoom: (() => void) | null = null;
  private readonly tickHandlers = new Set<(dt: number) => void>();
  private readonly lookAtPoint = new Vector3(0, 0, 0);
  private readonly sun: DirectionalLight;
  private shadowLevel = -1; // -1 = ombres inactives, 0 = PCFSoft pleine taille, 1 = PCF réduit, 2 = coupées
  private shadowMapSize = 1024;
  private slowFrames = 0;
  private frames = 0;

  /**
   * `plan: null` = scène nue (sol, lumière, caméra, boucle) : la vue de jeu (`MapView`) y ajoute sa propre ville
   * sans décor de connexion (ADR 0002 : un seul moteur, `CityScene` est le socle).
   */
  constructor(
    private readonly canvas: HTMLCanvasElement,
    plan: CityPlan | null = planCity(2024),
  ) {
    this.reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.scene.background = new Color("#bcd6ea");
    this.camera = new OrthographicCamera(-VIEW_SIZE, VIEW_SIZE, VIEW_SIZE, -VIEW_SIZE, 0.1, 200);
    const d = 60;
    const horiz = Math.cos(ISO_ELEVATION) * d;
    this.camera.position.set(horiz * Math.SQRT1_2, Math.sin(ISO_ELEVATION) * d, horiz * Math.SQRT1_2);
    this.camera.lookAt(0, 0, 0);
    this.baseOffset = this.camera.position.clone();
    this.cameraOffset = this.baseOffset.clone();

    this.scene.add(new AmbientLight("#ffffff", 1.4));
    this.sun = new DirectionalLight("#fff4dd", 1.6);
    this.sun.position.set(20, 40, 10);
    this.scene.add(this.sun, this.sun.target);
    if (plan) {
      this.buildCity(plan);
      this.buildClouds(plan);
    }
    this.resize();
  }

  /** Points d'extension pour une scène de jeu (affichage seulement) : racine 3D, caméra, ressources, boucle. */
  get root(): Scene {
    return this.scene;
  }
  get orthoCamera(): OrthographicCamera {
    return this.camera;
  }
  get reducedMotion(): boolean {
    return this.reduceMotion;
  }
  /** Libère la ressource avec la scène (`dispose()` complet : géométries, matériaux, textures). */
  own<T extends { dispose(): void }>(o: T): T {
    return this.track(o);
  }
  /**
   * Active les ombres du soleil (opt-in : le fond de connexion reste sans ombres). Coût maîtrisé : une seule
   * lumière, shadow map carrée modeste, frustum ajusté à `bounds`, et shadow map NON recalculée à chaque image
   * (`refreshShadows()` après un changement de scène). Si la boucle tourne sous ~26 images/s, la qualité baisse
   * d'un cran (map réduite + PCF simple), puis les ombres sont coupées. Aux appelants de marquer
   * `castShadow` / `receiveShadow` sur ce qui compte.
   */
  enableShadows(opts: ShadowOptions): void {
    const { bounds: b } = opts;
    this.shadowMapSize = opts.mapSize ?? 1024;
    const cx = b.x + b.w / 2;
    const cz = b.z + b.h / 2;
    const r = Math.hypot(b.w, b.h) / 2;
    this.sun.target.position.set(cx, 0, cz);
    this.sun.position.set(cx + 20, 40, cz + 10);
    const cam = this.sun.shadow.camera;
    cam.left = -r;
    cam.right = r;
    cam.top = r;
    cam.bottom = -r;
    cam.near = 1;
    cam.far = 120;
    cam.updateProjectionMatrix();
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.02;
    this.setShadowLevel(0);
  }
  /** Recalcule la shadow map à la prochaine image (la ville est statique entre deux viewmodels). */
  refreshShadows(): void {
    this.renderer.shadowMap.needsUpdate = true;
  }
  /** Niveau d'ombres courant (-1 inactives, 0 plein, 1 réduit, 2 coupées) : diagnostic / tests. */
  get shadowQuality(): number {
    return this.shadowLevel;
  }
  private setShadowLevel(level: number): void {
    const sm = this.renderer.shadowMap;
    this.shadowLevel = level;
    sm.enabled = level < 2;
    sm.autoUpdate = false;
    sm.type = level === 0 ? PCFSoftShadowMap : PCFShadowMap;
    this.sun.castShadow = level < 2;
    const size = level === 0 ? this.shadowMapSize : Math.max(256, this.shadowMapSize >> 1);
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
      this.sun.shadow.mapSize.set(size, size);
    }
    sm.needsUpdate = true;
    this.scene.traverse((o) => {
      const m = (o as Mesh).material as Material | Material[] | undefined;
      for (const x of Array.isArray(m) ? m : m ? [m] : []) x.needsUpdate = true; // recompilation du programme
    });
    this.slowFrames = 0;
    this.frames = 0;
  }
  private watchFrameCost(dt: number): void {
    if (this.shadowLevel < 0 || this.shadowLevel >= 2 || dt <= 0) return;
    if (++this.frames <= SHADOW_WARMUP_FRAMES) return;
    this.slowFrames = dt > SHADOW_SLOW_DT ? this.slowFrames + 1 : Math.max(0, this.slowFrames - 1);
    if (this.slowFrames >= SHADOW_SLOW_FRAMES) this.setShadowLevel(this.shadowLevel + 1);
  }
  /** Appelé à chaque image (jamais en `prefers-reduced-motion` : la boucle n'y tourne pas). */
  addTick(fn: (dt: number) => void): () => void {
    this.tickHandlers.add(fn);
    return () => this.tickHandlers.delete(fn);
  }
  /** Rendu à la demande (nécessaire en `prefers-reduced-motion`, où il n'y a pas de boucle). */
  render(): void {
    this.renderer.render(this.scene, this.camera);
  }
  /** Cadrage instantané : point visé (plan XZ) et zoom caméra. */
  setView(target: { x: number; z: number }, zoom: number): void {
    this.lookAtPoint.set(target.x, 0, target.z);
    this.camera.zoom = zoom;
    this.camera.position.copy(this.lookAtPoint).add(this.cameraOffset);
    this.camera.lookAt(this.lookAtPoint);
    this.camera.updateProjectionMatrix();
    this.render();
  }
  /** Rotation de la caméra autour de l'axe vertical (radians) ; l'élévation isométrique reste fixe. */
  get yaw(): number {
    return this.yawAngle;
  }
  setYaw(angle: number): void {
    this.yawAngle = angle;
    this.cameraOffset.copy(this.baseOffset).applyAxisAngle(new Vector3(0, 1, 0), angle);
    this.setView({ x: this.lookAtPoint.x, z: this.lookAtPoint.z }, this.camera.zoom);
  }
  /** Direction horizontale (plan XZ, unitaire) du point visé vers la caméra. */
  get horizontalOffset(): { x: number; z: number } {
    const l = Math.hypot(this.cameraOffset.x, this.cameraOffset.z) || 1;
    return { x: this.cameraOffset.x / l, z: this.cameraOffset.z / l };
  }
  get view(): { x: number; z: number; zoom: number } {
    return { x: this.lookAtPoint.x, z: this.lookAtPoint.z, zoom: this.camera.zoom };
  }

  private track<T extends { dispose(): void }>(o: T): T {
    this.disposables.push(o);
    return o;
  }

  private buildCity(plan: CityPlan): void {
    const ground = new Mesh(
      this.track(new PlaneGeometry(80, 80)),
      this.track(new MeshLambertMaterial({ color: "#8fae7a" })),
    );
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);
    const facades = new Map<number, Texture | null>();
    const roofGeo = this.track(new ConeGeometry(0.75, 1.6, 4));
    const roofMats = ROOF_PALETTE.map((c) => this.track(new MeshLambertMaterial({ color: c })));
    const flatMat = this.track(new MeshLambertMaterial({ color: "#6e7378" }));
    for (const b of plan.buildings) {
      const group = new Group();
      let y = 0;
      let w = b.width;
      let dp = b.depth;
      for (const h of b.floors) {
        if (!facades.has(b.palette)) facades.set(b.palette, facadeTexture(FACADE_PALETTE[b.palette]!));
        const base = facades.get(b.palette) ?? null;
        const tex = base ? base.clone() : null;
        if (tex) {
          tex.needsUpdate = true;
          tex.repeat.set(b.repeat.u, Math.max(1, Math.round(h / 1.2)));
          this.track(tex);
        }
        const mat = this.track(new MeshLambertMaterial(tex ? { map: tex } : { color: FACADE_PALETTE[b.palette] }));
        const mesh = new Mesh(this.track(new BoxGeometry(w, h, dp)), mat);
        mesh.position.y = y + h / 2;
        group.add(mesh);
        y += h;
        w *= 0.8;
        dp *= 0.8;
      }
      if (b.roof === "cone") {
        const roof = new Mesh(roofGeo, roofMats[b.palette % roofMats.length]!);
        roof.scale.set(w * 1.5, 1, dp * 1.5);
        roof.rotation.y = Math.PI / 4;
        roof.position.y = y + 0.8;
        group.add(roof);
      } else {
        const cap = new Mesh(this.track(new BoxGeometry(w, 0.2, dp)), flatMat);
        cap.position.y = y + 0.1;
        group.add(cap);
      }
      group.position.set(b.x, 0, b.z);
      this.scene.add(group);
    }
    for (const t of facades.values()) t?.dispose();
  }

  private buildClouds(plan: CityPlan): void {
    const tex = cloudTexture();
    if (tex) this.track(tex);
    const geo: BufferGeometry = this.track(new PlaneGeometry(1, 1));
    for (const c of plan.clouds) {
      const mat: Material = this.track(
        new MeshBasicMaterial({ map: tex, transparent: true, opacity: c.opacity, depthWrite: false }),
      );
      const mesh = new Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.scale.set(c.width, c.depth, 1);
      mesh.position.set(c.x, c.y, c.z);
      this.scene.add(mesh);
      this.clouds.push({ mesh, speed: c.speed });
    }
  }

  resize = (): void => {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    const aspect = w / h;
    this.camera.left = -VIEW_SIZE * aspect;
    this.camera.right = VIEW_SIZE * aspect;
    this.camera.top = VIEW_SIZE;
    this.camera.bottom = -VIEW_SIZE;
    this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera);
  };

  start(): void {
    window.addEventListener("resize", this.resize);
    if (this.reduceMotion) return;
    const tick = (now: number) => {
      const dt = this.last ? Math.min((now - this.last) / 1000, 0.1) : 0;
      this.last = now;
      this.watchFrameCost(dt);
      for (const fn of this.tickHandlers) fn(dt);
      for (const c of this.clouds) {
        c.mesh.position.x += c.speed * dt;
        if (c.mesh.position.x > 30) c.mesh.position.x = -30;
      }
      this.renderer.render(this.scene, this.camera);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  /**
   * Zoom continu de la caméra vers la vue de quartier. La promesse se résout à la fin (ou immédiatement si
   * la scène est détruite / un autre zoom la remplace). Ne navigue pas : l'appelant enchaîne ensuite
   * (router.push) ou branche la scène cible via `onZoomEnd`.
   */
  zoomToDistrict(opts: ZoomOptions = {}): Promise<void> {
    this.cancelZoom?.();
    const target = opts.target ?? DEFAULT_TARGET;
    const zoomTo = opts.zoom ?? DEFAULT_ZOOM;
    const duration = this.reduceMotion ? REDUCED_MOTION_ZOOM_MS : (opts.durationMs ?? DEFAULT_ZOOM_MS);
    const zoomFrom = this.camera.zoom;
    const lookAt = this.lookAtPoint;
    const from = lookAt.clone();
    const to = new Vector3(target.x, 0, target.z);
    return new Promise<void>((resolve) => {
      let start = 0;
      let done = false;
      const finish = (completed: boolean) => {
        if (done) return;
        done = true;
        cancelAnimationFrame(this.zoomRaf);
        this.cancelZoom = null;
        if (completed) opts.onZoomEnd?.();
        resolve();
      };
      this.cancelZoom = () => finish(false);
      const step = (now: number) => {
        if (done) return;
        start ||= now;
        const t = Math.min((now - start) / duration, 1);
        const k = easeInOutCubic(t);
        lookAt.lerpVectors(from, to, k);
        this.camera.zoom = zoomFrom + (zoomTo - zoomFrom) * k;
        this.camera.position.copy(lookAt).add(this.cameraOffset);
        this.camera.lookAt(lookAt);
        this.camera.updateProjectionMatrix();
        this.renderer.render(this.scene, this.camera);
        if (t >= 1) finish(true);
        else this.zoomRaf = requestAnimationFrame(step);
      };
      this.zoomRaf = requestAnimationFrame(step);
    });
  }

  dispose(): void {
    this.cancelZoom?.();
    cancelAnimationFrame(this.raf);
    this.tickHandlers.clear();
    window.removeEventListener("resize", this.resize);
    for (const d of this.disposables) d.dispose();
    this.sun.shadow.map?.dispose(); // cible de rendu de la shadow map
    this.sun.dispose();
    this.renderer.dispose();
  }
}
