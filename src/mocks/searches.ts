/**
 * Recherches simulées (mode NEXT_PUBLIC_API_MODE autre que http). Corpus FICTIF, aucune règle de jeu : le serveur réel
 * décidera des déblocages, de la pertinence et des doublons. Rejouer une recherche ne rend que ce qui n'est pas déjà
 * dans le carnet simulé (comme le dédoublonnage `(source, source_ref)`).
 */
import { SearchError, type ContactResult, type RunInput, type RunOptions, type SearchesApi, type SearchProspect, type SearchResult } from "@/lib/api/searches";

type Seed = Pick<SearchProspect, "entreprise" | "fonction" | "pertinence" | "citation" | "aVerifier">;

const CORPUS: Record<string, Seed[]> = {
  annuaire: [
    { entreprise: "Boulangerie Lenoir (exemple)", fonction: "Gérante", pertinence: "correspond", citation: "« Boulangerie artisanale, 6 salariés, centre-ville »", aVerifier: [] },
    { entreprise: "Café des Arts (exemple)", fonction: "Propriétaire", pertinence: "correspond", citation: "« Café-librairie, 4 salariés, quartier piéton »", aVerifier: [] },
    { entreprise: "Atelier Vélo Nord (exemple)", fonction: null, pertinence: "a_verifier", citation: "« Réparation de vélos, effectif non indiqué »", aVerifier: ["taille"] },
    { entreprise: "Grossiste Dubois Logistique (exemple)", fonction: "Directeur", pertinence: "hors_cible", citation: "« Entrepôt de 220 salariés, zone industrielle »", aVerifier: [] },
  ],
  registre: [
    { entreprise: "Fleurs & Saisons (exemple)", fonction: "Gérant", pertinence: "correspond", citation: "« Commerce de détail de fleurs, 3 salariés »", aVerifier: [] },
    { entreprise: "Studio Mercier (exemple)", fonction: null, pertinence: "a_verifier", citation: "« Activité récente, secteur à confirmer »", aVerifier: ["secteur"] },
    { entreprise: "Boucherie du Marché (exemple)", fonction: "Gérant", pertinence: "correspond", citation: "« Commerce de détail alimentaire, 5 salariés »", aVerifier: [] },
  ],
};

const found = new Set<string>();
const retained = new Map<string, number>();
const seen = new Map<string, number>();

/** Prospects non « hors cible » trouvés sur un lieu (la maquette ouvre le lieu suivant à 3, comme annoncé au joueur). */
export const retainedCount = (planetId: string): number => retained.get(planetId) ?? 0;
export function resetMockSearches() {
  found.clear();
  retained.clear();
  seen.clear();
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createMockSearchesApi(opts: { delayMs?: number } = {}): SearchesApi {
  const delay = opts.delayMs ?? 1200;
  return {
    async run({ planetId, precision }: RunInput, o: RunOptions = {}): Promise<SearchResult> {
      if (precision && precision.length > 300) throw new SearchError("INVALID_REQUEST", undefined, 422);
      o.onStarted?.();
      await sleep(delay);
      const seeds = CORPUS[planetId] ?? [];
      const added: SearchProspect[] = [];
      let already = 0;
      seeds.forEach((s, i) => {
        const ref = `${planetId}_${String(i + 1).padStart(4, "0")}`;
        if (found.has(ref)) {
          already++;
          return;
        }
        found.add(ref);
        if (s.pertinence !== "hors_cible") retained.set(planetId, retainedCount(planetId) + 1);
        added.push({ id: `pro_${ref}`, fonction: s.fonction, entreprise: s.entreprise, source: planetId, sourceRef: ref, pertinence: s.pertinence, citation: s.citation, aVerifier: s.aVerifier, raisons: [], simule: true });
      });
      return { id: `sea_mock_${planetId}`, planetId, precision: precision?.trim() || null, added, alreadyPresent: already, rejected: 0, horsCible: 0 };
    },
    async contact(prospectId: string): Promise<ContactResult> {
      await sleep(Math.min(delay, 300));
      const n = seen.get(prospectId) ?? seen.size + 1;
      seen.set(prospectId, n);
      return { conversationId: `conv_mock_${n}` };
    },
  };
}
