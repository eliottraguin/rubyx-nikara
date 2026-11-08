/**
 * Orchestrateur simulé (mode NEXT_PUBLIC_API_MODE autre que http). Corpus FICTIF, aucune règle de jeu : le serveur
 * réel décide des plans, des prix, des paliers et des limites. Comportements déterministes selon le message :
 *  - contient « rien » : plan vide ; « incompréhensible » : l'orchestrateur ne comprend pas ;
 *  - contient « bloqu » : une des tâches est impossible (raison en une phrase) ;
 *  - contient « échec » : la 2e tâche échoue à la 1re confirmation (état partiel), puis réussit à la nouvelle tentative.
 */
import { FALLBACK } from "@/content/assistant";
import {
  OrchestratorError,
  type AgentConfigView,
  type AgentInstance,
  type ConfirmOptions,
  type OrchestratorApi,
  type OrchestratorPlan,
  type OrchestratorPlanStep,
  type RoleId,
} from "@/lib/api/orchestrator";

interface Seed {
  type: string;
  role: RoleId;
  target: string;
  title: string;
  who: string;
  youGet: string;
  cost: number;
  durationEstimateS: number;
  result: string;
}

const SEEDS: Seed[] = [
  { type: "scout_search", role: "scout", target: "Bibliothèque publique", title: "Chercher des prospects à la Bibliothèque publique", who: "votre éclaireur", youGet: "de nouveaux prospects dans votre carnet", cost: 0, durationEstimateS: 35, result: "De nouveaux prospects sont arrivés dans votre carnet." },
  { type: "prospect_profile", role: "replier", target: "Boulangerie Lenoir (exemple)", title: "Préparer la fiche client de Boulangerie Lenoir (exemple)", who: "votre rédacteur", youGet: "une fiche client à relire", cost: 3, durationEstimateS: 10, result: "La fiche client est prête dans votre carnet." },
  { type: "conversation_reply", role: "replier", target: "Dupont (exemple)", title: "Préparer une réponse pour Dupont (exemple)", who: "votre rédacteur", youGet: "un brouillon de réponse que vous relisez", cost: 2, durationEstimateS: 8, result: "Le brouillon de réponse est prêt." },
  { type: "ad_campaign", role: "ads", target: "Lancement", title: "Préparer le kit de la campagne « Lancement »", who: "votre directrice de campagne", youGet: "des textes et un plan prêts à publier vous-même", cost: 5, durationEstimateS: 20, result: "Le kit de campagne est prêt dans le Studio pub." },
];

const INSTANCE_LABEL: Record<RoleId, string> = { scout: "Éclaireur", triage: "Trieur", replier: "Rédacteur", ads: "Directrice de campagne" };

