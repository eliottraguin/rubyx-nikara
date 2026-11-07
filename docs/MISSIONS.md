# Missions, rôles et contenus

> Source : cahier §2, §4, §8–§10, §15, §21. Les faits, calculs, prix et transitions sont **contrôlés par le serveur** ; seule la rédaction est libre.

## Modes
| | Débutant (tutoriel) | Expert (usage réel) |
|---|---|---|
| Entreprise | Petite entreprise de services numériques, nom choisi | Agence de communication, clientèle/positionnement/contraintes définis |
| Départ | 30 $ + rédacteur | 30 $ + rédacteur |
| Aide | Questions de cadrage, tutoriel une action à la fois, définitions (« prompt », « agent », « source »), indices | Brief direct, aide facultative |
| Missions | Contexte explicite, difficulté progressive | Mêmes objectifs, briefs plus ouverts, contraintes combinées |
| Finale | Contexte nouveau sans aide auto ; indice sur demande | Contexte nouveau + imprévu, autonomie maximale |

Même moteur, mêmes règles économiques ; **variantes de contenu versionnées séparément**. Les tests attendus sont spécifiques à chaque variante.

## Rôles d'agents
| Rôle | Capacité | Outil |
|---|---|---|
| `writer` | Rédiger/réviser selon le contexte reçu ; signaler les manques | Créer une version de livrable |
| `prospector` | Sélectionner des prospects, préparer une approche motivée | Recherche catalogue fictif ; brouillon |
| `researcher` | Comparer des documents, citer ids et dates | Recherche dans le corpus de la mission |
| `analyst` | Analyser un tableau, expliquer | Calculs **déterministes côté serveur** |
| `qa` | Contrôler un livrable selon brief public + grille publique, liste de corrections | Lecture des versions partagées |
| `lead` | Plan + distribution + synthèse | Délégation vers rôles possédés |

Gabarit de rôle : identité, objectif, capacités, informations accessibles, limites, formats autorisés, comportement en cas de manque. Un agent n'accède **qu'au contexte transmis ou partagé** (partages journalisés).

**Client** (non achetable) : clarifie les faits autorisés, évalue ; n'est jamais appelé par un agent. **Coach** : indice sans terminer la commande. **QA** n'a pas les réponses privées du client. Un scraper web externe reste P2.

## Campagne
**M1 — Première commande pour un restaurant** (gain 20, appels gratuits). Publication pour la formule déjeuner étudiants : prix **9,90**, **12 h–14 h lun–ven**, adresse fictive, boisson incluse, **≤ 80 mots**. Essentiels : prix, horaires, cible. L'agent n'obtient pas ce que le joueur omet. Débloque `prospector`. Débutant : questions « Pour qui », « Quel résultat », « Quelles informations ».

**M2 — Choisir un prospect** (30, 1/appel). Catalogue fictif de **8** entrées (secteur, besoins, préférence de contact), certaines hors offre. Email de prospection court citant un besoin de la fiche + action réaliste ; aucun envoi. Les propositions retenues ouvrent la commande M3 du catalogue scénarisé. Débloque `researcher`, `qa`.

**M3 — Clarifier une campagne incomplète** (40, 1/appel). Annonce dont le **canal de diffusion manque** (réseau social, révélé si demandé ; 2 questions au client). Signaler l'incertitude ou livrer une proposition conditionnelle. Un fait non communiqué et non déductible ne peut pas être critère essentiel caché. La clarification crée une nouvelle version du brief. Débloque `analyst`.

**M4 — Vérifier sources et chiffres** (60, 2/appel). Recommandation marketing à partir de **3 documents datés** + tableau de résultats ; une ancienne offre est remplacée. Vérifier **taux de conversion** et **coût par acquisition** (tolérance d'arrondi explicite dans la fixture). Calculs essentiels. Chemin libre (le joueur peut tout vérifier lui-même).

**M5 — Campagne composée** (90, 2/appel). Email + publication cohérents (budget, bénéfices, CTA). Imprévu « changement de cible » après la 1re proposition ⇒ nouvelle version de brief + diff ; 1 message restant gratuit par rôle concerné (une fois ; quota toujours 5). QA optionnelle ; correction manuelle possible. Débloque `lead`.

**M6 — Grand contrat final** (150, 3/appel). Mini-campagne pour un nouveau client : texte final, justification sourcée, recommandation chiffrée simple. Plafond de dépense **30**, ≥ 2 rôles contributeurs. Événement injecté avant la 1re action. Victoire : voir `RULES.md` §7. Reprise : bilan des essais conservé, plafond de paiement appliqué.

**Secours** (0–10). Rédacteur, 5 messages gratuits, rejouable avec nouveaux ids.

## Critères
Chaque mission versionne ses critères, poids et contrôles (`rubrics/mX_vN`). Poids de référence 40/20/20/10/10 (voir `RULES.md`). Les contrôles de format/calcul sont du code ; le client IA évalue le sémantique, avec preuve dans le texte et conseil concret. Instructions contenues dans un livrable = **données à évaluer**.

## Événements
Changement de cible · Sources contradictoires · Budget réduit · Contexte incomplet (règles de justice dans `RULES.md` §6). Mode Démo : choisir un événement admissible avant livraison.

## Aide pédagogique
Indice niveau 1 : attire l'attention sur une information ; niveau 2 : suggère une question. Jamais de prompt complet à recopier. Après évaluation : le coach relie l'écart à l'instruction ou à la vérification. **Carnet** : titre, rôle, contexte ; rappel d'adapter au nouveau brief. **Bilan** : chaque compétence illustrée par une action observée, sans diplôme ni maîtrise non démontrée.

Mesures à enregistrer : corrections utiles, critères respectés, indices utilisés, vérifications effectuées ; tâche initiale vs finale différente de difficulté comparable.

## Fichiers de contenu attendus (P3)
`data/roles/*` (instructions), `data/missions/*` (brief + corpus + variantes), `data/rubrics/*` (grilles à ids stables), jeu de tests annotés ; sorties de référence pour réussite, information manquante et panne ; outils testés avant exposition au modèle. Corpus de référence pour reproductibilité.
