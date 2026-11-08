import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createMockOrchestratorApi } from "@/mocks/orchestrator";
import { OrchestratorError, type OrchestratorApi, type OrchestratorPlan } from "@/lib/api/orchestrator";
import { OrchestratorPanel } from "./OrchestratorPanel";
import { useOrchestrator } from "./useOrchestrator";

function Harness({ api }: { api: OrchestratorApi }) {
  const c = useOrchestrator({ api });
  return <OrchestratorPanel controller={c} />;
}
const mock = (o: Parameters<typeof createMockOrchestratorApi>[0] = {}) => createMockOrchestratorApi({ delayMs: 1, ...o });

async function ask(text: string) {
  fireEvent.change(screen.getByLabelText("Que voulez-vous faire ?"), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Envoyer" }));
  return screen.findByRole("heading", { name: /Voici ce que je propose de faire|rien/i });
}

describe("étage Orchestrateur : discussion et plan", () => {
  it("champ limité à 500 caractères, demandes restantes, exemples cliquables", async () => {
    render(<Harness api={mock()} />);
    expect(await screen.findByText("Il vous reste 5 demandes.")).toBeInTheDocument();
    const field = screen.getByLabelText("Que voulez-vous faire ?");
    expect(field).toHaveAttribute("maxlength", "500");
    expect(screen.getByRole("button", { name: "Envoyer" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Relance mon prospect Dupont" }));
    expect(field).toHaveValue("Relance mon prospect Dupont");
    expect(screen.getByRole("button", { name: "Envoyer" })).toBeEnabled();
  });

  it("plan lisible : titre, bandeau, qui/rôle/durée, note de prompt et conseils", async () => {
    render(<Harness api={mock()} />);
    await ask("Relance mon prospect Dupont rapidement");
    expect(screen.getByRole("heading", { name: "Voici ce que je propose de faire" })).toBeInTheDocument();
    expect(screen.getByText(/Rien n'est envoyé ni publié sans vous/)).toBeInTheDocument();
    const tasks = within(screen.getByRole("list", { name: "Tâches proposées" })).getAllByRole("listitem");
    expect(tasks).toHaveLength(2);
    expect(tasks[0]).toHaveTextContent("Éclaireur");
    expect(tasks[0]).toHaveTextContent("Durée estimée");
    expect(tasks[1]).toHaveTextContent("Rédacteur");
    expect(screen.getByText(/Votre note de prompt/)).toBeInTheDocument();
    expect(screen.getByText(/Conseils/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\b(quota|token|délégation|erreur serveur)\b/i);
  });

  it("tâche bloquée : grisée avec sa raison, le reste peut être lancé", async () => {
    render(<Harness api={mock()} />);
    await ask("Relance Dupont, c'est bloqué pour l'instant");
    const tasks = screen.getAllByRole("listitem").filter((li) => li.classList.contains("task"));
    expect(tasks[1]).toHaveClass("task-blocked");
    expect(tasks[1]).toHaveTextContent("Vous n'avez pas assez d'argent pour cette tâche.");
    expect(screen.getByRole("button", { name: "Oui, lancer" })).toBeEnabled();
  });

  it("plan vide : explication, aucun bouton « Oui »", async () => {
    render(<Harness api={mock()} />);
    await ask("rien de précis");
    expect(screen.getByText(/Je ne propose aucune tâche/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Oui, lancer" })).toBeNull();
    expect(screen.getByRole("button", { name: "Faire une autre demande" })).toBeInTheDocument();
  });

  it("confirmation : tâches terminées, résultat et lien vers la section", async () => {
    render(<Harness api={mock()} />);
    await ask("Trouve-moi des clients en centre-ville");
    fireEvent.click(screen.getByRole("button", { name: "Oui, lancer" }));
    expect(await screen.findByRole("heading", { name: "C'est terminé" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ouvrir mon carnet" })).toHaveAttribute("href", "/immeuble?etage=archives");
    expect(screen.getByTestId("orchestrator-live")).toHaveTextContent("Toutes les tâches sont terminées.");
  });

  it("résultat partiel puis nouvelle tentative réussie", async () => {
    render(<Harness api={mock()} />);
    await ask("Relance Dupont, c'était un échec la dernière fois");
    fireEvent.click(screen.getByRole("button", { name: "Oui, lancer" }));
    expect(await screen.findByRole("heading", { name: "C'est terminé, sauf une partie" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Réessayer les tâches qui n'ont pas pu se faire" }));
    expect(await screen.findByRole("heading", { name: "C'est terminé" })).toBeInTheDocument();
  });

  it("annulation : rien n'est dépensé", async () => {
    render(<Harness api={mock()} />);
    await ask("Trouve-moi des clients en centre-ville");
    fireEvent.click(screen.getByRole("button", { name: "Non, annuler" }));
    expect(await screen.findByRole("heading", { name: "Ce plan a été annulé" })).toBeInTheDocument();
    expect(screen.getByText("Plan annulé. Rien n'a été dépensé.", { selector: "p:not(.sr-only)" })).toBeInTheDocument();
  });

  it("historique : les plans récents, relisibles", async () => {
    render(<Harness api={mock()} />);
    await ask("Trouve-moi des clients en centre-ville");
    fireEvent.click(screen.getByRole("button", { name: "Non, annuler" }));
    await screen.findByRole("heading", { name: "Ce plan a été annulé" });
    fireEvent.click(screen.getByRole("button", { name: "Faire une autre demande" }));
    const hist = await screen.findByRole("region", { name: "Vos demandes récentes" });
    await waitFor(() => expect(within(hist).getByText(/annulé/)).toBeInTheDocument());
    fireEvent.click(within(hist).getByRole("button", { name: /^Revoir/ }));
    expect(screen.getByRole("heading", { name: "Ce plan a été annulé" })).toBeInTheDocument();
  });

  it("limite atteinte : phrase claire, envoi impossible", async () => {
    render(<Harness api={mock({ plans: 0 })} />);
    expect(await screen.findByText("Il ne vous reste aucune demande.")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Vous avez utilisé toutes vos demandes");
    expect(screen.getByRole("button", { name: "Envoyer" })).toBeDisabled();
  });

  it("erreur lisible, sans code ni mot technique (incompris)", async () => {
    render(<Harness api={mock()} />);
    fireEvent.change(screen.getByLabelText("Que voulez-vous faire ?"), { target: { value: "incompréhensible" } });
    fireEvent.click(screen.getByRole("button", { name: "Envoyer" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Je n'ai pas bien compris votre demande");
    expect(alert.textContent).not.toMatch(/INVALID_OUTPUT|422/);
  });

  it("échec de confirmation : phrase lisible et plan relu", async () => {
    const base = await mock().propose("x");
    const api: OrchestratorApi = {
      propose: async () => base, list: async () => ({ items: [], plansLeft: 4 }), get: async () => base, reject: async () => base,
      confirm: async () => { throw new OrchestratorError("INSUFFICIENT_FUNDS", "x", 409); },
      instances: async () => [], improve: async () => { throw new Error("n/a"); }, rollback: async () => { throw new Error("n/a"); },
    };
    render(<Harness api={api} />);
    await ask("x");
    fireEvent.click(screen.getByRole("button", { name: "Oui, lancer" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Vous n'avez pas assez d'argent");
    expect(screen.getByRole("button", { name: "Oui, lancer" })).toBeEnabled();
  });

  it("texte du modèle rendu en texte seul (pas de HTML)", async () => {
    const evil: OrchestratorPlan = {
      id: "p", headline: "", banner: "", summary: "<img src=x onerror=alert(1)>résumé", status: "PROPOSED",
      steps: [], totalCost: 0, balance: 1, balanceAfter: 1, plansLeft: 3, simule: false, createdAt: "", evaluation: null,
    };
    const api: OrchestratorApi = {
      propose: async () => evil, list: async () => ({ items: [], plansLeft: 3 }), get: async () => evil, confirm: async () => evil, reject: async () => evil,
      instances: async () => [], improve: async () => { throw new Error("n/a"); }, rollback: async () => { throw new Error("n/a"); },
    };
    const { container } = render(<Harness api={api} />);
    await ask("x");
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("<img src=x onerror=alert(1)>résumé")).toBeInTheDocument();
  });

  it("accessibilité : le titre du plan prend le focus, une zone d'état annonce les changements", async () => {
    render(<Harness api={mock()} />);
    await ask("Trouve-moi des clients en centre-ville");
    await waitFor(() => expect(screen.getByRole("heading", { name: "Voici ce que je propose de faire" })).toHaveFocus());
    expect(screen.getByTestId("orchestrator-live")).toHaveTextContent("Voici sa proposition : 1 tâche.");
  });
});
