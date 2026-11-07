import { describe, expect, it } from "vitest";
import type { AttemptView, MessageView } from "@/lib/api/types";
import { buildPlanetHistory, entryFromAttempt, mergeCurrentAttempt, pairInstructions, summarizeHistory } from "./history";

const msg = (id: string, role: MessageView["role"], author: MessageView["author"], text: string, status: MessageView["status"] = "SENT"): MessageView => ({ id, role, author, text, status });

function attempt(no: number, over: Partial<AttemptView> = {}): AttemptView {
  return {
    id: `att_${no}`,
    mission_id: "m1",
    mission_title: "M1",
    attempt_no: no,
    status: "COMPLETED",
    brief: { version: 1, text: "" },
    documents: [],
    criteria: [],
    max_reward: 20,
    unit_price: 0,
    spend_cap: null,
    clarifications: { used: 0, max: 3, items: [] },
    roles: [{ role: "writer", owned: true, used: 1, limit: 5, next_cost_max: 0 }],
    messages: [],
    artifacts: [],
    submission: null,
    hints_used: 0,
    created_at: "2026-05-04T10:30:00Z",
    ...over,
  };
}

describe("historique d'une planète", () => {
  it("associe chaque instruction à la réponse suivante du même agent", () => {
    const pairs = pairInstructions([
      msg("1", "writer", "player", "Trouve 5 restaurants"),
      msg("2", "prospector", "player", "Liste des gérants"),
      msg("3", "writer", "agent", "Voici 5 restaurants"),
      msg("4", "writer", "player", "Ajoute le téléphone", "PENDING"),
    ]);
    expect(pairs.map((p) => [p.id, p.reply, p.replyStatus])).toEqual([
      ["1", "Voici 5 restaurants", "SENT"],
      ["2", null, "SENT"],
      ["4", null, "PENDING"],
    ]);
    expect(pairs[0]!.roleLabel).toBe("Rédacteur");
  });

  it("résume score, paiement crédité et retour du client depuis l'évaluation serveur", () => {
    const e = entryFromAttempt(
      attempt(1, {
        messages: [msg("1", "writer", "player", "Cherche"), msg("2", "writer", "agent", "Résultat")],
        submission: {
          id: "sub_1",
          status: "EVALUATED",
          artifact_version_id: "art_1",
          brief_version: 1,
          evaluation: {
            submission_id: "sub_1", rubric_version: "r", out_of_scope: false, criteria: [], client_feedback: "Bon travail.", next_action: "Précisez la zone.",
            score: 85, passed: true, capped_by_essential: false, criteria_labels: {},
            payment: { max_reward: 20, target: 17, already_acquired: 0, credited: 17, already_awarded: true }, spent: 0,
          },
        },
      }),
    );
    expect(e).toMatchObject({ statusLabel: "Terminée", score: 85, passed: true, payment: 17, feedback: "Bon travail.", delivered: true, evaluating: false });
    expect(e.agents).toEqual([{ role: "writer", label: "Rédacteur", used: 1, limit: 5 }]);
    expect(e.dateLabel).not.toBe("date inconnue");
  });

  it("une livraison non évaluée est « en cours d'évaluation » sans score", () => {
    const e = entryFromAttempt(attempt(1, { status: "EVALUATING", submission: { id: "s", status: "EVALUATING", artifact_version_id: "a", brief_version: 1 } }));
    expect(e).toMatchObject({ evaluating: true, statusLabel: "Évaluation en cours", score: null, payment: null });
  });

  it("date inconnue quand le serveur n'en donne pas", () => {
    expect(entryFromAttempt(attempt(1, { created_at: undefined })).dateLabel).toBe("date inconnue");
  });

  it("trie de la plus récente à la plus ancienne et résume l'ensemble", () => {
    const ev = (score: number, credited: number) => ({
      id: "s", status: "EVALUATED" as const, artifact_version_id: "a", brief_version: 1,
      evaluation: { submission_id: "s", rubric_version: "r", out_of_scope: false, criteria: [], client_feedback: "", next_action: "", score, passed: score >= 50, capped_by_essential: false, criteria_labels: {}, payment: { max_reward: 20, target: credited, already_acquired: 0, credited, already_awarded: true }, spent: 0 },
    });
    const list = buildPlanetHistory([
      attempt(1, { status: "FAILED", submission: ev(40, 0), messages: [msg("1", "writer", "player", "a")] }),
      attempt(2, { submission: ev(90, 18), messages: [msg("2", "writer", "player", "b"), msg("3", "writer", "player", "c")] }),
    ]);
    expect(list.map((e) => e.attemptNo)).toEqual([2, 1]);
    expect(summarizeHistory(list)).toEqual({ expeditions: 2, instructions: 3, bestScore: 90, totalPaid: 18 });
    expect(summarizeHistory([])).toEqual({ expeditions: 0, instructions: 0, bestScore: null, totalPaid: 0 });
  });

  it("remplace la tentative courante par la version fraîche de l'état, sans la dupliquer", () => {
    const old = attempt(1, { status: "ACTIVE" });
    const fresh = attempt(1, { status: "ACTIVE", messages: [msg("1", "writer", "player", "x")] });
    expect(mergeCurrentAttempt([old], fresh, "m1")[0]!.messages).toHaveLength(1);
    expect(mergeCurrentAttempt([], fresh, "m1")).toHaveLength(1);
    expect(mergeCurrentAttempt([old], fresh, "m2")).toEqual([old]);
    expect(mergeCurrentAttempt([old], null, "m1")).toEqual([old]);
  });
});
