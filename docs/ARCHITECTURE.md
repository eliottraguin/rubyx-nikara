# Architecture

> **6e décision (2026-11-08, `PARCOURS-BOT.md`)** : plus d'atelier ni d'évaluation par un client. Retirés de l'architecture cible (le code existe encore, ticket **API-R2**) : évaluateur client, grilles `m*`, orchestration de livraison (`submit`), événements de brief. Ajouts : action `scout_search` (recherche gratuite), tri de pertinence par agent, `POST /api/prospects/{id}/contact`. L'**orchestration bornée** ci-dessous est **gardée** telle quelle.
>
> Source : cahier §12, §16, §17, puis cap prospection (2026-11-07). **Livré (vérifié dans le code, le 2026-11-08)** : sessions, économie, quotas, idempotence, fiche entreprise et cible, recherche du bot (`scout_search`, tri de pertinence, lieux Annuaire et Registre en Tutoriel), carnet et export CSV, Contacter, brouillons sur prospect, messagerie simulée, pub, achat d'agents et progression par clients obtenus, assistants avec plans confirmés, et l'interface correspondante (fiche, recherche, immeuble en étages, carnet, assistants). Fournisseur de modèles : `mock` seulement. **Retrait en cours** de l'ancien moteur d'expédition (ticket API-R2, migration 0015). **Reste (marqué [PROPOSÉ] ou non branché)** : adaptateur de modèles réel (relais AXIS), sources réelles du mode Réel, boîte mail et envoi réel confirmé, exemplaires multiples d'un agent, lieux autres que l'Annuaire et le Registre. Contrats : `CONTRACTS.md` ; entités : `DATA-MODEL.md`. Stack de référence : **Next.js + TypeScript** (interface) · **FastAPI + Python + Pydantic** (API) · **SQLite** (démo) · adaptateur unique vers le fournisseur de modèles. PostgreSQL = évolution multi-instances. Versions verrouillées au démarrage.

## Composants
| Composant | Responsabilité |
|---|---|
| Interface (`src/`, Next.js) | Affiche l'état renvoyé par l'API, déclenche les actions, présente réponses et versions. Ne calcule ni solde, ni score, ni droits. **Livré** : écrans fiche, carte, immeuble et boutique sur `src/lib/api/`. **[PROPOSÉ]** : carte Phaser (`src/game/map/`, chargée à la demande), **mode liste** de secours, couche DOM accessible, pages Carnet, Clients, Pub, Mes données. |
| Moteur de jeu (`api/`) | Lieux (ex-missions, sans gain), achats, quotas des générations, recherches `scout_search`, progression par clients obtenus. ~~Événements, score, victoire~~ *(OBSOLÈTE 6e décision, API-R2).* Données de règles versionnées (`rules_v2` livrées ; `rules_v1` visées par API-R2). |
| Service agents | Construit le contexte autorisé, exécute les outils de la liste blanche, valide les sorties (Pydantic). **4 rôles** au hangar : `scout`, `triage`, `replier`, `ads`, plus les 3 assistants (`assistant_prospection`, `assistant_clients`, `assistant_pub`) qui proposent des plans exécutés après confirmation (`ASSISTANT.md`). **Aucun outil d'envoi.** |
| ~~Évaluateur client~~ → **Tri de pertinence** | **OBSOLÈTE (6e décision)** : l'évaluateur de livraison est à retirer (API-R2). Remplacé par un agent de tri (`API-S2`, mock déterministe) qui rend `correspond` / `a_verifier` / `hors_cible` + citation de la source pour chaque prospect ; les critères structurés sont tranchés par code. Aucun score, aucun paiement. |
| **Adaptateur de sources** **[PROPOSÉ]** | Interface `PlanetSource` : le **serveur seul** interroge une source, avec liste blanche de sources et d'opérations ; Tutoriel = agent de la planète simulé sur corpus ; Réel = API officielle / MCP autorisé / fournisseur licencié, **jamais de scraping direct**. Timeout, taille et débit par source ; vérification du `source_ref` **par code**. |
| **Carnet et agents sur prospect** **[PROPOSÉ]** | Fiche entreprise et cible (`PUT /api/profile`), carnet (`/api/prospects`), export CSV produit par le serveur (formules neutralisées), actions `prospect_profile` / `prospect_message`, minimisation, rétention, export JSON et suppression de la partie. |
| **Messagerie** **[PROPOSÉ]** | Conversations, client simulé (Tutoriel, à la demande, déterministe avec `mock`), connexion de boîte mail OAuth (Réel, jetons chiffrés), synchronisation, envoi **confirmé par le joueur** seulement. |
| **Pub** **[PROPOSÉ]** | Campagnes et kits (`ad_campaign`, agent `ads`) ; export Markdown ; aucune publication ni dépense externe. |
| Stockage | Actions, versions, évaluations, transactions, mesures de consommation ; **[PROPOSÉ]** fiche cible, prospects, conversations, campagnes, connexion de boîte mail (`DATA-MODEL.md`). |
| Adaptateur LLM | Isole auth, format d'appel, limites, timeout, statistiques. Implémentations `mock` et `real`. **Le modèle ne reçoit jamais** la valeur d'un email ou d'un téléphone, ni les notes du joueur. |

