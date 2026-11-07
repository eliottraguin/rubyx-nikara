/**
 * Client API simulé. Il REJOUE les réponses des fixtures (src/mocks/fixtures.ts)
 * et conserve un état en mémoire (persisté dans localStorage pour survivre au
 * rechargement, comme le ferait le serveur). Il n'implémente PAS les règles
 * économiques réelles : ni calcul de score, ni formule de paiement. Les seuls
 * contrôles reproduits sont les réponses d'erreur du contrat (quota, rôle
 * verrouillé, fonds, version périmée) afin que l'UI puisse les afficher.
 */
import {
  ApiError,
  type ActionView,
  type ApiClient,
  type ArtifactVersionView,
  type AttemptView,
  type DemoEventId,
  type EvaluationView,
  type GameState,
  type MessageView,
  type MutationResult,
  type NotebookEntry,
  type RoleId,
  type SubmissionView,
} from "@/lib/api/types";
import { ERROR_MESSAGE } from "@/lib/format";
import {
  AGENTS,
  CLARIFICATION_MAX,
  CONTRACT_VERSION,
  INITIAL_BALANCE,
  LEAD_PLAN,
  M1,
  MESSAGE_LIMIT,
  MISSIONS,
  RESCUE,
  RULES_VERSION,
  TARGET_CHANGE,
  type AttemptFixture,
} from "./fixtures";

const STORE_KEY = "rubix-mock-server-v1";
const T_RUNNING = 500;
const T_SLOW = 1500;
const T_DONE = 2600;
const T_EVAL = 1800;

interface IAction {
  id: string;
  type: "message" | "plan" | "delegation";
  attempt_id: string;
  role: RoleId;
  created: number;
  text: string;
  doc_ids: string[];
  cost: number;
  reply_index: number;
  awaiting_confirmation?: boolean;
  done?: boolean;
  confirmed_at?: number;
}
interface ISubmission {
  id: string;
  artifact_version_id: string;
  brief_version: number;
  created: number;
  fail: boolean;
  eval_index: number;
  result?: EvaluationView;
  status: "EVALUATING" | "EVALUATION_PENDING" | "EVALUATED";
}
interface IAttempt {
  id: string;
  mission_id: string;
  attempt_no: number;
  status: AttemptView["status"];
  brief_version: number;
  brief: AttemptView["brief"];
  used: Partial<Record<RoleId, number>>;
  free_credit: Partial<Record<RoleId, number>>;
  clar: { id: string; question: string; answer: string }[];
  messages: MessageView[];
  artifacts: ArtifactVersionView[];
  submissions: ISubmission[];
  hints_used: number;
  manual_edits: number;
}
interface Srv {
  session: { id: string; mode: "beginner" | "expert"; company: string } | null;
  booked: number;
  owned: RoleId[];
  completed: Record<string, { score: number; payment: number }>;
  attempts_count: Record<string, number>;
  attempt: IAttempt | null;
  actions: IAction[];
  notebook: NotebookEntry[];
  fail_next_eval: boolean;
  seq: number;
}

const fresh = (): Srv => ({
  session: null,
  booked: 0,
  owned: [],
  completed: {},
  attempts_count: {},
  attempt: null,
  actions: [],
  notebook: [],
  fail_next_eval: false,
  seq: 0,
});

let srv: Srv = fresh();
let loaded = false;

function load() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (raw) srv = { ...fresh(), ...(JSON.parse(raw) as Srv) };
  } catch {
    /* stockage indisponible : état en mémoire seulement */
  }
}
function save() {
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(srv));
  } catch {
    /* ignoré */
  }
}
const id = (p: string) => `${p}_${String(++srv.seq).padStart(3, "0")}`;
const delay = (ms = 120) => new Promise((r) => setTimeout(r, ms));
const fixtureFor = (missionId: string): AttemptFixture => (missionId === "rescue" ? RESCUE : M1);
const missionFx = (mid: string) => MISSIONS.find((m) => m.id === mid);
const err = (code: keyof typeof ERROR_MESSAGE, message?: string, status = 409) =>
  new ApiError(code, message ?? ERROR_MESSAGE[code], status);

