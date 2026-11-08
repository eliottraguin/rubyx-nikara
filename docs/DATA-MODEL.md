# Modèle de données et machines à états

> Source : cahier §13, puis cap prospection (2026-11-07 : `PRODUIT-PROSPECTION.md` §10 à §14, `PRODUIT-CLIENTS-PUB.md`, `RULES.md` §11 à §14). Stockage : SQLite (instance de démo), PostgreSQL en évolution. Montants = entiers de jeu. Toute lecture/mutation vérifie la **propriété de la session** ; aucun identifiant reçu n'est utilisé sans contrôle.
>
> **Deux niveaux dans ce fichier** : « Entités livrées » = tables existantes (BE01 à BE07, migrations Alembic `0001` à `0004`, 313 tests) ; « Entités proposées » = **[PROPOSÉ, pas encore implémenté]**, aucune table ni migration n'existe encore. Les routes qui les manipulent sont dans `CONTRACTS.md` (contrats v0.5). Les décisions manquantes sont listées dans « Points à trancher » de `CONTRACTS.md` (renvoi par numéro ci-dessous).
>
> **6e décision (2026-11-08, `PARCOURS-BOT.md`)** : pas d'atelier. **À retirer par API-R2** (le code existe encore) : `MissionDefinition.brief`, compteur de clarifications et `brief_version` de `MissionAttempt`, `Submission`, `Evaluation` (dont `report`), événements appliqués (version de brief), crédit de correction. **Ajoutés (PROPOSÉ)** : l'entité `Search` et le champ de pertinence de `Prospect` (voir ci-dessous).
>
> Correspondance de vocabulaire (partiellement OBSOLÈTE : plus de tentative ni de livrable pour le scout) : mission = planète/contrat, tentative = expédition, message = instruction, livrable = rapport de leads. Les **noms de tables et de champs livrés ne changent pas** (aucune migration de renommage).