## Arborescence cible
```
src/                 front Next.js à la racine (décision retenue : pas de `web/` ; `src/lib/api/{http,adapt,types}.ts`)
api/                 FastAPI : routes, moteur, agents, évaluateur, adaptateur LLM, migrations (+ sources, carnet, messagerie, pub [PROPOSÉ])
data/
  rules/             prix, plafonds, prérequis (versionnés) ; rules_v2.json [PROPOSÉ]
  roles/             instructions des rôles (6 livrés ; 7 [PROPOSÉ])
  missions/          missions M1–M6 (obsolète, livré, retrait API-R2) ; planets/ [PROPOSÉ] : lieux = source + description + corpus, sans commanditaire ni grille (DATA-S1)
  rubrics/           grilles m1_v1… (OBSOLÈTE 6e décision, retrait API-R2) ; prospect_*, conversation_* [PROPOSÉ]
  fixtures/          JSON d'exemple par écran + sorties de référence modèle
  profile/           fiche entreprise et cible : bornes, exemples [PROPOSÉ]
  sources/           liste blanche de champs par source [PROPOSÉ]
  clients/           personas, mots-clés de désinscription [PROPOSÉ]
  ads/               formats et limites de caractères [PROPOSÉ]
  map/               city_v1.json, building_v1.json (cosmétique) [PROPOSÉ]
tests/               règles (mock), sécurité, calibration
docs/
```
> Le choix `web/` ou racine du premier jet est **tranché** : le dépôt contient `src/` à la racine (Next.js, pnpm). Les dossiers `data/` marqués [PROPOSÉ] sont créés par les tickets DATA-* (hors périmètre de ce document ; certains sont en cours de création dans l'arbre de travail et ne sont pas encore validés ni fusionnés).

## Orchestration bornée
- File d'actions avec **ids persistés** ; le navigateur interroge le statut (`GET /api/actions/{id}`).
- Aucune transaction de base ouverte pendant l'attente réseau.
- Réservation argent+quota **atomique avant** l'appel ; règlement **atomique après**.
- `RUNNING` interrompu réconcilié au redémarrage ; réservations avec échéance.
- Concurrence : 5 appels fournisseur max (file visible au-delà). Timeout 45 s, 1 reprise technique.
- L'orchestrateur de Noah peut remplacer l'exécuteur **uniquement** s'il respecte mêmes contrats, traces et plafonds ; décision au premier jalon.

## Carte et ville **[PROPOSÉ]**
Détails dans `CARTE-TECH.md` et `VILLE-ET-BATIMENT.md`. Principes qui touchent l'architecture :
- **Phaser 3** chargé à la demande dans un composant client (`next/dynamic`, `ssr: false`), **une seule** instance de `Phaser.Game` détruite au démontage ; scènes `WorldScene` (ville plein écran, immeuble central) et `BuildingScene` (coupe d'immeuble).
- **Le serveur reste maître** : la carte affiche un état et joue des animations, elle ne décide ni solde, ni prix, ni quota, ni score, ni déblocage, ni niveau d'immeuble (`GET /api/state` porte `building`, calculé par le serveur).
- **Une seule source de vérité côté client** : `GameState` adapté (`adapt.ts`) → `viewmodel.ts` (fonction pure testée) → bus → scène. La scène **ne fait aucun appel réseau** et ne reçoit **jamais** de contenu de prospect (données personnelles : seulement des compteurs).
- **Trace de recherche** (ex-expédition) : `GET /api/actions/{id}` porte un champ `trace` ordonné (`seq`), rejouable, sans prompt système ni clé ; **animation ≠ résultat** (le résultat n'attend jamais la fin d'une animation).
- **Mode liste** (sans carte) : périmètre de secours qui garde tout le jeu jouable ; couche DOM parallèle accessible ; `prefers-reduced-motion` respecté ; le contenu des étages reste en **panneaux React** (texte copiable, jamais de HTML venant du modèle). Cible : ordinateur ; téléphone = mode liste.
- **Budget** : ≤ 8 Mo au premier affichage, chargement progressif, 60 images/s visées (30 minimum sur un portable modeste) ; on dégrade décor et animations avant toute règle de jeu.

## Sécurité et confiance
- Sorties IA = **contenu non fiable** : texte/Markdown nettoyé, HTML et scripts désactivés.
- Outils en liste blanche ; calculs via opérations définies, jamais d'interpréteur libre.
- Sources limitées au corpus (Tutoriel) ; identifiant cité inconnu ⇒ signalé. **[PROPOSÉ] Mode Réel** : seules les routes de l'API interrogent une source, côté serveur, avec **liste blanche** de sources et d'opérations ; **aucun scraping direct** de plateforme dont les CGU l'interdisent ; un lead n'est recevable que s'il porte un `source_ref` renvoyé pendant la recherche, vérifié par code (`LEAD_UNVERIFIED` sinon).
- Prix, achats, messages restants, paiements : **backend exclusivement**.
- ~~Évaluateur : séparation explicite instructions de jugement / texte soumis (T07)~~ *(OBSOLÈTE 6e décision)*. Même principe pour l'agent de tri : instructions de tri séparées des données de la source, citation vérifiée par code.
- Session anonyme par cookie sécurisé ; propriété vérifiée à chaque lecture/mutation ; aucune clé ni règle privée côté client.
- **[PROPOSÉ] Données personnelles (carnet, conversations, mode Réel)** : B2B uniquement ; liste blanche de champs écartés **avant stockage** ; rétention 180 jours d'inactivité (rappel à 30 jours, « Conserver », purge journalisée sans contenu, horloge injectable) ; suppression en cascade ; export CSV (formules neutralisées, UTF-8 BOM) et JSON complet ; **journaux et erreurs sans aucun contenu personnel** (ni nom, contact, note, instantané, message, adresse) ; sauvegardes de démo avec vrais prospects exclues ou chiffrées ; le fournisseur LLM ne reçoit ni valeur de coordonnée ni notes. Texte à valider par un juriste avant tout usage public.
- **[PROPOSÉ] Aucune action externe automatique** : le produit n'envoie jamais de lui-même un message, un email ou une invitation, et n'a ni CRM ni publication publicitaire ; aucun agent n'a d'outil d'envoi. **Seule exception** : en mode Réel, l'envoi d'**un email à la fois, confirmé par le joueur** (`confirm: true` + version de brouillon figée), depuis la boîte qu'il a connectée, vers la seule adresse du prospect, avec plafonds (20/jour, 5/heure, un envoi par conversation et par 24 h sans réponse), `Idempotency-Key`, journal sans contenu. Jetons OAuth chiffrés au repos, jamais renvoyés au navigateur ; une boîte par partie. Bloqué par la validation juridique (`OPEN-QUESTIONS.md`).
- Avant le 1er échange : afficher ce qui est transmis au fournisseur ; suppression de partie ; rétention de référence 7 jours ou fin du hackathon (configurable) ; ne pas promettre une suppression non maîtrisée chez le fournisseur.
- Traces de démo : plan de tâches + résultats d'outils, pas de raisonnement interne détaillé.

## Agents sur prospect, conversation et campagne **[PROPOSÉ]**
L'action `scout_search` (gratuite, pas de quota de $) et les actions `prospect_profile`, `prospect_message`, `conversation_triage`, `conversation_reply` et `ad_campaign` **réutilisent l'orchestration bornée** ci-dessus (réservation avant, règlement après, `Idempotency-Key`, aucune transaction pendant l'appel, aucun débit sans réponse exploitable, un `INVALID_OUTPUT` ⇒ une réparation puis échec sans débit) avec de **nouvelles clés de quota** `(prospect, rôle)`, `(conversation, rôle)`, `(campagne, rôle)` (plafond 5, jamais 6) et **sans aucun gain** ; `scout_search` réserve seulement un emplacement de budget d'appels (plafond technique par jour). Les entrées sont des **blocs de données délimités** (instantané minimisé, fiche entreprise, fil de conversation) : une instruction qui s'y trouve est ignorée et testée comme telle. Contrôles par code (faits ⊂ source, mentions d'opposition, limites de caractères par format) = liste de réussites affichée, sans paiement. Le **client simulé** de la messagerie Tutoriel répond **à la demande** (jamais par minuteur), à la charge de la plateforme et plafonné à 6 tours par conversation ; son résultat est calculé par code.

## Pannes et modes dégradés
Afficher l'état réel, préserver la version en cours, proposer une relance sûre. **[PROPOSÉ]** Échec d'envoi (`SEND_FAILED`) : le message passe `NON_ENVOYE`, rien n'est présenté comme envoyé, aucun renvoi automatique ; source réelle indisponible : repli sur le simulé signalé par le badge, jamais de faux résultat ; carte indisponible ou lente : mode liste. Crédits engagés seulement après réponse exploitable. Seuil de tokens atteint ⇒ pause explicite + sauvegarde, la consultation du carnet reste possible. **Mode simulé** pour tests et démo de secours, toujours avec mention visible.

## Budget de tokens
300 M disponibles = plafond, pas objectif : réserve 60 M, ≤ 240 M pour expérimentation et démo. Tableau de bord technique (équipe seulement) : entrée, sortie, cache si dispo, appels échoués, estimation signalée. Ordre de grandeur (cahier, 6 missions) : 100 parties × 6 missions × 6 appels × 3 000 tokens ≈ 10,8 M avant reprises ; mesurer ~10 parties avant d'extrapoler. **[PROPOSÉ]** À recalculer avec le cap prospection (planètes, générations sur prospects, tours du client simulé) : non chiffré dans les docs.

## Qualité de service
État local < 2 s ; 1re réponse agent visée < 15 s (à mesurer) ; ~~prompt ≤ 4 000 caractères ; 36 appels modèle max par tentative (dont 2 réservés à l'évaluation)~~ *(OBSOLÈTE 6e décision ; précision de recherche ≤ 300 caractères, plafond d'appels par recherche à fixer, API-S1)* ; sorties 800 tokens. **[PROPOSÉ]** Les appels sur prospect, conversation et campagne comptent dans le budget global de tokens ; les tours du client simulé sont à la charge de la plateforme.
