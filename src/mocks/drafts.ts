/**
 * Fiche client et premier message simulés (hors `NEXT_PUBLIC_API_MODE=http`). Contenu FICTIF et déterministe ;
 * le serveur réel décide des coûts, des essais et des contrôles. Les versions sont immuables : modifier en crée une.
 */
import {
  DraftsError, QUOTA,
  type Check, type DraftEdit, type DraftKind, type DraftsApi, type DraftsState, type DraftVersion,
} from "@/lib/api/drafts";

const store = new Map<string, Record<DraftKind, DraftVersion[]>>();
let seq = 0;
export function resetMockDrafts() {
  store.clear();
  seq = 0;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rec = (id: string) => {
  let r = store.get(id);
  if (!r) store.set(id, (r = { profile: [], message: [] }));
  return r;
};
const stamp = () => new Date(Date.UTC(2026, 10, 8, 10, 0, seq)).toISOString();

const CHECKS: Check[] = [
  { id: "sources", label: "Chaque fait vient de la fiche du prospect", essentiel: true, reussi: true, detail: null },
  { id: "longueur", label: "Longueurs respectées", essentiel: true, reussi: true, detail: null },
  { id: "pas_de_contact", label: "Aucune adresse ni numéro dans le texte", essentiel: true, reussi: true, detail: null },
];

const MOCK_COST: Record<DraftKind, number> = { profile: 3, message: 2 };
const left = (list: DraftVersion[]) => Math.max(0, QUOTA - list.filter((v) => v.auteur === "agent").length);

function snapshot(id: string): DraftsState {
  const r = rec(id);
  return {
    profile: [...r.profile],
    message: [...r.message],
    remaining: { profile: left(r.profile), message: left(r.message) },
    costs: { profile: MOCK_COST.profile, message: MOCK_COST.message },
  };
}

function make(kind: DraftKind, n: number, auteur: "agent" | "joueur", parentId: string | null, over: Partial<DraftVersion> = {}): DraftVersion {
  seq++;
  const base: DraftVersion =
    kind === "profile"
      ? {
          id: `ver_mock_${seq}`, kind, numero: n, parentId, auteur, createdAt: stamp(), checks: CHECKS, objet: null, corps: "",
          resume: `Commerce de proximité (exemple) : équipe réduite, bien implanté localement. Essai n°${n}.`,
          pourquoi: ["Secteur et zone conformes à votre cible.", "Effectif dans la fourchette que vous visez."],
          accroches: ["Une équipe réduite qui gagne à gagner du temps.", "Un point de contact clair sur la fiche."],
          aVerifier: ["Taille exacte de l'équipe.", "Qui décide des achats."],
        }
      : {
          id: `ver_mock_${seq}`, kind, numero: n, parentId, auteur, createdAt: stamp(), checks: CHECKS, resume: "", pourquoi: [], accroches: [],
          aVerifier: ["Le prénom de la personne à qui vous écrivez."],
          objet: `Une idée pour votre commerce (essai ${n})`,
          corps: `Bonjour,\n\nJe suis tombé sur votre commerce en cherchant des entreprises de votre quartier. Nous aidons les équipes réduites à gagner du temps sur leurs tâches du quotidien.\n\nSeriez-vous disponible pour un échange de dix minutes cette semaine ?\n\nCordialement`,
        };
  return { ...base, ...over };
}

export function createMockDraftsApi(opts: { delayMs?: number } = {}): DraftsApi {
  const delay = opts.delayMs ?? 900;
  return {
    async load(prospectId) {
      return snapshot(prospectId);
    },
    async generate(prospectId, kind) {
      const r = rec(prospectId);
      await sleep(delay);
      const used = r[kind].filter((v) => v.auteur === "agent").length;
      if (used >= QUOTA) throw new DraftsError("MESSAGE_LIMIT", "Essais épuisés.", 409);
      const v = make(kind, used + 1, "agent", r[kind].length ? r[kind][r[kind].length - 1]!.id : null, { numero: r[kind].length + 1 });
      r[kind].push(v);
      return { state: snapshot(prospectId), createdId: v.id, debited: MOCK_COST[kind] };
    },
    async edit(prospectId, kind, versionId, c: DraftEdit) {
      const r = rec(prospectId);
      const parent = r[kind].find((v) => v.id === versionId);
      if (!parent) throw new DraftsError("NOT_FOUND", undefined, 404);
      const v = make(kind, r[kind].length + 1, "joueur", parent.id, {
        resume: c.resume ?? parent.resume,
        pourquoi: parent.pourquoi,
        accroches: c.accroches ?? parent.accroches,
        aVerifier: c.aVerifier ?? parent.aVerifier,
        objet: c.objet !== undefined ? c.objet : parent.objet,
        corps: c.corps ?? parent.corps,
      });
      r[kind].push(v);
      return { state: snapshot(prospectId), createdId: v.id };
    },
    async useAsFirstMessage(prospectId, versionId) {
      await sleep(Math.min(delay, 300));
      if (!rec(prospectId).message.some((v) => v.id === versionId)) throw new DraftsError("NOT_FOUND", undefined, 404);
      return { conversationId: `conv_mock_${prospectId}` };
    },
  };
}
