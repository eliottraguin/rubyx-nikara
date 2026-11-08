import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createMockOrchestratorApi } from "@/mocks/orchestrator";
import { OrchestratorError, type OrchestratorApi } from "@/lib/api/orchestrator";
import { AgentImprovePanel } from "./AgentImprovePanel";
import { useAgentImprove } from "./useAgentImprove";

function Harness({ api }: { api: OrchestratorApi }) {
  const c = useAgentImprove({ api });
  return <AgentImprovePanel controller={c} />;
}
const mock = (o: Parameters<typeof createMockOrchestratorApi>[0] = {}) => createMockOrchestratorApi({ delayMs: 1, ...o });

describe("étage Orchestrateur : améliorer un agent", () => {
  it("liste les exemplaires possédés, un retour déclenche une proposition", async () => {
    render(<Harness api={mock()} />);
    expect(await screen.findByRole("button", { name: /Rédacteur/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Éclaireur/ }));
    fireEvent.click(screen.getByRole("button", { name: "Trop générique" }));
    expect(screen.getByLabelText("Ce qui ne va pas")).toHaveValue("Trop générique");
    fireEvent.click(screen.getByRole("button", { name: "Proposer une nouvelle version" }));
    expect(await screen.findByText(/Ceci va vous coûter de l'argent/)).toBeInTheDocument();
    expect(screen.getByText(/Plafond du palier : 2/)).toBeInTheDocument();
  });

  it("confirmation : diff lisible avant/après, coût affiché, nouvelle version en historique", async () => {
    render(<Harness api={mock()} />);
    fireEvent.click(await screen.findByRole("button", { name: /Éclaireur/ }));
    fireEvent.change(screen.getByLabelText("Ce qui ne va pas"), { target: { value: "trop générique" } });
    fireEvent.click(screen.getByRole("button", { name: "Proposer une nouvelle version" }));
    await screen.findByText(/Ceci va vous coûter de l'argent/);
    fireEvent.click(screen.getByRole("button", { name: "Confirmer et payer" }));
    const title = await screen.findByText(/Nouvelle version proposée/);
    expect(title.closest("p")).toHaveTextContent("60 $");
    const added = document.querySelector(".diff-add");
    expect(added).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Historique des versions" })).toBeInTheDocument();
    expect(screen.getByText(/Version 2/)).toHaveTextContent("version active");
    expect(screen.getByRole("button", { name: "Revenir à cette version" })).toBeInTheDocument();
  });

  it("annuler la revue n'envoie rien", async () => {
    render(<Harness api={mock()} />);
    fireEvent.click(await screen.findByRole("button", { name: /Éclaireur/ }));
    fireEvent.change(screen.getByLabelText("Ce qui ne va pas"), { target: { value: "trop familier" } });
    fireEvent.click(screen.getByRole("button", { name: "Proposer une nouvelle version" }));
    await screen.findByText(/Ceci va vous coûter de l'argent/);
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
    expect(screen.getByLabelText("Ce qui ne va pas")).toBeInTheDocument();
    expect(screen.queryByText(/Nouvelle version proposée/)).toBeNull();
  });

  it("retour en arrière : revient à une version précédente", async () => {
    render(<Harness api={mock()} />);
    fireEvent.click(await screen.findByRole("button", { name: /Éclaireur/ }));
    fireEvent.change(screen.getByLabelText("Ce qui ne va pas"), { target: { value: "trop générique" } });
    fireEvent.click(screen.getByRole("button", { name: "Proposer une nouvelle version" }));
    await screen.findByText(/Ceci va vous coûter de l'argent/);
    fireEvent.click(screen.getByRole("button", { name: "Confirmer et payer" }));
    await screen.findByText(/Nouvelle version proposée/);
    fireEvent.click(screen.getByRole("button", { name: "Revenir à cette version" }));
    expect(await screen.findByText("Retour à une version précédente effectué.")).toBeInTheDocument();
  });

  it("aucun agent possédé : message clair", async () => {
    const api: OrchestratorApi = {
      instances: async () => [], propose: async () => { throw new Error("n/a"); }, list: async () => ({ items: [], plansLeft: 0 }), get: async () => { throw new Error("n/a"); },
      confirm: async () => { throw new Error("n/a"); }, reject: async () => { throw new Error("n/a"); }, improve: async () => { throw new Error("n/a"); }, rollback: async () => { throw new Error("n/a"); },
    };
    render(<Harness api={api} />);
    expect(await screen.findByText("Vous ne possédez encore aucun agent à améliorer.")).toBeInTheDocument();
  });

  it("solde insuffisant : phrase lisible, aucune version créée", async () => {
    const items = await mock().instances();
    const api: OrchestratorApi = {
      instances: async () => items, propose: async () => { throw new Error("n/a"); }, list: async () => ({ items: [], plansLeft: 0 }), get: async () => { throw new Error("n/a"); },
      confirm: async () => { throw new Error("n/a"); }, reject: async () => { throw new Error("n/a"); },
      improve: async () => { throw new OrchestratorError("INSUFFICIENT_FUNDS", "x", 409); }, rollback: async () => { throw new Error("n/a"); },
    };
    render(<Harness api={api} />);
    fireEvent.click(await screen.findByRole("button", { name: /Éclaireur/ }));
    fireEvent.change(screen.getByLabelText("Ce qui ne va pas"), { target: { value: "trop long" } });
    fireEvent.click(screen.getByRole("button", { name: "Proposer une nouvelle version" }));
    await screen.findByText(/Ceci va vous coûter de l'argent/);
    fireEvent.click(screen.getByRole("button", { name: "Confirmer et payer" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Vous n'avez pas assez d'argent");
    expect(screen.queryByText(/Nouvelle version proposée/)).toBeNull();
  });
});
