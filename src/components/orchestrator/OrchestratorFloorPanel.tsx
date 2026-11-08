"use client";

import "@/styles/orchestrator.css";
import { useId, useState } from "react";
import { LABELS } from "@/content/orchestrator";
import { AgentImprovePanel } from "./AgentImprovePanel";
import { OrchestratorPanel } from "./OrchestratorPanel";
import type { AgentImproveController } from "./useAgentImprove";
import type { OrchestratorController } from "./useOrchestrator";

interface Props {
  orchestrator: OrchestratorController;
  improve: AgentImproveController;
}

/**
 * Étage Orchestrateur : discuter et valider un plan, ou améliorer un agent — deux onglets d'un même bloc visible
 * (docs/PLAN-V2.md §3 : « cette fonctionnalité doit être mise en avant »).
 */
export function OrchestratorFloorPanel({ orchestrator, improve }: Props) {
  const uid = useId();
  const [tab, setTab] = useState<"plan" | "improve">("plan");
  return (
    <div aria-labelledby={`${uid}-title`} role="group">
      <h2 className="h3" id={`${uid}-title`}>
        {LABELS.title}
      </h2>
      <div className="orc-tabs" role="tablist" aria-label={LABELS.title}>
        <button type="button" role="tab" aria-selected={tab === "plan"} className={tab === "plan" ? "btn btn-small btn-primary" : "btn btn-small"} onClick={() => setTab("plan")}>
          {LABELS.tabPlan}
        </button>
        <button type="button" role="tab" aria-selected={tab === "improve"} className={tab === "improve" ? "btn btn-small btn-primary" : "btn btn-small"} onClick={() => setTab("improve")}>
          {LABELS.tabImprove}
        </button>
      </div>
      {tab === "plan" ? (
        <section className="card" aria-label={LABELS.tabPlan}>
          <OrchestratorPanel controller={orchestrator} />
        </section>
      ) : (
        <section className="card" aria-label={LABELS.tabImprove}>
          <AgentImprovePanel controller={improve} />
        </section>
      )}
    </div>
  );
}
