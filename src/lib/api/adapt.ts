/**
 * Adaptateur API réelle → modèle d'affichage du front.
 *
 * Le serveur (api/app/schemas/, api/openapi.json) fait foi : ses formes diffèrent de celles de la maquette
 * (`GameState` à plat, `attempts[]` + `progress`, évaluation dans `report`, erreurs `{ error: { code, message } }`…).
 * Tout ce qui est calculé ici est de l'AFFICHAGE : solde, prix, score, quotas et droits viennent toujours du serveur.
 * Fonctions pures, sans réseau : testées dans http.test.ts.
 */
import { ROLE_LABEL } from "../format";
import type {
  ActionStatus,
  ActionView,
  AgentView,
  ArtifactVersionView,
  AttemptView,
  Bilan,
  BriefVersion,
  BuildingState,
  ClarificationItem,
  CriterionView,
  DiffLine,
  DocumentView,
  ErrorCode,
  EvaluationView,
  GameState,
  MessageView,
  Mode,
  MissionView,
  RoleId,
  RoleQuota,
  SubmissionView,
  DemoEventId,
} from "./types";

// --- Formes du serveur (sous-ensemble utilisé) --------------------------------------------------------------------

export interface WireAttemptSummary {
  id: string;
  mission_id: string;
  attempt_no: number;
  status: "ACTIVE" | "EVALUATING" | "COMPLETED" | "FAILED";
  brief_version: number;
  unit_price: number;
  spend_cap: number | null;
  message_counts: Record<string, number>;
  free_credit_roles: RoleId[];
  clarifications_used: number;
  score: number | null;
  submission_id: string | null;
  created_at: string;
}

export interface WireState {
  session: {
    id: string;
    mode: Mode;
    company: { name: string; profile: string | null };
    stage: string;
    rules_version: string;
  };
  balance: { booked: number; reserved: number; available: number };
  agents: { role: RoleId; label: string; price: number; owned: boolean; unlock_mission: string | null; unlocked: boolean }[];
  missions: {
    id: string;
    label: string;
    max_reward: number;
    unit_price: number;
    status: MissionView["status"];
    requires: string | null;
    best_score: number | null;
    active_attempt_id: string | null;
    can_start: boolean;
  }[];
  attempts: WireAttemptSummary[];
  progress: {
    completed_missions: string[];
    total_missions: number;
    victory: boolean;
    next_action: { type: string; message: string };
  } | null;
  active_actions: unknown[];
  /** Additif (API-Q1) : absent tant que le serveur ne le renvoie pas. */
  building?: { level?: number; total_earned?: number; next_level_at?: number | null } | null;
  quotas: { messages_per_agent_per_attempt: number; clarifications_per_attempt: number };
  llm: { provider: string; simulated: boolean };
  contracts_version: string;
}

interface WireCriterion {
  id: string;
  label?: string;
  description?: string;
  weight?: number;
  essential?: boolean;
  rating?: number | null;
  comment?: string;
}

export interface WireDetail {
  attempt: WireAttemptSummary;
  mission_title: string | null;
  brief: {
    version: number;
    content: {
      client_name?: string;
      summary?: string;
      objective?: string;
      facts?: { id: string; label: string; value?: string | null; essential?: boolean }[];
      constraints?: string[];
      deliverable_format?: string;
    } | null;
    changes: { version: number; description?: string | null; diff: { field: string; before: string; after: string }[] }[];
  };
  documents: { id: string; title: string; date?: string | null; text?: string | null }[];
  messages: {
    id: string;
    role: RoleId;
    author: string;
    text: string;
    status: string;
    action_id: string | null;
  }[];
  artifacts: {
    id: string;
    /** `document` = pièce du corpus partagée avec un agent (journal de partage), pas un livrable. */
    type?: string;
    parent_id: string | null;
    author: string;
    content: string;
    sources: string[];
    contributions: { role?: RoleId }[];
    created_at: string;
  }[];
  submissions: { id: string; status: string; artifact_version_id: string; brief_version: number; rubric: { rubric?: { criteria?: WireCriterion[] } | null } }[];
  evaluations: {
    submission_id: string;
    status: string;
    score: number | null;
    criteria: WireCriterion[];
    evidence: { id: string; evidence?: string }[];
    report: {
      rubric_id?: string;
      out_of_scope?: boolean;
      client_feedback?: string;
      next_action?: string;
      capped_by_essential?: boolean;
      passed?: boolean;
      spent?: number;
      payment?: { max_reward: number; target: number; already_acquired: number; credited: number; already_awarded: boolean };
    } | null;
  }[];
}

