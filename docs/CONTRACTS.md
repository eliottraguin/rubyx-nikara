# Contrats API et schémas

> Source : cahier §14, §15. **Version des contrats : 0.1.** Tout changement de schéma est écrit ici **avant** fusion et signalé immédiatement à P1/P2/P3. P2 publie l'OpenAPI et les fixtures JSON **dès H2**.

## Conventions
- Réponses = objets validés (Pydantic côté API ; types TS générés/alignés côté web).
- Session : **cookie serveur opaque**. Le navigateur ne choisit jamais solde, score ni droits.
- Toute mutation exige `Idempotency-Key`. Même clé ⇒ même résultat.
- Actions longues : réponse `202 Accepted` + id d'action, le navigateur interroge `GET /api/actions/{id}`.
- Messages d'erreur en français ; jamais de clé, de prompt système privé ni de données d'une autre partie.

## Routes
| Route | Effet |
|---|---|
| `POST /api/sessions` | Crée une partie ; retourne l'état initial + cookie. Rejouable par `Idempotency-Key` (voir « Corrections moteur ») |
| `GET /api/state` | État complet utile à l'UI + actions en cours |
| `POST /api/missions/{id}/start` | Ouvre une tentative, fige le tarif |
| `POST /api/attempts/{id}/messages` | Réserve quota+coût, lance une action vers un rôle autorisé |
| `GET /api/actions/{id}` | Statut, résultat partiel, débit confirmé, réservations |
| `POST /api/actions/{id}/confirm` | Confirme les délégations et réserve leur surcoût (sans replanification) |
| `POST /api/attempts/{id}/clarifications` | Question factuelle au client (max 2) |
| `GET /api/attempts/{id}` | Détail d'une tentative : brief et ses changements, pièces visibles, messages, versions de livrable, partages, livraisons et évaluations |
| `POST /api/attempts/{id}/artifacts` | Version manuelle ou assemblage |
| `POST /api/attempts/{id}/shares` | Partage d'une version ou d'un document avec un rôle possédé (l'agent n'accède qu'à ce qui est partagé) |
| `POST /api/attempts/{id}/submit` | Fige une version, lance l'évaluation serveur (BE06, voir « Évaluation d'une livraison ») |
| `POST /api/missions/{id}/retry` | Ouvre une reprise (historique + plafond de paiement conservés) |
| `POST /api/agents/purchase` | Achète un rôle débloqué après contrôle du solde |
| `POST /api/notebook` / `GET /api/notebook` | Enregistre / liste les prompts |
| `POST /api/demo/events` | Injecte un événement admissible (accès démo protégé) |
| `DELETE /api/session` | Supprime la partie et ses contenus personnels |

Complément à prévoir (BE08) : `GET /api/health`.

## Erreurs
| Code stable | HTTP | Cas |
|---|---|---|
| `INSUFFICIENT_FUNDS` | 409 | Solde disponible insuffisant |
| `MESSAGE_LIMIT` | 409 | 5 messages atteints pour ce rôle |
| `ROLE_LOCKED` | 409 | Rôle non possédé / non débloqué |
| `INVALID_STATE` | 409 | Transition interdite |
| `VERSION_CONFLICT` | 409 | Brief/version périmé |
| `INVALID_OUTPUT` | 422 | Sortie modèle invalide après réparation |
| `INVALID_REQUEST` | 422 | Validation d'entrée |
| `RATE_LIMITED` | 429 | File/concurrence saturée |
| `SESSION_REQUIRED` | 401 | Cookie de session absent ou inconnu |
| `NOT_FOUND` | 404 | Ressource inexistante **ou appartenant à une autre session** (jamais de distinction) |
| `NOT_IMPLEMENTED` | 501 | Route du contrat pas encore implémentée |
| `INTERNAL_ERROR` | 500 | Erreur interne (message générique, sans détail) |
| `LLM_UNAVAILABLE` | 503 | Fournisseur indisponible |

