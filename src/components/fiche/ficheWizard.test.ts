import { describe, expect, it } from "vitest";
import { TON_DEFAUT } from "@/content/fiche";
import { FICHE_VIDE } from "@/lib/api/profile";
import { erreursVisibles, niveauCompletion, toSaisie, validerSaisie } from "./ficheWizard";

describe("niveauCompletion (indicateur local, 0 à 100)", () => {
  it("vide : 0 %", () => {
    expect(niveauCompletion(toSaisie(FICHE_VIDE))).toBe(0);
  });

  it("augmente à chaque champ renseigné, plafonne à 100 %", () => {
    const vide = toSaisie(FICHE_VIDE);
    const avecOffre = { ...vide, offre: "Des vélos" };
    expect(niveauCompletion(avecOffre)).toBe(25);
    const complet = { ...vide, entreprise_nom: "Acme", offre: "Des vélos", besoin: "x", secteurs: ["industrie"], zone: "Lyon", taille_min: "5", taille_max: "50", fonctions: "DAF", ton: TON_DEFAUT };
    expect(niveauCompletion(complet)).toBe(100);
  });
});

describe("erreursVisibles (n'affiche que les étapes déjà visitées)", () => {
  it("masque les erreurs des étapes non visitées", () => {
    const { errors } = validerSaisie(toSaisie(FICHE_VIDE));
    expect(errors.offre).toBeDefined();
    expect(errors.cible_zone).toBeDefined();
    expect(erreursVisibles(errors, new Set(["vente"]))).toEqual({ offre: errors.offre });
    expect(erreursVisibles(errors, new Set(["vente", "zone"]))).toEqual({ offre: errors.offre, cible_zone: errors.cible_zone });
  });
});