function reserved(): number {
  return srv.actions
    .filter((a) => !a.done && !a.awaiting_confirmation)
    .reduce((s, a) => s + a.cost, 0);
}

/** Fait avancer les actions et évaluations selon l'horloge (rejeu des fixtures). */
function settle() {
  const now = Date.now();
  const at = srv.attempt;
  if (!at) return;
  const fx = fixtureFor(at.mission_id);
  for (const a of srv.actions) {
    if (a.done || a.awaiting_confirmation) continue;
    const t0 = a.confirmed_at ?? a.created;
    if (now - t0 < T_DONE) continue;
    a.done = true;
    if (a.type === "plan") continue;
    const reply = fx.replies[Math.min(a.reply_index, fx.replies.length - 1)];
    if (!reply) continue;
    const docs = fx.documents.filter((d) => a.doc_ids.includes(d.id));
    const parent = at.artifacts[at.artifacts.length - 1];
    const artId = id("art");
    const refs = docs.map((d) => ({ document_id: d.id, title: d.title }));
    at.artifacts.push({
      id: artId,
      parent_id: parent?.id ?? null,
      author: "agent",
      role: a.role,
      content: reply.artifact,
      sources: refs,
      created_at: new Date().toISOString(),
      number: at.artifacts.length + 1,
    });
    at.messages.push({
      id: id("msg"),
      role: a.role,
      author: "agent",
      text: reply.message,
      status: "SENT",
      action_id: a.id,
      sources: refs,
      known_facts: reply.known_facts,
      proposals: reply.proposals,
    });
    srv.booked -= a.cost;
  }
  for (const s of at.submissions) {
    if (s.status !== "EVALUATING" || now - s.created < T_EVAL) continue;
    if (s.fail) {
      s.status = "EVALUATION_PENDING";
      at.status = "EVALUATING";
      continue;
    }
    const ev = fx.evaluations[Math.min(s.eval_index, fx.evaluations.length - 1)];
    const m = missionFx(at.mission_id);
    if (!ev || !m) continue;
    const target = Math.floor((m.max_reward * ev.score) / 100);
    const prev = srv.completed[at.mission_id]?.payment ?? 0;
    const credited = Math.max(0, target - prev);
    srv.booked += credited;
    srv.completed[at.mission_id] = {
      score: Math.max(ev.score, srv.completed[at.mission_id]?.score ?? 0),
      payment: Math.max(target, prev),
    };
    s.result = {
      submission_id: s.id,
      rubric_version: `${at.mission_id}_v1`,
      out_of_scope: false,
      criteria: ev.ratings,
      client_feedback: ev.client_feedback,
      next_action: ev.next_action,
      score: ev.score,
      passed: ev.passed,
      capped_by_essential: ev.capped,
      criteria_labels: Object.fromEntries(fx.criteria.map((c) => [c.id, { label: c.label, essential: c.essential }])),
      payment: { max_reward: m.max_reward, target, already_acquired: prev, credited, already_awarded: false },
      spent: 0,
      coach_note: ev.coach_note,
    };
    s.status = "EVALUATED";
    at.status = ev.passed ? "COMPLETED" : "FAILED";
  }
  save();
}

function actionView(a: IAction): ActionView {
  const now = Date.now();
  const t0 = a.confirmed_at ?? a.created;
  const el = now - t0;
  let status: ActionView["status"];
  if (a.awaiting_confirmation) status = "AWAITING_CONFIRMATION";
  else if (a.done) status = "SUCCEEDED";
  else status = el < T_RUNNING ? "RESERVED" : "RUNNING";
  const view: ActionView = {
    id: a.id,
    type: a.type,
    attempt_id: a.attempt_id,
    role: a.role,
    status,
    reserved: a.done ? 0 : a.cost,
    debited: a.done ? a.cost : 0,
  };
  if (status === "RESERVED") view.progress_label = "Coût réservé, l'agent se prépare…";
  if (status === "RUNNING") {
    view.progress_label = "L'agent rédige sa réponse…";
    if (el > T_SLOW) {
      view.slow = true;
      view.progress_label = "La réponse est plus longue que d'habitude. Vous pouvez patienter, rien n'est débité tant qu'elle n'arrive pas.";
    }
  }
  if (a.type === "plan" && status === "AWAITING_CONFIRMATION") view.plan = LEAD_PLAN;
  return view;
}