function instructionsFor(role: RoleId, tier: number): string {
  return `Vous êtes ${INSTANCE_LABEL[role]} (palier ${tier}). Restez bref, fidèle à la fiche entreprise, et ne promettez rien qui n'y figure pas.`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const step = (s: Seed, index: number, blocked: string | null, instanceId: string | null): OrchestratorPlanStep => ({
  index, type: s.type, targetId: `${s.type}_${index}`, targetLabel: s.target, instanceId: blocked ? null : instanceId, role: s.role, tier: 1, durationEstimateS: s.durationEstimateS,
  title: s.title, who: s.who, youGet: s.youGet, instruction: "", cost: s.cost, blockedReason: blocked, status: blocked ? "BLOCKED" : "READY", actionId: null, resultText: null, tries: 0,
});

function seedsFor(message: string): Seed[] {
  const m = message.toLowerCase();
  if (m.includes("rien")) return [];
  if (m.includes("relance") || m.includes("dupont")) return [SEEDS[0]!, SEEDS[2]!];
  if (m.includes("campagne") || m.includes("pub")) return [SEEDS[3]!];
  return [SEEDS[0]!];
}

function evaluationFor(message: string): { score: number; feedback: string } {
  const len = message.trim().length;
  const specific = /centre-ville|dupont|lancement|campagne/i.test(message);
  const score = Math.min(100, 40 + Math.min(len, 60) + (specific ? 20 : 0));
  const feedback = score >= 80 ? "Clair et précis. Donnez aussi une échéance pour aller plus vite." : score >= 50 ? "Plutôt clair. Précisez un lieu ou un client pour une meilleure note." : "Essayez d'être plus précis : qui, où, quoi.";
  return { score, feedback };
}

export function createMockOrchestratorApi(opts: { delayMs?: number; balance?: number; plans?: number } = {}): OrchestratorApi {
  const delay = opts.delayMs ?? 700;
  let balance = opts.balance ?? 60;
  let left = opts.plans ?? 5;
  let n = 0;
  const plans: OrchestratorPlan[] = [];
  const failOnce = new Set<string>();
  const instances: AgentInstance[] = [
    { id: "agi_scout_01", role: "scout", tier: 1, status: "idle", label: null, config: { version: 1, instructions: instructionsFor("scout", 1), contextNote: null, tierCap: 2 }, pricePaid: 0, purchasedAt: new Date(2026, 10, 1).toISOString() },
    { id: "agi_replier_01", role: "replier", tier: 1, status: "idle", label: null, config: { version: 1, instructions: instructionsFor("replier", 1), contextNote: null, tierCap: 2 }, pricePaid: 40, purchasedAt: new Date(2026, 10, 2).toISOString() },
    { id: "agi_ads_01", role: "ads", tier: 1, status: "idle", label: null, config: { version: 1, instructions: instructionsFor("ads", 1), contextNote: null, tierCap: 2 }, pricePaid: 50, purchasedAt: new Date(2026, 10, 3).toISOString() },
  ];

  const find = (id: string): OrchestratorPlan => {
    const p = plans.find((x) => x.id === id);
    if (!p) throw new OrchestratorError("NOT_FOUND", undefined, 404);
    return p;
  };
  const view = (p: OrchestratorPlan): OrchestratorPlan => {
    const todo = p.status === "PROPOSED" || p.status === "PARTIAL" ? p.steps.filter((s) => s.status === "READY" || s.status === "FAILED") : [];
    const total = todo.reduce((a, s) => a + s.cost, 0);
    return structuredClone({ ...p, balance, totalCost: p.status === "PROPOSED" ? total : p.totalCost, balanceAfter: p.status === "PROPOSED" ? balance - total : balance, plansLeft: left });
  };
  const instanceFor = (role: RoleId): AgentInstance | undefined => instances.find((i) => i.role === role && i.status === "idle");

  return {
    async propose(message) {
      await sleep(delay / 2);
      const m = message.toLowerCase();
      if (left <= 0) throw new OrchestratorError("MESSAGE_LIMIT", undefined, 409);
      if (m.includes("incompréhensible")) throw new OrchestratorError("INVALID_OUTPUT", undefined, 422);
      const seeds = seedsFor(message);
      const steps = seeds.map((s, i) => {
        const blockedCost = m.includes("bloqu") && i === seeds.length - 1 ? "Vous n'avez pas assez d'argent pour cette tâche." : null;
        const inst = instanceFor(s.role);
        const blocked = blockedCost ?? (inst ? null : `Aucun·e ${INSTANCE_LABEL[s.role].toLowerCase()} disponible : achetez-en un·e ou attendez son retour.`);
        return step(s, i, blocked, inst?.id ?? null);
      });
      const plan: OrchestratorPlan = {
        id: `orp_mock_${++n}`, headline: FALLBACK.headline, banner: FALLBACK.banner,
        summary: seeds.length === 0 ? "Votre demande ne correspond à aucune tâche que je sais faire pour le moment." : `Voici comment je m'y prends pour : ${message.trim().slice(0, 80)}`,
        status: "PROPOSED", steps, totalCost: 0, balance, balanceAfter: balance, plansLeft: left, simule: true, createdAt: new Date().toISOString(),
        evaluation: message.trim() ? evaluationFor(message) : null,
      };
      left--;
      if (m.includes("échec")) failOnce.add(plan.id);
      plans.unshift(plan);
      return view(plan);
    },
    async list() {
      return { items: plans.map(view), plansLeft: left };
    },
    async get(id) {
      return view(find(id));
    },
    async confirm(id, o: ConfirmOptions = {}) {
      const p = find(id);
      if (p.status === "REJECTED" || p.status === "DONE") throw new OrchestratorError("INVALID_STATE", undefined, 409);
      const todo = p.steps.filter((s) => s.status === "READY" || s.status === "FAILED");
      if (todo.length === 0) throw new OrchestratorError("INVALID_STATE", undefined, 409);
      p.status = "RUNNING";
      p.totalCost = todo.reduce((a, s) => a + s.cost, 0);
      for (const s of todo) s.status = "READY";
      for (const s of todo) {
        s.status = "RUNNING";
        const inst = instances.find((i) => i.id === s.instanceId);
        if (inst) inst.status = "traveling";
        o.onProgress?.(view(p));
        await sleep(delay);
        s.tries++;
        if (failOnce.has(p.id) && s.index === 1 && s.tries === 1) {
          s.status = "FAILED";
          s.resultText = "L'orchestrateur n'a pas réussi cette fois. Rien n'a été dépensé : vous pouvez réessayer.";
        } else if (balance < s.cost) {
          s.status = "FAILED";
          s.resultText = "Vous n'avez pas assez d'argent pour cette tâche.";
        } else {
          balance -= s.cost;
          s.status = "DONE";
          s.resultText = SEEDS.find((x) => x.type === s.type)?.result ?? "C'est fait.";
        }
        if (inst) inst.status = "idle";
        o.onProgress?.(view(p));
      }
      failOnce.delete(p.id);
      p.status = p.steps.some((s) => s.status === "FAILED") ? "PARTIAL" : "DONE";
      return view(p);
    },
    async reject(id) {
      await sleep(Math.min(delay, 200));
      const p = find(id);
      if (p.status !== "PROPOSED") throw new OrchestratorError("INVALID_STATE", undefined, 409);
      p.status = "REJECTED";
      left++;
      return view(p);
    },
    async instances() {
      await sleep(Math.min(delay, 200));
      return structuredClone(instances);
    },
    async improve(instanceId, feedback) {
      await sleep(delay);
      const inst = instances.find((i) => i.id === instanceId);
      if (!inst) throw new OrchestratorError("NOT_FOUND", undefined, 404);
      const f = feedback.toLowerCase();
      const nextTier = inst.tier + 1;
      const cost = nextTier === 2 ? 60 : 120;
      if (balance < cost) throw new OrchestratorError("INSUFFICIENT_FUNDS", undefined, 409);
      if (inst.config.tierCap > 3 && nextTier > 3) throw new OrchestratorError("INVALID_REQUEST", "Cet agent a atteint son palier maximal.", 422);
      balance -= cost;
      const newConfig: AgentConfigView = {
        version: inst.config.version + 1,
        instructions: f.includes("générique") ? `${inst.config.instructions} Donnez toujours un détail précis tiré de la fiche entreprise.` : f.includes("familier") ? `${inst.config.instructions} Restez professionnel, sans familiarité.` : f.includes("long") ? inst.config.instructions.split(".")[0]! + "." : `${inst.config.instructions} Tenez compte de ce retour : « ${feedback.trim().slice(0, 80)} ».`,
        contextNote: inst.config.contextNote,
        tierCap: inst.config.tierCap,
      };
      inst.config = newConfig;
      const summary = "Nouvelle version enregistrée : instructions ajustées selon votre retour.";
      return { instanceId, configVersion: newConfig.version, pricePaid: cost, summary, instance: structuredClone(inst) };
    },
    async rollback(instanceId, configVersion) {
      await sleep(Math.min(delay, 300));
      const inst = instances.find((i) => i.id === instanceId);
      if (!inst) throw new OrchestratorError("NOT_FOUND", undefined, 404);
      if (configVersion < 1 || configVersion >= inst.config.version) throw new OrchestratorError("INVALID_REQUEST", "Version inconnue ou plus récente que la version active.", 422);
      inst.config = { ...inst.config, version: configVersion, instructions: instructionsFor(inst.role, inst.tier) };
      return structuredClone(inst);
    },
  };
}
