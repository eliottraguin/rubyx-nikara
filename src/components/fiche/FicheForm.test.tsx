import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FICHE_VIDE, ProfileError, type Fiche, type ProfileApi } from "@/lib/api/profile";
import { FicheForm } from "./FicheForm";

/**
 * Migration (GR3-64) : la fiche devient un assistant en 5 étapes (« Qui êtes-vous ? », « Que vendez-vous ? »,
 * « Qui cherchez-vous ? », « Où ? », « Votre ton »), au lieu d'un unique long formulaire. Les anciens tests
 * remplissaient tous les champs d'un coup puis cliquaient une seule fois sur « Enregistrer ma fiche » : ce
 * parcours n'existe plus, le bouton « Enregistrer ma fiche » n'apparaît que sur la dernière étape, et chaque
 * étape bloque sur « Suivant » tant que ses champs obligatoires ne sont pas valides. Ce fichier remplace donc
 * l'ancien par des tests équivalents qui avancent dans l'assistant à chaque étape ; la couverture (champs
 * obligatoires, bornes, conflit de version, erreurs serveur, réseau coupé, exemple Tutoriel, texte non fiable)
 * est conservée à l'identique.
 */

const base = (over: Partial<Fiche> = {}): Fiche => ({ ...FICHE_VIDE, version: 1, complete: false, modifieLe: null, ...over });
const full = (over: Partial<Fiche> = {}): Fiche => base({ entreprise_nom: "Acme", offre: "Des vélos", cible_secteurs: ["industrie"], cible_zone: ["Lyon"], complete: true, ...over });

function fake(save?: ProfileApi["save"]): ProfileApi & { save: ReturnType<typeof vi.fn> } {
  return {
    get: vi.fn(async () => full({ version: 5, offre: "Version du serveur" })),
    save: vi.fn(save ?? (async (v, n) => ({ ...v, version: n + 1, complete: true, modifieLe: null }))),
  } as never;
}

const suivant = () => fireEvent.click(screen.getByRole("button", { name: "Suivant" }));
const precedent = () => fireEvent.click(screen.getByRole("button", { name: "Précédent" }));
const enregistrer = () => fireEvent.click(screen.getByRole("button", { name: "Enregistrer ma fiche" }));