function attemptView(at: IAttempt): AttemptView {
  const fx = fixtureFor(at.mission_id);
  const m = missionFx(at.mission_id);
  const roles = AGENTS.map((ag) => ({
    role: ag.role,
    owned: srv.owned.includes(ag.role),
    used: at.used[ag.role] ?? 0,
    limit: MESSAGE_LIMIT,
    next_cost_max: (m?.unit_price ?? 0),
    free_credit: at.free_credit[ag.role],
  }));
  const sub = at.submissions[at.submissions.length - 1];
  const submission: SubmissionView | null = sub
    ? {
        id: sub.id,
        status: sub.status,
        artifact_version_id: sub.artifact_version_id,
        brief_version: sub.brief_version,
        evaluation: sub.result,
      }
    : null;
  return {
    id: at.id,
    mission_id: at.mission_id,
    mission_title: m?.title ?? at.mission_id,
    attempt_no: at.attempt_no,
    status: at.status,
    brief: at.brief,
    documents: fx.documents,
    criteria: fx.criteria,
    max_reward: m?.max_reward ?? 0,
    unit_price: m?.unit_price ?? 0,
    spend_cap: null,
    clarifications: { used: at.clar.length, max: CLARIFICATION_MAX, items: at.clar },
    roles,
    messages: at.messages,
    artifacts: at.artifacts,
    submission,
    hints_used: at.hints_used,
  };
}

function stateView(): GameState {
  const s = srv.session;
  const at = srv.attempt;
  const res = reserved();
  const doneCount = Object.keys(srv.completed).filter((k) => k !== "rescue").length;
  let next = "Ouvrez la commande M1 depuis le bureau.";
  if (at?.status === "ACTIVE") next = at.messages.length === 0 ? "Donnez une consigne au rédacteur dans l'atelier." : "Inspectez le livrable, modifiez-le si besoin, puis livrez une version.";
  else if (at?.status === "EVALUATING") next = "Le client évalue votre livraison.";
  else if (at?.status === "COMPLETED" || at?.status === "FAILED") next = "Lisez le retour du client, puis choisissez la suite.";
  else if (srv.completed["m1"]) next = "M2 n'est pas encore disponible dans la maquette. Passez par la boutique ou rejouez M1.";
  return {
    contract_version: CONTRACT_VERSION,
    session: s ? { id: s.id, mode: s.mode, company: s.company, stage: doneCount + 1, rules_version: RULES_VERSION } : null,
    simulated_provider: true,
    demo_enabled: true,
    balance: { booked: srv.booked, reserved: res, available: srv.booked - res },
    stage: { index: Math.min(doneCount + 1, 6), total: 6, label: `Étape ${Math.min(doneCount + 1, 6)} sur 6` },
    next_action: next,
    agents: AGENTS.map((a) => ({
      role: a.role,
      owned: srv.owned.includes(a.role),
      price: a.price,
      unlock_condition: a.unlock_condition,
      unlocked: a.unlockedBy === null || !!srv.completed[a.unlockedBy],
      teaches: a.teaches,
    })),
    missions: MISSIONS.map((m) => {
      const done = srv.completed[m.id];
      const prevOk = m.prevRequired === null || !!srv.completed[m.prevRequired];
      let status: GameState["missions"][number]["status"] = prevOk ? "AVAILABLE" : "LOCKED";
      if (done && !m.rescue) status = "COMPLETED";
      if (at && at.mission_id === m.id && (at.status === "ACTIVE" || at.status === "EVALUATING")) status = at.status === "ACTIVE" ? "ACTIVE" : "EVALUATING";
      return {
        id: m.id,
        title: m.title,
        status,
        max_reward: m.max_reward,
        unit_price: m.unit_price,
        best_payment: done?.payment ?? 0,
        unavailable_reason: status === "LOCKED" ? m.lockedReason : undefined,
        is_rescue: m.rescue,
      };
    }),
    attempt: at ? attemptView(at) : null,
    actions_in_progress: srv.actions.filter((a) => !a.done).map(actionView),
    bilan: bilan(),
  };
}

