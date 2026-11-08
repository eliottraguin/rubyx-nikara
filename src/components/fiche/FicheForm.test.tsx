import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FICHE_VIDE, ProfileError, type Fiche, type ProfileApi } from "@/lib/api/profile";
import { FicheForm } from "./FicheForm";

const base = (over: Partial<Fiche> = {}): Fiche => ({ ...FICHE_VIDE, version: 1, complete: false, modifieLe: null, ...over });
const full = (over: Partial<Fiche> = {}): Fiche => base({ entreprise_nom: "Acme", offre: "Des vélos", cible_secteurs: ["industrie"], cible_zone: ["Lyon"], complete: true, ...over });

function fake(save?: ProfileApi["save"]): ProfileApi & { save: ReturnType<typeof vi.fn> } {
  return {
    get: vi.fn(async () => full({ version: 5, offre: "Version du serveur" })),
    save: vi.fn(save ?? (async (v, n) => ({ ...v, version: n + 1, complete: true, modifieLe: null }))),
  } as never;
}

describe("page fiche entreprise et cible", () => {
  it("signale les champs obligatoires et envoie rien tant qu'ils manquent ; erreurs liées aux champs", async () => {
    const api = fake();
    render(<FicheForm initial={base()} api={api} tutoriel={false} />);
    expect(screen.getByLabelText(/Ce que vous vendez/)).toBeRequired();
    expect(screen.getByText("(obligatoire)", { selector: "label[for$=offre] span" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer ma fiche" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Ce que vous vendez");
    expect(alert).toHaveTextContent("Secteurs visés");
    expect(alert).toHaveTextContent("Zone géographique");
    expect(api.save).not.toHaveBeenCalled();
    const offre = screen.getByLabelText(/Ce que vous vendez/);
    expect(offre).toHaveAttribute("aria-invalid", "true");
    expect(offre).toHaveAccessibleDescription(/Ce champ est obligatoire/);
  });

  it("enregistre la version suivante avec la version affichée, puis confirme", async () => {
    const api = fake();
    render(<FicheForm initial={base({ version: 4 })} api={api} tutoriel={false} />);
    fireEvent.change(screen.getByLabelText(/Ce que vous vendez/), { target: { value: "  Des vélos  " } });
    fireEvent.click(screen.getByLabelText("Industrie et fabrication"));
    fireEvent.change(screen.getByLabelText(/Autres secteurs/), { target: { value: "Cyclisme\n\nLoisirs actifs" } });
    fireEvent.change(screen.getByLabelText(/Zone géographique/), { target: { value: "Lyon\nGrenoble" } });
    fireEvent.change(screen.getByLabelText("Salariés au minimum"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("Salariés au maximum"), { target: { value: "50" } });
    fireEvent.click(screen.getByLabelText(/Tutoiement/));
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer ma fiche" }));
    await screen.findByText("Fiche enregistrée (version 5).");
    expect(api.save).toHaveBeenCalledWith(
      expect.objectContaining({ offre: "Des vélos", cible_secteurs: ["industrie", "Cyclisme", "Loisirs actifs"], cible_zone: ["Lyon", "Grenoble"], cible_taille: { effectif_min: 5, effectif_max: 50 }, ton: "tutoiement" }),
      4,
    );
    expect(screen.getByText("Fiche complète : le bot peut chercher.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Aller chercher des clients" })).toHaveAttribute("href", "/carte");
  });

  it("bornes : trop long, trop d'éléments, taille incohérente", async () => {
    const api = fake();
    render(<FicheForm initial={full()} api={api} tutoriel={false} />);
    fireEvent.change(screen.getByLabelText(/Ce que vous vendez/), { target: { value: "x".repeat(401) } });
    fireEvent.change(screen.getByLabelText(/Zone géographique/), { target: { value: "a\nb\nc\nd\ne\nf" } });
    fireEvent.change(screen.getByLabelText("Salariés au minimum"), { target: { value: "50" } });
    fireEvent.change(screen.getByLabelText("Salariés au maximum"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer ma fiche" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Trop long : 400 caractères au maximum.");
    expect(alert).toHaveTextContent("Trop d'éléments : 5 au maximum.");
    expect(alert).toHaveTextContent("Le minimum ne peut pas dépasser le maximum.");
    expect(api.save).not.toHaveBeenCalled();
  });

  it("conflit de version : message clair, saisie conservée, rechargement de la dernière version", async () => {
    const api = fake(async () => {
      throw new ProfileError("VERSION_CONFLICT", "x", 409);
    });
    render(<FicheForm initial={full()} api={api} tutoriel={false} />);
    fireEvent.change(screen.getByLabelText(/Ce que vous vendez/), { target: { value: "Ma saisie" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer ma fiche" }));
    const alert = await screen.findByText("Votre fiche a changé ailleurs.");
    expect(alert.closest("[role=alert]")).not.toHaveTextContent("VERSION_CONFLICT");
    expect(screen.getByLabelText(/Ce que vous vendez/)).toHaveValue("Ma saisie");
    fireEvent.click(screen.getByRole("button", { name: "Recharger la dernière version" }));
    await waitFor(() => expect(screen.getByLabelText(/Ce que vous vendez/)).toHaveValue("Version du serveur"));
    expect(screen.getByText("La dernière version est chargée.")).toBeInTheDocument();
  });

  it("erreurs du serveur (422) affichées sur les champs ; réseau coupé : saisie conservée", async () => {
    const api = fake(async () => {
      throw new ProfileError("INVALID_REQUEST", "x", 422, { cible_zone: "Au moins un élément est requis." });
    });
    render(<FicheForm initial={full()} api={api} tutoriel={false} />);
    fireEvent.change(screen.getByLabelText(/Ce que vous vendez/), { target: { value: "Autre" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer ma fiche" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Zone géographique : Au moins un élément est requis.");
    api.save.mockRejectedValueOnce(new ProfileError("NETWORK"));
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer ma fiche" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Connexion perdue"));
    expect(screen.getByLabelText(/Ce que vous vendez/)).toHaveValue("Autre");
  });

  it("Tutoriel : « Remplir avec un exemple » remplit sans enregistrer ; absent en Réel", () => {
    const api = fake();
    const { unmount } = render(<FicheForm initial={base()} api={api} tutoriel />);
    const group = screen.getByRole("group", { name: "Remplir avec un exemple" });
    const btn = within(group).getByRole("button", { name: "Remplir avec cet exemple" });
    expect(btn).toBeDisabled();
    fireEvent.change(within(group).getByLabelText("Entreprise d'exemple"), { target: { value: "exemple_logiciel_planning" } });
    fireEvent.click(btn);
    expect((screen.getByLabelText(/Ce que vous vendez/) as HTMLTextAreaElement).value).toContain("planification de tournées");
    expect(screen.getByLabelText("Transport et logistique")).toBeChecked();
    expect(screen.getByLabelText(/Zone géographique/)).toHaveValue("Pays de la Loire\nBretagne");
    expect(screen.getByText(/Exemple « Planéa Logiciels \(fictive\) » chargé/)).toBeInTheDocument();
    expect(api.save).not.toHaveBeenCalled();
    unmount();
    render(<FicheForm initial={base()} api={api} tutoriel={false} />);
    expect(screen.queryByRole("group", { name: "Remplir avec un exemple" })).toBeNull();
  });

  it("le texte saisi reste du texte ; langage courant", () => {
    const { container } = render(<FicheForm initial={full({ offre: "<img src=x onerror=alert(1)>" })} api={fake()} tutoriel />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByLabelText(/Ce que vous vendez/)).toHaveValue("<img src=x onerror=alert(1)>");
    expect(document.body.textContent).not.toMatch(/quota|token|expédition|agent|score/i);
  });
});
