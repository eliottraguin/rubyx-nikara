/**
 * Les cinq pièces de la coupe d'immeuble : terrasse, studio pub, salle du courrier, archives, accueil et garage.
 * AFFICHAGE seulement : décor et petits robots animés, aucun texte du modèle, aucun appel réseau. Le mobilier est
 * fusionné par matériau (peu de dessins) ; seuls les acteurs animés restent des objets séparés.
 */
import { BoxGeometry, CanvasTexture, ConeGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, RingGeometry, SphereGeometry, SRGBColorSpace, TorusGeometry, type BufferGeometry, type Material } from "three";
import { mulberry32 } from "@/game/login/plan";
import { mat4, StaticBatch } from "@/game/map/three/world/geo";
import type { Kit } from "@/game/map/three/world/kit";
import type { FloorId } from "../floors";
import { FLOOR_DEPTH, FLOOR_HEIGHT, FLOOR_WIDTH } from "./layout";

const W = FLOOR_WIDTH;
const D = FLOOR_DEPTH;
/** Dessus de la dalle : le sol de la pièce. */
const TOP = 0.16;

export interface RoomCtx {
  kit: Kit;
  group: Group;
  own<T extends { dispose(): void }>(o: T): T;
  /** Fonctions d'animation (t en secondes). */
  anims: ((t: number) => void)[];
  /** Pièces fusionnées à toucher pour choisir l'étage. */
  meshes: Mesh[];
}

interface Floorstyle {
  floor: string;
  wall: string;
  accent: string;
}

const STYLE: Record<FloorId, Floorstyle> = {
  toit: { floor: "#c9a577", wall: "#e6e0d2", accent: "#4a90d9" },
  orchestrateur: { floor: "#e3c3c4", wall: "#f7e6e6", accent: "#c9484a" },
  pub: { floor: "#e7b9cf", wall: "#f6e3ec", accent: "#d9548f" },
  courrier: { floor: "#ead59a", wall: "#fbf1d2", accent: "#e0a526" },
  archives: { floor: "#c3b9e3", wall: "#ebe6f7", accent: "#7a62c9" },
  accueil: { floor: "#e6e2d6", wall: "#e3f1ea", accent: "#2f9e6e" },
};

