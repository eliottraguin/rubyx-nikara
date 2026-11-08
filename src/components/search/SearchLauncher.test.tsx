import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildMapViewModel } from "@/game/map/viewmodel";
import { SearchError, type SearchProspect, type SearchResult, type SearchesApi } from "@/lib/api/searches";
import { SearchLauncher } from "./SearchLauncher";
import { useSearch } from "./useSearch";
import { useTips } from "./useTips";

const planets = buildMapViewModel(null).planets; // maquette : Annuaire ouvert, les autres verrouillés

const prospect = (id: string, pertinence: SearchProspect["pertinence"], over: Partial<SearchProspect> = {}): SearchProspect => ({
  id, entreprise: `Ent ${id}`, fonction: null, source: "annuaire", sourceRef: id, pertinence, citation: `« citation ${id} »`, aVerifier: [], raisons: [], simule: true, ...over,
});
const result = (added: SearchProspect[], over: Partial<SearchResult> = {}): SearchResult => ({ id: "s1", planetId: "annuaire", precision: null, added, alreadyPresent: 0, rejected: 0, horsCible: 0, ...over });

function fakeApi(run: SearchesApi["run"], contact: SearchesApi["contact"] = async () => ({ conversationId: "conv_1" })): SearchesApi {
  return { run, contact };
}

function Harness({ api, planetId, tutoriel = true, onConversation = () => {}, onStart, onEnd }: { api: SearchesApi; planetId?: string; tutoriel?: boolean; onConversation?: (id: string) => void; onStart?: () => string | undefined; onEnd?: (t: string | undefined, ok: boolean) => void }) {
  const search = useSearch({ api, onStart, onEnd });
  const tips = useTips(tutoriel);
  return <SearchLauncher planets={planets} controller={search} tips={tips} planetId={planetId} onOpenConversation={onConversation} />;
}

beforeEach(() => window.localStorage.clear());

