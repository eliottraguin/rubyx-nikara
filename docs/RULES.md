# Règles de jeu (source de vérité serveur)

> **Cap prospection (2026-11-07).** Les mécanismes (économie, quotas, réservation/règlement, score, reprise, événements, limites) sont **GARDÉS**. Le contenu (agents, missions M1–M6, prix et gains du cahier) est **OBSOLÈTE** et remplacé par les planètes et le hangar de `PRODUIT-PROSPECTION.md`. Chaque section ci-dessous porte une étiquette : **[GARDÉ]**, **[ADAPTÉ]** (même mécanisme, nouveau vocabulaire ou nouvelles valeurs) ou **[OBSOLÈTE]**. Les valeurs « proposées » sont à écrire dans `data/rules/rules_v2.json` (versionné) ; tant que ce fichier n'existe pas, le code applique `rules_v1`.
>
> Source d'origine : cahier des charges v1.1, §5, §6, §7, §10, §16. Toute valeur ci-dessous vit dans des **données versionnées** (`data/rules/`), jamais en dur dans le code. Le navigateur ne choisit jamais un solde, un score ou un droit.

## 1. Monnaie et départ **[GARDÉ]**
- Monnaie : « dollars de jeu » (entiers). Aucun lien avec les tokens réels.
- Capital initial : **30**, plus l'**éclaireur** (gratuit ; ex-« rédacteur »), dans les deux modes. Aucun salaire périodique (MVP).
- Solde disponible = solde comptabilisé − réservations actives.

## 2. Agents (achats uniques) **[OBSOLÈTE → remplacé]**
~~Rédacteur, prospecteur, chargé de veille, responsable qualité, analyste, chef d'équipe (prix 0 / 20 / 35 / 30 / 45 / 80).~~ Valeurs proposées pour le hangar (`rules_v2`) :

| Rôle | Id technique | Prix | Déblocage |
|---|---|---|---|
| Éclaireur | `scout` | 0 | Au lancement |
| Qualificateur | `qualifier` | 30 | Score ≥ 60 sur la planète 2 |
| Analyste de fiche client | `profiler` | 40 | Score ≥ 60 sur la planète 3 |
| Rédacteur de premier message | `outreach` | 45 | Score ≥ 60 sur la planète 4 |

`scout` et `qualifier` travaillent en expédition ; `profiler` et `outreach` travaillent sur un prospect du carnet (§11). **Mode Réel : la condition de score de déblocage est levée** pour `qualifier`, `profiler` et `outreach` (seul le prix reste ; décision par défaut, `OPEN-QUESTIONS.md`) ; en Tutoriel, elle s'applique.

Le chef d'équipe est **reporté en P2**. Unicité `(session, rôle)` **[GARDÉ]** : un double achat concurrent ne débite et ne crée qu'une fois (F07, T06). Changer les ids de rôles demande une migration de l'énumération `Role` (voir `BACKLOG.md`).

## 3. Planètes : gains et tarifs **[ADAPTÉ]**
La « mission » du moteur devient une **planète / contrat de prospection**. Mêmes montants que le cahier, pour **conserver une économie déjà calibrée** (calcul de contrôle §9) :

| Planète | Gain max | Coût par instruction | Débloque |
|---|---|---|---|
| 1. Annuaire | 20 | 0 | Planète 2 |
| 2. Registre | 30 | 1 | Planète 3, Qualificateur |
| 3. Carte locale | 40 | 1 | Planète 4, Analyste de fiche client |
| 4. LinkedIn | 60 | 2 | Planète 5, Rédacteur de premier message |
| 5. Glassdoor | 90 | 2 (hors crédit exceptionnel) | Constellation |
| 6. Constellation (finale) | 150 | 3 | Fin de campagne |
| Secours | 10 | 0 (5 messages gratuits, éclaireur) | Rien (financement seulement) |

Le tarif est **figé à l'ouverture de la tentative** (`POST /api/missions/{id}/start`, qui devient l'ouverture d'une expédition ; la route garde son nom tant que `CONTRACTS.md` n'est pas modifié) même si la campagne progresse ensuite **[GARDÉ]**.

## 4. Quotas et coût d'une action **[GARDÉ]**
> « Tentative » = **expédition** ; « message » = **instruction (version du prompt)** ; « client » = **commanditaire** de la planète. Mécanismes inchangés.

