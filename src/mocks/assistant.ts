/**
 * Assistants simulés (mode NEXT_PUBLIC_API_MODE autre que http). Corpus FICTIF, aucune règle de jeu : le serveur réel
 * décide des plans, des prix et des limites. Comportements déterministes selon la demande :
 *  - contient « rien » : plan vide ; « incompréhensible » : l'assistant ne comprend pas ;
 *  - contient « bloqu » : une des tâches est impossible (raison en une phrase) ;
 *  - contient « échec » : la 2e tâche échoue à la 1re confirmation (état partiel), puis réussit à la nouvelle tentative.
 */
import { FALLBACK } from "@/content/assistant";
import { AssistantError, type AssistantApi, type AssistantId, type ConfirmOptions, type Plan, type PlanStep } from "@/lib/api/assistant";

const LABELS: Record<AssistantId, string> = {
  assistant_prospection: "Assistant Prospection",
  assistant_clients: "Assistant Clients",
  assistant_pub: "Assistant Pub",
};

interface Seed {
  type: string;
  target: string;
  title: string;
  who: string;
  youGet: string;
  cost: number;
  result: string;
}
const SEEDS: Record<AssistantId, Seed[]> = {
  assistant_prospection: [
    { type: "prospect_profile", target: "Boulangerie Lenoir (exemple)", title: "Préparer la fiche client de Boulangerie Lenoir (exemple)", who: "Julie, votre rédactrice", youGet: "Une fiche client à relire.", cost: 3, result: "La fiche client est prête dans votre carnet." },
    { type: "prospect_message", target: "Café des Arts (exemple)", title: "Écrire un premier message pour Café des Arts (exemple)", who: "Julie, votre rédactrice", youGet: "Un brouillon que vous relisez et envoyez vous-même.", cost: 3, result: "Le brouillon du premier message est prêt." },
  ],
  assistant_clients: [
    { type: "conversation_triage", target: "Dupont (exemple)", title: "Résumer la conversation avec Dupont (exemple)", who: "Marc, votre trieur de boîte", youGet: "Un résumé court de ce que le client a écrit.", cost: 2, result: "Le résumé est prêt dans la Salle du courrier." },
    { type: "conversation_reply", target: "Dupont (exemple)", title: "Préparer une réponse à Dupont (exemple)", who: "Julie, votre rédactrice", youGet: "Un brouillon de réponse que vous relisez avant tout envoi.", cost: 3, result: "Le brouillon de réponse est prêt." },
  ],
  assistant_pub: [
    { type: "ad_campaign", target: "Lancement", title: "Préparer le kit de la campagne « Lancement »", who: "Léa, votre directrice de campagne", youGet: "Des textes et un plan prêts à publier par vous-même.", cost: 5, result: "Le kit de campagne est prêt dans le Studio pub." },
  ],
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const step = (s: Seed, index: number, blocked: string | null): PlanStep => ({
  index, type: s.type, targetId: `${s.type}_${index}`, targetLabel: s.target, title: s.title, who: s.who, youGet: s.youGet, instruction: "", cost: s.cost,
  blockedReason: blocked, status: blocked ? "BLOCKED" : "READY", actionId: null, resultText: null, tries: 0,
});

export function createMockAssistantApi(opts: { delayMs?: number; balance?: number; plans?: number } = {}): AssistantApi {
  const delay = opts.delayMs ?? 700;
  let balance = opts.balance ?? 30;
  let left = opts.plans ?? 5;
  let n = 0;
  const plans: Plan[] = [];
  const failOnce = new Set<string>();
  const find = (id: string): Plan => {
    const p = plans.find((x) => x.id === id);
    if (!p) throw new AssistantError("NOT_FOUND", undefined, 404);
    return p;
  };
  const view = (p: Plan): Plan => {
    const todo = p.status === "PROPOSED" || p.status === "PARTIAL" ? p.steps.filter((s) => s.status === "READY" || s.status === "FAILED") : [];
    const total = todo.reduce((a, s) => a + s.cost, 0);
    return structuredClone({ ...p, balance, totalCost: p.status === "PROPOSED" ? total : p.totalCost, balanceAfter: p.status === "PROPOSED" ? balance - total : balance, plansLeft: left });
  };

  return {
    async propose(assistant, message) {
      await sleep(delay / 2);
      const m = message.toLowerCase();
      if (left <= 0) throw new AssistantError("MESSAGE_LIMIT", undefined, 409);
      if (m.includes("incompréhensible")) throw new AssistantError("INVALID_OUTPUT", undefined, 422);
      const seeds = m.includes("rien") ? [] : SEEDS[assistant];
      const steps = seeds.map((s, i) => step(s, i, m.includes("bloqu") && i === seeds.length - 1 ? "Vous n'avez pas assez d'argent pour cette tâche." : null));
      const plan: Plan = {
        id: `plan_mock_${++n}`, assistant, assistantLabel: LABELS[assistant], headline: FALLBACK.headline, banner: FALLBACK.banner,
        summary: seeds.length === 0 ? "Votre demande ne correspond à aucune tâche que je sais faire pour le moment." : `Voici comment je m'y prends pour : ${message.trim().slice(0, 80)}`,
        status: "PROPOSED", steps, totalCost: 0, balance, balanceAfter: balance, plansLeft: left, simule: true, createdAt: new Date().toISOString(),
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
      if (p.status === "REJECTED" || p.status === "DONE") throw new AssistantError("INVALID_STATE", undefined, 409);
      const todo = p.steps.filter((s) => s.status === "READY" || s.status === "FAILED");
      if (todo.length === 0) throw new AssistantError("INVALID_STATE", undefined, 409);
      p.status = "RUNNING";
      p.totalCost = todo.reduce((a, s) => a + s.cost, 0);
      for (const s of todo) s.status = "READY";
      for (const s of todo) {
        s.status = "RUNNING";
        o.onProgress?.(view(p));
        await sleep(delay);
        s.tries++;
        if (failOnce.has(p.id) && s.index === 1 && s.tries === 1) {
          s.status = "FAILED";
          s.resultText = "L'assistant n'a pas réussi cette fois. Rien n'a été dépensé : vous pouvez réessayer.";
        } else if (balance < s.cost) {
          s.status = "FAILED";
          s.resultText = "Vous n'avez pas assez d'argent pour cette tâche.";
        } else {
          balance -= s.cost;
          s.status = "DONE";
          s.resultText = SEEDS[p.assistant as AssistantId]?.find((x) => x.type === s.type)?.result ?? "C'est fait.";
        }
        o.onProgress?.(view(p));
      }
      failOnce.delete(p.id);
      p.status = p.steps.some((s) => s.status === "FAILED") ? "PARTIAL" : "DONE";
      return view(p);
    },
    async reject(id) {
      await sleep(Math.min(delay, 200));
      const p = find(id);
      if (p.status !== "PROPOSED") throw new AssistantError("INVALID_STATE", undefined, 409);
      p.status = "REJECTED";
      left++;
      return view(p);
    },
  };
}
