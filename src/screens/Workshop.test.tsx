import { render, screen, waitFor } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import { createMockClient } from "@/mocks/client";
import { GameProvider } from "@/lib/game-context";
import { WorkshopScreen } from "./WorkshopScreen";

describe("Atelier (mock)", () => {
  const api = createMockClient();
  let attemptId = "";

  beforeAll(async () => {
    await api.createSession({ company: "Test SARL", mode: "expert" });
    const r = await api.startMission("m1");
    attemptId = r.state.attempt!.id;
  });

  it("affiche le compteur de messages 0/5 et le coût max", async () => {
    render(
      <GameProvider>
        <WorkshopScreen attemptId={attemptId} />
      </GameProvider>,
    );
    const group = await screen.findByRole("group", { name: "État de l'expédition" });
    expect(group).toHaveTextContent("0/5");
    expect(group).toHaveTextContent("Coût max du prochain envoi");
  });

  it("à 5/5 désactive la saisie, explique la cause, et laisse éditer/livrer", async () => {
    for (let i = 0; i < 5; i++) {
      await api.sendMessage(attemptId, { role: "scout", text: `Consigne ${i}`, document_ids: [], max_cost_confirmed: 0 });
    }
    await expect(api.sendMessage(attemptId, { role: "scout", text: "6e", document_ids: [], max_cost_confirmed: 0 })).rejects.toMatchObject({
      code: "MESSAGE_LIMIT",
    });
    render(
      <GameProvider>
        <WorkshopScreen attemptId={attemptId} />
      </GameProvider>,
    );
    await waitFor(() => expect(screen.getByRole("group", { name: "État de l'expédition" })).toHaveTextContent("5/5"));
    expect(screen.getByRole("textbox", { name: /Votre instruction/ })).toBeDisabled();
    expect(screen.getAllByText(/5 messages/).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Envoyer à/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Modifier à la main|Écrire un livrable/ })).toBeEnabled();
  });
});
