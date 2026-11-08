# Contrats V2 — orchestrateur, agents/instances, boutique, évaluateur, réputation, niveaux (7e décision)

> **Statut : décidé (ticket B1, GR3-49), 2026-11-08.** Ce fichier est **additif** à `docs/CONTRACTS.md` (contrats v0.5, cap prospection) et `docs/DATA-MODEL.md` : il ne les remplace pas, sauf mention explicite « REMPLACE ». Il met en forme le **plan V2** (`docs/PLAN-V2.md`, 7e décision) : l'orchestrateur unique et l'évaluateur **remplacent les trois assistants** (`docs/ASSISTANT.md`) et une partie de la 6e décision (`docs/PARCOURS-BOT.md`) — la prospection « sans atelier » reste vraie, mais la récompense n'est plus un montant fixe : elle est **calculée par le serveur à partir de la note de l'évaluateur**. En cas de désaccord entre `docs/PLAN-V2.md` et ce fichier : **ce fichier fait foi pour les formes** (routes, schémas, noms de champs, tables), `docs/PLAN-V2.md` pour l'intention. Toutes les règles de `CLAUDE.md` restent valables (serveur seul maître de l'argent/quotas/récompenses, sorties IA non fiables, idempotence, propriété de session, pas d'action externe automatique).
>
> **Conventions reprises de `docs/CONTRACTS.md`** : session = cookie opaque ; `Idempotency-Key` obligatoire sur toute mutation, unicité par `(session_id, clé)` ; actions longues = `202` + suivi par `GET /api/actions/{id}` ; réservation avant appel, règlement après, jamais de transaction ouverte pendant l'attente réseau ; sorties IA rendues en texte nettoyé, jamais en HTML ; dates UTC ISO 8601 ; montants = entiers de jeu. Enveloppe d'erreur inchangée : `{"error": {"code", "message", "details"?}}`.
>
> **Hypothèses de `docs/PLAN-V2.md` §5 corrigées ici** (le ticket B1 peut les corriger, par écrit, en moins d'une heure — voir « Décisions de B1 » en fin de fichier).

## 0. Vue d'ensemble des rôles (met à jour `Role`, `api/app/schemas/common.py`)

| Rôle | Nature | Change |
|---|---|---|
| `scout`, `triage`, `replier`, `ads` | Métiers, achetables **en plusieurs exemplaires** (instances) | Inchangés comme rôles ; **le hangar vend des instances**, pas juste un déverrouillage (§2) |
| `orchestrator` | Unique, obligatoire, gratuit, toujours possédé | **Nouveau** ; remplace `assistant_prospection`, `assistant_clients`, `assistant_pub` |
| `evaluator` | Unique, PNJ, pas d'instance, pas d'achat | **Nouveau** ; vit dans un bâtiment de la ville (ticket E3a), n'apparaît pas dans le hangar |
| `assistant_prospection`, `assistant_clients`, `assistant_pub` | — | **RETIRÉS** (remplacés par `orchestrator`). Conservés dans l'énumération `Role` le temps de la migration (dépréciés, retrait par un futur ticket d'API-R-like ; non demandé ici) |

