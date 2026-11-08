/**
 * Ville de fond de la page de connexion : la même ville que la carte de jeu (`CityWorld`), vue de loin, qui tourne
 * lentement sous des nuages. À la connexion, la caméra plonge vers l'immeuble du joueur et passe le relais à la carte
 * (`handoff`), qui reprend exactement là puis s'éloigne. AFFICHAGE seulement : aucun appel réseau, aucune règle de jeu.
 */
import { appearanceFor } from "@/game/map/building";
import { setHandoff } from "@/game/map/handoff";
import { LAYOUT } from "@/game/map/layout";
import { CityWorld } from "@/game/map/three/world/CityWorld";
import { DEFAULT_YAW, SKY, SKY_BOTTOM, SKY_TOP } from "@/game/map/three/world/scale";
import { CityScene } from "./CityScene";

/** Zoom de repos (ville entière, beaucoup de ciel) et zoom d'arrivée devant l'immeuble. */
export const FAR_ZOOM = 0.82;
export const DIVE_ZOOM = 3.4;
const ORBIT_AMPLITUDE = 0.3;
const ORBIT_SPEED = 0.1;
const fitSize = (aspect: number): number => Math.max(30, 40 / aspect);
const ease = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export class LoginCity {
  private readonly city: CityScene;
  private readonly world: CityWorld;
  private time = 0;
  private diving: { from: number; start: number; dur: number } | null = null;
  private orbitOffset = 0;
  private disposed = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    seed = 2024,
    /** Largeur (px) du formulaire à gauche : la ville est décalée à droite pour rester visible. */
    private insetLeft = 0,
  ) {
    this.city = new CityScene(canvas, null, { background: SKY, sky: [SKY_TOP, SKY_BOTTOM], viewSize: fitSize, ambient: 1.45, sun: 3.3, maxPixelRatio: 1.5 });
    this.world = new CityWorld(this.city, LAYOUT, { pins: false, clouds: 7, cars: 40, seed });
    const ap = appearanceFor(7); // l'immeuble « vitrine » : héliport et ascenseur panoramique
    this.world.landmarks.setHq({ floors: ap.floors, width: ap.width, wall: ap.wall, trim: ap.trim, glass: ap.glass, features: ap.features, sign: ap.sign }, "");
    this.world.refresh();
    this.city.setYaw(DEFAULT_YAW);
    this.city.setView(this.farTarget(), FAR_ZOOM);
    this.city.addTick((dt) => this.tick(dt));
    this.city.start();
  }

  setInset(px: number): void {
    this.insetLeft = px;
    if (!this.diving) this.city.setView(this.farTarget(), FAR_ZOOM);
  }

  /** Point visé au repos : décalé pour que la ville apparaisse à droite du formulaire. */
  private farTarget(): { x: number; z: number } {
    const cam = this.city.orthoCamera;
    const unit = (cam.top - cam.bottom) / FAR_ZOOM / (this.canvas.clientHeight || 1);
    const h = this.city.horizontalOffset;
    const dx = (this.insetLeft / 2) * unit;
    return { x: 4.5 - dx * h.z, z: -4.5 + dx * h.x };
  }

  private tick(dt: number): void {
    this.time += dt;
    if (this.diving) {
      const d = this.diving;
      const k = Math.min(1, (performance.now() - d.start) / d.dur);
      this.orbitOffset = d.from * (1 - ease(k));
    } else this.orbitOffset = Math.sin(this.time * ORBIT_SPEED * Math.PI * 2 * 0.5) * ORBIT_AMPLITUDE;
    this.city.setYaw(DEFAULT_YAW + this.orbitOffset);
  }

  /**
   * Plonge vers l'immeuble du joueur : la caméra descend, l'orbite revient à l'angle de la carte (pour que les deux
   * écrans se raccordent), puis le relais est posé. Résolu à la fin ; ne navigue pas.
   */
  dive(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    const dur = this.city.reducedMotion ? 200 : 1700;
    this.diving = { from: this.orbitOffset, start: performance.now(), dur };
    const hq = this.world.landmarks.hq;
    return this.city.zoomToDistrict({ target: { x: hq.x, z: hq.z }, zoom: DIVE_ZOOM, durationMs: dur }).then(() => {
      setHandoff({ from: "login", target: { x: hq.x, z: hq.z }, zoom: DIVE_ZOOM });
    });
  }

  dispose(): void {
    this.disposed = true;
    this.world.dispose();
    this.city.dispose();
  }
}
