import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createMockAssistantApi } from "@/mocks/assistant";
import { AssistantError, type AssistantApi, type Plan } from "@/lib/api/assistant";
import { AssistantPanel } from "./AssistantPanel";
import { useAssistant } from "./useAssistant";

function Harness({ api }: { api: AssistantApi }) {
  const c = useAssistant({ api });
  return <AssistantPanel controller={c} />;
}
const mock = (o: Parameters<typeof createMockAssistantApi>[0] = {}) => createMockAssistantApi({ delayMs: 1, ...o });

async function ask(assistant: string, text: string) {
  fireEvent.click(screen.getByRole("button", { name: new RegExp(`Demander à l'assistant ${assistant}`) }));
  fireEvent.change(screen.getByLabelText("Que voulez-vous faire ?"), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Envoyer ma demande" }));
  return screen.findByRole("heading", { name: /Voici ce que je propose de faire|rien/i });
}

describe("assistants personnels", () => {
  it("trois assistants, champ limité à 500 caractères, demandes restantes, exemples cliquables", async () => {
    render(<Harness api={mock()} />);
    expect(screen.getAllByRole("button", { name: /^Demander à l'assistant/ })).toHaveLength(3);
    expect(await screen.findByText("Il vous reste 5 demandes.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Demander à l'assistant Clients/ }));
    const field = screen.getByLabelText("Que voulez-vous faire ?");
    expect(field).toHaveAttribute("maxlength", "500");
    expect(screen.getByRole("button", { name: "Envoyer ma demande" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Résume mes conversations en cours" }));
    expect(field).toHaveValue("Résume mes conversations en cours");
    expect(screen.getByRole("button", { name: "Envoyer ma demande" })).toBeEnabled();
  });

  it("plan lisible : titre, bandeau, carte par tâche (qui, ce que vous obtiendrez, coût), total et solde", async () => {
    render(<Harness api={mock()} />);
    await ask("Clients", "Résume mes conversations");
    expect(screen.getByRole("heading", { name: "Voici ce que je propose de faire" })).toBeInTheDocument();
    expect(screen.getByText(/Rien n'est envoyé ni publié sans vous/)).toBeInTheDocument();
    const tasks = within(screen.getByRole("list", { name: "Tâches proposées" })).getAllByRole("listitem");
    expect(tasks).toHaveLength(2);
    expect(tasks[0]).toHaveTextContent("Résumer la conversation avec Dupont");
    expect(tasks[0]).toHaveTextContent("Marc, votre trieur de boîte");
    expect(tasks[0]).toHaveTextContent("Ce que vous obtiendrez");
    expect(tasks[0]).toHaveTextContent("2 $");
    expect(screen.getByText(/Total à dépenser/).closest("p")).toHaveTextContent("5 $");
    expect(screen.getByText(/Votre solde aujourd'hui : 30 \$/)).toHaveTextContent("Votre solde après : 25 $");
    expect(screen.getByRole("button", { name: "Oui, lancer" })).toBeEnabled();
    expect(document.body.textContent).not.toMatch(/\b(agent|quota|token|délégation|erreur serveur)\b/i);
  });

  it("tâche bloquée : grisée avec sa raison, le reste peut être lancé", async () => {
    render(<Harness api={mock()} />);
    await ask("Clients", "bloqué");
    const tasks = screen.getAllByRole("listitem").filter((li) => li.classList.contains("task"));
    expect(tasks[1]).toHaveClass("task-blocked");
    expect(tasks[1]).toHaveTextContent("Vous n'avez pas assez d'argent pour cette tâche.");
    expect(tasks[1]).toHaveTextContent("ne peut pas se faire");
    expect(screen.getByText(/Total à dépenser/).closest("p")).toHaveTextContent("2 $");
    expect(screen.getByRole("button", { name: "Oui, lancer" })).toBeEnabled();
  });

  it("plan vide : l'explication de l'assistant, aucun bouton « Oui »", async () => {
    render(<Harness api={mock()} />);
    await ask("Pub", "rien de précis");
    expect((await screen.findAllByText(/ne correspond à aucune tâche/)).length).toBeGreaterThan(0);
    expect(screen.getByText(/Je ne propose aucune tâche/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Oui, lancer" })).toBeNull();
    expect(screen.getByRole("button", { name: "Faire une autre demande" })).toBeInTheDocument();
  });

  it("confirmation sans fenêtre du navigateur : tâches terminées, résultat et lien vers la section", async () => {
    render(<Harness api={mock()} />);
    await ask("Pub", "Prépare ma pub");
    fireEvent.click(screen.getByRole("button", { name: "Oui, lancer" }));
    expect(await screen.findByRole("heading", { name: "C'est terminé" })).toBeInTheDocument();
    expect(screen.getByText("Le kit de campagne est prêt dans le Studio pub.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ouvrir le Studio pub" })).toHaveAttribute("href", "/immeuble?etage=pub");
    expect(screen.getByText("Toutes les tâches sont terminées. Votre solde maintenant : 25 $.")).toBeInTheDocument();
    expect(screen.getByTestId("assistant-live")).toHaveTextContent("Toutes les tâches sont terminées.");
  });

  it("pendant l'exécution : états « en cours » puis « terminé »", async () => {
    render(<Harness api={mock({ delayMs: 40 })} />);
    await ask("Clients", "Résume");
    fireEvent.click(screen.getByRole("button", { name: "Oui, lancer" }));
    expect(await screen.findByText("en cours")).toBeInTheDocument();
    expect(screen.getByText("en attente")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lancement en cours…" })).toBeDisabled();
    await screen.findByRole("heading", { name: "C'est terminé" });
    expect(screen.getAllByText("terminé").length).toBeGreaterThanOrEqual(2);
  });

  it("résultat partiel puis nouvelle tentative réussie", async () => {
    render(<Harness api={mock()} />);
    await ask("Clients", "échec");
    fireEvent.click(screen.getByRole("button", { name: "Oui, lancer" }));
    expect(await screen.findByRole("heading", { name: "C'est terminé, sauf une partie" })).toBeInTheDocument();
    expect(screen.getByText("n'a pas pu se faire")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Réessayer les tâches qui n'ont pas pu se faire" }));
    expect(await screen.findByRole("heading", { name: "C'est terminé" })).toBeInTheDocument();
    expect(screen.queryByText("n'a pas pu se faire")).toBeNull();
  });

  it("annulation : « Non, annuler » rend la demande, rien n'est dépensé", async () => {
    render(<Harness api={mock()} />);
    await ask("Pub", "Prépare ma pub");
    fireEvent.click(screen.getByRole("button", { name: "Non, annuler" }));
    expect(await screen.findByRole("heading", { name: "Ce plan a été annulé" })).toBeInTheDocument();
    expect(screen.getByText("Plan annulé. Rien n'a été dépensé.", { selector: "p:not(.sr-only)" })).toBeInTheDocument();
    expect(screen.getByTestId("assistant-live")).toHaveTextContent("Plan annulé");
    expect(screen.queryByRole("button", { name: "Oui, lancer" })).toBeNull();
  });

  it("limite atteinte : phrase claire, envoi impossible", async () => {
    render(<Harness api={mock({ plans: 0 })} />);
    expect(await screen.findByText("Il ne vous reste aucune demande.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Demander à l'assistant Pub/ }));
    expect(screen.getByRole("alert")).toHaveTextContent("Vous avez utilisé toutes vos demandes");
    expect(screen.getByRole("button", { name: "Envoyer ma demande" })).toBeDisabled();
  });

  it("erreur lisible, sans code ni mot technique (l'assistant n'a pas compris)", async () => {
    render(<Harness api={mock()} />);
    fireEvent.click(screen.getByRole("button", { name: /Demander à l'assistant Pub/ }));
    fireEvent.change(screen.getByLabelText("Que voulez-vous faire ?"), { target: { value: "incompréhensible" } });
    fireEvent.click(screen.getByRole("button", { name: "Envoyer ma demande" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Je n'ai pas bien compris votre demande");
    expect(alert.textContent).not.toMatch(/INVALID_OUTPUT|422/);
    expect(screen.getByLabelText("Que voulez-vous faire ?")).toHaveValue("incompréhensible");
  });

  it("texte du modèle rendu en texte seul (pas de HTML)", async () => {
    const evil: Plan = {
      id: "p", assistant: "assistant_pub", assistantLabel: "A", headline: "", banner: "", summary: "<img src=x onerror=alert(1)>résumé", status: "PROPOSED",
      steps: [], totalCost: 0, balance: 1, balanceAfter: 1, plansLeft: 3, simule: false, createdAt: "",
    };
    const api: AssistantApi = { propose: async () => evil, list: async () => ({ items: [], plansLeft: 3 }), get: async () => evil, confirm: async () => evil, reject: async () => evil };
    const { container } = render(<Harness api={api} />);
    await ask("Pub", "x");
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("<img src=x onerror=alert(1)>résumé")).toBeInTheDocument();
  });

  it("historique : les plans récents, relisibles", async () => {
    const api = mock();
    render(<Harness api={api} />);
    await ask("Pub", "Prépare ma pub");
    fireEvent.click(screen.getByRole("button", { name: "Non, annuler" }));
    await screen.findByRole("heading", { name: "Ce plan a été annulé" });
    fireEvent.click(screen.getByRole("button", { name: "Faire une autre demande" }));
    const hist = await screen.findByRole("region", { name: "Vos demandes récentes" });
    await waitFor(() => expect(within(hist).getByText(/annulé/)).toBeInTheDocument());
    fireEvent.click(within(hist).getByRole("button", { name: /^Revoir/ }));
    expect(screen.getByRole("heading", { name: "Ce plan a été annulé" })).toBeInTheDocument();
  });

  it("échec de confirmation : phrase lisible et plan relu", async () => {
    const base = await mock().propose("assistant_pub", "x");
    const api: AssistantApi = {
      propose: async () => base, list: async () => ({ items: [], plansLeft: 4 }), get: async () => base, reject: async () => base,
      confirm: async () => { throw new AssistantError("INSUFFICIENT_FUNDS", "x", 409); },
    };
    render(<Harness api={api} />);
    await ask("Pub", "x");
    fireEvent.click(screen.getByRole("button", { name: "Oui, lancer" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Vous n'avez pas assez d'argent");
    expect(screen.getByRole("button", { name: "Oui, lancer" })).toBeEnabled();
  });

  it("accessibilité : le titre du plan prend le focus, une zone d'état annonce les changements", async () => {
    render(<Harness api={mock()} />);
    await ask("Pub", "Prépare ma pub");
    await waitFor(() => expect(screen.getByRole("heading", { name: "Voici ce que je propose de faire" })).toHaveFocus());
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
    expect(screen.getByTestId("assistant-live")).toHaveTextContent("Voici ma proposition : 1 tâche.");
  });
});