`rules_v2.agents` perd les trois rôles `assistant_*` de sa liste de catalogue hangar (ils ne sont plus vendus ni affichés) et gagne `orchestrator` (`price: 0`, `section: "orchestrator"`, toujours `owned: true`, pas d'instance). `evaluator` n'entre pas dans `rules_v2.agents` (pas un rôle du hangar) : ses données vivent dans `data/evaluator/` (§6).

## 1. Orchestrateur (ticket C1)

**Remplace** `docs/ASSISTANT.md` : un seul agent, **obligatoire** pour lancer une tâche (le joueur ne peut plus appeler directement les routes d'action métier **que** via l'orchestrateur — les routes existantes `POST /api/searches`, `POST /api/prospects/{id}/profile|message`, `POST /api/conversations/{id}/triage|reply`, `POST /api/campaigns/{id}/generate` restent dans le contrat et sont réutilisées **par le serveur** à l'exécution du plan ; elles ne sont plus exposées comme point d'entrée principal de l'interface — voir ticket C1 pour la décision d'accès direct). La mécanique de plan/confirmation est **réutilisée telle quelle** (`api/app/services/assistant_plan.py`, `assistant_actions.py`, table `assistant_plans`) : pas de réécriture, seulement des champs en plus et un sélecteur d'assistant qui disparaît.

### `POST /api/orchestrator/plans`
Remplace `POST /api/assistant/plans`. Corps `OrchestratorPlanIn` (`extra="forbid"`) :
```json
{"message": "Trouve-moi des clients en centre-ville puis relance Dupont"}
```
- `message` : 1 à 500 caractères, **donnée**, jamais une consigne système.
- Pas de champ `assistant` (un seul orchestrateur). Action `orchestrator_plan` (rôle `orchestrator`, coût `rules_v2.orchestrator.plan_cost`, proposé à **0**, comme l'ancien `assistant_plan`).
- Le serveur ajoute un **contexte minimisé** au modèle : résumé fiche entreprise, instances possédées par rôle avec leur **statut** (`idle`/`busy`/`traveling`) et **palier**, quotas restants par cible, message du joueur. Jamais d'email ni de téléphone.
- Réponse **201** `OrchestratorPlanOut` (= `PlanOut` existant, `api/app/schemas/assistant.py`, **+ champs** par étape) en statut `PROPOSED` :
```json
{
  "id": "orp_01", "headline": "Voici ce que je propose de faire", "banner": "Rien n'est envoyé ni publié sans vous. Vous recevez des brouillons à relire.",
  "summary": "Chercher des prospects au centre-ville, puis relancer Dupont",
  "status": "PROPOSED",
  "steps": [
    {"index": 0, "type": "scout_search", "target_id": "annuaire", "target_label": "Bibliothèque publique",
     "instance_id": "agi_scout_01", "role": "scout", "tier": 1, "duration_estimate_s": 35,
     "title": "Chercher des prospects à la Bibliothèque publique", "who": "votre éclaireur", "you_get": "de nouveaux prospects dans votre carnet",
     "instruction": "centre-ville", "cost": 0, "blocked_reason": null, "status": "READY", "action_id": null, "result_text": null, "tries": 0},
    {"index": 1, "type": "conversation_reply", "target_id": "conv_dupont", "target_label": "Dupont",
     "instance_id": "agi_replier_01", "role": "replier", "tier": 1, "duration_estimate_s": 8,
     "title": "Préparer une réponse pour Dupont", "who": "votre rédacteur", "you_get": "un brouillon de réponse que vous relisez",
     "instruction": null, "cost": 2, "blocked_reason": null, "status": "READY", "action_id": null, "result_text": null, "tries": 0}
  ],
  "total_cost": 2, "balance": 60, "balance_after": 58, "plans_left": 4, "simule": true, "created_at": "2026-11-08T10:00:00Z"
}
```
- **Champs ajoutés à `PlanStepOut`** : `instance_id` (`string | null` — choisie par le serveur parmi les instances **idle** du rôle requis, jamais par le modèle), `role` (string), `tier` (int), `duration_estimate_s` (int, lu dans `data/agents/tiers.json`, §7). Si aucune instance idle : `status: "BLOCKED"`, `blocked_reason: "Aucun·e <rôle> disponible : achetez-en un·e ou attendez son retour."`, `instance_id: null`.
- Validation par code (inchangée, étendue) : ≤ 3 étapes, types en liste blanche (`rules_v2.orchestrator.step_types`, mêmes 6 types que l'ancien `assistant.step_types`), cibles de la session, quota `(cible, action)` restant, pas de doublon `(type, cible)`, **+ rôle possédé avec au moins une instance** (sinon étape `BLOCKED`, pas un rejet de tout le plan). Hors contrat après une réparation : `INVALID_OUTPUT`, sans débit.
- Limite `rules_v2.orchestrator.plans_max` (proposé **5** par partie, comme l'ancien `assistant.plans_max` ; les plans annulés ne comptent pas).
- Erreurs : `INVALID_OUTPUT` (422), `INVALID_REQUEST` (422), `SESSION_REQUIRED` (401), `RATE_LIMITED` (429, plan quota atteint — **à trancher comme l'ancien §Q2**, reprend `INVALID_STATE` 409 si on préfère : **décision B1** → `INVALID_STATE` 409, "Vous avez atteint votre limite de demandes à l'orchestrateur."). `Idempotency-Key` : oui.

### `POST /api/orchestrator/plans/{id}/confirm`, `.../reject`, `GET /api/orchestrator/plans`, `GET /api/orchestrator/plans/{id}`
Identiques à `docs/ASSISTANT.md` §3/§4 (confirm exécute dans l'ordre, clé dérivée `{plan}:{tâche}:{essai}`, `PARTIAL` si une étape échoue, `reject` sans débit). **Ajout** : à l'exécution d'une étape, le serveur pose l'instance choisie en `busy`/`traveling` (`AgentInstance.status`, §2) pour sa durée minimale (`duration_estimate_s`), puis la repasse `idle` (ou `disabled` si l'instance a été vendue/retirée entre-temps — cas hors MVP). Confirmer un plan dont une instance n'est plus idle (prise par un autre plan entre la proposition et la confirmation) : l'étape passe `BLOCKED` à l'exécution (pas d'erreur globale), `blocked_reason` posé, pas de débit pour cette étape.

### `POST /api/agents/instances/{id}/improve` (amélioration, ticket C3)
Le joueur donne un retour sur une instance (« trop générique », « trop familier »…) ; l'orchestrateur propose une **nouvelle version** de configuration.
- Corps `AgentImproveIn` (`extra="forbid"`) : `{feedback: string, 1 à 500 caractères}` (donnée, jamais une consigne).
- Action `agent_improve` (rôle `orchestrator`). Coût lu dans `rules_v2.orchestrator.improve_cost_by_tier` (ex. palier 1→2 : 60 $ ; palier 2→3 : 120 $ ; au palier maximal du catalogue boutique pour ce rôle : refus, voir erreur ci-dessous).
- Le modèle reçoit : le `feedback`, les `instructions` et `context_note` actuels (contenu, pas une consigne), le palier courant et le **plafond** (`tier_cap` = palier actuel + 1, jamais au-delà du palier maximal vendu en boutique pour ce rôle, `data/agents/tiers.json` §7). Il propose `instructions` (≤ `limits.agent_instructions_max_chars`, 1500) et `context_note` (≤ 500).
- **Le serveur, jamais le modèle, fixe le prix et le plafond** (règle 1) : toute proposition est **tronquée/rejetée par contrôle** si elle dépasse les bornes de longueur ou si le palier demandé dépasse `tier_cap` — le palier de l'instance **ne change pas** via cette route (l'amélioration affine `instructions`/`context_note`, elle n'achète pas un palier : un palier s'achète en boutique, §2). `tier_cap` ne sert qu'à borner l'ambition du texte généré (ex. un palier 1 ne peut pas prétendre à des outils ou des délais de palier 3) ; contrôle par code sur des mots-clés interdits (`data/evaluator/` n'intervient pas ici).
- Réponse **202** `AgentImproveOut` = `ActionOut` + `instance_id`, `config_version` (entier, nouvelle version créée), `price_paid`, `summary` (phrase FR). `status: SUCCEEDED` (exécuté avant la réponse, comme `prospect_profile`).
- Erreurs : `ROLE_LOCKED` (409, instance inexistante ou rôle non possédé), `INSUFFICIENT_FUNDS` (409), `INVALID_OUTPUT` (422, proposition inexploitable après une réparation, aucun débit), `NOT_FOUND` (404), `INVALID_REQUEST` (422), `SESSION_REQUIRED` (401). `Idempotency-Key` : oui.
- **Retour en arrière** : `POST /api/agents/instances/{id}/rollback` — corps `{config_version: int}` (version existante et antérieure à la version active). **Gratuit**, immédiat, `200` `AgentInstanceOut` à jour. Erreurs : `NOT_FOUND`, `INVALID_REQUEST` (version inconnue ou future). `Idempotency-Key` : oui.

## 2. Agents en plusieurs exemplaires, paliers et boutique (ticket C2)

**Remplace** la mécanique « un rôle = une ligne `AgentOwnership` = déverrouillé ou non » pour `scout`/`triage`/`replier`/`ads` : un rôle peut avoir **0 à `rules_v2.agents_max_instances_per_role`** (proposé **3**) instances, chacune avec son **palier** (tier) et sa **configuration versionnée**. `AgentOwnership` (table livrée) reste la source du **déverrouillage** (le rôle est-il débloqué par le nombre de clients ? règle inchangée) ; `AgentInstance` (nouvelle, §8) est la source de la **possession physique** d'un exemplaire.

### Entité `AgentInstance` (nouvelle table `agent_instances`, migration §9)
`{id (agi_…), session_id, role (scout|triage|replier|ads), tier (int ≥ 1), status (idle|busy|traveling|disabled), label (string|null, ≤ 40, surnom joueur), active_config_id, price_paid, purchased_at, created_at, updated_at}`. Une instance n'existe que si le rôle est débloqué (`ROLE_LOCKED` sinon). Pas unique par `(session, role)` : plusieurs lignes possibles.

### Entité `AgentConfig` (nouvelle table `agent_configs`, migration §9)
`{id (acf_…), instance_id, version (int, par instance, à partir de 1), parent_id (version précédente | null), instructions (≤ 1500), context_note (≤ 500 | null), tools (JSON, toujours [] — aucun outil d'envoi, règle 13), tier_cap (int), price_paid (int, 0 pour la version initiale), created_by (system|orchestrator), action_id (null pour la version initiale), created_at}`. **Immuable** (comme `prospect_drafts` : trigger sans `UPDATE`) ; la version 1 est créée automatiquement à l'achat, copiée depuis `data/roles/<role>.json` + le palier acheté.

### `GET /api/shop`
Catalogue + état d'achat.
- Réponse 200 `ShopOut` : `{items: [ShopItemOut…], owned_counts: {scout: n, triage: n, replier: n, ads: n}}`.
- `ShopItemOut` : `{id, role, tier, label, price, effects: {duration_multiplier: float, quality_bonus: int}, unlock_clients: int|null, unlocked: bool, buyable: bool}` (catalogue lu dans `data/shop/*.json`, §7 ; `unlocked`/`buyable` calculés par le serveur comme `HangarAgentView`).
- Gratuit à consulter. Pas d'`Idempotency-Key` (lecture).

### `POST /api/shop/purchase`
Achète **une nouvelle instance** au palier d'un article du catalogue.
- Corps `ShopPurchaseIn` (`extra="forbid"`) : `{item_id: string}` (référence `data/shop/*.json`).
- Contrôles, **dans l'ordre** : rôle débloqué (`ROLE_LOCKED` 409 sinon) ; nombre d'instances du rôle < `rules_v2.agents_max_instances_per_role` (sinon `409 INSTANCE_LIMIT`, nouveau code, §5) ; solde suffisant (`INSUFFICIENT_FUNDS` 409).
- Réponse **201** `AgentInstanceOut` : `{id, role, tier, status: "idle", label: null, active_config_id, config: {version: 1, instructions, context_note: null, tools: [], tier_cap}, price_paid, purchased_at}`. `Idempotency-Key` : oui (rejeu ⇒ même instance, pas un second achat).
- Erreurs : `NOT_FOUND` (item_id inconnu), `ROLE_LOCKED`, `INSTANCE_LIMIT`, `INSUFFICIENT_FUNDS`, `INVALID_REQUEST`, `SESSION_REQUIRED`.
```json
// requête
{"item_id": "replier_t2"}
// réponse 201
{"id": "agi_07", "role": "replier", "tier": 2, "status": "idle", "label": null, "active_config_id": "acf_07",
 "config": {"version": 1, "instructions": "…", "context_note": null, "tools": [], "tier_cap": 3}, "price_paid": 90, "purchased_at": "2026-11-08T10:00:00Z"}
```

### `PATCH /api/agents/instances/{id}`
Le joueur ne modifie que `label` (≤ 40 caractères). Corps `{label}`. Réponse 200 `AgentInstanceOut`. Erreurs : `NOT_FOUND`, `INVALID_REQUEST`. `Idempotency-Key` : oui.

### `GET /api/agents/instances`
Liste des instances possédées, triées par rôle puis date d'achat. Réponse 200 `{items: [AgentInstanceOut…]}`. Lecture, pas d'`Idempotency-Key`.

## 3. Évaluateur (ticket C4)

**Remplace** la grille « 40 code / 60 agent » retirée par la 6e décision et réintroduit un agent évaluateur, mais **sans retour à l'ancien moteur** (pas d'atelier, pas de livraison, pas de `Submission`/`Evaluation` d'avant API-R2 : table neuve, sans lien avec l'ancienne). L'évaluateur note **deux choses**, jamais un livrable : (a) la **consigne écrite par le joueur** à une action agent (`instruction` des actions existantes, ou `message`/`feedback` à l'orchestrateur) et (b) les **échanges de négociation** d'une conversation (§6). Il vit dans un bâtiment de la ville (PNJ, aucune instance, aucun achat).

### Déclenchement — additif aux actions existantes, pas de nouvelle route pour le joueur
Chaque action qui accepte une **consigne du joueur** (`instruction` sur `POST /api/prospects/{id}/profile|message`, `POST /api/conversations/{id}/triage|reply`, `POST /api/campaigns/{id}/generate`, `POST /api/searches` via `precision`, et `message` sur `POST /api/orchestrator/plans`) déclenche, **après** la réponse métier (même appel, pas un aller-retour en plus), un second appel modèle (rôle `evaluator`, schéma `PromptEvaluation`, `purpose` `evaluator_prompt`) qui note la **consigne seule** (pas le résultat produit) sur : clarté, contexte repris de la fiche entreprise, contraintes précisées, ton. **Si le joueur n'a fourni aucune consigne** (champ `instruction`/`precision`/`message` vide ou absent), l'évaluateur **ne note rien** (aucune ligne créée, pas de malus) : rien à évaluer.
- Sortie modèle : `{score (0 à 100), feedback (≤ 300, conseil pédagogique court, FR)}`. Contrôle par code (grille `data/evaluator/rubrics_prompt_v1.json`) : bornes respectées, pas de fait inventé sur le joueur, `feedback` sans HTML. Illisible : une réparation, puis `score: 0` et `feedback` générique (**jamais d'échec de l'action métier à cause de l'évaluateur** : son appel ne peut ni annuler ni retarder le débit déjà réglé par l'action métier).
- Le serveur calcule la **récompense** depuis `score` et `data/evaluator/rewards_v1.json` (jamais le modèle, règle 1) ; voir §4 pour le mapping métier → récompense.
- Une ligne `Evaluation` est créée, `kind: "prompt"`, `metier` déduit du type d'action (`prospection` pour `scout_search`/`prospect_*`, `clients` pour `conversation_*`, `pub` pour `ad_campaign`), `source_type: "action"`, `source_id: <action_id>`.
- **Exposition** : le champ `evaluation` s'ajoute à `ActionOut` (et aux réponses typées qui l'étendent : `ProspectActionOut`, `SearchOut`…) : `{score, feedback, reward_kind, reward_amount} | null` (`null` si pas de consigne). Aucun débit, aucun coût supplémentaire pour le joueur.

### `GET /api/evaluations`
Historique (ticket E3c, « Écran Évaluateur »).
- Paramètres : `metier?` (`prospection`|`clients`|`pub`), `kind?` (`prompt`|`negotiation`), `limit`, `cursor`.
- Réponse 200 `{items: [EvaluationOut…], next_cursor}`. `EvaluationOut` : `{id, kind, metier, source_type, source_id, score, feedback, reward_kind, reward_amount, created_at}`.
- Gratuit, lecture seule, propriété de session. Pas d'`Idempotency-Key`.

## 4. Récompenses par métier (serveur, `data/evaluator/rewards_v1.json`, §7)

| Métier | `reward_kind` | Calcul serveur | Effet |
|---|---|---|---|
| Prospection | `clients` | bandes de score → bonus de prospects retenus : `score ≥ 80` → `+2`, `score ≥ 50` → `+1`, sinon `+0` | Ajouté à `kept`/`added` de la **recherche en cours** (`SearchOut`, §... de `CONTRACTS.md` §11), avant la limite de 500 prospects ; jamais inventé si le lieu n'a pas assez d'enregistrements valides (le bonus ne crée jamais un prospect sans `source_ref` vérifié : il ne fait que **retenir** des prospects déjà `a_verifier`/`hors_cible` trouvés par le lieu, dans la limite de ce qui a été examiné) |
| Relation client | `argent` | `reward_amount = max(rules_v2.client_reward_min, round(rules_v2.client_reward_base × score / 100))` (`client_reward_base` proposé **20**, remplace l'ancien montant fixe ; `client_reward_min` proposé **5**) | Crédité au ledger (`client_reward`, source unique `client:<session>:<prospect>`, inchangé) **au moment de la conclusion de négociation** (§6), pas à la seule réponse du prospect |
| Pub | `visibilite` | `reward_amount = round(rules_v2.visibility_base × score / 100)` (`visibility_base` proposé **10**) | Ajouté à `GameState.visibility` (nouveau compteur cumulatif, jamais dépensé ; §8) |

Aucune de ces formules n'est appliquée par le modèle : il ne renvoie qu'un `score`, jamais un montant (règle 1, invariant déjà en place pour `assistant_plan`).

## 5. Codes d'erreur ajoutés (complète `docs/CONTRACTS.md` §Erreurs, `api/app/errors.py`)

| Code | HTTP | Cas |
|---|---|---|
| `INSTANCE_LIMIT` | 409 | Nombre maximal d'instances du rôle atteint (`rules_v2.agents_max_instances_per_role`) |
| `NO_INSTANCE_AVAILABLE` | — | **N'est pas un code d'erreur** : une étape sans instance idle passe `BLOCKED` dans le plan (§1), elle ne fait jamais échouer toute la requête. Pas de nouveau code. |

Aucun autre code n'est ajouté : les erreurs existantes (`ROLE_LOCKED`, `INSUFFICIENT_FUNDS`, `INVALID_OUTPUT`, `NOT_FOUND`, `INVALID_REQUEST`, `SESSION_REQUIRED`, `VERSION_CONFLICT`, `RATE_LIMITED`) couvrent les nouvelles routes par analogie directe avec les routes livrées (même famille d'action : réservation/quota/validation).

## 6. Réputation (ticket C5)

Nombre entier **0 à 100**, affiché dans l'état, jamais négatif ni > 100 (clampé par le serveur). Stockage en **événements signés** (comme le ledger), jamais une colonne mutable directe — traçabilité et idempotence.

### Entité `ReputationEvent` (nouvelle table `reputation_events`, migration §9)
`{id (rep_…), session_id, delta (int signé), reason_code (evaluation_prompt|evaluation_negotiation|opt_out|client_lost), source_action (unique, ex. "evaluation:<evaluation_id>"), created_at}`.
`GameState.reputation = clamp(0, 100, rules_v2.reputation.initial (proposé 50) + somme des deltas)`.

### Règles d'alimentation (serveur, lues dans `rules_v2.reputation`)
- Une évaluation `kind: "prompt"` de score ≥ 70 : `+1`. Score < 30 : `-1`. Entre les deux : `0` (pas de ligne créée, rien à journaliser).
- Une évaluation `kind: "negotiation"` conclue `acceptee` : `+2` ; `refusee` : `-1`.
- Un prospect qui se désinscrit (`OPTED_OUT`, code existant) pendant une conversation : `-2` (`reason_code: opt_out`), **une fois par prospect** (`source_action` unique garantit l'idempotence).
Aucun effet additionnel n'est inventé ici : les barèmes exacts (`+1`/`-1`/`+2`…) sont des **valeurs de données** (`rules_v2.reputation`), ajustables sans redéploiement.

Pas de nouvelle route : la réputation se lit dans `GET /api/state` (§8) et dans l'historique implicite via `GET /api/evaluations` (chaque évaluation dit si elle a affecté la réputation, champ `reputation_delta: int` ajouté à `EvaluationOut`).

## 7. Niveaux d'entreprise et objectifs (ticket C6)

**Remplace** `rules_v2.building.levels` (seuil unique `min_clients`) par un barème **à trois objectifs** (`data/company/levels.json`, §7bis), conforme à `docs/PLAN-V2.md` §5 : « niveau d'entreprise calculé par le serveur d'après des objectifs (clients, argent, réputation) ». `GET /api/prospects/export.csv`, le ledger et les routes existantes ne changent pas.

- **Règle de passage de niveau** : un niveau `N` est atteint quand les **trois** seuils de `data/company/levels.json[N].objectifs` sont atteints ou dépassés (`clients_obtained ≥ clients_min` **ET** `balance.booked ≥ argent_min` **ET** `reputation ≥ reputation_min`). Le niveau **ne baisse jamais** même si l'argent est dépensé ensuite (le serveur retient le **niveau maximal déjà atteint**, pas un recalcul à chaque lecture qui pourrait rétrograder) : nécessite de retenir le plus haut niveau atteint — voir note de stockage ci-dessous.
- **Stockage** : pas de nouvelle table. Le plus haut niveau atteint est **recalculé à chaque lecture de l'état** comme le `max` des niveaux dont les trois seuils sont (ou ont été, voir note) satisfaits ; comme l'argent peut baisser (achats), geler le niveau exige de retenir un **plafond horodaté**. **Décision B1** : ajouter une colonne `GameSession.company_level_floor` (int, défaut 1, mise à jour **seulement vers le haut**, écrite dans la même transaction que tout événement qui pourrait faire monter le niveau — gain de client, crédit de réputation, achat de boutique qui dépense de l'argent). Migration §9.
- Réponse (`GET /api/state`, champ `company_level`, §8) : niveau courant = `max(company_level_floor, plus haut niveau dont les 3 seuils sont remplis maintenant)`, sans jamais redescendre sous `company_level_floor`.

### `data/company/levels.json` — format (§7bis pour l'exemple complet)
`{version, levels: [{level (1 à 10), objectifs: {clients_min, argent_min, reputation_min}, apparence: string (id de skin d'immeuble)}]}`.

## 8. `GET /api/state` — champs ajoutés (additif à `GameState`, `api/app/schemas/state.py`)

```json
{
  "orchestrator": {"last_message": "Trouve-moi des clients en centre-ville puis relance Dupont", "active_plan_id": "orp_01", "plans_left": 4},
  "agents": [
    {"id": "agi_scout_01", "role": "scout", "tier": 1, "status": "idle", "label": null, "active_config_id": "acf_01", "config_version": 1}
  ],
  "shop_catalog": [
    {"id": "scout_t2", "role": "scout", "tier": 2, "label": "Éclaireur rapide", "price": 90, "unlocked": true, "buyable": true}
  ],
  "evaluator": {"last_evaluations": [{"id": "evl_09", "kind": "prompt", "metier": "prospection", "score": 72, "feedback": "Bonne précision de zone ; ajoutez un secteur pour affiner.", "reward_kind": "clients", "reward_amount": 1, "created_at": "2026-11-08T10:00:00Z"}]},
  "reputation": 54,
  "visibility": 12,
  "company_level": {"level": 3, "objectifs": {"clients_min": 2, "argent_min": 80, "reputation_min": 20}, "progres": {"clients": 2, "argent": 95, "reputation": 54}, "next_level_at": {"clients_min": 4, "argent_min": 150, "reputation_min": 30}, "apparence": "immeuble_niveau_3"},
  "open_negotiations": [
    {"conversation_id": "conv_dupont", "prospect_id": "pro_01", "entreprise": "Dupont", "negotiation_offer_initial": 18, "negotiation_status": "ouverte"}
  ],
  "activity_feed": [
    {"seq": 41, "type": "departed", "instance_id": "agi_scout_01", "role": "scout", "planet_id": "annuaire", "created_at": "2026-11-08T10:00:00Z"},
    {"seq": 42, "type": "returned", "instance_id": "agi_scout_01", "role": "scout", "search_id": "src_ab12", "prospects_added": 3, "created_at": "2026-11-08T10:00:35Z"}
  ]
}
```
- `orchestrator` : `OrchestratorStateOut` = `{last_message: string|null, active_plan_id: string|null, plans_left: int}`. `active_plan_id` pointe le plan `PROPOSED`/`RUNNING`/`PARTIAL` le plus récent (un seul à la fois : un plan `AWAITING` bloque-t-il un nouveau `POST` ? **Non** : plusieurs plans peuvent coexister, comme aujourd'hui `assistant_plans`).
- `agents` : `list[AgentInstanceSummaryOut]` (toutes les instances possédées, tous rôles).
- `shop_catalog` : `list[ShopItemOut]` (identique à `GET /api/shop`, dupliqué pour l'affichage sans appel supplémentaire ; **lecture seule**, l'achat reste `POST /api/shop/purchase`).
- `evaluator.last_evaluations` : les 5 dernières `EvaluationOut` (toutes catégories), le détail complet est dans `GET /api/evaluations`.
- `reputation` : `int` (§6). `visibility` : `int` (§4, cumulatif, jamais dépensé).
- `company_level` : `CompanyLevelOut` (§7).
- `open_negotiations` : `list[OpenNegotiationOut]` — résumé des conversations `negotiation_status: "ouverte"` (détail complet via `GET /api/conversations/{id}`).
- `activity_feed` : `list[ActivityEventOut]` — les 20 derniers événements de **toutes** les instances de la partie (tous rôles, pas seulement `scout` ; répond aussi au bug A3, ticket GR3-52, et au ticket C7). `ActivityEventOut` : `{seq, type (departed|en_route|arrived|working|returning|returned|failed), instance_id, role, planet_id: string|null, search_id: string|null, prospects_added: int|null, created_at}`. Jamais de prompt système, de clé ni de contenu de dialogue brut (texte libre non inclus ici ; le détail narratif reste dans `GET /api/actions/{id}.trace`, `docs/CONTRACTS.md` §9, inchangé).

## 9. Prospection réaliste, statuts et flux d'activité (ticket C7)

- **Durée minimale pilotée par le serveur** (jamais le navigateur) : à l'exécution d'une étape `scout_search` (directe ou via l'orchestrateur), l'instance choisie passe `status: "traveling"` pendant `duration_estimate_s` (lu dans `data/agents/tiers.json`, borne `[duration_seconds_min, duration_seconds_max]` du palier, tiré déterministiquement par graine de partie + id de recherche) avant que le résultat ne soit exploitable. `POST /api/searches` reste **201/202 immédiat côté HTTP** (le calcul du rapport est déjà synchrone, §`CONTRACTS.md` §11) mais `GET /api/searches/{id}.status` reste `RUNNING` jusqu'à l'expiration du délai simulé — **décision B1** : le calcul reste fait en un seul appel (pas de tâche de fond à ce stade), mais le champ `available_at` (`datetime`) est ajouté à `SearchOut` : l'interface **affiche** l'agent en route jusqu'à `available_at` même si la donnée est déjà prête côté serveur (cohérent avec « départs visibles », `docs/PLAN-V2.md` §4). Pas de nouvel état serveur bloquant : c'est un **effet d'affichage garanti par une donnée serveur**, pas une fausse latence imposée à l'API.
- **Trace d'activité** (table `agent_activity_events`, migration §9) : chaque transition d'instance (`departed`, `en_route`, `arrived`, `working`, `returning`, `returned`, `failed`) écrit une ligne, `seq` croissant par session. Alimente `activity_feed` (§8). Écrit **sans** contenu de dialogue ni donnée personnelle (règle 6).
- **Base simulée** : inchangé (`data/sources/*.json`, `data/planets/*`), aucune nouvelle route.

## 10. Messagerie : conversation automatique et négociation évaluée (ticket C8)

**Étend** `docs/CONTRACTS.md` §5 (`Conversation`, inchangée dans sa forme) sans toucher à `send` (toujours 501/bloqué juridiquement).

- **Message automatique à l'ouverture** : `POST /api/prospects/{id}/contact` (inchangée, `docs/CONTRACTS.md` §11) crée désormais, **dans la même transaction**, un premier `ConversationMessage` `sens: "recu"`, `simule: true`, texte **gabarit** (`data/clients/negotiation_open_v1.json`, pas un appel modèle : « Bonjour, je suis intéressé(e). Je peux mettre {offre} $ pour votre offre. ») où `{offre}` = `negotiation_offer_initial` (calculé par le serveur, `rules_v2.negotiation.offer_base` ± aléa déterministe par graine, **jamais par le modèle**). `Conversation` gagne `negotiation_offer_initial: int` et `negotiation_status: "ouverte"|"acceptee"|"refusee"` (colonnes, migration §9).
- **Négocier** : le joueur répond via la route existante `POST /api/conversations/{id}/messages` (Tutoriel, inchangée) ou via `reply`/`triage` (inchangées) : rien de neuf à ce niveau, ce sont des **données**.
- **Conclure** (nouvelle route) : `POST /api/conversations/{id}/conclude` — corps `{accepted: bool}` (décision du joueur, jamais déduite d'un texte modèle). Déclenche l'**évaluateur** (`kind: "negotiation"`, rôle `evaluator`, schéma `NegotiationEvaluation`) sur le **fil complet** (textes reçus = données, jamais une consigne) : note la qualité de l'échange côté joueur (clarté, ton, absence de promesse non tenable) et renvoie `{score, feedback}`. Le serveur :
  - pose `negotiation_status` = `acceptee` si `accepted: true` **et** le prospect a reçu au moins un message (`CONTRACTS.md` §8 invariant repris), sinon `refusee` ;
  - si `acceptee` et prospect pas déjà `gagne` : passe le prospect `gagne` (règle inchangée de `PATCH /api/prospects/{id}`, réutilisée en interne) et crédite `reward_amount` (§4, calculé depuis `score`) au ledger, **une fois par prospect** ;
  - crée la ligne `Evaluation` (`kind: "negotiation"`, `metier: "clients"`, `source_type: "conversation"`, `source_id: <conversation_id>`).
  - Réponse 200 `ConversationConcludeOut` : `{conversation_id, negotiation_status, evaluation: {score, feedback, reward_kind: "argent", reward_amount}, clients_obtained}`.
  - Erreurs : `INVALID_STATE` (409, déjà conclue, ou aucun message reçu si `accepted: true`), `NOT_FOUND`, `OPTED_OUT` (409, prospect désinscrit : conclusion forcée à `refusee`, pas d'erreur bloquante — **décision B1** : `OPTED_OUT` reste réservé à l'**envoi**, `conclude` sur un prospect écarté répond `200` avec `negotiation_status: "refusee"` automatiquement), `SESSION_REQUIRED`, `INVALID_REQUEST`. `Idempotency-Key` : oui (rejeu ⇒ même résultat, aucun second crédit).
```json
// requête
{"accepted": true}
// réponse 200
{"conversation_id": "conv_dupont", "negotiation_status": "acceptee",
 "evaluation": {"score": 81, "feedback": "Bonne reformulation de l'offre, restez ferme sur le délai la prochaine fois.", "reward_kind": "argent", "reward_amount": 16},
 "clients_obtained": 5}
```

## 11. Agents LLM / SDK AXIS / Codex (tickets D1–D3)

Pas de nouvelle route ; additif à l'**interface de l'adaptateur** (`docs/CONTRACTS.md` « Interface de l'adaptateur LLM », `api/app/llm/`).
- **D1** : implémentation `real` branchée sur le relais AXIS (`api/app/llm/real.py`, déjà un squelette), clé lue par **nom de variable d'environnement** seulement (`CODEX_API_KEY` ou équivalent déjà présent dans `.env.example` — **ne jamais afficher sa valeur**, règle 8 de `docs/PLAN-V2.md`) ; `provider: "codex"` dans `data/llm/models_v2.json` (nouveau fichier, un id de modèle par rôle : `orchestrator`, `evaluator`, `scout`, `triage`, `replier`, `ads`). Aucun changement de schéma d'entrée/sortie de l'adaptateur (`role, context, allowed_tools, expected_schema, max_output_tokens` → `content, tool_calls, usage, duration_ms, provider_call_id, status`) : D1 **branche**, ne redéfinit rien.
- **D2** : le **bloc fiche entreprise** (`docs/CONTRACTS.md` point 29g) est ajouté en tête du contexte de **tous** les appels de rôle métier (inchangé) **et** des appels `orchestrator`/`evaluator` (nouveau, car ils doivent eux aussi rester adaptés à la fiche). Aucune route, un ajout de contexte uniquement.
- **D3** : fournit à l'évaluateur les grilles de `data/evaluator/` (§... schémas `PromptEvaluation` et `NegotiationEvaluation` du §3/§10) comme `expected_schema` de l'adaptateur. Aucune route.

Aucun de ces tickets ne change `allowed_tools` : il reste `[]` pour tous les rôles (aucun outil d'envoi, règle 13).

## 12. Formats des fichiers de données (nouveaux, avec un exemple minimal chacun)

Les fichiers complets livrés dans ce ticket (valeurs de départ, à ajuster par les tickets consommateurs) sont dans `data/shop/`, `data/company/`, `data/evaluator/`, `data/agents/`. Formats ci-dessous.

### `data/shop/<role>.json` — un fichier par métier (`scout.json`, `triage.json`, `replier.json`, `ads.json`)
```json
{
  "role": "scout",
  "items": [
    {"id": "scout_t1", "tier": 1, "label": "Éclaireur", "price": 40,
     "effects": {"duration_multiplier": 1.0, "quality_bonus": 0}, "unlock_clients": null},
    {"id": "scout_t2", "tier": 2, "label": "Éclaireur rapide", "price": 90,
     "effects": {"duration_multiplier": 0.6, "quality_bonus": 5}, "unlock_clients": 2}
  ]
}
```
`unlock_clients` : nombre de clients obtenus requis pour que l'article soit `buyable` (`null` = pas de condition de clients, seul le prix compte, comme `HangarAgentView`). `effects.duration_multiplier` multiplie `duration_seconds_min/max` du palier (`data/agents/tiers.json`) ; `quality_bonus` s'ajoute au score de l'évaluateur pour les actions de cette instance (plafonné à 100, jamais négatif).

### `data/company/levels.json`
```json
{
  "version": "company_levels_v1",
  "levels": [
    {"level": 1, "objectifs": {"clients_min": 0, "argent_min": 0, "reputation_min": 0}, "apparence": "immeuble_niveau_1"},
    {"level": 2, "objectifs": {"clients_min": 1, "argent_min": 50, "reputation_min": 10}, "apparence": "immeuble_niveau_2"},
    {"level": 3, "objectifs": {"clients_min": 2, "argent_min": 80, "reputation_min": 20}, "apparence": "immeuble_niveau_3"}
  ]
}
```
(Fichier livré complet jusqu'au niveau 10, §7bis ; progression des seuils `clients_min` reprise de l'ancien `rules_v2.building.levels` : 0, 1, 2, 4, 7, 11, 16, 22, 30, 40.)

### `data/evaluator/rubrics_prompt_v1.json`
```json
{
  "id": "rubrics_prompt_v1",
  "criteres": [
    {"id": "clarte", "label": "Clarté de la demande", "poids": 30},
    {"id": "contexte", "label": "Reprend un élément de la fiche entreprise", "poids": 30},
    {"id": "contraintes", "label": "Précise une contrainte utile (zone, ton, délai…)", "poids": 25},
    {"id": "ton", "label": "Ton cohérent avec la fiche", "poids": 15}
  ],
  "note_min": 0, "note_max": 100
}
```

### `data/evaluator/rubrics_negotiation_v1.json`
```json
{
  "id": "rubrics_negotiation_v1",
  "criteres": [
    {"id": "clarte_reponse", "label": "Réponse claire au client", "poids": 35},
    {"id": "ton_pro", "label": "Ton professionnel", "poids": 25},
    {"id": "sans_promesse_non_tenable", "label": "Aucune promesse chiffrée non vérifiable", "poids": 25, "essentiel": true},
    {"id": "fermete_delai", "label": "Délai ou condition clairement posés", "poids": 15}
  ],
  "note_min": 0, "note_max": 100
}
```

### `data/evaluator/rewards_v1.json`
```json
{
  "id": "rewards_v1",
  "prospection": {"reward_kind": "clients", "bandes": [{"score_min": 80, "bonus": 2}, {"score_min": 50, "bonus": 1}, {"score_min": 0, "bonus": 0}]},
  "clients": {"reward_kind": "argent", "base": 20, "min": 5, "formule": "round(base * score / 100)"},
  "pub": {"reward_kind": "visibilite", "base": 10, "formule": "round(base * score / 100)"}
}
```

### `data/agents/tiers.json`
```json
{
  "version": "agent_tiers_v1",
  "roles": {
    "scout": {
      "max_tier": 3,
      "tiers": [
        {"tier": 1, "duration_seconds_min": 20, "duration_seconds_max": 60},
        {"tier": 2, "duration_seconds_min": 12, "duration_seconds_max": 36},
        {"tier": 3, "duration_seconds_min": 8, "duration_seconds_max": 20}
      ]
    },
    "triage": {"max_tier": 2, "tiers": [{"tier": 1, "duration_seconds_min": 5, "duration_seconds_max": 15}, {"tier": 2, "duration_seconds_min": 3, "duration_seconds_max": 9}]},
    "replier": {"max_tier": 3, "tiers": [{"tier": 1, "duration_seconds_min": 8, "duration_seconds_max": 20}, {"tier": 2, "duration_seconds_min": 5, "duration_seconds_max": 14}, {"tier": 3, "duration_seconds_min": 3, "duration_seconds_max": 9}]},
    "ads": {"max_tier": 2, "tiers": [{"tier": 1, "duration_seconds_min": 10, "duration_seconds_max": 25}, {"tier": 2, "duration_seconds_min": 6, "duration_seconds_max": 16}]}
  },
  "improvement": {
    "cost_by_target_tier": {"2": 60, "3": 120},
    "tier_cap_rule": "une configuration améliorée ne peut jamais viser un palier au-delà du palier maximal vendu en boutique pour ce rôle (`max_tier` ci-dessus) ; elle ne change pas le `tier` de l'instance (qui ne s'achète qu'en boutique)"
  }
}
```

## 13. Modèle de données ajouté — tables et colonnes exactes

| Table (nouvelle) | Colonnes | Ticket |
|---|---|---|
| `agent_instances` | `id` PK, `session_id` FK cascade, `role`, `tier` int, `status` (`idle`\|`busy`\|`traveling`\|`disabled`), `label` nullable, `active_config_id` FK, `price_paid`, `purchased_at`, `created_at`, `updated_at` | C2 |
| `agent_configs` | `id` PK, `instance_id` FK cascade, `version` int (unique avec `instance_id`), `parent_id` FK nullable (auto), `instructions`, `context_note` nullable, `tools` JSON, `tier_cap` int, `price_paid` int, `created_by` (`system`\|`orchestrator`), `action_id` nullable, `created_at` — **immuable** (trigger sans `UPDATE`) | C2 (+ C3 réutilise) |
| `evaluations` | `id` PK, `session_id` FK cascade, `kind` (`prompt`\|`negotiation`), `metier` (`prospection`\|`clients`\|`pub`), `source_type` (`action`\|`conversation`\|`plan`), `source_id`, `rubric_id`, `score` int, `feedback`, `reward_kind` (`clients`\|`argent`\|`visibilite`), `reward_amount` int, `reputation_delta` int, `created_at` — unique `(source_type, source_id)` | C4 |
| `reputation_events` | `id` PK, `session_id` FK cascade, `delta` int signé, `reason_code`, `source_action` unique, `created_at` | C5 |
| `agent_activity_events` | `id` PK, `session_id` FK cascade, `instance_id` FK nullable, `search_id` FK nullable, `action_id` nullable, `type`, `seq` int (croissant par session), `payload` JSON nullable, `created_at` | C7 |

| Table existante modifiée | Colonnes ajoutées | Ticket |
|---|---|---|
| `conversations` | `negotiation_offer_initial` int nullable, `negotiation_status` (`ouverte`\|`acceptee`\|`refusee`, défaut `ouverte`), `negotiation_evaluation_id` FK nullable → `evaluations.id` | C8 |
| `game_sessions` | `company_level_floor` int, défaut `1`, ne peut que monter | C6 |

Aucune colonne ni table de l'ancien moteur (`MissionAttempt`, `Submission`, ancienne `Evaluation` retirée par la migration `0015`) n'est réutilisée : la nouvelle table `evaluations` est **sans lien** avec l'ancienne (déjà retirée).

## 14. Plan de migrations — une migration par ticket backend, numéros réservés

**Tête actuelle d'`integration/v2` au moment de l'écriture de ce ticket : `0017_user_token`.** Règle inchangée (`docs/PLAN-V2.md` §6.6) : chaque agent rebase sur `origin/integration/v2` avant d'ouvrir sa PR et renumérote si une autre migration a été fusionnée entre-temps ; un seul head.

| N° réservé | Ticket | Contenu | `down_revision` prévu |
|---|---|---|---|
| `0018_agent_instances` | C2 | `agent_instances`, `agent_configs` (+ triggers immuables) | `0017_user_token` |
| `0019_evaluations` | C4 | `evaluations` | `0018_agent_instances` |
| `0020_reputation_events` | C5 | `reputation_events` | `0019_evaluations` |
| `0021_agent_activity_events` | C7 | `agent_activity_events` | `0020_reputation_events` |
| `0022_conversation_negotiation` | C8 | colonnes `conversations.negotiation_*` | `0021_agent_activity_events` |
| `0023_company_level_floor` | C6 | colonne `game_sessions.company_level_floor` | `0022_conversation_negotiation` |

**Tickets sans migration** (réutilisent les tables ci-dessus ou du moteur livré, aucune n'est demandée) : **C1** (orchestrateur : table `assistant_plans` déjà assez générique, `steps` JSON porte les champs nouveaux) ; **C3** (amélioration : réutilise `agent_configs` de C2) ; **D1, D2, D3** (adaptateur LLM, contexte, grilles : fichiers de données et code applicatif seulement).

**Ordre de fusion recommandé** (dépendances fonctionnelles, pas seulement la chaîne `down_revision`) :
1. **C2** (`0018`) — base (instances, configs) dont dépendent C1, C3, C7.
2. **C4** (`0019`) — évaluateur, dont dépendent C1 (champ `evaluation` sur les actions), C5, C8.
3. **C1** (sans migration) — orchestrateur, dépend de C2 et C4.
4. **C3** (sans migration) — amélioration, dépend de C2 (et de C1 pour la route, mais peut être codée en parallèle avec des mocks).
5. **C5** (`0020`) — réputation, dépend de C4.
6. **C7** (`0021`) — flux d'activité, dépend de C2 (instance_id).
7. **C8** (`0022`) — négociation, dépend de C4 (évaluateur) et de C2/C5 (récompense, réputation).
8. **C6** (`0023`) — niveaux d'entreprise, dépend de C5 (réputation) et du ledger existant (argent) ; dernier car il lit les trois ressources.
9. **D1, D2, D3** — en parallèle de tout ce qui précède (adaptateur LLM indépendant des tables ; D2/D3 ont juste besoin que C1/C4 existent pour brancher le contexte réel, mais peuvent être développés et testés avec le fournisseur `mock` avant).

Si deux tickets backend sont fusionnés dans un ordre différent de celui-ci, le second **rebase et renumérote** sa migration (règle déjà en vigueur) ; l'ordre fonctionnel ci-dessus est une recommandation, pas une contrainte technique bloquante (les tables sont indépendantes les unes des autres à l'exception des clés étrangères listées au §13).

## 15. Décisions de B1 (hypothèses de `docs/PLAN-V2.md` §5 corrigées par écrit)

1. **Accès direct aux routes métier** : conservé dans le contrat (compatibilité, tests existants), mais l'interface (ticket E4) ne les expose plus comme point d'entrée principal — seul le chemin orchestrateur est mis en avant, conformément à « le joueur passe obligatoirement par l'orchestrateur ». Aucune route n'est supprimée.
2. **Un seul orchestrateur, jamais plusieurs instances** : contrairement aux métiers, l'orchestrateur n'a pas d'`AgentInstance` (toujours disponible, jamais `busy`) — sinon une seule conversation complexe pourrait bloquer tout le jeu.
3. **`evaluator` n'est pas un rôle du hangar** : pas d'achat, pas d'instance, pas de palier — un bâtiment de la ville (ticket E3a) lui donne une présence visuelle, sans mécanique d'achat.
4. **Récompense prospection = bonus de prospects retenus**, pas un ajout de « clients » directement (le mot « clients » de `docs/PLAN-V2.md` §1 désigne le résultat final de la boucle, pas un gain instantané : un prospect retenu en plus n'est pas encore un client).
5. **Niveau d'entreprise à trois seuils simultanés** (ET logique), pas une moyenne ni un score composite : plus simple à expliquer au joueur et à vérifier par un test.
6. **Négociation évaluée seulement à la conclusion** (`POST .../conclude`), pas à chaque message : évite un coût caché à chaque échange et garde un seul crédit de récompense par prospect (invariant déjà en place).

## 16. Vérification contre les critères d'acceptation

- **Couverture `docs/PLAN-V2.md` §3 et §4** : orchestrateur (§1), instances/paliers/boutique (§2), amélioration d'agent (§1 fin), évaluateur (§3), réputation (§6), niveaux et objectifs (§7), départs visibles et flux d'activité (§9), boutique dans un bâtiment de la ville (§2, ticket E3a côté interface), bâtiment de l'évaluateur (§3, ticket E3a), salle du courrier / négociation évaluée (§10), connexion Codex/AXIS (§11), bugs A3 « on ne sait pas si les agents sont partis/revenus » (§9, `activity_feed`) — **aucun point laissé « à définir »**.
- **Champs/routes cités par d'autres tickets** : noms exacts ci-dessus, repris tels quels dans les commentaires de découpage (GR3-53 à GR3-73).
- **Pas de contradiction avec `CLAUDE.md`** : récompenses toujours calculées par le serveur depuis un `score` (jamais un montant du modèle) ; aucun prix ni plafond fixé par le modèle (`tier_cap`, prix de boutique, barèmes — tous en données ou calculés serveur) ; aucun outil d'envoi (`tools: []` partout) ; versions immuables (`agent_configs`, `evaluations` n'est jamais réécrite) ; idempotence sur toute nouvelle mutation ; propriété de session inchangée.
