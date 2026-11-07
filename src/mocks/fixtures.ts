/**
 * Fixtures de la maquette (mode NEXT_PUBLIC_API_MODE=mock).
 * Données de contenu seulement : ni règle économique, ni calcul de score.
 * Valeurs de référence : docs/RULES.md et docs/MISSIONS.md. Les paiements et
 * scores des évaluations sont ECRITS ICI comme réponses rejouées du « serveur ».
 */
import type {
  AgentSection,
  CriterionView,
  DocumentView,
  EvaluatorCriterion,
  LeadPlan,
  RoleId,
} from "@/lib/api/types";

export const CONTRACT_VERSION = "0.1";
export const RULES_VERSION = "mock-rules-1";
export const INITIAL_BALANCE = 30;
export const MESSAGE_LIMIT = 5;
export const CLARIFICATION_MAX = 2;

export interface AgentFixture {
  role: RoleId;
  price: number;
  unlockedBy: string | null;
  label: string;
  section: AgentSection;
  /** Lieu (id de planète) et score minimum, comme le hangar du serveur. */
  unlock_planet: string | null;
  unlock_min_score: number | null;
  teaches: string;
}

export const AGENTS: AgentFixture[] = [
  { role: "scout", price: 0, unlockedBy: null, label: "Éclaireur", section: "prospection", unlock_planet: null, unlock_min_score: null, teaches: "Écrire une consigne claire pour trouver des prospects vérifiables." },
  { role: "triage", price: 35, unlockedBy: "m1", label: "Trieur de boîte", section: "clients", unlock_planet: "registre", unlock_min_score: 50, teaches: "Trier les messages reçus des prospects du carnet." },
  { role: "replier", price: 45, unlockedBy: "m2", label: "Rédacteur (fiche client, premier message, réponses)", section: "clients", unlock_planet: "carte-locale", unlock_min_score: 50, teaches: "Rédiger des brouillons de réponse, que vous relisez avant tout envoi." },
  { role: "ads", price: 50, unlockedBy: "m3", label: "Directeur de campagne", section: "pub", unlock_planet: "linkedin", unlock_min_score: 50, teaches: "Préparer des contenus de pub prêts à publier, sans rien publier." },
];

export interface MissionFixture {
  id: string;
  title: string;
  max_reward: number;
  unit_price: number;
  prevRequired: string | null;
  lockedReason: string;
  rescue?: boolean;
}

export const MISSIONS: MissionFixture[] = [
  { id: "m1", title: "M1 · Première commande pour un restaurant", max_reward: 20, unit_price: 0, prevRequired: null, lockedReason: "" },
  { id: "m2", title: "M2 · Choisir un prospect", max_reward: 30, unit_price: 1, prevRequired: "m1", lockedReason: "Réussissez d'abord la commande M1." },
  { id: "m3", title: "M3 · Clarifier une campagne incomplète", max_reward: 40, unit_price: 1, prevRequired: "m2", lockedReason: "Réussissez d'abord la commande M2." },
  { id: "m4", title: "M4 · Vérifier sources et chiffres", max_reward: 60, unit_price: 2, prevRequired: "m3", lockedReason: "Réussissez d'abord la commande M3." },
  { id: "m5", title: "M5 · Campagne composée", max_reward: 90, unit_price: 2, prevRequired: "m4", lockedReason: "Réussissez d'abord la commande M4." },
  { id: "m6", title: "M6 · Grand contrat final", max_reward: 150, unit_price: 3, prevRequired: "m5", lockedReason: "Réussissez d'abord la commande M5." },
  { id: "rescue", title: "Mission de secours · Petite annonce", max_reward: 10, unit_price: 0, prevRequired: null, lockedReason: "", rescue: true },
];

export interface AttemptFixture {
  brief: string;
  documents: DocumentView[];
  criteria: CriterionView[];
  replies: { message: string; artifact: string; known_facts: string[]; proposals: string[] }[];
  clarifications: { keywords: string[]; answer: string }[];
  hints: [string, string];
  evaluations: EvalFixture[];
}

export interface EvalFixture {
  score: number;
  passed: boolean;
  capped: boolean;
  ratings: EvaluatorCriterion[];
  client_feedback: string;
  next_action: string;
  coach_note: string;
}

const M1_CRITERIA: CriterionView[] = [
  { id: "price", label: "Prix exact de la formule", description: "Le prix de la formule est indiqué et correct.", weight: 25, essential: true },
  { id: "hours", label: "Jours et horaires", description: "Les horaires et les jours de service sont indiqués.", weight: 25, essential: true },
  { id: "target", label: "Cible : les étudiants", description: "Le texte s'adresse clairement aux étudiants.", weight: 20, essential: true },
  { id: "length", label: "80 mots maximum", description: "Le texte ne dépasse pas 80 mots.", weight: 20, essential: false },
  { id: "clarity", label: "Clarté du message", description: "Le texte est lisible et donne envie de venir.", weight: 10, essential: false },
];

