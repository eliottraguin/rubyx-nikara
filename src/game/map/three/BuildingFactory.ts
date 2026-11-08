/**
 * Fabrique d'immeubles Three.js (ADR 0002) : BoxGeometry empilées, toit pyramide ConeGeometry à 4 faces, façades
 * en CanvasTexture (RepeatWrapping) sur MeshLambertMaterial. AFFICHAGE seulement.
 *
 * Mémoire : géométries, matériaux et textures sont mis en cache et PARTAGÉS entre immeubles (une texture par
 * couleur de mur, une géométrie par gabarit), créés une seule fois et rattachés à `CityScene.own()` : ils sont
 * libérés une fois pour toutes par `CityScene.dispose()`. Les immeubles eux-mêmes ne possèdent rien : les retirer
 * de la scène suffit (aucune fuite à chaque nouveau viewmodel).
 */
import {
  BoxGeometry,
  CanvasTexture,
  ConeGeometry,
  Group,
  Mesh,
  MeshLambertMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  type BufferGeometry,
  type Material,
} from "three";
import type { CityScene } from "@/game/login/CityScene";
import { FLOOR_H, planBuilding, type BuildingPlan, type RoofKind } from "./buildingPlan";

/** Largeur d'une travée de fenêtres en unités de scène. */
const BAY_W = 0.9;
const TILE_PX = 64;

export interface BuildingStyle {
  seed: number;
  size: number;
  floors: number;
  /** Couleur des murs. */
  wall: string;
  /** Couleur des vitres. */
  glass: string;
  /** Couleur des corniches et du toit plat. */
  trim: string;
  roof?: RoofKind;
}

export interface BuiltBuilding {
  group: Group;
  /** Volumes cliquables (tous les corps + le toit). */
  meshes: Mesh[];
  plan: BuildingPlan;
}

/** Tuile de façade : une travée et un étage (mur, vitre, cadre). Pure canvas 2D, aucun texte. */
function drawFacadeTile(wall: string, glass: string): HTMLCanvasElement | null {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = TILE_PX;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, TILE_PX, TILE_PX);
  ctx.fillStyle = "rgba(0, 0, 0, 0.22)"; // cadre
  ctx.fillRect(12, 10, 40, 38);
  ctx.fillStyle = glass;
  ctx.fillRect(15, 13, 34, 32);
  ctx.fillStyle = "rgba(255, 255, 255, 0.35)"; // reflet
  ctx.fillRect(15, 13, 34, 9);
  ctx.fillStyle = "rgba(0, 0, 0, 0.18)"; // appui de fenêtre
  ctx.fillRect(10, 48, 44, 4);
  return canvas;
}

/** Multiplie les UV de chaque face latérale d'une boîte : la texture se répète au lieu de s'étirer. */
function tileSideUVs(geo: BoxGeometry, width: number, floors: number): void {
  const uv = geo.getAttribute("uv");
  const u = Math.max(1, Math.round(width / BAY_W));
  // ordre des faces BoxGeometry : +x, -x, +y, -y, +z, -z (4 sommets chacune) ; on ne touche que les côtés.
  for (const face of [0, 1, 4, 5]) {
    for (let i = face * 4; i < face * 4 + 4; i++) uv.setXY(i, uv.getX(i) * u, uv.getY(i) * floors);
  }
  uv.needsUpdate = true;
}

export class BuildingFactory {
  private readonly geos = new Map<string, BufferGeometry>();
  private readonly mats = new Map<string, Material>();
  private readonly textures = new Map<string, CanvasTexture | null>();

  constructor(private readonly city: CityScene) {}

  build(style: BuildingStyle): BuiltBuilding {
    const plan = planBuilding(style);
    const group = new Group();
    const meshes: Mesh[] = [];
    const facade = this.facadeMaterial(style.wall, style.glass);
    const cap = this.flat(style.trim);
    for (const t of plan.tiers) {
      // matériaux de la BoxGeometry : +x -x (côtés), +y (dessus), -y (dessous), +z -z (côtés).
      const mesh = new Mesh(this.tierGeometry(t.size, t.floors), [facade, facade, cap, cap, facade, facade]);
      mesh.position.y = t.y + t.height / 2;
      group.add(mesh);
      meshes.push(mesh);
    }
    const top = plan.tiers[plan.tiers.length - 1]!;
    if (plan.roof === "pyramid") {
      const roof = new Mesh(this.roofGeometry(top.size, plan.roofHeight), this.flat(style.trim, true));
      roof.rotation.y = Math.PI / 4; // les arêtes du cône à 4 faces suivent les coins de la boîte
      roof.position.y = plan.height + plan.roofHeight / 2;
      group.add(roof);
      meshes.push(roof);
    }
    return { group, meshes, plan };
  }

  private tierGeometry(size: number, floors: number): BufferGeometry {
    const key = `tier:${size.toFixed(3)}:${floors}`;
    let g = this.geos.get(key);
    if (!g) {
      const box = new BoxGeometry(size, floors * FLOOR_H, size);
      tileSideUVs(box, size, floors);
      g = this.city.own(box);
      this.geos.set(key, g);
    }
    return g;
  }

  private roofGeometry(size: number, height: number): BufferGeometry {
    const key = `roof:${size.toFixed(3)}:${height.toFixed(3)}`;
    let g = this.geos.get(key);
    if (!g) {
      // rayon = demi-diagonale du carré : la base de la pyramide épouse le dessus du volume.
      g = this.city.own(new ConeGeometry((size * Math.SQRT2) / 2, height, 4));
      this.geos.set(key, g);
    }
    return g;
  }

  private facadeMaterial(wall: string, glass: string): Material {
    const key = `facade:${wall}:${glass}`;
    let m = this.mats.get(key);
    if (!m) {
      const map = this.facadeTexture(wall, glass);
      m = this.city.own(new MeshLambertMaterial(map ? { map } : { color: wall }));
      this.mats.set(key, m);
    }
    return m;
  }

  private flat(color: string, roof = false): Material {
    const key = `${roof ? "roof" : "flat"}:${color}`;
    let m = this.mats.get(key);
    if (!m) {
      m = this.city.own(new MeshLambertMaterial({ color }));
      this.mats.set(key, m);
    }
    return m;
  }

  private facadeTexture(wall: string, glass: string): CanvasTexture | null {
    const key = `${wall}:${glass}`;
    if (this.textures.has(key)) return this.textures.get(key)!;
    const canvas = drawFacadeTile(wall, glass);
    let tex: CanvasTexture | null = null;
    if (canvas) {
      tex = this.city.own(new CanvasTexture(canvas));
      tex.wrapS = tex.wrapT = RepeatWrapping;
      tex.colorSpace = SRGBColorSpace;
      tex.anisotropy = 4;
    }
    this.textures.set(key, tex);
    return tex;
  }
}