export interface WireAction {
  id: string;
  attempt_id: string | null;
  type: string;
  status: ActionStatus;
  steps: { index: number; kind: string; role: string | null; status: string; cost: number; task: string | null; source_ids: string[]; depends_on: number | null }[];
  error: { code?: string; message?: string } | null;
  debited: number;
  pending_cost: number;
  plan_summary: string | null;
  answer: string | null;
  reservations: { amount: number; status: string }[];
}

// --- Erreurs --------------------------------------------------------------------------------------------------------

/** Les 13 codes émis par api/app/errors.py. */
export const API_ERROR_CODES = [
  "INSUFFICIENT_FUNDS",
  "MESSAGE_LIMIT",
  "ROLE_LOCKED",
  "INVALID_STATE",
  "VERSION_CONFLICT",
  "INVALID_OUTPUT",
  "LLM_UNAVAILABLE",
  "INVALID_REQUEST",
  "RATE_LIMITED",
  "SESSION_REQUIRED",
  "NOT_FOUND",
  "NOT_IMPLEMENTED",
  "INTERNAL_ERROR",
] as const;

/** Code du serveur → code du front (le front garde VALIDATION et NO_SESSION). */
export function mapErrorCode(code: string | undefined): ErrorCode | null {
  if (!code || !(API_ERROR_CODES as readonly string[]).includes(code)) return null;
  if (code === "INVALID_REQUEST") return "VALIDATION";
  if (code === "SESSION_REQUIRED") return "NO_SESSION";
  return code as ErrorCode;
}

// --- Libellés d'affichage -------------------------------------------------------------------------------------------

const ROLE_TEACHES: Record<RoleId, string> = {
  writer: "Apprendre à donner une consigne claire et complète.",
  prospector: "Choisir des prospects et justifier une approche.",
  researcher: "Comparer des sources et citer leurs dates.",
  qa: "Faire contrôler un livrable avant de le livrer.",
  analyst: "Vérifier des chiffres, calculés côté serveur.",
  lead: "Déléguer à plusieurs agents dans une limite de coût.",
};

const missionName = (id: string) => id.toUpperCase();

export function briefToText(content: NonNullable<WireDetail["brief"]["content"]> | null): string {
  if (!content) return "Le contenu de cette commande n'est pas disponible.";
  const out: string[] = [];
  if (content.client_name || content.summary) out.push(`**${content.client_name ?? "Client"}** — ${content.summary ?? ""}`.trim());
  if (content.objective) out.push(`**Objectif.** ${content.objective}`);
  const facts = (content.facts ?? []).filter((f) => f.value);
  if (facts.length) out.push(["**Informations du client**", ...facts.map((f) => `- ${f.label} : ${f.value}${f.essential ? " (essentiel)" : ""}`)].join("\n"));
  if (content.constraints?.length) out.push(["**Contraintes**", ...content.constraints.map((c) => `- ${c}`)].join("\n"));
  if (content.deliverable_format) out.push(`**Format attendu.** ${content.deliverable_format}`);
  return out.join("\n\n");
}

/** Critères affichés avant livraison : le brief public (faits et contraintes). La grille pondérée arrive avec la livraison. */
function briefCriteria(content: WireDetail["brief"]["content"]): CriterionView[] {
  if (!content) return [];
  const facts: CriterionView[] = (content.facts ?? [])
    .filter((f) => f.value)
    .map((f) => ({ id: f.id, label: f.label, description: String(f.value), weight: 0, essential: !!f.essential }));
  const constraints: CriterionView[] = (content.constraints ?? []).map((c, i) => ({
    id: `constraint_${i}`,
    label: c,
    description: "Contrainte du brief.",
    weight: 0,
    essential: false,
  }));
  return [...facts, ...constraints];
}

