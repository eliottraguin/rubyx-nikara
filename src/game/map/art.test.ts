import { describe, expect, it } from "vitest";
import { rng, shade } from "./art";

describe("outils de dessin des placeholders (purs)", () => {
  it("nuance une couleur #rrggbb et une couleur déjà nuancée (pas de noir par erreur)", () => {
    expect(shade("#808080", 0.5)).toBe("rgb(64,64,64)");
    expect(shade("#808080", 2)).toBe("rgb(255,255,255)");
    expect(shade(shade("#808080", 0.5), 0.5)).toBe("rgb(32,32,32)");
  });

  it("le générateur est déterministe (même graine, même ville)", () => {
    const a = rng(7);
    const b = rng(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(rng(8)()).not.toBe(rng(7)());
  });
});