function bilan(): GameState["bilan"] {
  const at = srv.attempt;
  const observed: GameState["bilan"]["observed"] = [];
  const msgs = at ? at.messages.filter((m) => m.author === "player").length : 0;
  if (msgs > 0) observed.push({ label: "Formuler une consigne", evidence: `Vous avez envoyé ${msgs} instruction(s) à un agent sur la commande en cours.` });
  if (at && at.clar.length > 0) observed.push({ label: "Clarifier le besoin", evidence: `Vous avez posé ${at.clar.length} question(s) au client.` });
  if (at && at.manual_edits > 0) observed.push({ label: "Vérifier et corriger un livrable", evidence: `Vous avez modifié le livrable à la main ${at.manual_edits} fois.` });
  if (at && at.hints_used > 0) observed.push({ label: "Demander de l'aide", evidence: `Vous avez utilisé ${at.hints_used} indice(s).` });
  return {
    campaign_finished: false,
    summary:
      observed.length === 0
        ? "Aucune action observée pour l'instant. Le bilan se construit à partir de ce que vous faites."
        : "Bilan provisoire : seules les actions observées sont listées. La campagne n'est pas terminée.",
    observed,
    results: Object.entries(srv.completed).map(([k, v]) => ({
      mission_id: k,
      title: missionFx(k)?.title ?? k,
      best_score: v.score,
      best_payment: v.payment,
    })),
  };
}

function result(action?: IAction): MutationResult {
  settle();
  return { state: stateView(), action: action ? actionView(action) : undefined };
}

function needSession() {
  load();
  settle();
  if (!srv.session) throw err("NO_SESSION", undefined, 401);
}
function needAttempt(attemptId: string): IAttempt {
  needSession();
  if (!srv.attempt || srv.attempt.id !== attemptId) throw err("INVALID_STATE", "Cette tentative n'existe pas dans votre partie.", 404);
  return srv.attempt;
}

function openAttempt(missionId: string): IAttempt {
  const fx = fixtureFor(missionId);
  const n = (srv.attempts_count[missionId] = (srv.attempts_count[missionId] ?? 0) + 1);
  srv.actions = srv.actions.filter((a) => a.done);
  return {
    id: id("att"),
    mission_id: missionId,
    attempt_no: n,
    status: "ACTIVE",
    brief_version: 1,
    brief: { version: 1, text: fx.brief },
    used: {},
    free_credit: {},
    clar: [],
    messages: [],
    artifacts: [],
    submissions: [],
    hints_used: 0,
    manual_edits: 0,
  };
}