function mapBrief(d: WireDetail): BriefVersion {
  const change = d.brief.changes.find((c) => c.version === d.brief.version) ?? d.brief.changes[d.brief.changes.length - 1];
  const diff: DiffLine[] | undefined =
    d.brief.version > 1 && change?.diff.length
      ? change.diff.flatMap<DiffLine>((x) => [
          { type: "remove", text: `${x.field} : ${x.before}` },
          { type: "add", text: `${x.field} : ${x.after}` },
        ])
      : undefined;
  return {
    version: d.brief.version,
    text: briefToText(d.brief.content),
    ...(diff ? { diff, change_reason: change?.description ?? undefined } : {}),
  };
}

function mapSubmission(d: WireDetail): SubmissionView | null {
  const sub = d.submissions[d.submissions.length - 1];
  if (!sub) return null;
  const ev = [...d.evaluations].reverse().find((e) => e.submission_id === sub.id && e.status === "DONE");
  const rubricCriteria = sub.rubric?.rubric?.criteria ?? [];
  let evaluation: EvaluationView | undefined;
  if (ev && ev.report) {
    const r = ev.report;
    evaluation = {
      submission_id: sub.id,
      rubric_version: r.rubric_id ?? "",
      out_of_scope: !!r.out_of_scope,
      criteria: ev.criteria.map((c) => ({
        id: c.id,
        rating: c.rating ?? 0,
        evidence: ev.evidence.find((x) => x.id === c.id)?.evidence ?? "",
        comment: c.comment ?? "",
      })),
      client_feedback: r.client_feedback ?? "",
      next_action: r.next_action ?? "",
      score: ev.score ?? 0,
      passed: !!r.passed,
      capped_by_essential: !!r.capped_by_essential,
      criteria_labels: Object.fromEntries(
        ev.criteria.map((c) => [c.id, { label: c.label ?? rubricCriteria.find((x) => x.id === c.id)?.label ?? c.id, essential: !!(c.essential ?? rubricCriteria.find((x) => x.id === c.id)?.essential) }]),
      ),
      payment: r.payment ?? { max_reward: 0, target: 0, already_acquired: 0, credited: 0, already_awarded: false },
      spent: r.spent ?? 0,
    };
  }
  return {
    id: sub.id,
    status: sub.status === "EVALUATED" ? "EVALUATED" : "EVALUATING",
    artifact_version_id: sub.artifact_version_id,
    brief_version: sub.brief_version,
    ...(evaluation ? { evaluation } : {}),
  };
}

