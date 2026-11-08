"use client";

import "@/styles/orchestrator.css";
import { useId } from "react";
import { IMPROVE_LABELS, FEEDBACK_MAX, ROLE_LABELS, SUGGESTIONS } from "@/content/orchestrator";
import { money } from "@/content/assistant";
import { DiffText } from "./DiffText";
import type { AgentImproveController } from "./useAgentImprove";

interface Props {
  controller: AgentImproveController;
}

/** « Améliorer un agent » : bloc visible, pas caché (docs/PLAN-V2.md §3). Choisir, dire ce qui ne va pas, voir le diff, confirmer, revenir en arrière. */
export function AgentImprovePanel({ controller: c }: Props) {
  const uid = useId();
  const fieldId = `${uid}-feedback`;
  const helpId = `${uid}-help`;
  const reviewing = c.phase === "review";
  const applying = c.phase === "applying" || c.phase === "rollingBack";
  const canPropose = !!c.selected && c.feedback.trim().length > 0 && c.phase === "idle";

  return (
    <div className="improve-panel">
      <h3 className="h4">{IMPROVE_LABELS.title}</h3>
      <p className="help">{IMPROVE_LABELS.intro}</p>

      {c.instancesProblem ? (
        <p className="note note-warn" role="alert">
          {c.instancesProblem}
        </p>
      ) : null}

      {c.instances.length === 0 && !c.instancesProblem ? <p className="help">{IMPROVE_LABELS.noInstances}</p> : null}

      {c.instances.length > 0 ? (
        <>
          <p>
            <strong>{IMPROVE_LABELS.pickInstance}</strong>
          </p>
          <ul className="improve-picker" aria-label={IMPROVE_LABELS.pickInstance}>
            {c.instances.map((i) => (
              <li key={i.id}>
                <button type="button" className="planet-item" aria-pressed={c.selected?.id === i.id} disabled={applying} onClick={() => c.select(i.id)}>
                  <span className="planet-item-main">
                    <strong>
                      {ROLE_LABELS[i.role] ?? i.role} {i.label ? `« ${i.label} »` : ""} — palier {i.tier}
                    </strong>
                    <span className="planet-item-sub">version {i.config.version}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {c.selected && c.phase === "idle" ? (
        <form
          className="assistant-form"
          aria-label={IMPROVE_LABELS.title}
          onSubmit={(e) => {
            e.preventDefault();
            c.review();
          }}
        >
          <p>
            <label htmlFor={fieldId}>
              <strong>{IMPROVE_LABELS.feedbackLabel}</strong>
            </label>
            <textarea id={fieldId} rows={2} maxLength={FEEDBACK_MAX} value={c.feedback} onChange={(e) => c.setFeedback(e.target.value)} aria-describedby={helpId} />
            <span id={helpId} className="help">
              {IMPROVE_LABELS.feedbackHelp} {IMPROVE_LABELS.chars(c.feedback.length)}
            </span>
          </p>
          <div role="group" aria-label={IMPROVE_LABELS.suggestionsTitle}>
            <p className="help">{IMPROVE_LABELS.suggestionsTitle}</p>
            <ul className="example-list">
              {SUGGESTIONS.map((s) => (
                <li key={s}>
                  <button type="button" className="btn btn-small" onClick={() => c.setFeedback(s)}>
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <p>
            <button type="submit" className="btn btn-primary" disabled={!canPropose}>
              {IMPROVE_LABELS.propose}
            </button>
          </p>
        </form>
      ) : null}

      {c.selected && reviewing ? (
        <section className="improve-review" aria-label={IMPROVE_LABELS.diffTitle}>
          <p>
            <strong>{ROLE_LABELS[c.selected.role] ?? c.selected.role}</strong> — « {c.feedback.trim()} »
          </p>
          <p className="help">{IMPROVE_LABELS.tierCap(c.selected.config.tierCap)}</p>
          <p className="note note-info">Ceci va vous coûter de l&apos;argent (le prix exact est fixé par le serveur). Rien n&apos;est encore payé.</p>
          <p className="plan-actions">
            <button type="button" className="btn btn-primary" disabled={applying} onClick={() => void c.confirm()}>
              {applying ? IMPROVE_LABELS.confirming : IMPROVE_LABELS.confirm}
            </button>
            <button type="button" className="btn" disabled={applying} onClick={c.cancelReview}>
              {IMPROVE_LABELS.cancel}
            </button>
          </p>
        </section>
      ) : null}

      {c.problem ? (
        <p className="note note-warn" role="alert">
          {c.problem}
        </p>
      ) : null}

      {c.selected && c.before && c.phase === "idle" ? (
        <section className="diff-box" aria-label={IMPROVE_LABELS.diffTitle}>
          <p>
            <strong>{IMPROVE_LABELS.diffTitle}</strong> {c.lastPrice !== null ? `— ${money(c.lastPrice)}` : ""}
          </p>
          {c.lastSummary ? <p className="help">{c.lastSummary}</p> : null}
          <DiffText label={IMPROVE_LABELS.after} before={c.before.instructions} after={c.selected.config.instructions} />
          {c.before.contextNote || c.selected.config.contextNote ? <DiffText label={IMPROVE_LABELS.after} before={c.before.contextNote ?? ""} after={c.selected.config.contextNote ?? ""} /> : null}
        </section>
      ) : null}

      {c.selected && (c.history[c.selected.id]?.length ?? 0) > 1 ? (
        <section aria-label={IMPROVE_LABELS.historyTitle}>
          <h4 className="h4">{IMPROVE_LABELS.historyTitle}</h4>
          <ul className="ver-list">
            {c.history[c.selected.id]!.slice()
              .reverse()
              .map((v) => (
                <li key={v.version} className={`ver ${v.version === c.selected!.config.version ? "ver-on" : ""}`}>
                  <span>
                    Version {v.version} {v.version === c.selected!.config.version ? `(${IMPROVE_LABELS.current})` : ""}
                  </span>
                  {v.version !== c.selected!.config.version ? (
                    <button type="button" className="btn btn-small" disabled={applying} onClick={() => void c.rollback(c.selected!.id, v.version)}>
                      {applying ? IMPROVE_LABELS.rollingBack : IMPROVE_LABELS.rollback}
                    </button>
                  ) : null}
                </li>
              ))}
          </ul>
        </section>
      ) : null}

      <p className="sr-only" role="status" aria-live="polite" data-testid="improve-live">
        {c.announce}
      </p>
    </div>
  );
}
