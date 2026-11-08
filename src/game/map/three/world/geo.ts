/**
 * Géométries utilitaires de la ville : boîtes à UV de façade, fusion des éléments statiques par matériau et
 * instances (voitures, arbres, piétons). AFFICHAGE seulement.
 */
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  InstancedMesh,
  Matrix4,
  Quaternion,
  Vector3,
  type Material,
  type Object3D,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/** Matrice position / rotation Y / échelle. */
const _q = new Quaternion();
const _up = new Vector3(0, 1, 0);
export function mat4(x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx, ry = 0): Matrix4 {
  return new Matrix4().compose(new Vector3(x, y, z), _q.setFromAxisAngle(_up, ry), new Vector3(sx, sy, sz));
}

export const nonIndexed = (g: BufferGeometry): BufferGeometry => (g.index ? g.toNonIndexed() : g);

export interface BoxUv {
  /** Largeur (unités) couverte par une répétition de la texture. */
  uTile: number;
  /** Hauteur (unités) couverte par une répétition de la texture. */
  vTile: number;
  /** Décalage vertical (unités) : garde les étages alignés quand on empile des retraits. */
  vOffset?: number;
}

/**
 * Boîte posée sur y = 0, séparée en côtés (façade texturée) et dessus (toit). Non indexée : fusionnable.
 */
export function boxParts(w: number, h: number, d: number, uv: BoxUv): { sides: BufferGeometry; top: BufferGeometry } {
  const pos: number[] = [];
  const nor: number[] = [];
  const tex: number[] = [];
  const quad = (p: number[][], n: number[], u: number, v0: number, v1: number) => {
    const uvs = [
      [0, v0],
      [u, v0],
      [u, v1],
      [0, v1],
    ];
    for (const i of [0, 1, 2, 0, 2, 3]) {
      pos.push(...p[i]!);
      nor.push(...n);
      tex.push(...uvs[i]!);
    }
  };
  const x = w / 2;
  const z = d / 2;
  const v0 = (uv.vOffset ?? 0) / uv.vTile;
  const v1 = v0 + h / uv.vTile;
  quad([[-x, 0, z], [x, 0, z], [x, h, z], [-x, h, z]], [0, 0, 1], w / uv.uTile, v0, v1);
  quad([[x, 0, -z], [-x, 0, -z], [-x, h, -z], [x, h, -z]], [0, 0, -1], w / uv.uTile, v0, v1);
  quad([[x, 0, z], [x, 0, -z], [x, h, -z], [x, h, z]], [1, 0, 0], d / uv.uTile, v0, v1);
  quad([[-x, 0, -z], [-x, 0, z], [-x, h, z], [-x, h, -z]], [-1, 0, 0], d / uv.uTile, v0, v1);
  const sides = new BufferGeometry();
  sides.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  sides.setAttribute("normal", new BufferAttribute(new Float32Array(nor), 3));
  sides.setAttribute("uv", new BufferAttribute(new Float32Array(tex), 2));
  const top = new BoxGeometry(w, 0.001, d);
  top.translate(0, h, 0);
  return { sides, top: nonIndexed(top) };
}

/**
 * Cumule des géométries par matériau puis les fusionne : des centaines de pièces statiques deviennent quelques
 * dessins. Les géométries sources sont copiées, l'appelant peut les réutiliser.
 */
export class StaticBatch {
  private readonly buckets = new Map<Material, BufferGeometry[]>();

  add(geo: BufferGeometry, mat: Material, m?: Matrix4): void {
    const g = nonIndexed(geo).clone();
    if (m) g.applyMatrix4(m);
    for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal" && k !== "uv") g.deleteAttribute(k);
    if (!g.getAttribute("uv")) g.setAttribute("uv", new BufferAttribute(new Float32Array((g.getAttribute("position").count || 0) * 2), 2));
    const list = this.buckets.get(mat) ?? [];
    list.push(g);
    this.buckets.set(mat, list);
  }

  /** Fusionne et ajoute à `parent` ; `own` reçoit chaque géométrie fusionnée pour la libérer au `dispose()`. */
  build(parent: Object3D, own: <T extends { dispose(): void }>(o: T) => T, opts: { cast: boolean; receive: boolean }, MeshCtor: new (g: BufferGeometry, m: Material) => Object3D & { castShadow: boolean; receiveShadow: boolean }): Object3D[] {
    const out: Object3D[] = [];
    for (const [mat, list] of this.buckets) {
      const merged = mergeGeometries(list, false);
      for (const g of list) g.dispose();
      if (!merged) continue;
      own(merged);
      const mesh = new MeshCtor(merged, mat);
      mesh.castShadow = opts.cast;
      mesh.receiveShadow = opts.receive;
      parent.add(mesh);
      out.push(mesh);
    }
    this.buckets.clear();
    return out;
  }
}

export interface Part {
  geo: BufferGeometry;
  mat: Material;
  /** Transformation locale de la pièce dans l'instance. */
  local?: Matrix4;
  /** La couleur de l'instance teinte cette pièce (matériau blanc). */
  tint?: boolean;
}

/** Plusieurs `InstancedMesh` (un par pièce) pilotés ensemble : une voiture = carrosserie + habitacle + roues. */
export class InstanceGroup {
  readonly meshes: InstancedMesh[] = [];
  private readonly base = new Matrix4();
  private readonly tmp = new Matrix4();

  constructor(
    private readonly parts: Part[],
    readonly count: number,
    parent: Object3D,
    opts: { cast?: boolean; receive?: boolean } = {},
  ) {
    for (const p of parts) {
      const m = new InstancedMesh(p.geo, p.mat, count);
      m.frustumCulled = false;
      m.castShadow = opts.cast ?? false;
      m.receiveShadow = opts.receive ?? false;
      if (p.tint) m.setColorAt(0, new Color("#ffffff"));
      parent.add(m);
      this.meshes.push(m);
    }
  }

  set(i: number, x: number, y: number, z: number, yaw = 0, scale = 1, color?: Color | string): void {
    this.base.compose(new Vector3(x, y, z), _q.setFromAxisAngle(_up, yaw), new Vector3(scale, scale, scale));
    this.parts.forEach((p, k) => {
      const m = this.meshes[k]!;
      m.setMatrixAt(i, p.local ? this.tmp.multiplyMatrices(this.base, p.local) : this.base);
      if (p.tint && color !== undefined) m.setColorAt(i, color instanceof Color ? color : new Color(color));
    });
  }

  /** À appeler après une série de `set`. */
  commit(): void {
    for (const m of this.meshes) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }

  /** Cache les instances au-delà de `n` (échelle nulle). */
  hideFrom(n: number): void {
    for (let i = n; i < this.count; i++) this.set(i, 0, -50, 0, 0, 0.0001);
    this.commit();
  }
}
