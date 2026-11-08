import { describe, expect, it } from "vitest";
import { APPEARANCES, BUILDING_MAX_LEVEL, SIGN_MAX_CHARS, appearanceFor, bannerColor, buildingText, buildingVM, buildingHeightPx, clampLevel, levelUpMessage, truncateSign } from "./building";

describe("niveaux de l'immeuble (lus uniquement dans l'état)", () => {
  it("dix apparences, de 1 à 10, progressives (jamais plus basses)", () => {
    expect(APPEARANCES.map((a) => a.level)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    for (let i = 1; i < APPEARANCES.length; i++) {
      expect(APPEARANCES[i]!.floors).toBeGreaterThanOrEqual(APPEARANCES[i - 1]!.floors);
      // Chaque niveau garde les éléments des précédents ou en ajoute (l'immeuble s'améliore).
      expect(APPEARANCES[i]!.label).not.toBe(APPEARANCES[i - 1]!.label);
    }
    expect(buildingHeightPx(10)).toBeGreaterThan(buildingHeightPx(1) * 4);
  });

  it("n'inclut aucun seuil ni règle : seulement de l'apparence", () => {
    for (const a of APPEARANCES) expect(Object.keys(a).sort()).toEqual(["features", "floors", "glass", "label", "level", "sign", "trim", "wall", "width"]);
  });

  it("borne tout niveau invalide à 1..10", () => {
    expect(clampLevel(0)).toBe(1);
    expect(clampLevel(-3)).toBe(1);
    expect(clampLevel(99)).toBe(BUILDING_MAX_LEVEL);
    expect(clampLevel(4.9)).toBe(4);
    expect(clampLevel("5")).toBe(1);
    expect(clampLevel(Number.NaN)).toBe(1);
    expect(appearanceFor(7).level).toBe(7);
    expect(appearanceFor(undefined).level).toBe(1);
  });

  it("équivalent texte permanent", () => {
    expect(buildingText(5, 7, 11)).toBe("Immeuble niveau 5 sur 10, 7 clients obtenus, encore 4 clients pour le niveau suivant");
    expect(buildingText(1, 0, 1)).toBe("Immeuble niveau 1 sur 10, 0 client obtenu, encore 1 client pour le niveau suivant");
    expect(buildingText(10, 40, null)).toBe("Immeuble niveau 10 sur 10, 40 clients obtenus, niveau maximal atteint");
    expect(buildingText(3, 2, null)).toBe("Immeuble niveau 3 sur 10, 2 clients obtenus");
  });

  it("buildingVM : niveau 1 par défaut sans état, valeurs serveur sinon", () => {
    expect(buildingVM(undefined)).toMatchObject({ level: 1, source: "defaut", clientsObtained: 0, nextLevelAt: null });
    expect(buildingVM({ level: 4, clients_obtained: 5, next_level_at: 7 })).toMatchObject({ level: 4, source: "serveur", clientsObtained: 5, nextLevelAt: 7 });
    expect(buildingVM({ level: 4, clients_obtained: -9, next_level_at: 7 }).clientsObtained).toBe(0);
  });

  it("annonce une montée de niveau, jamais une baisse", () => {
    expect(levelUpMessage(2, 3)).toBe("Votre immeuble passe au niveau 3.");
    expect(levelUpMessage(3, 3)).toBeNull();
    expect(levelUpMessage(5, 4)).toBeNull();
  });
});

describe("enseigne (texte non fiable rendu en texte brut)", () => {
  it("tronque à 24 caractères", () => {
    expect(truncateSign("Atelier du Bois")).toBe("Atelier du Bois");
    const t = truncateSign("Menuiserie Générale du Grand Sud-Ouest");
    expect(Array.from(t).length).toBeLessThanOrEqual(SIGN_MAX_CHARS);
    expect(Array.from(t).length).toBeGreaterThan(20);
    expect(t.endsWith("…")).toBe(true);
    expect(truncateSign("a".repeat(24))).toBe("a".repeat(24));
    expect(Array.from(truncateSign("a".repeat(25)))).toHaveLength(24);
  });

  it("garde le HTML tel quel (texte brut) mais retire les caractères de contrôle et normalise les espaces", () => {
    expect(truncateSign("<b>Hé</b>")).toBe("<b>Hé</b>");
    expect(truncateSign("  A\u0000B\n\tC   D ")).toBe("A B C D");
    expect(truncateSign("")).toBe("Votre entreprise");
    expect(truncateSign(null)).toBe("Votre entreprise");
  });

  it("ne coupe pas un caractère composé en deux", () => {
    const s = truncateSign("😀".repeat(30));
    expect(Array.from(s)).toHaveLength(24);
    expect(s.endsWith("…")).toBe(true);
  });

  it("fanion déterministe d'après le nom", () => {
    expect(bannerColor("Atelier Test")).toBe(bannerColor("Atelier Test"));
    expect(bannerColor("Atelier Test")).toMatch(/^#[0-9a-f]{6}$/);
  });
});