describe("assistant de la fiche entreprise et cible", () => {
  it("affiche les 5 étapes dans la barre de progression, l'étape courante marquée", () => {
    render(<FicheForm initial={base()} api={fake()} tutoriel={false} />);
    const items = screen.getAllByRole("button", { name: /Qui êtes-vous|Que vendez-vous|cherchez-vous|^Où|Votre ton/ });
    expect(items).toHaveLength(5);
    expect(screen.getByRole("button", { name: /Qui êtes-vous/ })).toHaveAttribute("aria-current", "step");
    // les étapes non encore atteintes sont désactivées : on ne peut pas sauter la validation.
    expect(screen.getByRole("button", { name: /cherchez-vous/ })).toBeDisabled();
  });

  it("étape « Que vendez-vous ? » : bloque Suivant tant que l'offre est vide, puis avance une fois remplie", () => {
    render(<FicheForm initial={base()} api={fake()} tutoriel={false} />);
    suivant(); // qui -> vente (aucun champ obligatoire à cette étape)
    expect(screen.getByRole("heading", { name: /Que vendez-vous/ })).toBeInTheDocument();
    suivant();
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Ce que vous vendez");
    expect(screen.getByRole("heading", { name: /Que vendez-vous/ })).toBeInTheDocument(); // n'a pas avancé
    const offre = screen.getByLabelText(/Ce que vous vendez/);
    expect(offre).toHaveAttribute("aria-invalid", "true");
    fireEvent.change(offre, { target: { value: "Des vélos" } });
    suivant();
    expect(screen.getByRole("heading", { name: /cherchez-vous/ })).toBeInTheDocument();
  });

  it("Précédent revient sans revalider ; la saisie est conservée d'une étape à l'autre", () => {
    render(<FicheForm initial={base()} api={fake()} tutoriel={false} />);
    fireEvent.change(screen.getByLabelText(/Nom de votre entreprise/), { target: { value: "Acme" } });
    suivant();
    precedent();
    expect(screen.getByRole("heading", { name: /Qui êtes-vous/ })).toBeInTheDocument();
    expect(screen.getByLabelText(/Nom de votre entreprise/)).toHaveValue("Acme");
  });

  it("parcours complet : avance étape par étape puis enregistre la version suivante avec la version affichée", async () => {
    const api = fake();
    render(<FicheForm initial={base({ version: 4 })} api={api} tutoriel={false} />);
    fireEvent.change(screen.getByLabelText(/Nom de votre entreprise/), { target: { value: "Acme" } });
    suivant(); // -> vente
    fireEvent.change(screen.getByLabelText(/Ce que vous vendez/), { target: { value: "  Des vélos  " } });
    suivant(); // -> cible
    fireEvent.click(screen.getByLabelText(/Industrie et fabrication/));
    fireEvent.change(screen.getByLabelText(/Autres secteurs/), { target: { value: "Cyclisme\n\nLoisirs actifs" } });
    fireEvent.change(screen.getByLabelText("Salariés au minimum"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("Salariés au maximum"), { target: { value: "50" } });
    suivant(); // -> zone
    fireEvent.change(screen.getByLabelText(/Zone géographique/), { target: { value: "Lyon\nGrenoble" } });
    suivant(); // -> ton
    fireEvent.click(screen.getByLabelText(/Tutoiement/));
    enregistrer();
    await screen.findByText("Fiche enregistrée (version 5).");
    expect(api.save).toHaveBeenCalledWith(
      expect.objectContaining({ offre: "Des vélos", cible_secteurs: ["industrie", "Cyclisme", "Loisirs actifs"], cible_zone: ["Lyon", "Grenoble"], cible_taille: { effectif_min: 5, effectif_max: 50 }, ton: "tutoiement" }),
      4,
    );
    expect(screen.getByText("Fiche complète : le bot peut chercher.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Aller chercher des clients" })).toHaveAttribute("href", "/carte");
  });

  it("le bouton « + exemple » de la zone ajoute une ligne, sans dépasser le maximum ni dupliquer", () => {
    render(<FicheForm initial={full()} api={fake()} tutoriel={false} />);
    suivant(); // vente (déjà valide)
    suivant(); // cible (déjà valide)
    suivant(); // -> zone
    const zone = screen.getByLabelText(/Zone géographique/) as HTMLTextAreaElement;
    expect(zone).toHaveValue("Lyon");
    fireEvent.click(screen.getByRole("button", { name: "+ Île-de-France" }));
    expect(zone).toHaveValue("Lyon\nÎle-de-France");
    fireEvent.click(screen.getByRole("button", { name: "+ Île-de-France" })); // déjà présent : pas de doublon
    expect(zone).toHaveValue("Lyon\nÎle-de-France");
  });

  it("bornes à l'étape « Qui cherchez-vous ? » : trop d'éléments, taille incohérente", () => {
    render(<FicheForm initial={full()} api={fake()} tutoriel={false} />);
    suivant(); // vente
    suivant(); // -> cible
    fireEvent.change(screen.getByLabelText(/Autres secteurs/), { target: { value: "a\nb\nc\nd\ne\nf" } });
    fireEvent.change(screen.getByLabelText("Salariés au minimum"), { target: { value: "50" } });
    fireEvent.change(screen.getByLabelText("Salariés au maximum"), { target: { value: "5" } });
    suivant();
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Trop d'éléments : 5 au maximum.");
    expect(alert).toHaveTextContent("Le minimum ne peut pas dépasser le maximum.");
    expect(screen.getByRole("heading", { name: /cherchez-vous/ })).toBeInTheDocument(); // bloqué
  });

  it("conflit de version : message clair, saisie conservée, rechargement de la dernière version", async () => {
    const api = fake(async () => {
      throw new ProfileError("VERSION_CONFLICT", "x", 409);
    });
    render(<FicheForm initial={full()} api={api} tutoriel={false} />);
    suivant();
    fireEvent.change(screen.getByLabelText(/Ce que vous vendez/), { target: { value: "Ma saisie" } });
    suivant();
    suivant();
    suivant();
    enregistrer();
    const alert = await screen.findByText("Votre fiche a changé ailleurs.");
    expect(alert.closest("[role=alert]")).not.toHaveTextContent("VERSION_CONFLICT");
    fireEvent.click(screen.getByRole("button", { name: "Recharger la dernière version" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: /Votre ton/ })).toBeInTheDocument());
    expect(screen.getByText("La dernière version est chargée.")).toBeInTheDocument();
    precedent();
    precedent();
    precedent();
    expect(screen.getByLabelText(/Ce que vous vendez/)).toHaveValue("Version du serveur");
  });

  it("erreurs du serveur (422) affichées sur les champs ; réseau coupé : saisie conservée", async () => {
    const api = fake(async () => {
      throw new ProfileError("INVALID_REQUEST", "x", 422, { cible_zone: "Au moins un élément est requis." });
    });
    render(<FicheForm initial={full()} api={api} tutoriel={false} />);
    suivant();
    fireEvent.change(screen.getByLabelText(/Ce que vous vendez/), { target: { value: "Autre" } });
    suivant();
    suivant();
    suivant();
    enregistrer();
    expect(await screen.findByRole("alert")).toHaveTextContent("Zone géographique : Au moins un élément est requis.");
    expect(screen.getByRole("heading", { name: /— Où \?/ })).toBeInTheDocument(); // renvoyé sur l'étape en cause
    suivant(); // la zone reste valide : on peut revenir à la dernière étape pour réessayer
    api.save.mockRejectedValueOnce(new ProfileError("NETWORK"));
    enregistrer();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Connexion perdue"));
    precedent();
    precedent();
    precedent();
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
    expect(screen.getByText(/Exemple « Planéa Logiciels \(fictive\) » chargé/)).toBeInTheDocument();
    suivant();
    expect((screen.getByLabelText(/Ce que vous vendez/) as HTMLTextAreaElement).value).toContain("planification de tournées");
    suivant();
    expect(screen.getByLabelText(/Transport et logistique/)).toBeChecked();
    suivant();
    expect(screen.getByLabelText(/Zone géographique/)).toHaveValue("Pays de la Loire\nBretagne");
    expect(api.save).not.toHaveBeenCalled();
    unmount();
    render(<FicheForm initial={base()} api={api} tutoriel={false} />);
    expect(screen.queryByRole("group", { name: "Remplir avec un exemple" })).toBeNull();
  });

  it("le texte saisi reste du texte ; langage courant ; pas de HTML venant d'un modèle", () => {
    const { container } = render(<FicheForm initial={full({ offre: "<img src=x onerror=alert(1)>" })} api={fake()} tutoriel />);
    suivant();
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByLabelText(/Ce que vous vendez/)).toHaveValue("<img src=x onerror=alert(1)>");
    expect(document.body.textContent).not.toMatch(/quota|token|expédition|agent|score/i);
  });

  it("carte de visite : aperçu en direct, mis à jour pendant la saisie", () => {
    render(<FicheForm initial={base()} api={fake()} tutoriel={false} />);
    const carte = screen.getByRole("complementary", { name: "Aperçu de votre carte de visite" });
    expect(within(carte).getAllByText("À remplir…").length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText(/Nom de votre entreprise/), { target: { value: "Verdoyant Services" } });
    expect(within(carte).getByText("Verdoyant Services")).toBeInTheDocument();
  });

  it("le niveau de complétion local progresse avec la saisie, sans dépendre de `fiche.complete`", () => {
    render(<FicheForm initial={base()} api={fake()} tutoriel={false} />);
    expect(screen.getByText(/Fiche à 0 % : le bot trouvera de meilleurs clients\./)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Nom de votre entreprise/), { target: { value: "Acme" } });
    expect(screen.getByText(/Fiche à 10 % : le bot trouvera de meilleurs clients\./)).toBeInTheDocument();
  });
});