- **Cinq instructions maximum par agent et par tentative (expédition).** Le 1er prompt et chaque correction comptent ; réponses et consultation d'historique ne comptent pas. Les **actions sur un prospect** (§11) ont leur propre clé de quota `(prospect, rôle)`, même plafond de 5, jamais 6.
- Coût = tarif de l'étape × nombre d'appels de rôles prévus. Le **maximum est affiché avant confirmation**.
- 5e message : l'agent répond ; la saisie se désactive ; édition manuelle et livraison restent possibles.
- **Erreur technique** : aucun débit, aucun message consommé si aucune réponse exploitable n'est enregistrée ; la réservation est libérée. Une réponse exploitable mais peu pertinente reste facturée.
- **Idempotence** : même `Idempotency-Key` ⇒ même `ActionRun`, aucun nouvel appel ni débit (double clic, reprise réseau).
- **Clarifications au client** : 2 gratuites par tentative, hors quotas agents, réponses factuelles uniquement.
- Indices et carnet : gratuits. Réutiliser un prompt du carnet dans un envoi normal consomme un message.
- Édition manuelle : gratuite, crée une version enfant avec son auteur.
- Plafond global : **36 appels modèle par tentative**, réparations comprises, dont **2 réservés** à l'évaluation client et sa réparation.

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

## 5. Score et paiement **[GARDÉ, grille ADAPTÉE]**
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

*(Ancienne grille du cahier : 40/20/20/10/10 sur exactitude, contraintes, adéquation, clarté, sources — OBSOLÈTE.)* Les poids ci-dessus sont des **valeurs de départ à calibrer** (`OPEN-QUESTIONS.md`).

- Les formats et calculs sont vérifiés **par du code** ; le client IA ne juge que le sémantique et explique les écarts.
- Le serveur valide types et bornes (`rating ∈ [0,1]`, ids connus, preuve valide) puis calcule le **score /100**. Tout champ de récompense suggéré par le modèle est **ignoré**.
- Hors sujet ⇒ **0**. Critère essentiel non rempli ⇒ score **plafonné à 40**.
- Réussite : mission ordinaire **≥ 60** sans échec essentiel ; **finale ≥ 70** avec tous les essentiels.
- Paiement cible = `floor(gain_max × score / 100)` (ex. max 20 : 0→0, 65→13, 100→20).
- Une livraison fige texte + brief + grille ; son id et son empreinte empêchent les paiements répétés (T04).
- **Reprise** : nouvelle tentative avec ses compteurs ; paiement supplémentaire = `max(0, cible − meilleur paiement déjà acquis)` (13 → 17 crédite 4, T05).
- JSON d'évaluation invalide ou panne : **une seule** réparation ; sinon livraison `EVALUATING` récupérable, sans récompense inventée.
- Réputation = moyenne des meilleurs scores des missions terminées ; informative, aucun seuil caché.

## 6. Événements **[GARDÉ, contenu à réécrire — P1]**
Tout événement a un id, un point de déclenchement et crée une **nouvelle version du brief** (la fiche cible) avec diff affiché. Devenus des **événements de marché**. Les identifiants et planètes cités ci-dessous (M3–M6) sont **OBSOLÈTES** ; les règles de justice restent valables.

| Événement | Règle de justice |
|---|---|
| Changement de cible | Un seul message restant devient gratuit, **une fois par rôle concerné** ; le quota reste 5 (jamais 6). Déclenché assez tôt pour corriger. |
| Sources contradictoires | Dates et autorité des enregistrements permettent de trancher ou de signaler l'incertitude. |
| Budget réduit | Aucune dépense déjà confirmée n'est révoquée ; la nouvelle limite reste réalisable. |
| Contexte incomplet | Le joueur peut partager la pièce ou **briefer le commanditaire** (clarification). |

- Finale (Constellation) : l'événement est injecté **avant la première action**.
- Le hasard ne détermine ni prix, ni récompenses, ni critères. Une **graine** enregistrée rend les variantes reproductibles.
- Mode Démo : le présentateur choisit un événement admissible avant livraison, sans changer note ni solde ; badge visible ; commandes cachées jamais actives en partie normale.

