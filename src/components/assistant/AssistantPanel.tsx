"use client";

import { useId, useState } from "react";
import { ASSISTANTS, LABELS, MESSAGE_MAX, PLAN_STATUS_LABELS, type AssistantId } from "@/content/assistant";
import { PlanView } from "./PlanView";
import type { AssistantController } from "./useAssistant";

interface Props {
  controller: AssistantController;
}

/** Les trois assistants (Prospection, Clients, Pub) : une demande en français courant, le plan proposé, la confirmation. */
export function AssistantPanel({ controller: c }: Props) {
  const uid = useId();
  const [picked, setPicked] = useState<AssistantId | null>(null);
  const [message, setMessage] = useState("");
  const card = ASSISTANTS.find((a) => a.id === picked) ?? null;
  const asking = c.phase === "asking";
  const running = c.phase === "running";
  const noneLeft = c.plansLeft === 0;
  const canSend = !!card && message.trim().length > 0 && !asking && !running && !noneLeft;
  const showForm = !c.plan;
  const fieldId = `${uid}-msg`;
  const helpId = `${uid}-help`;

  function close() {
    c.clear();
    setMessage("");
  }

  return (
    <div className="assistant-panel">
      <h3 className="h4">{LABELS.title}</h3>
      <p className="help">{LABELS.intro}</p>
      {c.plansLeft !== null ? <p className="assistant-left">{LABELS.left(c.plansLeft)}</p> : null}

      {showForm ? (
        <>
          <ul className="assistant-cards" aria-label="Choisir un assistant">
            {ASSISTANTS.map((a) => (
              <li key={a.id}>
                <button type="button" className="planet-item" aria-pressed={picked === a.id} disabled={asking} onClick={() => setPicked(a.id)}>
                  <span className="planet-item-main">
                    <strong>{LABELS.askButton(a.name)}</strong>
                    <span className="planet-item-sub">{a.about}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {card ? (
            <form
              className="assistant-form"
              aria-label={LABELS.askTitle(card.name)}
              onSubmit={(e) => {
                e.preventDefault();
                if (canSend) void c.ask(card.id, message.trim());
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
                  {card.examples.map((ex) => (
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
                  {"Vous avez utilisé toutes vos demandes à l'assistant pour cette partie."}
                </p>
              ) : null}
            </form>
          ) : null}
          {c.problem ? (
            <p className="note note-warn" role="alert">
              {c.problem}
            </p>
          ) : null}
        </>
      ) : (
        <PlanView plan={c.plan!} running={running} problem={c.problem} onConfirm={() => void c.confirm()} onReject={() => void c.reject()} onClose={close} />
      )}

      <p className="sr-only" role="status" aria-live="polite" data-testid="assistant-live">
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
                <strong>{p.assistantLabel}</strong> : {p.summary || "Demande"} <span className="muted">({PLAN_STATUS_LABELS[p.status]})</span>
              </span>{" "}
              <button type="button" className="btn btn-small" disabled={running || asking} aria-label={`${LABELS.review} : ${p.summary || p.assistantLabel}`} onClick={() => c.open(p)}>
                {LABELS.review}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