export const M1: AttemptFixture = {
  brief:
    "Le restaurant **Chez Mina** lance une **formule déjeuner pour les étudiants**. La gérante vous demande le texte d'une publication pour annoncer cette formule.\n\n- Texte de **80 mots maximum**.\n- Utilisez uniquement les informations des documents fournis ou obtenues auprès du client.",
  documents: [
    {
      id: "doc_note",
      title: "Note de la gérante",
      date: "2025-03-04",
      content:
        "Formule déjeuner étudiants : **9,90 €**, boisson incluse. Servie **de 12 h à 14 h, du lundi au vendredi**. Merci de présenter la carte étudiante.",
    },
    {
      id: "doc_fiche",
      title: "Fiche du restaurant",
      date: "2025-02-18",
      content:
        "Chez Mina, cuisine maison. Adresse : 12 rue des Lilas, Exemplia (adresse fictive). Salle de 30 places, cuisine ouverte.",
    },
  ],
  criteria: M1_CRITERIA,
  replies: [
    {
      message:
        "Voici une première version. **Il me manque des informations** : le prix de la formule et les horaires ne figurent pas dans votre demande, je ne les ai donc pas inventés.",
      artifact:
        "Chez Mina vous propose sa formule déjeuner pensée pour les étudiants : un plat maison et une boisson incluse. Venez nous retrouver au 12 rue des Lilas !",
      known_facts: ["Boisson incluse", "Adresse : 12 rue des Lilas"],
      proposals: ["Ton chaleureux", "Invitation à venir sur place"],
    },
    {
      message:
        "Voici une version complète, avec le prix, les jours, les horaires et la cible. Elle compte 40 mots environ.",
      artifact:
        "**Formule déjeuner étudiants : 9,90 €** boisson incluse.\n\nChez Mina, du lundi au vendredi, de 12 h à 14 h, un plat maison pour les étudiants (carte étudiante demandée).\n\nRendez-vous au 12 rue des Lilas !",
      known_facts: ["Prix 9,90 €", "Lundi au vendredi, 12 h–14 h", "Carte étudiante demandée"],
      proposals: ["Mise en avant du prix en tête de texte"],
    },
    {
      message: "Version ajustée selon votre dernière consigne.",
      artifact:
        "**Formule déjeuner étudiants : 9,90 €**, boisson incluse.\n\nChez Mina, du lundi au vendredi de 12 h à 14 h : un plat maison, sur présentation de la carte étudiante.\n\n12 rue des Lilas. À midi, on vous attend !",
      known_facts: ["Prix 9,90 €", "Lundi au vendredi, 12 h–14 h"],
      proposals: ["Phrase de conclusion plus directe"],
    },
  ],
  clarifications: [
    { keywords: ["prix", "tarif", "coût", "cout", "combien"], answer: "La formule coûte 9,90 € avec une boisson incluse." },
    { keywords: ["horaire", "heure", "jour", "quand", "ouvert"], answer: "Elle est servie de 12 h à 14 h, du lundi au vendredi." },
    { keywords: ["adresse", "où", "ou ", "lieu"], answer: "L'adresse (fictive) est le 12 rue des Lilas, Exemplia." },
    { keywords: ["cible", "pour qui", "public", "client"], answer: "La formule vise les étudiants, sur présentation de leur carte." },
  ],
  hints: [
    "Indice 1 : relisez les documents. Quelles informations demandées par le client figurent déjà dans vos pièces ?",
    "Indice 2 : demandez-vous si votre consigne précise le prix, les jours et horaires, et à qui s'adresse le texte. L'agent ne peut pas deviner ce que vous ne dites pas.",
  ],
  evaluations: [
    {
      score: 65,
      passed: true,
      capped: false,
      ratings: [
        { id: "price", rating: 1, evidence: "9,90 €", comment: "Prix exact." },
        { id: "hours", rating: 0.8, evidence: "de 12 h à 14 h", comment: "Horaires présents ; les jours de service sont à préciser." },
        { id: "target", rating: 0.5, evidence: "pensée pour les étudiants", comment: "La cible est évoquée mais pas mise en avant." },
        { id: "length", rating: 0.5, evidence: "", comment: "Texte un peu long pour une publication." },
        { id: "clarity", rating: 0, evidence: "", comment: "Le message manque d'accroche." },
      ],
      client_feedback:
        "Le prix et les horaires sont bons. Il manque les jours d'ouverture et le texte pourrait s'adresser plus directement aux étudiants.",
      next_action: "Ajoutez « du lundi au vendredi » et parlez aux étudiants dès la première phrase.",
      coach_note:
        "L'écart sur les jours vient de la consigne : elle ne les citait pas. Précisez ce que le client attend avant d'envoyer.",
    },
    {
      score: 100,
      passed: true,
      capped: false,
      ratings: [
        { id: "price", rating: 1, evidence: "9,90 €", comment: "Prix exact." },
        { id: "hours", rating: 1, evidence: "du lundi au vendredi, de 12 h à 14 h", comment: "Jours et horaires complets." },
        { id: "target", rating: 1, evidence: "pour les étudiants", comment: "Cible claire." },
        { id: "length", rating: 1, evidence: "", comment: "Moins de 80 mots." },
        { id: "clarity", rating: 1, evidence: "", comment: "Message clair et direct." },
      ],
      client_feedback: "Parfait, j'envoie ce texte tel quel.",
      next_action: "Passez à la commande suivante.",
      coach_note: "Votre consigne contenait toutes les informations utiles : c'est ce qui fait la différence.",
    },
  ],
};