## 7. Fin de campagne **[ADAPTÉ]**
- Constellation (ex-M6) : victoire = score ≥ 70, essentiels exacts, **dépense ≤ 30**, ≥ **2 rôles** ayant produit une contribution liée au rapport, sur **≥ 2 planètes**.
- Les planètes 1 à 5 sont réalisables avec le seul éclaireur ; la fin est atteignable sans acheter tous les agents (T12).
- Planète de secours : rejouable (nouveaux ids d'expédition), accessible sans argent (T11).

## 8. Limites techniques (configurables côté serveur) **[GARDÉ]**
| Sujet | Valeur initiale |
|---|---|
| Prompt joueur | 4 000 caractères |
| Sortie agent / client-évaluateur | 800 / 1 200 tokens |
| Timeout appel | 45 s, 1 nouvelle tentative technique max |
| Concurrence fournisseur | 5 appels simultanés |
| Budget tokens | Plafond partie + global ; seuil atteint ⇒ pause + sauvegarde, jamais de faux résultat ; réserve 60 M sur 300 M |
| **Sources réelles (mode Réel)** | Timeout, nombre d'appels par expédition, taille de réponse et limite de débit **par source**, fixés côté serveur ; au-delà ⇒ erreur stable, aucun débit |

## 9. Sources de données **[NOUVEAU]**
- Le **navigateur n'appelle jamais une source** : seules les routes de l'API le font, côté serveur, avec une **liste blanche** de sources et d'opérations (règle 2).
- Toute donnée venant d'une source ou d'un agent de planète est **non fiable** : rendu texte nettoyé, instructions contenues = données.
- Un lead n'est recevable que s'il porte un `source_ref` renvoyé **pendant cette expédition** ; la vérification est faite **par code** côté serveur.
- Aucune clé de source ni prompt système dans les erreurs, journaux ou réponses (règle 6). Les journaux de sources contiennent identifiants et durées, pas les contenus personnels.
- Mode Réel : données de contact traitées comme **données personnelles** (minimisation, rétention, suppression avec la partie, aucune action externe) — règles chiffrées en §12, cadre complet dans `PRODUIT-PROSPECTION.md` §14, points ouverts dans `OPEN-QUESTIONS.md`.
- L'**instantané** d'un enregistrement stocké avec un prospect ne contient que les champs d'une **liste blanche** (par source, dans `data/`) ; tout champ hors liste est écarté **avant stockage**.

## 10. Vérification
Les mécanismes sont couverts par les tests T02–T06, T09–T12 (voir `RECETTE.md`, à réaligner sur le nouveau contenu). Calcul de contrôle conservé : scores 80/70/70/70/70 sur les planètes 1 à 5 ⇒ 16+21+28+42+63 = **170** ; 30 + 170 − 30 (qualificateur) − 40 (analyste de fiche client) − 45 (rédacteur de premier message) − 30 (frais d'instructions illustratifs) = **55**. Les générations de fiches et de messages (§11) s'ajoutent aux dépenses (ex. 10 fiches × 3 $ + 10 messages × 2 $ = 50 $) : la finale (dépense ≤ 30) ne compte que les dépenses **d'expédition** ; les actions sur un prospect n'y entrent pas, pour que le produit réel ne pénalise pas la victoire.

## 11. Actions sur un prospect **[NOUVEAU]**
Le **carnet de prospection** (`PRODUIT-PROSPECTION.md` §12) est le produit ; la monnaie du jeu ne le prend **jamais en otage**.

| Action | Coût | Quota | Gain |
|---|---|---|---|
| Ajouter au carnet, consulter, trier, filtrer, rechercher, annoter, changer de statut, marquer « contacté », **supprimer**, **exporter** (CSV, JSON complet) | **Gratuit, jamais refusé pour manque de fonds** | Aucun | Aucun |
| **Fiche client** (`profiler`) | 3 $ par génération (valeur de départ) | **5 par (prospect, rôle)**, jamais 6 | **Aucun** |
| **Brouillon de premier message** (`outreach`) | 2 $ par génération (valeur de départ) | **5 par (prospect, rôle)**, jamais 6 | **Aucun** |

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
- **Aucune action externe automatique** (envoi, invitation, CRM) : le brouillon est copié par le joueur.
