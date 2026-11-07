# Modèle de données et machines à états

> Source : cahier §13. Stockage : SQLite (instance de démo), PostgreSQL en évolution. Montants = entiers de jeu. Toute lecture/mutation vérifie la **propriété de la session** ; aucun identifiant reçu n'est utilisé sans contrôle.

## Entités
| Entité | Champs et contraintes |
|---|---|
| `GameSession` | `id`, jeton de session opaque (cookie), `mode` (`beginner`/`expert`), `company`, `state`, `stage`, `seed`, dates, `rules_version` |
| `AgentOwnership` | `session_id`, `role`, `price_paid`, `purchased_at` — **unique (session_id, role)** |
| `MissionDefinition` | `id`, `version`, `mode`, brief, corpus, critères (+poids, contrôles), `max_reward`, `unit_price`, événements, prérequis |
| `MissionAttempt` | `id`, `session_id`, `mission_id`, `brief_version`, `status`, `spend_cap`, compteurs (messages par rôle, clarifications, appels), `attempt_no`, `unit_price` figé |
| `Message` | `id`, `attempt_id`, `role`, `author` (joueur/agent), texte, pièces liées, `status`, `action_id` |
| `ArtifactVersion` | `id`, `attempt_id`, `type`, contenu, `parent_id`, `author` (agent/joueur), sources, contributions liées — **immuable** |
| `Submission` | `id`, `artifact_version_id`, `brief_version`, empreinte (hash), grille figée, `status` |
| `Evaluation` | `submission_id` **unique**, modèle, `judge_version`, critères, `score` calculé, preuves, `status`, `report` (retour client, réussite, paiement ; BE06) |
| `LedgerEntry` | `id`, `session_id`, montant entier signé, catégorie, `source_action` **unique**, `state` |
| `ActionRun` | `id`, `idempotency_key` **unique**, type, réservation, `status`, étapes, erreur |
| `LLMCall` | `action_id`, rôle, modèle, usage (mesuré/estimé), durée, tentatives, coût réel si connu |
| `NotebookEntry` | `session_id`, titre, prompt, rôle, mission d'origine, date |

Compléments nécessaires (à créer en BE01) : table de **réservations** (montant, quota, échéance), journal de **partages de pièces**, table d'**événements appliqués** (id, version de brief).

## Machines à états
**Tentative** : `AVAILABLE → ACTIVE → (EVALUATING) → COMPLETED | FAILED`.
- Une reprise **crée une nouvelle tentative** ; elle ne rouvre jamais une livraison figée.
- Évaluation en échec technique ⇒ retour à un état d'attente récupérable, sans modifier le résultat pédagogique.

**Action** : `PENDING → RESERVED → RUNNING → SUCCEEDED | PARTIAL | FAILED`.
- Plan du chef : `AWAITING_CONFIRMATION` avant la réservation des délégations.
- Réservations avec échéance et **réconciliation** ; un `RUNNING` interrompu est réconcilié au redémarrage.

## Invariants
1. Versions de livrable **immuables** ; une édition crée un enfant.
2. Une transaction de récompense a une **source unique** (pas de double paiement).
3. Solde disponible = comptabilisé − réservations actives ; jamais négatif (achats concurrents inclus).
4. Un changement de grille ne modifie pas rétroactivement une livraison évaluée ; chaque appel journalise les versions de rôle/mission/grille utilisées.
5. Les données privées d'une session ne sont jamais lisibles par une autre (T13).
6. Les journaux masquent secrets et contenus non nécessaires.