export function createMockClient(): ApiClient {
  return {
    mode: "mock",
    async createSession(input) {
      load();
      await delay();
      const company = input.company.trim();
      if (company.length < 2 || company.length > 60) throw err("VALIDATION", "Le nom de l'entreprise doit faire entre 2 et 60 caractères.", 422);
      srv = fresh();
      srv.session = { id: "sess_mock", mode: input.mode, company };
      srv.booked = INITIAL_BALANCE;
      srv.owned = ["scout"];
      return result();
    },
    async getState() {
      load();
      await delay(60);
      settle();
      return srv.session ? stateView() : null;
    },
    async startMission(missionId) {
      needSession();
      await delay();
      const m = missionFx(missionId);
      if (!m) throw err("INVALID_STATE", "Commande inconnue.", 404);
      if (m.prevRequired && !srv.completed[m.prevRequired]) throw err("INVALID_STATE", m.lockedReason);
      if (missionId !== "m1" && missionId !== "rescue")
        throw err("INVALID_STATE", "Cette commande n'est pas encore disponible dans la maquette locale (seules M1 et la mission de secours sont jouables).");
      const cur = srv.attempt;
      if (cur && (cur.status === "ACTIVE" || cur.status === "EVALUATING")) {
        if (cur.mission_id !== missionId) throw err("INVALID_STATE", "Une autre commande est déjà en cours : terminez-la d'abord.");
        return result();
      }
      srv.attempt = openAttempt(missionId);
      return result();
    },
    async retryMission(missionId) {
      needSession();
      await delay();
      if (!srv.completed[missionId] && srv.attempt?.mission_id !== missionId) throw err("INVALID_STATE");
      if (srv.attempt && srv.attempt.status === "ACTIVE" && srv.attempt.mission_id === missionId) return result();
      srv.attempt = openAttempt(missionId);
      return result();
    },
    async sendMessage(attemptId, input) {
      const at = needAttempt(attemptId);
      await delay();
      if (at.status !== "ACTIVE") throw err("INVALID_STATE", "La commande n'est plus en cours.");
      if (!srv.owned.includes(input.role)) throw err("ROLE_LOCKED");
      if ((at.used[input.role] ?? 0) >= MESSAGE_LIMIT) throw err("MESSAGE_LIMIT");
      if (input.text.trim().length === 0 || input.text.length > 4000) throw err("VALIDATION", "Instruction vide ou trop longue.", 422);
      const m = missionFx(at.mission_id);
      const free = at.free_credit[input.role] ?? 0;
      const cost = free ? 0 : (m?.unit_price ?? 0);
      if (cost > srv.booked - reserved()) throw err("INSUFFICIENT_FUNDS");
      const idx = at.used[input.role] ?? 0;
      at.used[input.role] = idx + 1;
      if (free) at.free_credit[input.role] = free - 1;
      at.messages.push({ id: id("msg"), role: input.role, author: "player", text: input.text, status: "SENT" });
      const a: IAction = {
        id: id("act"),
        type: "message",
        attempt_id: at.id,
        role: input.role,
        created: Date.now(),
        text: input.text,
        doc_ids: input.document_ids,
        cost,
        reply_index: idx,
      };
      srv.actions.push(a);
      return result(a);
    },
    async getMissionAttempts(missionId) {
      needSession();
      await delay(60);
      // La maquette locale ne garde que la tentative courante : pas d'historique des précédentes.
      return srv.attempt && srv.attempt.mission_id === missionId ? [attemptView(srv.attempt)] : [];
    },
    async getAction(actionId) {
      needSession();
      await delay(60);
      const a = srv.actions.find((x) => x.id === actionId);
      if (!a) throw err("INVALID_STATE", "Action inconnue.", 404);
      return actionView(a);
    },
    async confirmAction(actionId) {
      needSession();
      await delay();
      const a = srv.actions.find((x) => x.id === actionId);
      if (!a || !a.awaiting_confirmation) throw err("INVALID_STATE", "Rien à confirmer pour cette action.");
      a.awaiting_confirmation = false;
      a.confirmed_at = Date.now();
      a.cost = LEAD_PLAN.extra_cost_max;
      return result(a);
    },
    async askClarification(attemptId, question) {
      const at = needAttempt(attemptId);
      await delay();
      if (at.clar.length >= CLARIFICATION_MAX) throw err("INVALID_STATE", "Vous avez déjà posé les 2 questions gratuites au client.");
      if (question.trim().length < 3) throw err("VALIDATION", "Écrivez une question.", 422);
      const fx = fixtureFor(at.mission_id);
      const q = question.toLowerCase();
      const hit = fx.clarifications.find((c) => c.keywords.some((k) => q.includes(k)));
      at.clar.push({
        id: id("clar"),
        question: question.trim(),
        answer: hit?.answer ?? "Je ne peux répondre qu'à des questions factuelles sur la commande (prix, horaires, adresse, public visé).",
      });
      return result();
    },
    async saveArtifact(attemptId, input) {
      const at = needAttempt(attemptId);
      await delay();
      if (at.status !== "ACTIVE") throw err("INVALID_STATE", "La commande n'est plus en cours.");
      if (input.content.trim().length === 0) throw err("VALIDATION", "Le livrable ne peut pas être vide.", 422);
      at.artifacts.push({
        id: id("art"),
        parent_id: input.parent_id,
        author: "player",
        content: input.content,
        sources: [],
        created_at: new Date().toISOString(),
        number: at.artifacts.length + 1,
      });
      at.manual_edits += 1;
      return result();
    },
    async submit(attemptId, input) {
      const at = needAttempt(attemptId);
      await delay();
      if (input.brief_version !== at.brief.version) throw err("VERSION_CONFLICT");
      if (!at.artifacts.some((a) => a.id === input.artifact_version_id)) throw err("INVALID_STATE", "Version inconnue.");
      const last = at.submissions[at.submissions.length - 1];
      if (last && last.status === "EVALUATION_PENDING") {
        // Reprise de l'évaluation (même livraison figée, aucun nouveau paiement possible).
        last.status = "EVALUATING";
        last.created = Date.now();
        last.fail = false;
        at.status = "EVALUATING";
        return result();
      }
      if (at.status !== "ACTIVE") throw err("INVALID_STATE", "Cette commande a déjà été livrée.");
      const fail = srv.fail_next_eval;
      srv.fail_next_eval = false;
      at.submissions.push({
        id: id("sub"),
        artifact_version_id: input.artifact_version_id,
        brief_version: input.brief_version,
        created: Date.now(),
        fail,
        eval_index: Math.max(0, (srv.attempts_count[at.mission_id] ?? 1) - 1),
        status: "EVALUATING",
      });
      at.status = "EVALUATING";
      return result();
    },
    async purchaseAgent(role) {
      needSession();
      await delay();
      const ag = AGENTS.find((a) => a.role === role);
      if (!ag) throw err("ROLE_LOCKED");
      if (srv.owned.includes(role)) throw err("INVALID_STATE", "Cet agent est déjà possédé.");
      if (ag.unlockedBy && !srv.completed[ag.unlockedBy]) throw err("ROLE_LOCKED");
      if (ag.price > srv.booked - reserved()) throw err("INSUFFICIENT_FUNDS");
      srv.booked -= ag.price;
      srv.owned.push(role);
      return result();
    },
    async requestHint(attemptId, level) {
      const at = needAttempt(attemptId);
      await delay(80);
      at.hints_used = Math.max(at.hints_used, level);
      const text = fixtureFor(at.mission_id).hints[level - 1] ?? "";
      settle();
      return { text, state: stateView() };
    },
    async listNotebook() {
      needSession();
      return srv.notebook;
    },
    async saveNotebook(input) {
      needSession();
      await delay(80);
      srv.notebook.unshift({ id: id("nb"), ...input, created_at: new Date().toISOString() });
      save();
      return srv.notebook;
    },
    async demoEvent(eventId: DemoEventId) {
      needSession();
      await delay();
      const at = srv.attempt;
      if (eventId === "evaluation_outage") {
        srv.fail_next_eval = true;
        return result();
      }
      if (!at || at.status !== "ACTIVE") throw err("INVALID_STATE", "Aucune commande en cours pour cet événement.");
      if (eventId === "target_change") {
        if (at.mission_id !== "m1") throw err("INVALID_STATE", "Événement indisponible pour cette commande.");
        if (at.brief.version > 1) throw err("INVALID_STATE", "Cet événement a déjà été appliqué.");
        at.brief_version = 2;
        at.brief = { version: 2, text: TARGET_CHANGE.brief, diff: TARGET_CHANGE.diff, change_reason: TARGET_CHANGE.reason };
        at.free_credit.scout = 1;
        return result();
      }
      const a: IAction = {
        id: id("act"),
        type: "plan",
        attempt_id: at.id,
        role: "scout",
        created: Date.now(),
        text: "",
        doc_ids: [],
        cost: 0,
        reply_index: 0,
        awaiting_confirmation: true,
      };
      srv.actions.push(a);
      return result(a);
    },
    async deleteSession() {
      load();
      srv = fresh();
      save();
    },
  };
}
