# Règles de jeu (source de vérité serveur)

> **Cap prospection (2026-11-07).** Les mécanismes (économie, quotas, réservation/règlement, score, reprise, événements, limites) sont **GARDÉS**. Le contenu (agents, missions M1–M6, prix et gains du cahier) est **OBSOLÈTE** et remplacé par les planètes et le hangar de `PRODUIT-PROSPECTION.md`. Chaque section ci-dessous porte une étiquette : **[GARDÉ]**, **[ADAPTÉ]** (même mécanisme, nouveau vocabulaire ou nouvelles valeurs) ou **[OBSOLÈTE]**. Les valeurs « proposées » sont à écrire dans `data/rules/rules_v2.json` (versionné) ; tant que ce fichier n'existe pas, le code applique `rules_v1`.
>
> **6e décision (2026-11-08, `PARCOURS-BOT.md`).** Plus d'atelier : **ni score /100, ni paiement par expédition, ni reprise, ni livraison, ni clarifications, ni événements de marché, ni Constellation**. Les recherches du `scout` (action `scout_search`) sont **gratuites** ; la progression passe par le **nombre de clients obtenus**. Les sections ou paragraphes encore décrits ci-dessous et marqués **OBSOLÈTE (6e décision)** correspondent à du **code qui existe encore** : à retirer par le ticket **API-R2**, pas avant ; ne pas les étendre. Restent **GARDÉS** : monnaie, quotas des générations, réservation/règlement, idempotence, propriété de session, §8, §9, §11 à §14.

> Source d'origine : cahier des charges v1.1, §5, §6, §7, §10, §16. Toute valeur ci-dessous vit dans des **données versionnées** (`data/rules/`), jamais en dur dans le code. Le navigateur ne choisit jamais un solde, un score ou un droit.

