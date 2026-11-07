/**
 * Historique d'une planète (pur) : tentatives (expéditions) de la mission correspondante -> entrées lisibles.
 * Tout vient du serveur (messages, évaluations, paiements) : rien n'est calculé ici, seulement mis en forme.
 * Les réponses des agents et le retour du client sont du contenu NON FIABLE : l'interface les rend via SafeMarkdown.
 */
import { ATTEMPT_STATUS_LABEL, ROLE_LABEL } from "@/lib/format";
import type { ArtifactVersionView, AttemptStatus, AttemptView, RoleId } from "@/lib/api/types";

export interface HistoryInstruction {
  id: string;
  role: RoleId;
  roleLabel: string;
  /** Instruction du joueur (texte brut). */
  text: string;
  /** Réponse de l'agent (non fiable), si elle est arrivée. */
  reply: string | null;
  /** Une instruction envoyée sans réponse (en cours ou échouée). */
  replyStatus: "SENT" | "PENDING" | "FAILED" | null;
}

export interface HistoryEntry {
  attemptId: string;
  attemptNo: number;
  status: AttemptStatus;
  statusLabel: string;
  createdAt: string | null;
  dateLabel: string;
  instructions: HistoryInstruction[];
  /** Agents mobilisés sur cette expédition (rôle, instructions utilisées / quota serveur). */
  agents: { role: RoleId; label: string; used: number; limit: number }[];
  versions: ArtifactVersionView[];
  delivered: boolean;
  evaluating: boolean;
  score: number | null;
  passed: boolean | null;
  /** Gain crédité par le serveur pour cette expédition (écart payé, pas le gain maximal). */
  payment: number | null;
  feedback: string | null;
  nextAction: string | null;
}

export interface HistorySummary {
  expeditions: number;
  instructions: number;
  bestScore: number | null;
  totalPaid: number;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "date inconnue";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "date inconnue";
  return d.toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Associe chaque instruction du joueur à la réponse suivante du MÊME agent (ordre de la conversation). */
export function pairInstructions(messages: AttemptView["messages"]): HistoryInstruction[] {
  const out: HistoryInstruction[] = [];
  const waiting = new Map<RoleId, HistoryInstruction[]>();
  for (const m of messages) {
    if (m.author === "player") {
      const ins: HistoryInstruction = { id: m.id, role: m.role, roleLabel: ROLE_LABEL[m.role] ?? m.role, text: m.text, reply: null, replyStatus: m.status };
      out.push(ins);
      waiting.set(m.role, [...(waiting.get(m.role) ?? []), ins]);
    } else {
      const queue = waiting.get(m.role);
      const target = queue?.shift();
      if (target) {
        target.reply = m.text;
        target.replyStatus = m.status === "FAILED" ? "FAILED" : "SENT";
      }
    }
  }
  return out;
}

export function entryFromAttempt(a: AttemptView): HistoryEntry {
  const ev = a.submission?.evaluation ?? null;
  const evaluating = !!a.submission && a.submission.status !== "EVALUATED";
  return {
    attemptId: a.id,
    attemptNo: a.attempt_no,
    status: a.status,
    statusLabel: evaluating ? "Évaluation en cours" : ATTEMPT_STATUS_LABEL[a.status],
    createdAt: a.created_at ?? null,
    dateLabel: formatDateTime(a.created_at),
    instructions: pairInstructions(a.messages),
    agents: a.roles.filter((r) => r.used > 0).map((r) => ({ role: r.role, label: ROLE_LABEL[r.role] ?? r.role, used: r.used, limit: r.limit })),
    versions: a.artifacts,
    delivered: !!a.submission,
    evaluating,
    score: ev ? ev.score : null,
    passed: ev ? ev.passed : null,
    payment: ev ? ev.payment.credited : null,
    feedback: ev ? ev.client_feedback || null : null,
    nextAction: ev ? ev.next_action || null : null,
  };
}

/** Entrées de la plus récente à la plus ancienne. */
export function buildPlanetHistory(attempts: readonly AttemptView[]): HistoryEntry[] {
  return [...attempts].sort((x, y) => y.attempt_no - x.attempt_no).map(entryFromAttempt);
}

export function summarizeHistory(entries: readonly HistoryEntry[]): HistorySummary {
  const scores = entries.map((e) => e.score).filter((s): s is number => s !== null);
  return {
    expeditions: entries.length,
    instructions: entries.reduce((n, e) => n + e.instructions.length, 0),
    bestScore: scores.length ? Math.max(...scores) : null,
    totalPaid: entries.reduce((n, e) => n + (e.payment ?? 0), 0),
  };
}

/** Remplace dans la liste récupérée la tentative courante par la version la plus fraîche de l'état. */
export function mergeCurrentAttempt(fetched: readonly AttemptView[], current: AttemptView | null | undefined, missionId: string | null): AttemptView[] {
  if (!current || !missionId || current.mission_id !== missionId) return [...fetched];
  const has = fetched.some((a) => a.id === current.id);
  return has ? fetched.map((a) => (a.id === current.id ? current : a)) : [...fetched, current];
}