export const RESCUE: AttemptFixture = {
  brief:
    "Un salon de coiffure du quartier veut une **annonce d'une phrase** pour une promotion : **-10 %** sur la coupe le mardi.\n\nCette commande de secours est gratuite et rejouable.",
  documents: [
    {
      id: "doc_salon",
      title: "Message du salon",
      date: "2025-03-10",
      content: "Salon Éclat : -10 % sur la coupe chaque mardi, sur rendez-vous.",
    },
  ],
  criteria: [
    { id: "offer", label: "Offre exacte (-10 % le mardi)", description: "La promotion est correcte.", weight: 60, essential: true },
    { id: "clarity", label: "Une phrase claire", description: "Le texte tient en une phrase lisible.", weight: 40, essential: false },
  ],
  replies: [
    {
      message: "Voici une annonce d'une phrase.",
      artifact: "Chaque mardi, le salon Éclat vous offre 10 % de réduction sur la coupe, sur rendez-vous.",
      known_facts: ["-10 % le mardi", "Sur rendez-vous"],
      proposals: [],
    },
  ],
  clarifications: [{ keywords: ["rendez", "prix", "mardi"], answer: "La réduction est de 10 % sur la coupe, le mardi, sur rendez-vous." }],
  hints: [
    "Indice 1 : relisez le message du salon.",
    "Indice 2 : indiquez dans votre consigne la réduction, le jour et la condition.",
  ],
  evaluations: [
    {
      score: 80,
      passed: true,
      capped: false,
      ratings: [
        { id: "offer", rating: 1, evidence: "10 % de réduction sur la coupe", comment: "Offre exacte." },
        { id: "clarity", rating: 0.5, evidence: "", comment: "Un peu longue pour une seule phrase." },
      ],
      client_feedback: "L'offre est exacte. Raccourcissez légèrement.",
      next_action: "Rejouez la commande de secours si besoin de fonds.",
      coach_note: "Une phrase courte se lit mieux : demandez-le à l'agent.",
    },
  ],
};

export const TARGET_CHANGE = {
  reason: "Événement de démonstration : changement de cible demandé par la gérante.",
  brief:
    "Le restaurant **Chez Mina** lance une **formule déjeuner pour les étudiants et les jeunes actifs**. La gérante vous demande le texte d'une publication pour annoncer cette formule.\n\n- Texte de **80 mots maximum**.\n- Utilisez uniquement les informations des documents fournis ou obtenues auprès du client.",
  diff: [
    { type: "same" as const, text: "Le restaurant **Chez Mina** lance une **formule déjeuner pour les" },
    { type: "remove" as const, text: "étudiants**." },
    { type: "add" as const, text: "étudiants et les jeunes actifs**." },
    { type: "same" as const, text: "Texte de 80 mots maximum." },
  ],
};

export const LEAD_PLAN: LeadPlan & { extra_cost_max: number; roles_cost_max: Partial<Record<RoleId, number>> } = {
  steps: [
    { role: "replier", task: "Comparer les deux documents et relever les dates", source_ids: ["doc_note", "doc_fiche"] },
    { role: "scout", task: "Préparer la publication à partir de la comparaison", depends_on: 0 },
  ],
  summary: "Vérifier les sources puis rédiger la publication.",
  extra_cost_max: 4,
  roles_cost_max: { replier: 2, scout: 2 },
};