function skyWindows(): CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 128;
  const g = c.getContext("2d");
  if (!g) return null;
  g.fillStyle = "#f4efe3";
  g.fillRect(0, 0, 512, 128);
  for (let i = 0; i < 3; i++) {
    const x = 18 + i * 168;
    const grad = g.createLinearGradient(0, 14, 0, 112);
    grad.addColorStop(0, "#9fd3ee");
    grad.addColorStop(1, "#e8f4f8");
    g.fillStyle = grad;
    g.fillRect(x, 14, 150, 98);
    g.fillStyle = "rgba(255,255,255,0.7)";
    g.beginPath();
    g.ellipse(x + 50, 50, 26, 9, 0, 0, Math.PI * 2);
    g.ellipse(x + 76, 46, 20, 8, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "#cfc6b0";
    g.lineWidth = 5;
    g.strokeRect(x, 14, 150, 98);
    g.beginPath();
    g.moveTo(x + 75, 14);
    g.lineTo(x + 75, 112);
    g.stroke();
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

function poster(seed: number, w: number, h: number): CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const rng = mulberry32(seed);
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = Math.round((128 * h) / w);
  const g = c.getContext("2d");
  if (!g) return null;
  g.fillStyle = `hsl(${Math.floor(rng() * 360)},70%,62%)`;
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = "rgba(255,255,255,0.9)";
  g.beginPath();
  g.arc(c.width * (0.3 + rng() * 0.4), c.height * 0.38, c.width * 0.22, 0, Math.PI * 2);
  g.fill();
  g.fillRect(12, c.height * 0.72, c.width * 0.7, 8);
  g.fillRect(12, c.height * 0.8, c.width * 0.45, 6);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** Petit robot de l'entreprise : torse, tête, yeux, antenne. `+X` = devant. */
export function makeRobot(ctx: RoomCtx, accent: string, scale = 1): { g: Group; head: Mesh; arms: Mesh[] } {
  const { kit, own } = ctx;
  const g = new Group();
  const body = kit.lambert("#eef2f4");
  const dark = kit.lambert("#2a3440");
  const mk = (geo: BufferGeometry, mat: Material, x: number, y: number, z: number) => {
    const m = new Mesh(own(geo), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  mk(new BoxGeometry(0.42, 0.4, 0.3), body, 0, 0.55, 0);
  mk(new BoxGeometry(0.44, 0.1, 0.32), kit.lambert(accent), 0, 0.42, 0);
  const head = mk(new SphereGeometry(0.22, 14, 10), body, 0.02, 0.98, 0);
  mk(new BoxGeometry(0.06, 0.06, 0.05), kit.basic("#38e0c6"), 0.2, 1.02, 0.09);
  mk(new BoxGeometry(0.06, 0.06, 0.05), kit.basic("#38e0c6"), 0.2, 1.02, -0.09);
  mk(new CylinderGeometry(0.012, 0.012, 0.22, 5), dark, -0.02, 1.32, 0);
  mk(new SphereGeometry(0.035, 6, 6), kit.basic(accent), -0.02, 1.45, 0);
  mk(new BoxGeometry(0.14, 0.3, 0.14), dark, 0, 0.17, 0.1);
  mk(new BoxGeometry(0.14, 0.3, 0.14), dark, 0, 0.17, -0.1);
  const arms = [mk(new BoxGeometry(0.1, 0.34, 0.1), body, 0, 0.55, 0.27), mk(new BoxGeometry(0.1, 0.34, 0.1), body, 0, 0.55, -0.27)];
  g.scale.setScalar(scale);
  return { g, head, arms };
}

export function buildRoom(id: FloorId, ctx: RoomCtx): void {
  const { kit, own, group, anims } = ctx;
  const st = STYLE[id];
  const structure = new StaticBatch();
  const fu = new StaticBatch();
  const lam = (c: string) => kit.lambert(c);
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, color: string, ry = 0, b = fu) => b.add(new BoxGeometry(w, h, d), lam(color), mat4(x, TOP + y + h / 2, z, 1, 1, 1, ry));
  const boxB = (w: number, h: number, d: number, x: number, y: number, z: number, color: string, ry = 0) => fu.add(new BoxGeometry(w, h, d), kit.basic(color), mat4(x, TOP + y + h / 2, z, 1, 1, 1, ry));
  const cyl = (r: number, h: number, x: number, y: number, z: number, color: string, seg = 14) => fu.add(new CylinderGeometry(r, r, h, seg), lam(color), mat4(x, TOP + y + h / 2, z));
  const ball = (r: number, x: number, y: number, z: number, color: string) => fu.add(new SphereGeometry(r, 12, 8), lam(color), mat4(x, TOP + y, z));
  const place = (g: Group, x: number, y: number, z: number, ry = 0) => {
    g.position.set(x, TOP + y, z);
    g.rotation.y = ry;
    group.add(g);
  };
  const stand = (parts: [BufferGeometry, Material, number, number, number][]) => {
    const g = new Group();
    for (const [geo, mat, x, y, z] of parts) {
      const m = new Mesh(own(geo), mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      g.add(m);
    }
    return g;
  };

  // --- coque : dalle, murs du fond (+X et -Z), cadre de la coupe, fenêtres ---
  structure.add(new BoxGeometry(W + 0.3, TOP, D + 0.3), lam(st.floor), mat4(0, TOP / 2, 0));
  structure.add(new BoxGeometry(W + 0.4, 0.07, 0.14), lam("#f7f3e8"), mat4(0, TOP - 0.01, D / 2 + 0.15));
  structure.add(new BoxGeometry(0.14, 0.07, D + 0.4), lam("#f7f3e8"), mat4(-W / 2 - 0.15, TOP - 0.01, 0));
  if (id !== "toit") {
    structure.add(new BoxGeometry(0.12, FLOOR_HEIGHT - TOP, D), lam(st.wall), mat4(W / 2 - 0.06, TOP + (FLOOR_HEIGHT - TOP) / 2, 0));
    structure.add(new BoxGeometry(W, FLOOR_HEIGHT - TOP, 0.12), lam(st.wall), mat4(0, TOP + (FLOOR_HEIGHT - TOP) / 2, -D / 2 + 0.06));
    structure.add(new BoxGeometry(0.14, FLOOR_HEIGHT - TOP, 0.14), lam("#f7f3e8"), mat4(-W / 2 - 0.05, TOP + (FLOOR_HEIGHT - TOP) / 2, D / 2 + 0.05));
    structure.add(new BoxGeometry(W + 0.3, 0.14, 0.14), lam(st.accent), mat4(0, FLOOR_HEIGHT - 0.05, D / 2 + 0.05));
    structure.add(new BoxGeometry(0.14, 0.14, D + 0.3), lam(st.accent), mat4(-W / 2 - 0.05, FLOOR_HEIGHT - 0.05, 0));
    const win = skyWindows();
    if (win) {
      own(win);
      const m = new Mesh(own(new BoxGeometry(W - 0.5, 1.2, 0.04)), own(new MeshBasicMaterial({ map: win })));
      m.position.set(0, TOP + 1.15, -D / 2 + 0.14);
      group.add(m);
    }
  } else {
    structure.add(new BoxGeometry(W, 0.55, 0.14), lam("#e6e0d2"), mat4(0, TOP + 0.27, -D / 2 + 0.07));
    structure.add(new BoxGeometry(0.14, 0.55, D), lam("#e6e0d2"), mat4(W / 2 - 0.07, TOP + 0.27, 0));
  }

  const rng = mulberry32(id.length * 977);
  const robot = (accent: string, x: number, y: number, z: number, ry = 0, scale = 1) => {
    const r = makeRobot(ctx, accent, scale);
    place(r.g, x, y, z, ry);
    return r;
  };

  if (id === "toit") {
    // terrasse : platelage, héliport, salon, jardinières, panneaux solaires, antenne
    for (let i = 0; i < 6; i++) box(W - 0.3, 0.01, 0.8, 0, 0, -2.2 + i * 0.88, i % 2 ? "#c29d6e" : "#d1ae80");
    cyl(1.5, 0.05, 2.5, 0, -0.5, "#59606a", 32);
    fu.add(new RingGeometry(1.0, 1.1, 32).rotateX(-Math.PI / 2), kit.basic("#ffffff"), mat4(2.5, TOP + 0.07, -0.5));
    boxB(0.14, 0.01, 0.8, 2.2, 0.07, -0.5, "#ffffff");
    boxB(0.14, 0.01, 0.8, 2.8, 0.07, -0.5, "#ffffff");
    boxB(0.6, 0.01, 0.12, 2.5, 0.07, -0.5, "#ffffff");
    box(1.5, 0.28, 0.7, -2.9, 0, 1.1, "#4a90d9");
    box(1.5, 0.4, 0.2, -2.9, 0.28, 0.82, "#3b78bd");
    box(0.7, 0.28, 0.7, -2.9, 0, -0.1, "#4a90d9", 0.3);
    cyl(0.4, 0.07, -3.6, 0, -0.2, "#f2efe6", 20);
    cyl(0.025, 1.7, -3.6, 0, -0.2, "#8b8f98", 6);
    fu.add(new ConeGeometry(1.1, 0.35, 16), lam("#e0463c"), mat4(-3.6, TOP + 1.85, -0.2));
    for (let i = 0; i < 4; i++) {
      box(0.7, 0.45, 0.45, -3.9 + i * 1.7, 0, -2.3, "#8a5f3c");
      ball(0.38, -3.9 + i * 1.7, 0.8, -2.3, "#5aa84c");
    }
    for (let i = 0; i < 3; i++) fu.add(new BoxGeometry(1.1, 0.04, 0.8), lam("#27406a"), mat4(-1.2 + i * 1.3, TOP + 0.75, -2.0, 1, 1, 1, 0).multiply(mat4(0, 0, 0)));
    cyl(0.03, 2.4, 4.0, 0, -2.2, "#9aa3ad", 6);
    boxB(0.5, 0.3, 0.03, 4.25, 2.1, -2.2, "#ff7a1a");
    fu.add(new SphereGeometry(0.06, 8, 6), kit.basic("#ff5a4a"), mat4(4.0, TOP + 2.45, -2.2));
    const heli = stand([
      [new SphereGeometry(0.36, 14, 10), lam("#9a7be0"), 0, 0.42, 0],
      [new BoxGeometry(0.8, 0.07, 0.07), lam("#9a7be0"), -0.7, 0.5, 0],
      [new BoxGeometry(1.4, 0.02, 0.1), lam("#2a3440"), 0, 0.82, 0],
    ]);
    place(heli, 2.5, 0.05, -0.5);
    anims.push((t) => (heli.children[2]!.rotation.y = t * 18));
  } else if (id === "pub") {
    // studio : bureau à écrans, robot publicitaire, plateau photo, drone, affiches
    box(2.6, 0.08, 1.1, -0.6, 0.72, -0.9, "#f6f1e6");
    box(0.08, 0.72, 0.9, -1.8, 0, -0.9, "#8a5f3c");
    box(0.08, 0.72, 0.9, 0.6, 0, -0.9, "#8a5f3c");
    for (const sx of [-1.2, 0.0]) {
      box(0.95, 0.55, 0.05, sx, 0.9, -1.25, "#2a3440");
      boxB(0.85, 0.45, 0.02, sx, 0.95, -1.21, ["#ff9ec4", "#8ad7ff"][sx < -0.5 ? 0 : 1]!);
    }
    cyl(0.28, 0.06, -0.6, 0.28, 0.1, "#2a3440");
    cyl(0.04, 0.3, -0.6, 0, 0.1, "#2a3440", 6);
    box(2.0, 0.9, 0.06, 3.1, 0, -2.4, st.accent);
    cyl(0.04, 1.6, 3.7, 0, -1.2, "#2a3440", 6);
    box(0.6, 0.4, 0.5, 3.6, 0.9, -0.6, "#2a3440");
    boxB(0.28, 0.28, 0.02, 3.88, 0.95, -0.6, "#bfe6ff");
    for (let i = 0; i < 3; i++) cyl(0.025, 1.1, 3.5 + (i - 1) * 0.3, 0, -0.6 + (i - 1) * 0.3, "#2a3440", 6);
    box(0.7, 0.9, 0.06, 2.0, 0.6, 1.0, "#fff7d6");
    boxB(0.66, 0.84, 0.02, 2.0, 0.62, 1.04, "#fffbe8");
    cyl(0.02, 0.6, 2.0, 0, 1.0, "#2a3440", 6);
    box(0.6, 0.5, 0.6, -3.3, 0, -0.4, "#f6f1e6");
    box(1.4, 0.06, 0.5, -3.3, 1.45, -2.3, "#8a5f3c");
    for (let i = 0; i < 3; i++) {
      const p = poster(i * 31 + 5, 0.9, 1.2);
      if (p) {
        own(p);
        const m = new Mesh(own(new BoxGeometry(0.9, 1.2, 0.04)), own(new MeshBasicMaterial({ map: p })));
        m.position.set(-3.6 + i * 1.15, TOP + 1.35, -D / 2 + 0.16);
        group.add(m);
      }
    }
    const drone = stand([
      [new BoxGeometry(0.44, 0.1, 0.44), lam("#3b4a5c"), 0, 0, 0],
      [new BoxGeometry(0.9, 0.03, 0.06), lam("#2a3440"), 0, 0.07, 0],
      [new BoxGeometry(0.06, 0.03, 0.9), lam("#2a3440"), 0, 0.07, 0],
      [new SphereGeometry(0.07, 8, 6), kit.basic("#ff5a4a"), 0.2, -0.04, 0],
    ]);
    place(drone, -3.3, 0.78, -0.4);
    anims.push((t) => {
      drone.position.y = TOP + 1.05 + Math.sin(t * 1.8) * 0.12;
      drone.rotation.y = t * 0.6;
    });
    const r = robot(st.accent, -0.6, 0, -0.1, Math.PI / 2);
    anims.push((t) => {
      r.g.position.y = TOP + Math.abs(Math.sin(t * 5)) * 0.015;
      r.arms[0]!.rotation.z = Math.sin(t * 9) * 0.5;
      r.arms[1]!.rotation.z = Math.sin(t * 9 + 2) * 0.5;
      r.head.rotation.y = Math.sin(t * 0.8) * 0.4;
    });
  } else if (id === "courrier") {
    // casiers de tri, convoyeur d'enveloppes, bureaux et chariot
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 6; c++) {
        box(0.62, 0.42, 0.34, 4.3 - 0.16, 0.2 + r * 0.46, -1.55 + c * 0.66, r % 2 ? "#e8dcc0" : "#f1e8d0");
        boxB(0.5, 0.26, 0.04, 4.1, 0.28 + r * 0.46, -1.55 + c * 0.66, "#2a3440");
        if (rng() < 0.7) boxB(0.3, 0.2, 0.03, 4.08, 0.3 + r * 0.46, -1.55 + c * 0.66, "#ffffff");
      }
    }
    box(5.0, 0.4, 0.8, -0.3, 0, -0.5, "#59606a");
    box(5.0, 0.04, 0.7, -0.3, 0.4, -0.5, "#2a3440");
    for (let i = 0; i < 9; i++) cyl(0.09, 0.8, -2.7 + i * 0.6, 0.0, -0.1, "#8b8f98", 8);
    const env: Mesh[] = [];
    for (let i = 0; i < 9; i++) {
      const m = new Mesh(own(new BoxGeometry(0.34, 0.03, 0.22)), kit.lambert(i % 3 ? "#ffffff" : "#ffe9a8"));
      m.castShadow = true;
      group.add(m);
      env.push(m);
    }
    anims.push((t) => env.forEach((m, i) => m.position.set(-2.7 + ((i * 0.55 + t * 0.7) % 5.0), TOP + 0.46, -0.5)));
    for (const dz of [1.0, -1.7]) {
      box(1.4, 0.08, 0.8, -3.1, 0.7, dz, "#f6f1e6");
      box(0.07, 0.7, 0.7, -3.75, 0, dz, "#8a5f3c");
      box(0.07, 0.7, 0.7, -2.45, 0, dz, "#8a5f3c");
      box(0.5, 0.34, 0.04, -3.1, 0.82, dz - 0.25, "#2a3440");
      boxB(0.44, 0.28, 0.02, -3.1, 0.85, dz - 0.22, "#bfe6ff");
    }
    box(1.0, 0.5, 0.7, 1.9, 0, 1.2, "#59606a");
    for (let i = 0; i < 4; i++) box(0.5, 0.05 + (i % 2) * 0.02, 0.35, 1.9, 0.5 + i * 0.06, 1.2, i % 2 ? "#ffffff" : "#ffe9a8");
    for (const [wx, wz] of [[-0.4, -0.3], [0.4, -0.3], [-0.4, 0.3], [0.4, 0.3]] as const) cyl(0.09, 0.08, 1.9 + wx, 0, 1.2 + wz, "#2a3440", 10);
    const r = robot(st.accent, -3.1, 0, 0.4, Math.PI / 2);
    anims.push((t) => {
      r.arms[0]!.rotation.z = Math.sin(t * 10) * 0.6;
      r.arms[1]!.rotation.z = Math.sin(t * 10 + 1.5) * 0.6;
      r.head.rotation.y = Math.sin(t) * 0.3;
    });
    const fly: Mesh[] = [];
    for (let i = 0; i < 3; i++) {
      const m = new Mesh(own(new BoxGeometry(0.3, 0.02, 0.2)), kit.basic("#ffffff"));
      group.add(m);
      fly.push(m);
    }
    anims.push((t) => fly.forEach((m, i) => {
      const u = (t * 0.25 + i / 3) % 1;
      m.position.set(1.4 + i * 0.5, TOP + 0.6 + u * 1.2, 1.4 - i * 0.7);
      m.rotation.set(u * 6, u * 4, 0);
    }));
  } else if (id === "archives") {
    // rayonnages de classeurs, classeurs à tiroirs, bureau de lecture et fiches flottantes
    const cols = ["#d9548f", "#4a90d9", "#e0a526", "#2f9e6e", "#7a62c9", "#e0463c"];
    for (let s = 0; s < 4; s++) {
      const sx = -3.4 + s * 2.2;
      box(0.08, 1.7, 0.7, sx - 0.9, 0, -2.25, "#8a5f3c");
      box(0.08, 1.7, 0.7, sx + 0.9, 0, -2.25, "#8a5f3c");
      for (let r = 0; r < 4; r++) {
        box(1.8, 0.05, 0.7, sx, 0.3 + r * 0.4, -2.25, "#a87a4c");
        for (let b = 0; b < 10; b++) if (rng() < 0.88) box(0.1, 0.28 + rng() * 0.06, 0.4, sx - 0.8 + b * 0.17, 0.33 + r * 0.4, -2.25, cols[Math.floor(rng() * cols.length)]!);
      }
    }
    for (let i = 0; i < 4; i++) {
      box(0.6, 1.0, 0.6, 3.7, 0, -1.3 + i * 0.75, "#9aa3ad");
      for (let d = 0; d < 3; d++) {
        box(0.5, 0.26, 0.04, 3.4, 0.08 + d * 0.31, -1.3 + i * 0.75, "#b6bec6");
        boxB(0.1, 0.03, 0.03, 3.36, 0.2 + d * 0.31, -1.3 + i * 0.75, "#2a3440");
      }
    }
    box(1.8, 0.08, 1.0, -0.4, 0.7, 0.6, "#f6f1e6");
    box(0.07, 0.7, 0.9, -1.25, 0, 0.6, "#8a5f3c");
    box(0.07, 0.7, 0.9, 0.45, 0, 0.6, "#8a5f3c");
    box(0.7, 0.04, 0.5, -0.4, 0.78, 0.6, "#ffffff");
    boxB(0.66, 0.01, 0.46, -0.4, 0.82, 0.6, "#fff4c9");
    cyl(0.04, 0.55, 0.15, 0.78, 0.3, "#2a3440", 6);
    fu.add(new ConeGeometry(0.2, 0.2, 12), kit.lambert("#e0a526"), mat4(0.15, TOP + 1.43, 0.3));
    box(0.1, 1.7, 0.1, 3.0, 0, 1.2, "#8a5f3c");
    box(0.6, 0.05, 0.08, 3.1, 0.9, 1.2, "#8a5f3c");
    const cards: Mesh[] = [];
    for (let i = 0; i < 5; i++) {
      const m = new Mesh(own(new BoxGeometry(0.42, 0.28, 0.02)), kit.basic(["#bfe6ff", "#ffe9a8", "#d9f2d0"][i % 3]!));
      group.add(m);
      cards.push(m);
    }
    anims.push((t) => cards.forEach((m, i) => {
      const a = t * 0.7 + (i * Math.PI * 2) / 5;
      m.position.set(-0.4 + Math.cos(a) * 0.9, TOP + 1.5 + Math.sin(t * 1.2 + i) * 0.1, 0.6 + Math.sin(a) * 0.6);
      m.rotation.y = -a;
    }));
    const r = robot(st.accent, -1.1, 0, 1.55, -Math.PI / 4, 0.95);
    anims.push((t) => (r.head.rotation.y = Math.sin(t * 0.9) * 0.6));
  } else if (id === "orchestrateur") {
    // poste de commandement : console centrale, grand écran de plan, robot orchestrateur
    box(2.4, 0.08, 1.0, 0, 0.72, -1.6, "#f6f1e6");
    box(0.08, 0.72, 0.9, -1.2, 0, -1.6, "#8a5f3c");
    box(0.08, 0.72, 0.9, 1.2, 0, -1.6, "#8a5f3c");
    box(2.0, 0.9, 0.06, 0, 0, -2.5, st.accent);
    boxB(1.8, 0.7, 0.03, 0, 0.1, -2.47, "#2a3440");
    boxB(1.6, 0.5, 0.02, 0, 0.2, -2.45, "#f7d3d3");
    cyl(0.28, 0.1, -1.6, 0, 1.0, "#2a3440");
    cyl(0.28, 0.1, 1.6, 0, 1.0, "#2a3440");
    const chairs: [number, number][] = [[-1.6, 1.0], [1.6, 1.0]];
    for (const [cx, cz] of chairs) {
      box(0.4, 0.42, 0.4, cx, 0, cz, "#9aa3ad");
      box(0.4, 0.5, 0.06, cx, 0.42, cz + 0.17, "#9aa3ad");
    }
    const r = robot(st.accent, 0, 0, -0.6, Math.PI, 1.05);
    anims.push((t) => {
      r.head.rotation.y = Math.sin(t * 0.6) * 0.5;
      r.arms[0]!.rotation.z = Math.sin(t * 2) * 0.3;
      r.arms[1]!.rotation.z = Math.sin(t * 2 + 1) * 0.3;
    });
    const beams: Mesh[] = [];
    for (let i = 0; i < 3; i++) {
      const m = new Mesh(own(new BoxGeometry(0.04, 0.5, 0.04)), kit.basic("#f7a8a8"));
      group.add(m);
      beams.push(m);
    }
    anims.push((t) => beams.forEach((m, i) => {
      const u = (t * 0.3 + i / 3) % 1;
      m.position.set(-1.4 + i * 1.4, TOP + 0.9 + u * 0.4, -2.3);
      m.rotation.z = u * 3;
    }));
  } else {
    // accueil : réception et salon à gauche ; garage, bornes de recharge et coffre à droite
    cyl(2.1, 0.02, -2.2, 0, 0.5, "#cfe8dc", 28);
    box(2.2, 0.95, 0.7, -3.2, 0, -1.6, "#f6f1e6");
    box(2.2, 0.06, 0.8, -3.2, 0.95, -1.6, st.accent);
    box(0.7, 0.95, 1.4, -2.4, 0, -0.95, "#f6f1e6");
    boxB(0.5, 0.3, 0.02, -3.2, 1.2, -1.75, "#bfe6ff");
    box(2.0, 0.34, 0.8, -2.6, 0, 1.5, "#2f9e6e");
    box(2.0, 0.5, 0.2, -2.6, 0.34, 1.82, "#27845c");
    box(0.8, 0.22, 0.5, -2.4, 0, 0.6, "#c9a577");
    for (const [px, pz] of [[-4.0, 1.9], [-1.6, -2.1]] as const) {
      box(0.5, 0.4, 0.5, px, 0, pz, "#8a5f3c");
      ball(0.4, px, 0.8, pz, "#5aa84c");
    }
    box(4.0, 0.01, 4.4, 2.0, 0, 0, "#8b8f98");
    for (let i = 0; i < 8; i++) boxB(0.5, 0.012, 0.1, 3.9, 0.012, -2.0 + i * 0.58, i % 2 ? "#f2c14e" : "#2a3440");
    const pods: { x: number; z: number; color: string }[] = [
      { x: 1.2, z: -1.8, color: "#f2c14e" },
      { x: 2.4, z: -1.8, color: "#e86f9a" },
      { x: 3.4, z: -1.8, color: "#9a7be0" },
    ];
    for (const p of pods) {
      box(0.9, 0.1, 0.9, p.x, 0, p.z, "#2a3440");
      boxB(0.8, 0.02, 0.8, p.x, 0.1, p.z, "#38e0c6");
      box(0.07, 1.0, 0.07, p.x + 0.4, 0, p.z - 0.42, "#59606a");
    }
    const bike = stand([
      [new TorusGeometry(0.2, 0.03, 6, 14), lam("#2a3440"), 0.28, 0.2, 0],
      [new TorusGeometry(0.2, 0.03, 6, 14), lam("#2a3440"), -0.28, 0.2, 0],
      [new BoxGeometry(0.6, 0.04, 0.04), lam("#4aa3df"), 0, 0.28, 0],
    ]);
    for (const m of bike.children) m.rotation.y = Math.PI / 2;
    bike.children[2]!.rotation.y = 0;
    place(bike, 1.2, 0.12, -1.8, 0.4);
    const skate = stand([[new BoxGeometry(0.62, 0.04, 0.2), lam("#e86f9a"), 0, 0.08, 0], [new CylinderGeometry(0.05, 0.05, 0.22, 8), lam("#2a3440"), 0.2, 0.04, 0], [new CylinderGeometry(0.05, 0.05, 0.22, 8), lam("#2a3440"), -0.2, 0.04, 0]]);
    skate.children[1]!.rotation.x = skate.children[2]!.rotation.x = Math.PI / 2;
    place(skate, 2.4, 0.12, -1.8);
    const chop = stand([[new SphereGeometry(0.26, 12, 8), lam("#9a7be0"), 0, 0.3, 0], [new BoxGeometry(0.5, 0.05, 0.05), lam("#9a7be0"), -0.45, 0.34, 0], [new BoxGeometry(0.9, 0.015, 0.07), lam("#2a3440"), 0, 0.6, 0]]);
    place(chop, 3.4, 0.12, -1.8);
    anims.push((t) => (chop.children[2]!.rotation.y = t * 14));
    // coffre
    box(0.9, 0.8, 0.7, 3.6, 0, 1.5, "#59606a");
    cyl(0.18, 0.05, 3.15, 0.45, 1.5, "#e0b03c", 16);
    for (let i = 0; i < 4; i++) cyl(0.16, 0.05, 3.1 + (i % 2) * 0.05, 0.82 + i * 0.05, 1.7, "#f2c14e", 14);
    box(0.7, 0.3, 0.7, 0.8, 0, 1.6, "#e0a526");
    const r = robot(st.accent, -3.2, 0, -0.9, Math.PI / 2, 1.05);
    anims.push((t) => {
      r.arms[0]!.rotation.z = Math.sin(t * 3) * 0.9 - 0.2;
      r.head.rotation.y = Math.sin(t * 0.7) * 0.4;
    });
    const scout = robot("#f2c14e", 1.2, 0.1, -0.9, -Math.PI / 2, 0.85);
    anims.push((t) => (scout.head.rotation.y = Math.sin(t * 1.1 + 1) * 0.5));
  }

  ctx.meshes.push(...(structure.build(group, own, { cast: false, receive: true }, Mesh) as Mesh[]));
  ctx.meshes.push(...(fu.build(group, own, { cast: true, receive: true }, Mesh) as Mesh[]));
}