## Entités livrées
| Entité | Champs et contraintes |
|---|---|
| `GameSession` | `id`, jeton de session opaque (cookie), `mode` (`beginner`/`expert` ; l'interface dit « Tutoriel » / « Réel »), `company` (dont `profile`, texte ≤ 200, **repris comme champ `offre`** de la fiche cible), `state`, `stage`, `seed`, dates, `rules_version`, `creation_key_hash`, `creation_request_hash` (idempotence de création, migration `0004`) |
| `AgentOwnership` | `session_id`, `role`, `price_paid`, `purchased_at` — **unique (session_id, role)**. L'énumération `Role` livrée compte encore les 6 rôles du cahier ; elle devra passer aux **4 rôles** (5e décision) (voir ci-dessous) |
| `MissionDefinition` | `id`, `version`, `mode`, ~~brief~~ *(OBSOLÈTE : à retirer)*, corpus, ~~critères (+poids, contrôles), `max_reward`, `unit_price`, événements~~ *(OBSOLÈTE)*, prérequis. Devient la définition d'un **lieu** : source, description, corpus (`DATA-S1`) |
| `MissionAttempt` | **OBSOLÈTE (6e décision), à retirer par API-R2, remplacée par `Search`** : `id`, `session_id`, `mission_id`, `brief_version`, `status`, `spend_cap`, compteurs (messages par rôle, ~~clarifications~~, appels), `attempt_no`, `unit_price` figé |
| `Message` | `id`, `attempt_id`, `role`, `author` (joueur/agent), texte, pièces liées, `status`, `action_id` |
| `ArtifactVersion` | `id`, `attempt_id`, `type`, contenu, `parent_id`, `author` (agent/joueur), sources, contributions liées — **immuable** |
| `Submission` | **OBSOLÈTE, à retirer (API-R2)** : `id`, `artifact_version_id`, `brief_version`, empreinte (hash), grille figée, `status` |
| `Evaluation` | **OBSOLÈTE, à retirer (API-R2)** ; le tri de pertinence est porté par `Prospect` : `submission_id` **unique**, modèle, `judge_version`, critères, `score` calculé, preuves, `status`, ~~`report` (retour client, réussite, paiement ; BE06)~~ |
| `LedgerEntry` | `id`, `session_id`, montant entier signé, catégorie, `source_action` **unique**, `state` |
| `ActionRun` | `id`, `idempotency_key` **unique**, type, réservation, `status`, étapes, erreur |
| `LLMCall` | `action_id`, rôle, modèle, usage (mesuré/estimé), durée, tentatives, coût réel si connu |
| `NotebookEntry` | **OBSOLÈTE (6e décision : plus de prompt de joueur)** : `session_id`, titre, prompt, rôle, mission d'origine, date. C'est le **carnet de prompts** (`/api/notebook`, 501 aujourd'hui), **distinct** du carnet de prospection (`Prospect`) |

Compléments livrés ou à confirmer (créés en BE01 et suivants) : table de **réservations** (montant, quota, échéance), journal de **partages de pièces**, table d'**événements appliqués** (id, version de brief).

## Entités proposées **[PROPOSÉ, pas encore implémenté]**
Toutes portent un `session_id` (propriété vérifiée, réponse `NOT_FOUND` identique si autre session) et des dates UTC. Aucune ne contient de clé, de prompt système ni de jeton lisible. Les montants du ledger référencent l'**id** de l'entité, **jamais son contenu**.

| Entité | Champs et contraintes | Source |
|---|---|---|
| `TargetProfile` (fiche entreprise et cible) | `session_id`, `profile_version` (entier, versions **immuables** : une modification crée une nouvelle version), `entreprise_nom` (1 à 60), `offre` (≤ 400), `besoin` (≤ 300), `cible_secteurs` (1 à 5), `cible_zone` (1 à 5), `cible_taille` (min, max entiers), `cible_fonctions` (0 à 5), `exclusions` (0 à 10), `ton` (énumération : vouvoiement formel, vouvoiement chaleureux, tutoiement), dates. Bornes lues dans `data/profile/`. Une **recherche** garde la version courante à son lancement (`Search.profile_version`) ; le prospect la porte comme provenance. Le texte est une **donnée** pour les agents. | `PRODUIT-PROSPECTION.md` §11 |
| `Search` (recherche du bot) | `id`, `session_id`, `planet_id` (lieu, liste blanche), `precision` (facultative, **≤ 300 caractères**, texte brut, donnée non fiable), `profile_version` (version de la fiche à l'ouverture), `status` (`PENDING`, `RUNNING`, `SUCCEEDED`, `FAILED`), `action_id` (action `scout_search`, **idempotente**), bilan (`added`, `already_present`, `rejected`, `hors_cible`, compteurs seulement), `trace` (événements `departed`/`arrived`/`dialogue`/`returned`/`failed`), dates. **Aucun montant, aucun gain** (recherche gratuite). Un prospect référence sa recherche (`search_id`). Une recherche vide est `SUCCEEDED` avec `added = 0`. Supprimée avec la partie ; les prospects survivent à la suppression d'une recherche seulement par choix explicite (à trancher). **[IMPLÉMENTÉ, API-S1, migration `0012_searches`]** : statuts réels `PENDING`, `RUNNING`, `DONE`, `FAILED` ; compteurs `found`, `kept`, `discarded`, `examined` ; `result` (JSON : prospects ajoutés et écartés avec raison, sans contact) et `error` ; `simule`, `finished_at` ; pas de trace d'événements pour l'instant ; le prospect porte l'id de la recherche dans `expedition_id` (et `rapport_version_id`) en attendant le retrait d'`ExpeditionRecord` (pas de `search_id` séparé). | `PARCOURS-BOT.md` §1, `CONTRACTS.md` §11 |
| `Prospect` | **[IMPLÉMENTÉ, API-S2, migration `0013_pertinence_labels`]** : colonnes nullables `pertinence_etiquette` (`correspond` \| `a_verifier` \| `hors_cible` ; null = « à vérifier »), `pertinence_citation` (extrait littéral vérifié par le serveur) et `pertinence_champ` (champ de la source cité) ; l'entier `pertinence` (0 à 100) reste inchangé et `pertinence_a_verifier` n'existe pas. `id`, `session_id`, `entreprise`, `contact_nom` (seulement si fourni comme donnée professionnelle), `contact_fonction`, `canal` (`type` : `email_generique`, `formulaire`, `adresse`, `telephone_standard`, `reseau_pro` ; `valeur`), `source`, `source_ref`, `raisons_fit`, `signal`, `pertinence` (**6e décision** : `correspond` | `a_verifier` | `hors_cible`, **calculée par le serveur** ; remplace le 0 à 100), `pertinence_citation` (citation littérale d'un champ de l'instantané), `pertinence_a_verifier` (liste ; non implémentée), `fiabilite` (`verifie`, `partiel`, `simule`), `statut` (`nouveau`, `contacte`, `en_discussion`, `gagne`, `perdu`, `ecarte`), `notes` (≤ 2 000), `instantane_source` (copie **minimisée**, liste blanche de champs par source dans `data/sources/`), provenance (`search_id` en remplacement de `expedition_id`, `profile_version` ; `rapport_version_id` obsolète), `cree_le`, `modifie_le`, `contacte_le`, `derniere_activite_le`, `version` (concurrence optimiste). **Unique `(session_id, source, source_ref)`** (dédoublonnage idempotent). Limite 500 par partie (`rules_v2`). **Provenance immuable** ; le joueur ne modifie que `statut` et `notes`. | §12 |
| `ProspectDraft` (versions de fiche client **et** de premier message d'un prospect) | **[IMPLÉMENTÉ, API-J1 et API-K1, migration `0014_prospect_drafts`, table `prospect_drafts`]** `id` (`pdr_…`), `session_id` (FK cascade), `prospect_id` (FK cascade), `kind` (`fiche` \| `message`), `numero` (par `(prospect, kind)`, **unique** `(prospect_id, kind, numero)`), `parent_id` (auto-FK cascade : copie éditée par le joueur), `auteur` (`agent` \| `joueur`), `contenu` (JSON : `FicheClient` = `resume` ≤ 600, `pourquoi_ce_prospect` [{texte, critere, champ}] 1 à 5, `points_d_accroche` ≤ 5, `a_verifier` ≤ 8, `sources` ; ou `Brouillon` = `canal_cible` (type seulement), `objet` ≤ 90, `corps` ≤ `limits.draft_max_chars` 800, `mentions`), `controles` (JSON, ids des grilles `prospect_fiche_v1` / `prospect_message_v1`), `consigne` (≤ 500, donnée), `profile_version`, `simule`, `action_id` (sans FK : un `SET NULL` violerait l'immutabilité), `created_at`. **Immuable** (trigger `trg_prospect_drafts_immutable` : aucun UPDATE), supprimée avec le prospect et avec la partie (cascade ; `prospect_actions.delete_for_prospect` supprime aussi les compteurs `target_action_uses` du prospect). Texte à copier ou à lier au contact : jamais envoyé ; jamais d'adresse ni de numéro. Quota : clé `(prospect, action)` dans `target_action_uses`. Remplace les entités `FicheClient` et `Brouillon` des versions précédentes (point 22 tranché). | §13 |
| `Conversation` | `id`, `session_id`, `prospect_id`, `simule` (Tutoriel), verrou d'envoi (posé si le prospect est écarté ou désinscrit ; représentation exacte non écrite), dernière activité, tours du client simulé (≤ 6, `messaging.sim_turns_max`), résultat de conversation (Tutoriel, **calculé par code**), dates. **Unique `(session_id, prospect_id)`** : une conversation ouverte par prospect. Quota : clé `(conversation, rôle)`. Supprimée avec le prospect, la partie ou sur demande. | `PRODUIT-CLIENTS-PUB.md` §3 |
| `ConversationMessage` | `id`, `conversation_id`, sens (envoyé / reçu), `texte` (brut, bornes `inbound_max_chars` 4 000 en réception), `etat` (`ENVOYE`, `NON_ENVOYE`), `simule`, `provider_message_id` (Réel ; **unique** par conversation pour l'import idempotent), `draft_version_id` (version envoyée, texte **figé**), date. Contenu reçu = **donnée non fiable**. Journalisé **sans contenu ni adresse**. Synthèse `triage` (intention, points, urgence, statut suggéré) : stockage non nommé (point 22). | §3, §4 |
| `ReplyDraft` (versions de brouillon de réponse) | `id`, `conversation_id`, `parent_id` (copie éditée = version enfant), `auteur` (agent `replier` / joueur), `objet`, `corps` (≤ `messaging.reply_max_chars` 1 200), contrôles par code, `action_id`. **Immuable** ; l'envoi réel transmet le texte figé de la version désignée. | §3, §4 |
| `Campaign` | `id`, `session_id`, `nom` (≤ 80), `objectif` (`notoriete`, `leads`, `evenement`, `offre`), `plateforme` (`linkedin`, `meta`, `google_search`, `local`, `email`), `audience` (≤ 300, dérivée de la fiche cible), `budget_indicatif` (**indicatif**, jamais la monnaie du jeu), `consigne` (≤ 500), `cree_le`, `modifie_le`, `version` (concurrence optimiste). Limite 20 par partie. Quota : clé `(campagne, rôle)`. | §5 |
| `CampaignVersion` (kit de campagne) | `id`, `campaign_id`, numéro, `parent_id`, `auteur` (agent `ads` / joueur), `positionnement` (≤ 160), `audience_resume`, `accroches` (3 à 5), `textes` (par format, limites de `data/ads/formats.json`), `brief_visuel`, `plan`, `checklist`, `a_verifier`, contrôles par code, `action_id`. **Immuable** ; l'édition crée une version enfant. | §5 |
| `MailboxConnection` (Réel) | `session_id` **unique** (une boîte par partie), `provider` (liste blanche), jeton d'accès et de rafraîchissement **chiffrés au repos** (jamais renvoyés au navigateur, jamais journalisés), `address_masked` (l'adresse en clair n'est pas exposée au navigateur), état de connexion, compteurs d'envoi (jour, heure), dates. Supprimer la connexion **révoque** le jeton chez le fournisseur et le supprime. | §4 |

**Rôles du hangar (4, 5e décision)** : `scout`, `triage`, `replier`, `ads` (chef d'équipe reporté en P2). `AgentOwnership` reste unique `(session, rôle)`.

**Types d'action (`ActionRun.type`) ajoutés** : `scout_search` (gratuite, sans quota ni réservation de $), `prospect_profile`, `prospect_message`, `conversation_triage`, `conversation_reply`, `ad_campaign`. Même cycle de vie que les actions livrées (réservation, règlement, idempotence). Comme `ActionRun.idempotency_key`, la clé reste **unique par session**.

**Clés de quota ajoutées** (compteur indépendant, plafond 5, **jamais 6**, même mécanisme que le quota `(tentative, rôle)` livré) : `(prospect, action)` pour `prospect_profile` et `prospect_message` (rôle `replier`) ; `(conversation, rôle)` pour `triage` et `replier` ; `(campagne, rôle)` pour `ads`. Un quota n'est consommé qu'au règlement d'une réponse exploitable ; aucun gain en $ sur ces actions.

**Trace de recherche** (ex-trace d'expédition, `CARTE-TECH.md`) : liste ordonnée (`seq` croissant) d'événements (`departed`, `arrived`, `dialogue`, `returned`, `failed`) rattachée à l'`ActionRun` `scout_search` (et à `Search`), **sans prompt système, clé ni raisonnement interne**. Stockage (colonne ou table) non précisé dans les docs.

**`building`** (niveau d'immeuble) : **non stocké**. Valeur **calculée par le serveur** à la lecture de l'état à partir du **nombre de clients obtenus** (6e décision : prospects au statut `gagne`, comptés par le serveur ; ex-« total gagné », obsolète) ; seuils non écrits : point 23 de `CONTRACTS.md`) et des seuils `rules_v2.building.levels` ; purement cosmétique.

**Complément à `LedgerEntry`** : les écritures des actions sur prospect, conversation et campagne portent l'`id` de l'entité, **jamais son contenu** ; aucune ne crédite le joueur.

**Cascade de suppression** : prospect ⇒ ses fiches clients, brouillons, instantané et sa conversation (messages, brouillons de réponse, synthèses) ; conversation ⇒ ses messages et brouillons ; campagne ⇒ ses versions ; partie (`DELETE /api/session`) ⇒ tout, y compris `MailboxConnection` (jeton révoqué chez le fournisseur) et la fiche entreprise. **Aucune ligne orpheline**, suppression **idempotente**.

**Rétention** (`rules_v2` : `retention_days` 180, `retention_notice_days` 30) : sur `derniere_activite_le` des prospects ; l'action « Conserver » remet le compteur à zéro ; purge automatique journalisée **sans contenu** ; horloge injectable. Les données fictives du Tutoriel partent avec la partie. Alignement des conversations sur la même durée (`PRODUIT-CLIENTS-PUB.md` §4).

## Machines à états
**Tentative** *(OBSOLÈTE, 6e décision, à retirer par API-R2)* : `AVAILABLE → ACTIVE → (EVALUATING) → COMPLETED | FAILED`.
- Une reprise **crée une nouvelle tentative** ; elle ne rouvre jamais une livraison figée.
- Évaluation en échec technique ⇒ retour à un état d'attente récupérable, sans modifier le résultat pédagogique.

**Action** : `PENDING → RESERVED → RUNNING → SUCCEEDED | PARTIAL | FAILED`.
- Plan du chef : `AWAITING_CONFIRMATION` avant la réservation des délégations.
- Réservations avec échéance et **réconciliation** ; un `RUNNING` interrompu est réconcilié au redémarrage.

### Machines à états proposées **[PROPOSÉ]**
**Recherche (`Search.status`)** : `PENDING → RUNNING → SUCCEEDED | FAILED` ; un `RUNNING` interrompu est réconcilié au redémarrage (comme l'`ActionRun`) ; rejouer la même `Idempotency-Key` renvoie la même recherche.

**Prospect (`statut`)** : `nouveau → contacte → en_discussion → gagne | perdu` ; `ecarte` (hors cible, sans suite). Les transitions sont **libres** (le joueur seul décide) mais **horodatées** ; `contacte_le` est posé au **premier** passage à `contacte`. « Contacté » est **déclaratif** (le produit n'envoie rien et ne détecte rien). Effets de la conversation (**proposés**) : premier envoi ⇒ `contacte` ; réponse du client ⇒ `en_discussion` ; message de désinscription (détecté par code **ou** modèle, le code l'emporte) ⇒ `ecarte` et envoi verrouillé. Le joueur peut toujours changer le statut à la main.

**Fiabilité d'un prospect** : `verifie` / `partiel` / `simule`, calculée **par code** à l'ajout ; `simule` en Tutoriel, jamais mélangé à du réel sans colonne `simule` à l'export.

**Message de conversation (`etat`)** : `ENVOYE` | `NON_ENVOYE`. En Réel : brouillon → confirmation du joueur → réservation du créneau d'envoi → appel fournisseur → `ENVOYE` ou `NON_ENVOYE` (aucun renvoi automatique). En Tutoriel : « envoi simulé », rien ne sort.

**Action sur un prospect, une conversation ou une campagne** : même machine que l'`ActionRun` livré (`PENDING → RESERVED → RUNNING → SUCCEEDED | PARTIAL | FAILED`) ; pas d'`AWAITING_CONFIRMATION` (propre au chef d'équipe, hors MVP).

**Connexion de boîte mail** : déconnectée → (OAuth) → connectée → révoquée/supprimée. États intermédiaires (en attente de retour OAuth, jeton expiré) : non précisés dans les docs.

## Invariants
1. Versions (fiche client, brouillon, kit) **immuables** ; une édition crée un enfant.
2. Une transaction du ledger a une **source unique** (pas de double écriture) ; plus de récompense d'expédition (6e décision).
3. Solde disponible = comptabilisé − réservations actives ; jamais négatif (achats concurrents inclus).
4. *(OBSOLÈTE 6e décision, grille et évaluation retirées)* Un changement de grille ne modifie pas rétroactivement une livraison évaluée ; chaque appel journalise les versions de rôle/mission/grille utilisées.
5. Les données privées d'une session ne sont jamais lisibles par une autre (T13).
6. Les journaux masquent secrets et contenus non nécessaires.
7. **[PROPOSÉ]** Un `Prospect` n'entre dans le carnet que **recopié par le serveur** depuis les enregistrements renvoyés par le lieu pendant une `Search`, avec son `source_ref` **revérifié** ; le navigateur ne fournit jamais son contenu ; sa provenance est immuable.
8. **[PROPOSÉ]** Unicité `(session_id, source, source_ref)` pour les prospects et `(session_id, prospect_id)` pour les conversations ; double ajout concurrent ⇒ une seule ligne.
9. **[PROPOSÉ]** Quota 5 par `(prospect, action)`, `(conversation, rôle)` et `(campagne, rôle)` : jamais 6, y compris sous concurrence ; aucun quota ni débit consommé sans réponse exploitable ; aucun gain en $ sur ces actions.
10. **[PROPOSÉ]** Aucun agent n'a d'outil d'envoi ; un envoi réel exige une action du joueur (`confirm: true`, version de brouillon existante), part vers la **seule adresse du prospect** de la conversation stockée par le serveur, et n'a lieu **qu'une fois** par `Idempotency-Key`.
11. **[PROPOSÉ]** Le modèle ne reçoit jamais la valeur d'un email ou d'un téléphone, ni les notes du joueur ; les journaux et erreurs ne contiennent aucun contenu personnel (noms, contacts, notes, instantanés, messages, adresses).
12. **[PROPOSÉ]** Les jetons de messagerie sont chiffrés au repos, jamais exposés au navigateur ni aux journaux ; une boîte par partie.
13. **[PROPOSÉ]** Consulter, trier, exporter et supprimer prospects, conversations et campagnes n'est jamais conditionné par l'argent ni par le score. L'export CSV est produit par le serveur et neutralise les formules.
14. **[PROPOSÉ]** Les versions de fiche entreprise, de fiche client, de brouillon et de kit sont immuables ; une recherche mémorise la version de fiche entreprise utilisée.