## 1. Monnaie et départ **[GARDÉ]**
- Monnaie : « dollars de jeu » (entiers). Aucun lien avec les tokens réels.
- Capital initial : **30**, plus l'**éclaireur** (gratuit ; ex-« rédacteur »), dans les deux modes. Aucun salaire périodique (MVP).
- Solde disponible = solde comptabilisé − réservations actives.
- **Gain par client obtenu** *(IMPLÉMENTÉ, API-S4)* : un prospect qui **accepte** la démarche (statut `gagne`) rapporte `client_reward` $ (`rules_v2`, **20**), **une seule fois par prospect** (écriture de ledger de catégorie `client_reward`, source unique `client:<session>:<prospect>`, idempotente et atomique). Il se déclenche **uniquement** dans `PATCH /api/prospects/{id}` quand le statut passe à `gagne` (aucun autre chemin). **Garde-fou** : refus `409 INVALID_STATE` (« Ce prospect n'a pas encore répondu… ») si la conversation du prospect ne contient aucun message **reçu** (simulé en Tutoriel, importé en Réel), sauf prospect déjà payé. Repasser de `gagne` à un autre statut puis revenir **ne repaie pas** et ne baisse pas le compteur. Aucun autre gain n'existe (recherches et générations : 0 $).
- **Clients obtenus** : nombre de prospects **distincts déjà payés**, lu dans le ledger (pas le statut courant ; supprimer un prospect ne l'annule pas). Exposé par `GET /api/state` : `clients_obtained`. Il pilote le déblocage des agents (§2) et le niveau de l'immeuble (`VILLE-ET-BATIMENT.md` §4 : seuils `rules_v2.building.levels[].min_clients` = 0, 1, 2, 4, 7, 11, 16, 22, 30, 40 pour les niveaux 1 à 10 ; ne baisse jamais ; ne dépend ni du solde ni du total gagné).

## 2. Agents (achats uniques) **[OBSOLÈTE → remplacé]**
~~Rédacteur, prospecteur, chargé de veille, responsable qualité, analyste, chef d'équipe (prix 0 / 20 / 35 / 30 / 45 / 80).~~ Valeurs proposées pour le hangar (`rules_v2`) :

| Rôle | Id technique | Prix | Déblocage (`rules_v2.agents[].unlock_clients`) |
|---|---|---|---|
| Éclaireur (**seul bot de prospection**) | `scout` | 0 | Au lancement |
| Trieur de boîte | `triage` | 35 | **1 client obtenu** *(IMPLÉMENTÉ)* |
| Rédacteur (fiche client, premier message, réponses) | `replier` | 45 | **2 clients obtenus** *(IMPLÉMENTÉ)* |
| Directeur de campagne | `ads` | 50 | **3 clients obtenus** *(IMPLÉMENTÉ)* |
| Assistants (prospection, clients, pub) | `assistant_*` | 0 | Au lancement |

Achat possible seulement si **débloqué ET solde suffisant** : `ROLE_LOCKED` (message : « Obtenez 2 clients pour débloquer ce rédacteur »), puis `INSUFFICIENT_FUNDS`. L'état expose par rôle `unlock_clients`, `unlock_condition` (cette phrase ; `null` si disponible d'emblée), `clients_condition_waived` et `unlocked`.

**5e décision (2026-11-07)** : plus de `qualifier`, `profiler` ni `outreach`. Le tri (doublons, hors-cible, critères structurés) est fait **par code** sur le rapport du `scout`. `replier` travaille sur un prospect du carnet (fiche client, premier message : §11) et sur une conversation (réponses). `scout` travaille en **recherche** (`scout_search`). **Mode Réel : la condition de clients est levée** pour `triage`, `replier` et `ads` (`rules_v2.real_mode_waives_clients_unlock` ; seul le prix reste) ; en Tutoriel, elle s'applique.

Le chef d'équipe est **reporté en P2**. Unicité `(session, rôle)` **[GARDÉ]** : un double achat concurrent ne débite et ne crée qu'une fois (F07, T06). Changer les ids de rôles demande une migration de l'énumération `Role` (voir `BACKLOG.md`).

## 3. Lieux : déblocage, plus de gains **[REMPLACÉ, 6e décision]**
Un lieu (ex-planète) est **une source + une description + un corpus** ; **aucun gain, aucun tarif, aucune fiche de commanditaire**. Une recherche (`scout_search`) est **gratuite**.

| Lieu | Déblocage |
|---|---|
| 1. Annuaire | Au lancement |
| 2. Registre | Le lieu 1 a rapporté **≥ 3 prospects retenus** (`rules_v2`, valeur N = 3, décision Q3) |
| 3. Carte locale, 4. Réseau pro, 5. Signaux | Même règle sur le lieu précédent |

« Prospect retenu » = ajouté au carnet et non `hors_cible`. Agents : voir §2 (déblocage par nombre de clients obtenus, valeurs proposées). Une recherche **gratuite** reste soumise aux plafonds techniques de §8 (appels de source, budget tokens) et à un plafond par jour à définir.

> **OBSOLÈTE (6e décision), à retirer par API-R2** (le code `rules_v1`/`rules_v2` les contient encore) : le tableau des gains max et coûts par instruction (20/30/40/60/90/150 ; 0/1/1/2/2/3), la planète « Secours » (gain 10), la Constellation, et le tarif « figé à l'ouverture de la tentative » (`POST /api/missions/{id}/start`).

## 4. Quotas et coût d'une action **[GARDÉ]**
> **6e décision** : ce qui suit sur « tentative / expédition », « instruction (prompt) » et « client évaluateur » est **OBSOLÈTE** pour le `scout` (pas de prompt, pas de quota de 5 instructions, recherche gratuite). Le quota de **5 générations jamais 6** reste valable pour `replier`, `triage` et `ads` (§11, §13, §14). Le code des missions existe encore : retrait par **API-R2**.

- **Cinq instructions maximum par agent et par tentative (expédition).** Le 1er prompt et chaque correction comptent ; réponses et consultation d'historique ne comptent pas. Les **actions sur un prospect** (§11) ont leur propre clé de quota `(prospect, rôle)`, même plafond de 5, jamais 6.
- Coût = tarif de l'étape × nombre d'appels de rôles prévus. Le **maximum est affiché avant confirmation**.
- 5e message : l'agent répond ; la saisie se désactive ; édition manuelle et livraison restent possibles.
- **Erreur technique** : aucun débit, aucun message consommé si aucune réponse exploitable n'est enregistrée ; la réservation est libérée. Une réponse exploitable mais peu pertinente reste facturée.
- **Idempotence** : même `Idempotency-Key` ⇒ même `ActionRun`, aucun nouvel appel ni débit (double clic, reprise réseau).
- ~~**Clarifications au client** : 2 gratuites par tentative~~ : **OBSOLÈTE (6e décision)**, route à retirer par API-R2.
- Indices et carnet : gratuits. Réutiliser un prompt du carnet dans un envoi normal consomme un message.
- Édition manuelle : gratuite, crée une version enfant avec son auteur.
- ~~Plafond global : **36 appels modèle par tentative**, dont **2 réservés** à l'évaluation client~~ : **OBSOLÈTE (6e décision)**. Reste le principe : un plafond borné d'appels modèle par recherche (valeur à fixer, `API-S1`), réparations comprises.

### Délégation du chef d'équipe **[OBSOLÈTE pour le MVP, reporté en P2]**
> Le chef d'équipe n'existe pas dans les 4 rôles du hangar. Le code (BE04, `actions_lead.py`) et ses tests restent dans le dépôt, inutilisés, jusqu'à décision. Ne pas étendre.

1. Une instruction au chef consomme 1 de ses 5 messages et paie la préparation du plan.
2. Le plan contient **≤ 2 étapes**, des rôles possédés, des dépendances sans cycle, des pièces appartenant à la tentative.
3. Le joueur confirme séparément le plan et son surcoût (`POST /api/actions/{id}/confirm`), **sans nouvel appel de planification**.
4. Chaque délégation consomme un message du destinataire et son tarif.
5. Interdits : appel récursif chef→chef, appel vers le client, 3e délégation.
6. Résultat partiel : étapes réussies conservées, réservations inutilisées libérées, la reprise ne rejoue pas les étapes terminées.

### Réservation / règlement
Réserver montant + quota **atomiquement avant** l'appel ; débiter **uniquement** les réponses réussies, atomiquement après. Aucune transaction de base ouverte pendant l'attente réseau.

## 5. Score et paiement **[OBSOLÈTE (6e décision), à retirer par API-R2]**
> Remplacé par le **tri de pertinence sans points** (`correspond` / `a_verifier` / `hors_cible` + citation de la source : `PRODUIT-PROSPECTION.md` §7). Tout ce qui suit décrit le code actuel uniquement.

La mécanique (code d'abord, client IA pour le sémantique, plafond essentiel, paiement, reprise) est conservée. Seule la **grille** change : un score /100 unique, qui note **le prompt** (40) et **les résultats** (60), versionné par planète (détail et ids stables : `PRODUIT-PROSPECTION.md` §7).

| Critère (id stable) | Poids de référence | Contrôle |
|---|---|---|
| `p_objectif` — le but est clair | 10 | Client IA, citation littérale du prompt |
| `p_cible` — qui, où, taille, secteur | 10 | Code (mots-clés / champs) + client IA |
| `p_format` — nombre de leads, champs, ordre | 8 | Code |
| `p_exclusions` — ce qu'il ne faut pas | 6 | Client IA, citation littérale |
| `p_preuves` — sources et `source_ref` demandés | 6 | Code + client IA |
| `l_adequation` — leads conformes à la fiche cible | 25 | **Code** sur les données de la source |
| `l_existence` — `source_ref` réellement renvoyé par la planète | 15 | **Code** (essentiel) |
| `l_actionnable` — canal de contact exploitable | 10 | Code |
| `l_fraicheur` — donnée non périmée | 5 | Code |
| `l_unicite` — pas de doublon | 5 | Code |

> **Mise à jour 2026-11-08 (6e décision)** : le score /100, le paiement par expédition, la livraison et la reprise **disparaissent** avec l'atelier (`docs/PARCOURS-BOT.md`). Le tri de pertinence des prospects est une aide sans points. Cette section reste en vigueur **uniquement pour le moteur actuel** tant que le code n'est pas migré ; ne pas l'étendre.

*(Ancienne grille du cahier : 40/20/20/10/10 sur exactitude, contraintes, adéquation, clarté, sources — OBSOLÈTE.)* Les poids ci-dessus sont des **valeurs de départ à calibrer** (`OPEN-QUESTIONS.md`).

- Les formats et calculs sont vérifiés **par du code** ; le client IA ne juge que le sémantique et explique les écarts.
- Le serveur valide types et bornes (`rating ∈ [0,1]`, ids connus, preuve valide) puis calcule le **score /100**. Tout champ de récompense suggéré par le modèle est **ignoré**.
- Hors sujet ⇒ **0**. Critère essentiel non rempli ⇒ score **plafonné à 40**.
- Réussite : mission ordinaire **≥ 50** sans échec essentiel ; **finale ≥ 60** avec tous les essentiels.
- Paiement cible = `floor(gain_max × score / 100)` (ex. max 20 : 0→0, 65→13, 100→20).
- Une livraison fige texte + brief + grille ; son id et son empreinte empêchent les paiements répétés (T04).
- **Reprise** : nouvelle tentative avec ses compteurs ; paiement supplémentaire = `max(0, cible − meilleur paiement déjà acquis)` (13 → 17 crédite 4, T05).
- JSON d'évaluation invalide ou panne : **une seule** réparation ; sinon livraison `EVALUATING` récupérable, sans récompense inventée.
- Réputation = moyenne des meilleurs scores des missions terminées ; informative, aucun seuil caché.

## 6. Événements **[OBSOLÈTE (6e décision) : supprimés en v1, reprise en P2 (Q5)]**
> Pas d'événement de marché ni de changement de cible en v1 (pas de brief à versionner). Si des aléas reviennent en P2 (« une source est indisponible »), les règles de justice ci-dessous resteront un point de départ ; le code existant est retiré par API-R2.

Tout événement a un id, un point de déclenchement et crée une **nouvelle version du brief** (la fiche cible) avec diff affiché. Devenus des **événements de marché**. Les identifiants et planètes cités ci-dessous (M3–M6) sont **OBSOLÈTES** ; les règles de justice restent valables.

| Événement | Règle de justice |
|---|---|
| Changement de cible | Un seul message restant devient gratuit, **une fois par rôle concerné** ; le quota reste 5 (jamais 6). Déclenché assez tôt pour corriger. |
| Sources contradictoires | Dates et autorité des enregistrements permettent de trancher ou de signaler l'incertitude. |
| Budget réduit | Aucune dépense déjà confirmée n'est révoquée ; la nouvelle limite reste réalisable. |
| Contexte incomplet | Le joueur peut partager la pièce ou **briefer le commanditaire** (clarification). |

- ~~Finale (Constellation)~~ : supprimée.
- Le hasard ne détermine ni prix, ni récompenses, ni critères. Une **graine** enregistrée rend les variantes reproductibles.
- Mode Démo : le présentateur choisit un événement admissible avant livraison, sans changer note ni solde ; badge visible ; commandes cachées jamais actives en partie normale.

## 7. Fin de campagne **[OBSOLÈTE (6e décision)]**
> Plus de campagne à finir ni de Constellation : le jeu n'a pas de victoire notée, le résultat est le **nombre de clients obtenus** (statut `gagne` des prospects). Texte conservé comme trace jusqu'à API-R2.

- Constellation (ex-M6) : victoire = score ≥ 60, essentiels exacts, **dépense ≤ 30**, ≥ **2 rôles** ayant produit une contribution liée au rapport, sur **≥ 2 planètes**.
- Les planètes 1 à 5 sont réalisables avec le seul éclaireur ; la fin est atteignable sans acheter tous les agents (T12).
- Planète de secours : rejouable (nouveaux ids d'expédition), accessible sans argent (T11).

## 8. Limites techniques (configurables côté serveur) **[GARDÉ]**
| Sujet | Valeur initiale |
|---|---|
| Prompt joueur *(OBSOLÈTE pour le scout ; remplacé par la « précision » facultative de 300 caractères)* | 4 000 caractères |
| Sortie agent / client-évaluateur *(évaluateur OBSOLÈTE, 6e décision)* | 800 / 1 200 tokens |
| Timeout appel | 45 s, 1 nouvelle tentative technique max |
| Concurrence fournisseur | 5 appels simultanés |
| Budget tokens | Plafond partie + global ; seuil atteint ⇒ pause + sauvegarde, jamais de faux résultat ; réserve 60 M sur 300 M |
| **Sources réelles (mode Réel)** | Timeout, nombre d'appels par recherche, taille de réponse et limite de débit **par source**, fixés côté serveur ; au-delà ⇒ erreur stable, aucun débit |

## 9. Sources de données **[NOUVEAU]**
- Le **navigateur n'appelle jamais une source** : seules les routes de l'API le font, côté serveur, avec une **liste blanche** de sources et d'opérations (règle 2).
- Toute donnée venant d'une source ou d'un agent de planète est **non fiable** : rendu texte nettoyé, instructions contenues = données.
- Un lead n'est recevable que s'il porte un `source_ref` renvoyé **pendant cette recherche** ; la vérification est faite **par code** côté serveur.
- Aucune clé de source ni prompt système dans les erreurs, journaux ou réponses (règle 6). Les journaux de sources contiennent identifiants et durées, pas les contenus personnels.
- Mode Réel : données de contact traitées comme **données personnelles** (minimisation, rétention, suppression avec la partie, aucune action externe) — règles chiffrées en §12, cadre complet dans `PRODUIT-PROSPECTION.md` §14, points ouverts dans `OPEN-QUESTIONS.md`.
- L'**instantané** d'un enregistrement stocké avec un prospect ne contient que les champs d'une **liste blanche** (par source, dans `data/`) ; tout champ hors liste est écarté **avant stockage**.

## 10. Vérification
> **6e décision** : le calcul de contrôle ci-dessous (scores, gains, Constellation) est **OBSOLÈTE** (plus de gains d'expédition). À remplacer par des tests de `scout_search` (recherche vide, `source_ref` inventé rejeté, doublon, idempotence) et de déblocage par prospects retenus.

Les mécanismes sont couverts par les tests T02–T06, T09–T12 (voir `RECETTE.md`, à réaligner sur le nouveau contenu). Calcul de contrôle conservé : scores 80/70/70/70/70 sur les planètes 1 à 5 ⇒ 16+21+28+42+63 = **170** ; 30 + 170 − 30 (qualificateur) − 40 (analyste de fiche client) − 45 (rédacteur de premier message) − 30 (frais d'instructions illustratifs) = **55**. Les générations de fiches et de messages (§11) s'ajoutent aux dépenses (ex. 10 fiches × 3 $ + 10 messages × 2 $ = 50 $) : ~~la finale (dépense ≤ 30) ne compte~~ *(Constellation supprimée)* ; ne compte que les dépenses **d'expédition** ; les actions sur un prospect n'y entrent pas, pour que le produit réel ne pénalise pas la victoire.

## 11. Actions sur un prospect **[NOUVEAU]**
Le **carnet de prospection** (`PRODUIT-PROSPECTION.md` §12) est le produit ; la monnaie du jeu ne le prend **jamais en otage**.

| Action | Coût | Quota | Gain |
|---|---|---|---|
| Ajouter au carnet (par le serveur, à la fin d'une recherche), consulter, trier, filtrer, rechercher, annoter, changer de statut, marquer « contacté », **supprimer**, **exporter** (CSV, JSON complet) | **Gratuit, jamais refusé pour manque de fonds** | Aucun | Aucun |
| **Fiche client** (`prospect_profile`, rôle `replier`) | 3 $ par génération (valeur de départ) | **5 par (prospect, action)**, jamais 6 | **Aucun** |
| **Brouillon de premier message** (`prospect_message`, rôle `replier`) | 2 $ par génération (valeur de départ) | **5 par (prospect, action)**, jamais 6 | **Aucun** |

- Mécanisme **identique au moteur** : réservation + quota **avant** l'appel, règlement **après**, aucune transaction ouverte pendant l'appel, **aucun débit ni quota consommé sans réponse exploitable**, `Idempotency-Key` (même clé ⇒ même résultat, même clé avec un autre corps ⇒ refus), coût maximal affiché avant l'envoi. Les écritures du ledger portent l'`id` du prospect, **jamais** son contenu.
- Toute mutation du carnet (`POST`, `PATCH`, `DELETE`, actions) porte une `Idempotency-Key` ; `PATCH` utilise la `version` du prospect (`VERSION_CONFLICT` si périmée).
- **Aucun gain** sur ces actions (anti-exploitation : régénérer ne doit jamais enrichir). Les contrôles par code (`PRODUIT-PROSPECTION.md` §13) donnent une liste de réussites, pas un paiement.
- Appel modèle, budget tokens et plafonds de §8 : ces appels **comptent** dans le budget global.
- Contrôle d'accès : un prospect n'est lisible et modifiable que par **la session propriétaire** (réponse identique à « introuvable » sinon, règle 6).
- Valeurs dans `data/rules/rules_v2.json`, par exemple : `prospect_actions` (coût et quota par rôle), `limits.prospects_max` = 500, `limits.notes_max_chars` = 2 000, `limits.player_instruction_max_chars` = 500, `limits.draft_max_chars` = 800, `followup_days` (« à relancer »).

## 12. Données du mode Réel **[NOUVEAU]**
Règles chiffrées ; le cadre complet est dans `PRODUIT-PROSPECTION.md` §14 (à valider juridiquement).
- **B2B uniquement** ; liste blanche de champs conservés (§9) ; données sensibles interdites.
- **Rétention** : `retention_days` = **180 jours d'inactivité** (`derniere_activite_le`), rappel `retention_notice_days` = **30 jours** avant ; l'action « Conserver » remet le compteur à zéro ; purge automatique ensuite, journalisée **sans contenu** ; l'horloge est **injectable** dans les tests.
- **Suppression en cascade** : un prospect emporte sa fiche, ses brouillons et son instantané ; supprimer la partie purge tout (aucune ligne orpheline) ; la suppression est **idempotente**.
- **Export** : CSV du carnet (neutralisation des formules, `PRODUIT-PROSPECTION.md` §12) et **JSON complet** de la partie, propriété de session vérifiée.
- **Journaux** : aucun nom, contact, note ni instantané ; seulement ids, compteurs, durées.
- **LLM** : jamais de valeur d'email ou de téléphone, jamais les notes du joueur au MVP.
- **Aucune action externe automatique** (invitation, CRM, publication) : le brouillon est copié par le joueur. **Seule exception** (décision du 2026-11-07, 3e) : en mode Réel, l'**envoi d'un email confirmé par le joueur** depuis sa boîte connectée (§13).

## 13. Clients : messagerie **[NOUVEAU]**
Référence produit : `PRODUIT-CLIENTS-PUB.md` §3 et §4. Valeurs dans `data/rules/rules_v2.json`.

| Action | Coût | Quota | Gain |
|---|---|---|---|
| Créer une conversation, consulter, annoter, **envoyer** (Réel, confirmé), **recevoir/actualiser**, **exporter**, **supprimer** | **Gratuit, jamais refusé pour manque de fonds** | Plafonds d'**envoi** seulement (ci-dessous) | Aucun |
| **Synthèse** (`triage`) | 1 $ par génération (valeur de départ) | **5 par (conversation, rôle)**, jamais 6 | **Aucun** |
| **Brouillon de réponse** (`replier`) | 2 $ par génération (valeur de départ) | **5 par (conversation, rôle)**, jamais 6 | **Aucun** |
| Tour du **client simulé** (Tutoriel) | À la charge de la plateforme (budget §8) | **6 tours** par conversation (`messaging.sim_turns_max`) | Aucun |

- Mécanisme **identique au moteur** : réservation + quota avant l'appel, règlement après, aucune transaction ouverte pendant l'appel, aucun débit ni quota consommé sans réponse exploitable, `Idempotency-Key`, coût maximal affiché avant l'envoi, ledger sans contenu.
- **Aucun outil d'envoi pour un agent.** L'envoi réel est une route **réservée au joueur** (`POST /api/conversations/{id}/send`), qui exige : mode Réel, boîte connectée, `confirm: true`, **version de brouillon existante** (le serveur envoie le texte **figé** de cette version), destinataire = **adresse du prospect stockée par le serveur**, aucun autre destinataire ni copie.
- **Garde-fous d'envoi** : prospect non `ecarte` et non désinscrit (`OPTED_OUT`) ; contrôles par code du brouillon **repassés** à l'envoi ; plafonds `messaging.send_per_day` (20), `messaging.send_per_hour` (5), un seul envoi par conversation et par 24 h sans réponse du client (`SEND_LIMIT`) ; idempotence stricte (un clic = un envoi) ; échec fournisseur ⇒ `NON_ENVOYE`, aucun renvoi automatique.
- **Réception** : seuls les messages dont l'expéditeur correspond **exactement** à un prospect du carnet ayant une conversation sont importés ; les autres sont **ignorés sans stockage**. Texte brut seulement, pièces jointes ignorées, longueur ≤ `messaging.inbound_max_chars` (4 000). Import idempotent (identifiant de message du fournisseur).
- **Désinscription** : détectée **par code** (mots-clés de `data/clients/optout_keywords.json`) **ou** par le modèle ; le code l'emporte. Effet : prospect `ecarte`, envoi verrouillé, bandeau au joueur.
- **Jetons de messagerie** : chiffrés au repos, jamais renvoyés au navigateur ni journalisés ; déconnexion = révocation chez le fournisseur + suppression ; **une boîte par partie**.
- **Données** : le **modèle ne reçoit jamais une adresse ni un numéro** ; le texte reçu est une **donnée délimitée** (règle 3) ; journaux sans contenu ni adresse ; rétention et suppression en cascade comme le carnet (§12) ; export JSON de la partie incluant les conversations.
- **Client simulé** : persona tirée de `data/clients/` avec la graine de la partie ; réponse produite **à la demande** (jamais par minuteur) ; le **résultat de conversation** (objectif de la persona atteint ou non) est **calculé par code**, jamais par le modèle ; aucun gain en $.
- Contrôle d'accès : une conversation n'est lisible que par la session propriétaire (réponse identique à « introuvable » sinon, règle 6).
- Valeurs dans `rules_v2` : `messaging.send_per_day`, `messaging.send_per_hour`, `messaging.send_cooldown_hours` (24), `messaging.inbound_max_chars`, `messaging.sim_turns_max`, `messaging.reply_max_chars` (1 200), `prospect_actions.triage`, `prospect_actions.replier` (coût et quota).

## 14. Pub : agent publicitaire **[NOUVEAU]**
Référence produit : `PRODUIT-CLIENTS-PUB.md` §5.

| Action | Coût | Quota | Gain |
|---|---|---|---|
| Créer, consulter, modifier, **exporter** (Markdown), **supprimer** une campagne, copier le kit | **Gratuit, jamais refusé pour manque de fonds** | Aucun | Aucun |
| **Génération d'un kit** (`ads`) | 4 $ par génération (valeur de départ) | **5 par (campagne, rôle)**, jamais 6 | **Aucun** |

- Mécanisme identique au moteur (voir §13). Les kits sont des **versions immuables** ; l'édition du joueur crée une version enfant avec son auteur.
- **Aucune publication, aucune connexion à une plateforme publicitaire, aucune dépense réelle.** Le `budget_indicatif` est un **texte de plan** : il ne touche jamais la monnaie du jeu ni un budget réel.
- **Contrôles par code** (liste de réussites, sans paiement) : sections présentes et bornées ; **limites de caractères par format** lues dans `data/ads/formats.json` ; aucun fait, chiffre, pourcentage, prix, date, témoignage ou label absent de la fiche entreprise ; aucune URL ni numéro absent des données ; aucune cible nominative ni particulier ; `a_verifier` non vide si un fait manque. Un contrôle essentiel en échec ⇒ `INVALID_OUTPUT` (une réparation, puis échec sans débit).
- **Règle 3** : la fiche entreprise est une donnée délimitée ; une consigne cachée dans l'offre est ignorée. Sorties rendues en texte nettoyé, sans lien cliquable produit par le modèle.
- Valeurs dans `rules_v2` : `prospect_actions.ads` (coût et quota), `limits.campaigns_max` (20), `limits.campaign_name_max_chars` (80), `limits.campaign_instruction_max_chars` (500). Les actions `triage`, `replier` et `ads` **n'entrent pas** dans la dépense de la finale (§10).
