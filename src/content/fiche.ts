/**
 * Textes et bornes de la page « Ma fiche entreprise et cible » (UI-H1, docs/PARCOURS-BOT.md §1).
 * Les bornes reprennent `data/profile/target_profile_v1.json` ; le serveur les revérifie toujours (il décide).
 * Français courant : pas de « agent », « quota », « token », « expédition », « score ».
 */

export const BORNES = {
  nom: 60,
  offre: 400,
  besoin: 300,
  secteurs: { max: 5, item: 60 },
  zone: { max: 5, item: 60 },
  fonctions: { max: 5, item: 60 },
  exclusions: { max: 10, item: 100 },
  taille: { min: 1, max: 100000 },
} as const;

export type Ton = "vouvoiement_formel" | "vouvoiement_chaleureux" | "tutoiement";
export const TON_DEFAUT: Ton = "vouvoiement_formel";
export const TONS: { id: Ton; label: string; exemple: string }[] = [
  { id: "vouvoiement_formel", label: "Vouvoiement formel", exemple: "Bonjour Madame, je me permets de vous écrire…" },
  { id: "vouvoiement_chaleureux", label: "Vouvoiement chaleureux", exemple: "Bonjour Madame, ravi de vous écrire…" },
  { id: "tutoiement", label: "Tutoiement", exemple: "Salut Claire, je t'écris car…" },
];

export const SECTEURS: { id: string; label: string }[] = [
  { id: "logiciel_services_numeriques", label: "Logiciels et services numériques" },
  { id: "industrie", label: "Industrie et fabrication" },
  { id: "batiment_travaux", label: "Bâtiment et travaux publics" },
  { id: "commerce_distribution", label: "Commerce et distribution" },
  { id: "restauration_hotellerie", label: "Restauration et hôtellerie" },
  { id: "transport_logistique", label: "Transport et logistique" },
  { id: "sante_social", label: "Santé et action sociale" },
  { id: "education_formation", label: "Éducation et formation" },
  { id: "immobilier", label: "Immobilier" },
  { id: "finance_assurance", label: "Finance et assurance" },
  { id: "conseil_services_entreprises", label: "Conseil et services aux entreprises" },
  { id: "energie_environnement", label: "Énergie et environnement" },
  { id: "agriculture_agroalimentaire", label: "Agriculture et agroalimentaire" },
  { id: "tourisme_loisirs", label: "Tourisme et loisirs" },
  { id: "communication_marketing", label: "Communication et marketing" },
  { id: "associations_collectivites", label: "Associations et collectivités" },
];

export const TEXTES = {
  title: "Ma fiche entreprise et cible",
  intro: "Cette fiche est la seule consigne du bot : il cherche des clients d'après ce que vous écrivez ici. Plus elle est précise, meilleurs sont les prospects.",
  consigne: "Décrivez une cible (des entreprises et des fonctions), pas des personnes.",
  requisLegende: "Les champs marqués « obligatoire » sont nécessaires pour que le bot puisse chercher.",
  obligatoire: "obligatoire",
  facultatif: "facultatif",
  version: (n: number) => `Version ${n} de votre fiche`,
  complete: "Fiche complète : le bot peut chercher.",
  incomplete: "Fiche incomplète : renseignez au moins ce que vous vendez, les secteurs visés et la zone.",
  save: "Enregistrer ma fiche",
  saving: "Enregistrement…",
  saved: (n: number) => `Fiche enregistrée (version ${n}).`,
  unchanged: "Aucun changement à enregistrer.",
  goSearch: "Aller chercher des clients",
  loading: "Chargement de votre fiche…",
  retry: "Réessayer",
  summary: "Certains champs sont à corriger avant l'enregistrement :",
  conflictTitle: "Votre fiche a changé ailleurs.",
  conflictText: "Une version plus récente existe. Rechargez-la pour la voir ; ce que vous avez saisi ici sera remplacé.",
  conflictReload: "Recharger la dernière version",
  reloaded: "La dernière version est chargée.",
  network: "Connexion perdue : rien n'a été enregistré. Vos saisies restent à l'écran, réessayez dans un instant.",
  unknown: "L'enregistrement n'a pas abouti. Vos saisies restent à l'écran, réessayez.",
  session: "Votre partie est introuvable : revenez à l'accueil.",
  texteSeul: "Ce que vous écrivez est lu comme du texte simple.",
} as const;

export const EXEMPLE = {
  legende: "Remplir avec un exemple",
  aide: "Mode Tutoriel : choisissez une entreprise fictive pour remplir la fiche d'un clic. Rien n'est enregistré avant « Enregistrer ma fiche ».",
  choix: "Entreprise d'exemple",
  placeholder: "Choisir un exemple…",
  bouton: "Remplir avec cet exemple",
  rempli: (nom: string) => `Exemple « ${nom} » chargé. Pensez à enregistrer.`,
} as const;

export const CHAMPS = {
  entreprise_nom: { label: "Nom de votre entreprise", aide: "Le nom qui apparaîtra dans vos premiers messages." },
  offre: { label: "Ce que vous vendez", aide: "En quelques phrases : votre produit ou service, et ce qui le rend intéressant (rapidité, prix, garantie…)." },
  besoin: { label: "Le problème que vous résolvez", aide: "Quel besoin ou quelle difficulté vos clients ont-ils avant de vous connaître ?" },
  cible_secteurs: { label: "Secteurs visés", aide: "Cochez les secteurs de vos clients idéaux (5 au maximum, avec ceux que vous ajoutez vous-même)." },
  secteurs_autres: { label: "Autres secteurs", aide: "Un secteur par ligne, si le vôtre n'est pas dans la liste." },
  cible_zone: { label: "Zone géographique", aide: "Une ville, un département ou une région par ligne (5 au maximum)." },
  cible_taille: { label: "Taille de l'entreprise visée", aide: "Nombre de salariés. Laissez vide si la taille n'a pas d'importance." },
  taille_min: { label: "Salariés au minimum" },
  taille_max: { label: "Salariés au maximum" },
  cible_fonctions: { label: "Personnes à contacter", aide: "Les fonctions à viser, une par ligne, par exemple « Directeur commercial » (5 au maximum)." },
  exclusions: { label: "Ce que vous ne voulez pas", aide: "Un critère par ligne : par exemple « Entreprises de plus de 500 salariés » (10 au maximum)." },
  ton: { label: "Façon de s'adresser aux prospects", aide: "Le ton des premiers messages proposés." },
} as const;

export const ERREURS = {
  requis: "Ce champ est obligatoire.",
  tropLong: (max: number) => `Trop long : ${max} caractères au maximum.`,
  tropDElements: (max: number) => `Trop d'éléments : ${max} au maximum.`,
  elementLong: (max: number) => `Une ligne dépasse ${max} caractères.`,
  taille: (min: number, max: number) => `Indiquez des nombres entiers entre ${min} et ${max}.`,
  tailleOrdre: "Le minimum ne peut pas dépasser le maximum.",
  tailleIncomplete: "Renseignez les deux valeurs, ou aucune.",
} as const;