describe("recherche du bot : états", () => {
  it("le bouton, le champ facultatif et la gratuité sont présents, au clavier", () => {
    render(<Harness api={fakeApi(async () => result([]))} planetId="annuaire" />);
    const btn = screen.getByRole("button", { name: "Chercher des clients ici" });
    expect(btn).toBeEnabled();
    const field = screen.getByLabelText(/Une précision/);
    expect(field).toHaveAttribute("maxlength", "300");
    expect(field).toHaveAccessibleDescription(/0\/300 caractères/);
    expect(screen.getByText("La recherche est gratuite.")).toBeInTheDocument();
  });

  it("en route, puis revenu avec le nombre de prospects ajoutés ; la précision est envoyée telle quelle", async () => {
    let finish!: (r: SearchResult) => void;
    const run = vi.fn((_i: unknown, o?: { onStarted?: () => void }) => {
      o?.onStarted?.();
      return new Promise<SearchResult>((res) => (finish = res));
    });
    const onStart = vi.fn(() => "trip-1");
    const onEnd = vi.fn();
    render(<Harness api={fakeApi(run as SearchesApi["run"])} planetId="annuaire" onStart={onStart} onEnd={onEnd} />);
    fireEvent.change(screen.getByLabelText(/Une précision/), { target: { value: "plutôt le centre" } });
    fireEvent.click(screen.getByRole("button", { name: "Chercher des clients ici" }));
    expect(await screen.findByText("Le bot est en route…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Recherche en cours…" })).toBeDisabled();
    expect(run.mock.calls[0]![0]).toEqual({ planetId: "annuaire", precision: "plutôt le centre" });
    expect(onStart).toHaveBeenCalledWith("annuaire");
    finish(result([prospect("a", "correspond"), prospect("b", "a_verifier")]));
    expect(await screen.findByRole("heading", { name: "Le bot est revenu : 2 prospects ajoutés à votre carnet." })).toBeInTheDocument();
    expect(onEnd).toHaveBeenCalledWith("trip-1", true);
    expect(screen.getByRole("button", { name: "Chercher des clients ici" })).toBeEnabled();
  });

  it("rien trouvé : phrase d'orientation, pas d'erreur", async () => {
    render(<Harness api={fakeApi(async () => result([]))} planetId="annuaire" />);
    fireEvent.click(screen.getByRole("button", { name: "Chercher des clients ici" }));
    expect(await screen.findByRole("heading", { name: "Rien ne correspond cette fois, essayez un autre lieu ou précisez votre cible." })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("lieu verrouillé : phrase simple, bouton inactif, aucun mot technique", () => {
    render(<Harness api={fakeApi(async () => result([]))} planetId="registre" />);
    expect(screen.getByText("Il faut d'abord trouver 3 prospects pertinents à la Bibliothèque publique.")).toBeInTheDocument();
    const btn = screen.getByRole("button", { name: "Chercher des clients ici" });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAccessibleDescription(/Il faut d'abord/);
    expect(document.body.textContent).not.toMatch(/quota|token|expédition|agent/i);
  });

  it("fiche incomplète : message qui parle de la fiche, sans code", async () => {
    const run = vi.fn(async () => {
      throw new SearchError("PROFILE_INCOMPLETE", "x", 422);
    });
    render(<Harness api={fakeApi(run)} planetId="annuaire" />);
    fireEvent.click(screen.getByRole("button", { name: "Chercher des clients ici" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Votre fiche est incomplète.");
    expect(alert).toHaveTextContent(/fiche entreprise et cible/);
    expect(alert).not.toHaveTextContent("PROFILE_INCOMPLETE");
    expect(screen.getByRole("button", { name: "Chercher des clients ici" })).toBeEnabled();
  });

  it("erreur réseau après le départ : le bot tombe en panne (onEnd ok=false), on peut réessayer", async () => {
    const run = vi.fn(async (_i: unknown, o?: { onStarted?: () => void }) => {
      o?.onStarted?.();
      throw new SearchError("LLM_UNAVAILABLE");
    });
    const onEnd = vi.fn();
    render(<Harness api={fakeApi(run as SearchesApi["run"])} planetId="annuaire" onStart={() => "t"} onEnd={onEnd} />);
    fireEvent.click(screen.getByRole("button", { name: "Chercher des clients ici" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Le bot n'a pas pu partir.");
    expect(onEnd).toHaveBeenCalledWith("t", false);
  });

  it("dans l'immeuble : liste des lieux, lieu fermé signalé, bouton « Lancer une recherche »", () => {
    render(<Harness api={fakeApi(async () => result([]))} />);
    const select = screen.getByLabelText(/Lieu de la recherche/);
    expect(select).toBeInTheDocument();
    expect(screen.getAllByRole("option").some((o) => /pas encore ouvert/.test(o.textContent ?? ""))).toBe(true);
  });
});

describe("résultat et contact", () => {
  const two = result([prospect("a", "correspond"), prospect("b", "hors_cible"), prospect("c", "a_verifier", { aVerifier: ["taille"], citation: null })]);

  it("étiquettes en texte et citation de la source ; lien vers le carnet", async () => {
    render(<Harness api={fakeApi(async () => two)} planetId="annuaire" />);
    fireEvent.click(screen.getByRole("button", { name: "Chercher des clients ici" }));
    const list = within(await screen.findByRole("list", { name: "Ce que le bot a trouvé" }));
    expect(list.getByText(/Correspond/)).toBeInTheDocument();
    expect(list.getByText(/Hors cible/)).toBeInTheDocument();
    expect(list.getByText(/^À vérifier$/)).toBeInTheDocument();
    expect(screen.getByText(/« citation a »/)).toBeInTheDocument();
    expect(screen.getByText(/Pas de citation de la source/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ouvrir mon carnet" })).toHaveAttribute("href", "/immeuble?etage=archives");
  });

  it("« Contacter » appelle l'API puis ouvre la conversation", async () => {
    const contact = vi.fn(async () => ({ conversationId: "conv_9" }));
    const open = vi.fn();
    render(<Harness api={fakeApi(async () => two, contact)} planetId="annuaire" onConversation={open} />);
    fireEvent.click(screen.getByRole("button", { name: "Chercher des clients ici" }));
    fireEvent.click(await screen.findByRole("button", { name: "Contacter Ent a" }));
    await waitFor(() => expect(open).toHaveBeenCalledWith("conv_9"));
    expect(contact).toHaveBeenCalledWith("a");
  });

  it.each(["NOT_IMPLEMENTED", "NOT_FOUND"] as const)("contact indisponible (%s) : phrase claire, rien ne s'ouvre", async (code) => {
    const open = vi.fn();
    const contact = async () => {
      throw new SearchError(code, "x", code === "NOT_FOUND" ? 404 : 501);
    };
    render(<Harness api={fakeApi(async () => two, contact)} planetId="annuaire" onConversation={open} />);
    fireEvent.click(screen.getByRole("button", { name: "Chercher des clients ici" }));
    fireEvent.click(await screen.findByRole("button", { name: "Contacter Ent a" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("La conversation n'est pas encore disponible pour ce prospect.");
    expect(open).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Contacter Ent a" })).toBeEnabled();
  });
});

describe("bulles d'aide du Tutoriel", () => {
  const api = () => fakeApi(async () => result([prospect("a", "correspond")]));

  it("une bulle par étape : cible, puis résultat, puis contact", async () => {
    render(<Harness api={api()} planetId="annuaire" />);
    expect(screen.getByRole("note", { name: /Voici votre cible/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Chercher des clients ici" }));
    expect(await screen.findByRole("note", { name: /Voici ce que le bot a trouvé/ })).toBeInTheDocument();
    expect(screen.queryByRole("note", { name: /Contactez-en un/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Compris" }));
    expect(screen.getByRole("note", { name: /Contactez-en un/ })).toBeInTheDocument();
  });

  it("désactivables, et le choix est gardé ; réactivables", () => {
    const { unmount } = render(<Harness api={api()} planetId="annuaire" />);
    fireEvent.click(screen.getByRole("button", { name: "Ne plus afficher les bulles d'aide" }));
    expect(screen.queryByRole("note", { name: /Voici votre cible/ })).toBeNull();
    unmount();
    render(<Harness api={api()} planetId="annuaire" />);
    expect(screen.queryByRole("note", { name: /Voici votre cible/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Réafficher les bulles d'aide" }));
    expect(screen.getByRole("note", { name: /Voici votre cible/ })).toBeInTheDocument();
  });

  it("absentes en mode Réel", () => {
    render(<Harness api={api()} planetId="annuaire" tutoriel={false} />);
    expect(screen.queryByRole("note", { name: /Voici votre cible/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Réafficher les bulles d'aide" })).toBeNull();
  });
});
