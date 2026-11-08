/**
 * Fixtures de la maquette (mode NEXT_PUBLIC_API_MODE=mock).
 * Données de contenu seulement : ni règle économique ni score. Le parcours « commande, atelier, livraison » est retiré
 * (6e décision) ; la recherche du bot (API-S1, UI-S1) n'existe pas encore, la maquette ne la simule donc pas.
 */
import type { AgentSection, RoleId } from "@/lib/api/types";

export const CONTRACT_VERSION = "0.1";
export const RULES_VERSION = "mock-rules-1";
export const INITIAL_BALANCE = 30;

export interface AgentFixture {
  role: RoleId;
  price: number;
  label: string;
  section: AgentSection;
  /** Nombre de clients obtenus qui débloque le rôle, comme le hangar du serveur. */
  unlock_clients: number | null;
  teaches: string;
}

export const AGENTS: AgentFixture[] = [
  { role: "scout", price: 0, label: "Éclaireur", section: "prospection", unlock_clients: null, teaches: "Chercher des prospects vérifiables à partir de votre fiche entreprise et cible." },
  { role: "triage", price: 35, label: "Trieur de boîte", section: "clients", unlock_clients: 1, teaches: "Trier les messages reçus des prospects du carnet." },
  { role: "replier", price: 45, label: "Rédacteur (fiche client, premier message, réponses)", section: "clients", unlock_clients: 2, teaches: "Rédiger des brouillons de réponse, que vous relisez avant tout envoi." },
  { role: "ads", price: 50, label: "Directeur de campagne", section: "pub", unlock_clients: 3, teaches: "Préparer des contenus de pub prêts à publier, sans rien publier." },
];

export interface PlaceFixture {
  /** Identifiant technique du lieu (`annuaire`, `registre`…). */
  id: string;
  label: string;
  /** Lieu à qui il faut d'abord faire rapporter des prospects pour ouvrir celui-ci (null : ouvert d'emblée). */
  prev: string | null;
}

/** Les lieux de la ville dans l'ordre de la carte (la règle d'ouverture est celle du serveur, en maquette). */
export const PLACES: PlaceFixture[] = [
  { id: "annuaire", label: "Annuaire", prev: null },
  { id: "registre", label: "Registre", prev: "annuaire" },
  { id: "carte-locale", label: "Carte locale", prev: "registre" },
  { id: "linkedin", label: "LinkedIn", prev: "carte-locale" },
  { id: "glassdoor", label: "Glassdoor", prev: "linkedin" },
  { id: "constellation", label: "Constellation", prev: "glassdoor" },
];
