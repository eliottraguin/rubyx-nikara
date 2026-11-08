"use client";

import "@/styles/orchestrator.css";
import { useId, useState } from "react";
import { EXAMPLES, LABELS, MESSAGE_MAX, PLAN_STATUS_LABELS } from "@/content/orchestrator";
import { OrchestratorPlanView } from "./OrchestratorPlanView";
import type { OrchestratorController } from "./useOrchestrator";

interface Props {
  controller: OrchestratorController;
}

/** Zone de discussion courte avec l'orchestrateur : un message, un plan proposé, à confirmer ou refuser. */
export function OrchestratorPanel({ controller: c }: Props) {
  const uid = useId();
  const [message, setMessage] = useState("");
  const asking = c.phase === "asking";
  const running = c.phase === "running";
  const noneLeft = c.plansLeft === 0;
  const canSend = message.trim().length > 0 && !asking && !running && !noneLeft;
  const showForm = !c.plan;
  const fieldId = `${uid}-msg`;
  const helpId = `${uid}-help`;

  function close() {
    c.clear();
    setMessage("");
  }

  return (
    <div className="assistant-panel orchestrator-panel">
      <h3 className="h4">{LABELS.title}</h3>
      <p className="help">{LABELS.intro}</p>
      {c.plansLeft !== null ? <p className="assistant-left">{LABELS.left(c.plansLeft)}</p> : null}

      {showForm ? (
        <>
          <form
            className="assistant-form"
            aria-label={LABELS.title}
            onSubmit={(e) => {
              e.preventDefault();
              if (canSend) void c.ask(message.trim());
            }}
          >
            <p>
              <label htmlFor={fieldId}>
                <strong>{LABELS.fieldLabel}</strong>
              </label>
              <textarea id={fieldId} rows={3} maxLength={MESSAGE_MAX} value={message} onChange={(e) => setMessage(e.target.value)} aria-describedby={helpId} disabled={asking || noneLeft} />
              <span id={helpId} className="help">
                {LABELS.fieldHelp} {LABELS.chars(message.length)}
              </span>
            </p>
            <div className="assistant-examples" role="group" aria-label={LABELS.examplesTitle}>
              <p className="help">{LABELS.examplesTitle}</p>
              <ul className="example-list">
                {EXAMPLES.map((ex) => (
                  <li key={ex}>
                    <button type="button" className="btn btn-small" disabled={asking || noneLeft} onClick={() => setMessage(ex)}>
                      {ex}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <p>
              <button type="submit" className="btn btn-primary" disabled={!canSend}>
                {asking ? LABELS.sending : LABELS.send}
              </button>{" "}
              <span className="help">{LABELS.free}</span>
            </p>
            {noneLeft ? (
              <p className="note note-warn" role="alert">
                Vous avez utilisé toutes vos demandes à l&apos;orchestrateur pour cette partie.
              </p>
            ) : null}
          </form>
          {c.problem ? (
            <p className="note note-warn" role="alert">
              {c.problem}
            </p>
          ) : null}
        </>
      ) : (
        <OrchestratorPlanView plan={c.plan!} running={running} problem={c.problem} onConfirm={() => void c.confirm()} onReject={() => void c.reject()} onClose={close} />
      )}

      <p className="sr-only" role="status" aria-live="polite" data-testid="orchestrator-live">
        {c.announce}
      </p>

      <section aria-label={LABELS.historyTitle} className="assistant-history">
        <h4 className="h4">{LABELS.historyTitle}</h4>
        {c.historyProblem ? <p className="help">{c.historyProblem}</p> : null}
        {c.history.length === 0 && !c.historyProblem ? <p className="help">{LABELS.historyEmpty}</p> : null}
        <ul className="hist-list">
          {c.history.slice(0, 8).map((p) => (
            <li key={p.id} className="hist-item">
              <span>
                {p.summary || "Demande"} <span className="muted">({PLAN_STATUS_LABELS[p.status]})</span>
              </span>{" "}
              <button type="button" className="btn btn-small" disabled={running || asking} aria-label={`${LABELS.review} : ${p.summary || LABELS.title}`} onClick={() => c.open(p)}>
                {LABELS.review}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