export function mapAttempt(d: WireDetail, w: WireState, clarifications: ClarificationItem[]): AttemptView {
  const a = d.attempt;
  const mission = w.missions.find((m) => m.id === a.mission_id);
  const docTitle = (id: string) => d.documents.find((x) => x.id === id)?.title ?? id;
  const sub = d.submissions[d.submissions.length - 1];
  const rubricCriteria = sub?.rubric?.rubric?.criteria;
  const criteria: CriterionView[] = rubricCriteria?.length
    ? rubricCriteria.map((c) => ({ id: c.id, label: c.label ?? c.id, description: c.description ?? "", weight: c.weight ?? 0, essential: !!c.essential }))
    : briefCriteria(d.brief.content);
  const roles: RoleQuota[] = w.agents.map((ag) => ({
    role: ag.role,
    owned: ag.owned,
    used: a.message_counts[ag.role] ?? 0,
    limit: w.quotas.messages_per_agent_per_attempt,
    // Le serveur ne publie pas de coût par envoi : le prix unitaire figé de la tentative est le coût maximal d'un message.
    next_cost_max: a.unit_price,
    ...(a.free_credit_roles.includes(ag.role) ? { free_credit: 1 } : {}),
  }));
  const documents: DocumentView[] = d.documents.map((x) => ({ id: x.id, title: x.title, date: x.date ?? "", content: x.text ?? "" }));
  const messages: MessageView[] = d.messages.map((m) => ({
    id: m.id,
    role: m.role,
    author: m.author === "player" ? "player" : "agent",
    text: m.text,
    status: m.status === "PENDING" || m.status === "FAILED" ? m.status : "SENT",
    ...(m.action_id ? { action_id: m.action_id } : {}),
  }));
  const artifacts: ArtifactVersionView[] = d.artifacts.filter((x) => x.type !== "document").map((x, i) => ({
    id: x.id,
    parent_id: x.parent_id,
    author: x.author === "player" ? "player" : "agent",
    ...(x.contributions[0]?.role ? { role: x.contributions[0].role } : {}),
    content: x.content,
    sources: x.sources.map((s) => ({ document_id: s, title: docTitle(s) })),
    created_at: x.created_at,
    number: i + 1,
  }));
  return {
    id: a.id,
    mission_id: a.mission_id,
    mission_title: d.mission_title ?? mission?.label ?? missionName(a.mission_id),
    attempt_no: a.attempt_no,
    status: a.status,
    brief: mapBrief(d),
    documents,
    criteria,
    max_reward: mission?.max_reward ?? 0,
    unit_price: a.unit_price,
    spend_cap: a.spend_cap,
    clarifications: { used: Math.max(a.clarifications_used, clarifications.length), max: w.quotas.clarifications_per_attempt, items: clarifications },
    roles,
    messages,
    artifacts,
    submission: mapSubmission(d),
    hints_used: 0,
    created_at: a.created_at,
  };
}

// --- Actions --------------------------------------------------------------------------------------------------------

export function mapAction(w: WireAction): ActionView {
  const isPlan = w.type === "lead_plan";
  const stepRole = (w.steps.find((s) => s.role)?.role ?? "lead") as RoleId;
  const running = w.steps.find((s) => s.status === "RUNNING" || s.status === "PENDING");
  const active = w.status === "PENDING" || w.status === "RESERVED" || w.status === "RUNNING";
  const code = mapErrorCode(w.error?.code ?? undefined) ?? (w.error ? "UNKNOWN" : null);
  const delegations = w.steps.filter((s) => s.kind === "delegation");
  const view: ActionView = {
    id: w.id,
    type: isPlan ? "plan" : "message",
    attempt_id: w.attempt_id ?? "",
    role: isPlan ? "lead" : stepRole,
    status: w.status,
    reserved: w.reservations.filter((r) => r.status === "RESERVED").reduce((n, r) => n + r.amount, 0),
    debited: w.debited,
  };
  if (active) {
    const role = (running?.role ?? stepRole) as RoleId;
    view.progress_label = isPlan ? "Le chef d'équipe prépare un plan" : w.type === "clarification" ? "Le client répond" : `${ROLE_LABEL[role] ?? "L'agent"} prépare sa réponse`;
  }
  if (w.error && code) view.error = { code, message: w.error.message ?? "" };
  if (w.status === "AWAITING_CONFIRMATION") {
    const costs: Partial<Record<RoleId, number>> = {};
    for (const s of delegations) if (s.role) costs[s.role as RoleId] = (costs[s.role as RoleId] ?? 0) + s.cost;
    view.plan = {
      summary: w.plan_summary ?? "",
      steps: delegations.map((s) => ({
        role: s.role as RoleId,
        task: s.task ?? "",
        source_ids: s.source_ids,
        ...(s.depends_on !== null ? { depends_on: s.depends_on } : {}),
      })),
      extra_cost_max: w.pending_cost,
      roles_cost_max: costs,
    };
  }
  return view;
}

// --- État -----------------------------------------------------------------------------------------------------------