Enveloppe d'erreur : `{"error": {"code": "...", "message": "...", "details": {...}?}}` (message en français, `details` optionnel et jamais sensible). Ajoutés en BE01 ; contrat version 0.2.

`Idempotency-Key` : unicité **par session** `(session_id, clé)` — une clé d'une autre session ne doit jamais entrer en collision.

## Schéma — sortie du client évaluateur
```json
{
  "submission_id": "sub_001",
  "rubric_version": "m1_v1",
  "out_of_scope": false,
  "criteria": [
    {"id": "price", "rating": 1.0, "evidence": "Formule à 9,90", "comment": "Prix exact"},
    {"id": "hours", "rating": 0.0, "evidence": "", "comment": "Horaires absents"}
  ],
  "client_feedback": "Ajoutez les horaires de la formule.",
  "next_action": "Corriger les informations de disponibilité"
}
```
Contient **tous** les critères de la grille. Rejet/réparation si : id inconnu, `rating` hors [0,1], preuve invalide. Le backend ignore tout champ de récompense et recalcule les contrôles déterministes.

## Schéma — plan du chef d'équipe
```json
{
  "steps": [
    {"role": "researcher", "task": "Comparer les sources", "source_ids": ["doc_1", "doc_2"]},
    {"role": "writer", "task": "Préparer la publication", "depends_on": 0}
  ],
  "summary": "Vérifier puis rédiger"
}
```
Validation serveur : ≤ 2 étapes, rôles possédés, dépendances sans cycle, pièces appartenant à la tentative. Le serveur ajoute le coût et demande confirmation. Aucun code arbitraire exécuté.

## Interface de l'adaptateur LLM
Entrée : `role`, `context`, `allowed_tools`, `expected_schema`, `max_output_tokens`.
Sortie : `content`, `tool_calls` (autorisés seulement), `usage` (si dispo), `duration_ms`, `provider_call_id`, `status`.
Deux implémentations au minimum : `mock` (déterministe, badge visible en démo) et `real` (branché après vérification AI01). Authentification, timeout, limites et statistiques sont isolés ici.

## Évaluation d'une livraison (BE06, contrat v0.3)
- `POST /api/attempts/{id}/submit` fige texte + brief + grille puis **évalue côté serveur** avant de répondre (fournisseur `mock` : instantané). La réponse porte le statut final : `status` `EVALUATED` et `attempt_status` `COMPLETED` | `FAILED` ; ou `EVALUATING` si l'évaluation n'a pas abouti (panne, sortie invalide après une réparation, grille absente). Dans ce dernier cas **aucun score, aucun paiement** : rejouer `submit` (même version) relance l'évaluation (réponse 200, `replayed: true`). Les livraisons restées `EVALUATING` sont aussi reprises au démarrage de l'API.
- Le modèle ne produit que des notes par critère (schéma « sortie du client évaluateur ») : tout champ `reward`/`score`/`payment` est ignoré. Preuve = citation littérale du livrable pour toute note > 0 d'un critère non déterministe. Une seule réparation ; au-delà, `INVALID_OUTPUT` / `LLM_UNAVAILABLE` sont journalisés dans l'`ActionRun` de type `evaluation` (jamais renvoyés au joueur avec le contenu du modèle).
- Score = `compute_score` (contrôles déterministes de la grille figée + notes du modèle), plafond essentiel = `rules.scoring.essential_failure_cap`. Le paiement `floor(gain_max × score / 100)` (différentiel sur reprise) et la clôture de la tentative sont réglés dans **une seule transaction** ; source de paiement unique par livraison.
- Appels : l'évaluation compte dans `attempt.model_calls` (les 2 appels réservés ; une reprise après échec peut consommer le reliquat du plafond de 36).
- **Changement de schéma (additif)** : `EvaluationOut.report` (objet ou `null`) = `{rubric_id, out_of_scope, client_feedback, next_action, raw_score, capped_by_essential, essential_failed[], passed, reasons[], spent, check_errors[], payment{max_reward, target, already_acquired, credited, already_awarded}}`. `criteria` = une entrée par critère (`id, label, weight, essential, kind, model_rating, deterministic_rating, rating, met, override, comment`), `evidence` = `[{id, evidence}]`. Migration Alembic `0003` (colonne `evaluations.report`). `Submission.status` prend la valeur `EVALUATED` une fois l'évaluation réglée.
- Configuration : `RUBIX_AUTO_EVALUATE` (défaut `1`) ; `0` laisse les livraisons en `EVALUATING` (tests du moteur sans évaluateur).
- Le contenu de mission du dépôt (`data/missions/<mission>/<mode>_v<N>.json`) est désormais chargé (brief, `rubric_id`) en plus de la disposition `data/missions/<mission>_<mode>_v<N>.json`.

