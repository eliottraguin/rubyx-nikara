"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { FALLBACK, LABELS, LINKS, ROLE_LABELS } from "@/content/orchestrator";
import { PLAN_TITLES, TASK_STATES, MESSAGES, money } from "@/content/assistant";
import type { OrchestratorPlan, OrchestratorPlanStep } from "@/lib/api/orchestrator";

interface Props {
  plan: OrchestratorPlan;
  /** Une confirmation est en cours. */
  running: boolean;
  problem: string | null;
  onConfirm: () => void;
  onReject: () => void;
  onClose: () => void;
}

const isTodo = (s: OrchestratorPlanStep) => s.status === "READY" || s.status === "FAILED";

function durationText(s: number): string {
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  return `${m} min`;
}

function StepCard({ step, plan }: { step: OrchestratorPlanStep; plan: OrchestratorPlan }) {
  const proposed = plan.status === "PROPOSED";
  const blocked = step.status === "BLOCKED" || (proposed && !!step.blockedReason);
  const link = step.status === "DONE" ? LINKS[step.type] : undefined;
  const state = proposed && !blocked ? null : blocked ? TASK_STATES.BLOCKED : step.status === "READY" ? TASK_STATES.READY : TASK_STATES[step.status];
  return (
    <li className={`task ${blocked ? "task-blocked" : ""} task-${step.status.toLowerCase()}`} data-status={step.status}>
      <p className="task-title">
        <strong>{step.title}</strong>
        {state ? <span className={`task-state task-state-${blocked ? "blocked" : step.status.toLowerCase()}`}> {state}</span> : null}
      </p>
      <p className="task-meta">
        {step.who ? <span>{step.who}</span> : null}
        {step.role ? <span>{ROLE_LABELS[step.role] ?? step.role}</span> : null}
        {!blocked && step.durationEstimateS > 0 ? (
          <span>
            {LABELS.duration} {durationText(step.durationEstimateS)}
          </span>
        ) : null}
      </p>
      {step.youGet ? (
        <p className="task-line">
          <span className="muted">{LABELS.youGet}</span> {step.youGet}
        </p>
      ) : null}
      <p className="task-line">
        <span className="muted">{LABELS.cost}</span> {step.cost > 0 ? money(step.cost) : LABELS.free0}
      </p>
      {blocked && step.blockedReason ? <p className="task-reason">{step.blockedReason}</p> : null}
      {!proposed && step.resultText ? <p className="task-result">{step.resultText}</p> : null}
      {link ? (
        <p className="task-line">
          <Link href={link.href}>{link.label}</Link>
        </p>
      ) : null}
    </li>
  );
}

/** La note de prompt immédiate (score + conseils), sous 3 conseils au plus (docs/PLAN-V2.md : « retour d'évaluation immédiat »). */
function EvalBlock({ plan }: { plan: OrchestratorPlan }) {
  if (!plan.evaluation) return null;
  const tips = plan.evaluation.feedback
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3);
  return (
    <section className="orc-eval" aria-label={LABELS.evalTitle}>
      <p>
        <strong>{LABELS.evalTitle}</strong> : <span className="orc-eval-score">{LABELS.evalScore(plan.evaluation.score)}</span>
      </p>
      {tips.length > 0 ? (
        <>
          <p className="help">{LABELS.evalAdvice}</p>
          <ul>
            {tips.map((tip, i) => (
              <li key={i}>{tip}</li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}

/** Le plan proposé par l'orchestrateur, puis son exécution et son résultat. Texte seul. */
export function OrchestratorPlanView({ plan, running, problem, onConfirm, onReject, onClose }: Props) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [plan.id]);

  const proposed = plan.status === "PROPOSED";
  const empty = plan.steps.length === 0;
  const todo = plan.steps.filter(isTodo);
  const hasBlocked = plan.steps.some((s) => s.status === "BLOCKED");
  const done = plan.steps.filter((s) => s.status === "DONE").length;
  const title = proposed ? plan.headline || FALLBACK.headline : PLAN_TITLES[plan.status as Exclude<OrchestratorPlan["status"], "PROPOSED">];

  return (
    <section className="plan card" aria-labelledby="orc-plan-title">
      <h3 className="h4" id="orc-plan-title" tabIndex={-1} ref={heading}>
        {title}
      </h3>
      {plan.simule ? <p className="help">{LABELS.simulated}</p> : null}
      <p className="note note-info plan-banner">{plan.banner || FALLBACK.banner}</p>
      {plan.summary ? <p className="plan-summary">{plan.summary}</p> : null}
      {proposed ? <EvalBlock plan={plan} /> : null}

      {empty ? (
        <p>{MESSAGES.emptyPlan}</p>
      ) : (
        <ol className="task-list" aria-label="Tâches proposées">
          {plan.steps.map((s) => (
            <StepCard key={s.index} step={s} plan={plan} />
          ))}
        </ol>
      )}

      {proposed && !empty ? (
        <div className="plan-total">
          <p>
            <strong>{LABELS.total} :</strong> {money(plan.totalCost)}
          </p>
          <p>
            {LABELS.balanceNow} : {money(plan.balance)} · {LABELS.balanceAfter} : {money(plan.balanceAfter)}
          </p>
          {hasBlocked && todo.length > 0 ? <p className="help">Les tâches grisées ne seront pas lancées ; vous pouvez confirmer le reste.</p> : null}
          {todo.length === 0 ? <p className="note note-warn">{MESSAGES.nothingToRun}</p> : null}
        </div>
      ) : null}

      {!proposed && plan.status !== "REJECTED" && !empty ? (
        <p className="plan-progress">
          {running ? MESSAGES.progress(done, plan.steps.filter((s) => s.status !== "BLOCKED").length) : plan.status === "DONE" ? MESSAGES.allDone : plan.status === "PARTIAL" ? MESSAGES.partial : ""}{" "}
          {!running ? `${LABELS.balanceNow} : ${money(plan.balance)}.` : ""}
        </p>
      ) : null}
      {plan.status === "REJECTED" ? <p>{MESSAGES.rejected}</p> : null}

      {problem ? (
        <p className="note note-warn" role="alert">
          {problem}
        </p>
      ) : null}

      <p className="plan-actions">
        {proposed && !empty && todo.length > 0 ? (
          <button type="button" className="btn btn-primary" disabled={running} onClick={onConfirm}>
            {running ? LABELS.running : LABELS.yes}
          </button>
        ) : null}
        {running && !proposed && plan.status !== "PARTIAL" ? (
          <button type="button" className="btn btn-primary" disabled>
            {LABELS.running}
          </button>
        ) : null}
        {proposed && !empty ? (
          <button type="button" className="btn" disabled={running} onClick={onReject}>
            {LABELS.no}
          </button>
        ) : null}
        {plan.status === "PARTIAL" ? (
          <button type="button" className="btn btn-primary" disabled={running} onClick={onConfirm}>
            {running ? LABELS.retrying : LABELS.retry}
          </button>
        ) : null}
        {!running && (!proposed || empty) ? (
          <button type="button" className="btn" onClick={onClose}>
            {LABELS.close}
          </button>
        ) : null}
      </p>
    </section>
  );
}