export interface StateContext {
  /** Détail de la tentative courante (la plus récente), le cas échéant. */
  detail: WireDetail | null;
  clarifications: ClarificationItem[];
  /** Paiement acquis par mission (déduit des évaluations déjà réglées). */
  payments: Record<string, number>;
  /** Actions ouvertes (mutations en cours), déjà adaptées. */
  actions: ActionView[];
  demo: { enabled: boolean; events: DemoEventId[] };
}

export function currentAttempt(w: WireState): WireAttemptSummary | null {
  if (w.attempts.length === 0) return null;
  return [...w.attempts].sort((x, y) => (x.created_at < y.created_at ? -1 : x.created_at > y.created_at ? 1 : 0))[w.attempts.length - 1] ?? null;
}

function mapMission(m: WireState["missions"][number], payments: Record<string, number>): MissionView {
  return {
    id: m.id,
    title: m.label,
    status: m.status,
    max_reward: m.max_reward,
    unit_price: m.unit_price,
    best_payment: payments[m.id] ?? 0,
    ...(m.status === "LOCKED" && m.requires ? { unavailable_reason: `Réussissez d'abord la commande ${missionName(m.requires)}.` } : {}),
    ...(m.id === "rescue" ? { is_rescue: true } : {}),
  };
}

/** Immeuble lu dans /state ; niveau 1 par défaut tant que l'API ne le renvoie pas ou si la valeur est invalide. */
export function mapBuilding(b: WireState["building"]): BuildingState {
  const int = (v: unknown, min: number, max: number, dflt: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.floor(v))) : dflt);
  const level = int(b?.level, 1, 10, 1);
  const next = b?.next_level_at;
  return {
    level,
    total_earned: int(b?.total_earned, 0, Number.MAX_SAFE_INTEGER, 0),
    next_level_at: level >= 10 ? null : typeof next === "number" && Number.isFinite(next) ? Math.max(0, Math.floor(next)) : null,
  };
}

export function mapState(w: WireState, ctx: StateContext): GameState {
  const done = w.progress?.completed_missions.length ?? 0;
  const total = w.progress?.total_missions ?? 6;
  const index = Math.min(done + 1, total);
  const missions = w.missions.map((m) => mapMission(m, ctx.payments));
  const agents: AgentView[] = w.agents.map((a) => ({
    role: a.role,
    owned: a.owned,
    price: a.price,
    unlock_condition: a.unlock_mission ? `Réussir la commande ${missionName(a.unlock_mission)}` : "Disponible dès le départ",
    unlocked: a.unlocked,
    teaches: ROLE_TEACHES[a.role],
  }));
  const finished = w.progress?.next_action.type === "campaign_complete" || !!w.progress?.victory;
  const bilan: Bilan = {
    campaign_finished: finished,
    victory: w.progress?.victory,
    summary: finished
      ? w.progress?.victory
        ? "Campagne terminée : toutes les commandes sont réussies."
        : "Campagne terminée."
      : `${done} commande${done > 1 ? "s" : ""} réussie${done > 1 ? "s" : ""} sur ${total}.`,
    observed: [],
    results: w.missions
      .filter((m) => m.best_score !== null)
      .map((m) => ({ mission_id: m.id, title: m.label, best_score: m.best_score ?? 0, best_payment: ctx.payments[m.id] ?? 0 })),
  };
  const cur = ctx.detail ? mapAttempt(ctx.detail, w, ctx.clarifications) : null;
  return {
    contract_version: w.contracts_version,
    session: { id: w.session.id, mode: w.session.mode, company: w.session.company.name, stage: index, rules_version: w.session.rules_version },
    simulated_provider: w.llm.simulated,
    demo_enabled: ctx.demo.enabled,
    demo_events: ctx.demo.events,
    hints_enabled: false,
    notebook_enabled: false,
    balance: w.balance,
    building: mapBuilding(w.building),
    stage: { index, total, label: `Étape ${index} sur ${total}` },
    next_action: w.progress?.next_action.message ?? "Ouvrez la commande M1 depuis le bureau.",
    agents,
    missions,
    attempt: cur,
    actions_in_progress: ctx.actions,
    bilan,
  };
}