## Corrections moteur (contrat v0.4, changements additifs)
- **Crédit de correction (M5)** : le message gratuit après un changement de brief est désormais réellement gratuit. À la réservation, si le rôle a un crédit disponible et qu'aucune action en cours ne le détient, le message coûte **0** (`ActionStepOut.free_credit = true`, `cost = 0`) ; le crédit n'est consommé qu'au règlement d'une réponse exploitable (un échec ne le consomme pas) et le message compte toujours dans le quota de 5. Pour un plan du chef, le tarif des délégations est recalculé à chaque (re)confirmation : au plus une délégation gratuite par rôle.
- **Réponses d'agents = versions de livrable** : chaque réponse exploitable d'un rôle (message ou délégation) crée une `ArtifactVersion` `author: "agent"` avec `contributions = [{role, action_id}]`, écrite par le serveur seul (le navigateur ne peut ni choisir l'auteur ni forger des contributions : `ArtifactCreate` reste `extra="forbid"`). `ActionStepOut.artifact_version_id` donne l'id. Le joueur hérite des contributions en **éditant** (`parent_id`) ou en **assemblant** (`kind: "assembly"`) ces versions : c'est ainsi que M6 compte ses ≥ 2 rôles contributeurs. Une réponse d'agent n'est pas « la première proposition » : l'événement `after_first_proposal` se déclenche à la première version du **joueur**.
- **Idempotence de la création et de la reprise** : `POST /api/sessions` avec la même `Idempotency-Key` et la même requête renvoie la **même partie** (200 au lieu de 201, aucune 2e partie, capital versé une fois). Si le cookie manque (réponse perdue), un nouveau jeton est émis : la clé, secrète côté client, prouve que l'appelant est le créateur. Même clé + autre requête : `INVALID_REQUEST`. `POST /api/missions/{id}/retry` et `/start` rejoués avec la même clé renvoient la tentative qu'elle a ouverte (200). Aucune clé n'est stockée en clair (empreintes ; migration Alembic `0004` : `game_sessions.creation_key_hash` unique + `creation_request_hash`, `mission_attempts.open_key_hash`).
- **`GameState.active_actions`** : liste typée (`id, attempt_id, type, status, created_at, updated_at`) des actions non terminées de la partie (`PENDING`, `RESERVED`, `RUNNING`, `AWAITING_CONFIRMATION`, `PARTIAL`), à suivre via `GET /api/actions/{id}`.

## Fixtures par écran (à livrer en H2)
Un fichier JSON d'exemple par écran de `UX.md` : accueil, création, bureau, commande, atelier, boutique, livraison, retour client, carnet/fin ; plus les états limites (chargement, quota atteint, fonds insuffisants, agent verrouillé, évaluation en attente, déjà payé).

## Versionnage
Rôles dans des fichiers d'instructions, missions dans des fichiers de données, grilles sous ids stables (`m1_v1`…). Chaque appel journalise les versions utilisées.
