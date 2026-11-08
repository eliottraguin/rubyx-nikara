/** Matériaux et textures partagés de la ville : un seul exemplaire par couleur, libérés avec la scène. */
import { Color, MeshBasicMaterial, MeshLambertMaterial, type Texture } from "three";
import type { CityScene } from "@/game/login/CityScene";
import { facadeTexture } from "./facade";
import { paletteKey, type Palette } from "./scale";

const hash = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

export class Kit {
  private readonly lamberts = new Map<string, MeshLambertMaterial>();
  private readonly basics = new Map<string, MeshBasicMaterial>();
  private readonly facades = new Map<string, MeshLambertMaterial>();

  constructor(readonly city: CityScene) {}

  lambert(color: string, extra: { emissive?: string; emissiveIntensity?: number; opacity?: number; flat?: boolean } = {}): MeshLambertMaterial {
    const key = `${color}|${extra.emissive ?? ""}|${extra.emissiveIntensity ?? ""}|${extra.opacity ?? ""}|${extra.flat ? 1 : 0}`;
    let m = this.lamberts.get(key);
    if (!m) {
      m = this.city.own(
        new MeshLambertMaterial({
          color,
          flatShading: extra.flat ?? false,
          emissive: new Color(extra.emissive ?? "#000000"),
          emissiveIntensity: extra.emissiveIntensity ?? 1,
          transparent: extra.opacity !== undefined && extra.opacity < 1,
          opacity: extra.opacity ?? 1,
        }),
      );
      this.lamberts.set(key, m);
    }
    return m;
  }

  basic(color: string, opacity = 1): MeshBasicMaterial {
    const key = `${color}|${opacity}`;
    let m = this.basics.get(key);
    if (!m) {
      m = this.city.own(new MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 }));
      this.basics.set(key, m);
    }
    return m;
  }

  /** Matériau de façade (texture de fenêtres) de la palette. */
  facade(p: Palette): MeshLambertMaterial {
    const key = paletteKey(p);
    let m = this.facades.get(key);
    if (!m) {
      const tex: Texture | null = facadeTexture(p, hash(key));
      if (tex) this.city.own(tex);
      m = this.city.own(new MeshLambertMaterial(tex ? { map: tex } : { color: p.wall }));
      this.facades.set(key, m);
    }
    return m;
  }
}
