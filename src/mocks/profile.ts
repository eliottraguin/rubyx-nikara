/**
 * Fiche entreprise et cible simulée (hors `NEXT_PUBLIC_API_MODE=http`). Mêmes règles visibles que le serveur :
 * versions successives, `VERSION_CONFLICT` si la version attendue est périmée, champs obligatoires (offre, secteurs, zone).
 * Le serveur réel décide de tout ; ce mock ne sert qu'à la démonstration.
 */
import { BORNES } from "@/content/fiche";
import { FICHE_VIDE, ProfileError, type Fiche, type FicheValeurs, type ProfileApi } from "@/lib/api/profile";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createMockProfileApi(opts: { delayMs?: number; initial?: Partial<FicheValeurs> } = {}): ProfileApi {
  const delay = opts.delayMs ?? 150;
  let current: Fiche = { ...FICHE_VIDE, ...opts.initial, version: 1, complete: false, modifieLe: new Date().toISOString() };
  const complete = (v: FicheValeurs) => Boolean(v.offre.trim() && v.cible_secteurs.length && v.cible_zone.length);
  return {
    async get() {
      await sleep(delay);
      return structuredClone(current);
    },
    async save(values, expectedVersion) {
      await sleep(delay);
      if (expectedVersion !== current.version) throw new ProfileError("VERSION_CONFLICT", "La fiche a changé ailleurs.", 409);
      const fields: Record<string, string> = {};
      if (!values.offre.trim()) fields.offre = "Champ obligatoire.";
      else if (values.offre.length > BORNES.offre) fields.offre = `Trop long (maximum ${BORNES.offre} caractères).`;
      if (!values.cible_secteurs.length) fields.cible_secteurs = "Au moins un élément est requis.";
      if (!values.cible_zone.length) fields.cible_zone = "Au moins un élément est requis.";
      if (Object.keys(fields).length) throw new ProfileError("INVALID_REQUEST", "Requête invalide.", 422, fields);
      current = { ...structuredClone(values), version: current.version + 1, complete: complete(values), modifieLe: new Date().toISOString() };
      return structuredClone(current);
    },
  };
}
