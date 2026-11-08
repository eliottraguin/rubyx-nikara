"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { FALLBACK, LABELS, LINKS, MESSAGES, PLAN_TITLES, TASK_STATES, money } from "@/content/assistant";
import type { Plan, PlanStep } from "@/lib/api/assistant";

interface Props {
  plan: Plan;
  /** Une confirmation est en cours. */
  running: boolean;
  problem: string | null;
  onConfirm: () => void;
  onReject: () => void;
  onClose: () => void;
}

const isTodo = (s: PlanStep) => s.status === "READY" || s.status === "FAILED";

function StepCard({ step, plan }: { step: PlanStep; plan: Plan }) {
  const proposed = plan.status === "PROPOSED";
  const blocked = step.status === "BLOCKED" || (proposed && !!step.blockedReason);
  const link = step.status === "DONE" ? LINKS[step.type] : undefined;
  // Avant le lancement, une tâche faisable n'a pas d'état à montrer : seul le coût compte.
  const state = proposed && !blocked ? null : blocked ? TASK_STATES.BLOCKED : step.status === "READY" ? TASK_STATES.READY : TASK_STATES[step.status];
  return (
    <li className={`task ${blocked ? "task-blocked" : ""} task-${step.status.toLowerCase()}`} data-status={step.status}>
      <p className="task-title">
        <strong>{step.title}</strong>
        {state ? <span className={`task-state task-state-${blocked ? "blocked" : step.status.toLowerCase()}`}> {state}</span> : null}
      </p>
      {step.who ? (
        <p className="task-line">
          <span className="muted">{LABELS.who}</span> {step.who}
        </p>
      ) : null}
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

/** Le plan proposé, puis son exécution et son résultat, en français courant (docs/ASSISTANT.md §9). Texte seul. */
export function PlanView({ plan, running, problem, onConfirm, onReject, onClose }: Props) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [plan.id]);

  const proposed = plan.status === "PROPOSED";
  const empty = plan.steps.length === 0;
  const todo = plan.steps.filter(isTodo);
  const hasBlocked = plan.steps.some((s) => s.status === "BLOCKED");
  const done = plan.steps.filter((s) => s.status === "DONE").length;
  const title = proposed ? plan.headline || FALLBACK.headline : PLAN_TITLES[plan.status as Exclude<Plan["status"], "PROPOSED">];

  return (
    <section className="plan card" aria-labelledby="plan-title">
      <h3 className="h4" id="plan-title" tabIndex={-1} ref={heading}>
        {title}
      </h3>
      {plan.simule ? <p className="help">{LABELS.simulated}</p> : null}
      <p className="note note-info plan-banner">{plan.banner || FALLBACK.banner}</p>
      {plan.summary ? <p className="plan-summary">{plan.summary}</p> : null}

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
          {!running ? `${LABELS.balanceNow.replace("aujourd'hui", "maintenant")} : ${money(plan.balance)}.` : ""}
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
