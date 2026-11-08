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
export const TONS: { id: Ton; label: string; exemple: string; icone: string }[] = [
  { id: "vouvoiement_formel", label: "Vouvoiement formel", exemple: "Bonjour Madame, je me permets de vous écrire…", icone: "🎩" },
  { id: "vouvoiement_chaleureux", label: "Vouvoiement chaleureux", exemple: "Bonjour Madame, ravi de vous écrire…", icone: "😊" },
  { id: "tutoiement", label: "Tutoiement", exemple: "Salut Claire, je t'écris car…", icone: "✌️" },
];

export const SECTEURS: { id: string; label: string; icone: string }[] = [
  { id: "logiciel_services_numeriques", label: "Logiciels et services numériques", icone: "💻" },
  { id: "industrie", label: "Industrie et fabrication", icone: "🏭" },
  { id: "batiment_travaux", label: "Bâtiment et travaux publics", icone: "🏗️" },
  { id: "commerce_distribution", label: "Commerce et distribution", icone: "🛒" },
  { id: "restauration_hotellerie", label: "Restauration et hôtellerie", icone: "🍽️" },
  { id: "transport_logistique", label: "Transport et logistique", icone: "🚚" },
  { id: "sante_social", label: "Santé et action sociale", icone: "🩺" },
  { id: "education_formation", label: "Éducation et formation", icone: "🎓" },
  { id: "immobilier", label: "Immobilier", icone: "🏠" },
  { id: "finance_assurance", label: "Finance et assurance", icone: "💰" },
  { id: "conseil_services_entreprises", label: "Conseil et services aux entreprises", icone: "💼" },
  { id: "energie_environnement", label: "Énergie et environnement", icone: "🌿" },
  { id: "agriculture_agroalimentaire", label: "Agriculture et agroalimentaire", icone: "🌾" },
  { id: "tourisme_loisirs", label: "Tourisme et loisirs", icone: "🧳" },
  { id: "communication_marketing", label: "Communication et marketing", icone: "📣" },
  { id: "associations_collectivites", label: "Associations et collectivités", icone: "🤝" },
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

/** Les 5 étapes de l'assistant (UI-H1 « esprit jeu ») : une question courte, un sous-ensemble de champs. */
export type EtapeId = "qui" | "vente" | "cible" | "zone" | "ton";
export const ETAPES: { id: EtapeId; titre: string; aide: string }[] = [
  { id: "qui", titre: "Qui êtes-vous ?", aide: "Le nom de votre entreprise, pour signer vos messages." },
  { id: "vente", titre: "Que vendez-vous ?", aide: "En une phrase : votre offre et le problème qu'elle résout." },
  { id: "cible", titre: "Qui cherchez-vous ?", aide: "Choisissez les secteurs, puis la taille et les fonctions visées." },
  { id: "zone", titre: "Où ?", aide: "Les villes, départements ou régions visés." },
  { id: "ton", titre: "Votre ton", aide: "Comment vos premiers messages s'adressent-ils aux prospects ?" },
];

export const ASSISTANT = {
  etape: (n: number, total: number) => `Étape ${n} sur ${total}`,
  precedent: "Précédent",
  suivant: "Suivant",
  carteVisite: "Aperçu de votre carte de visite",
  carteVisiteVide: "À remplir…",
  completion: (pct: number) => `Fiche à ${pct} % : le bot trouvera de meilleurs clients.`,
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
