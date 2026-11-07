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
| `POST /api/sessions` | Crée une partie ; retourne l'état initial + cookie |
| `GET /api/state` | État complet utile à l'UI + actions en cours |
| `POST /api/missions/{id}/start` | Ouvre une tentative, fige le tarif |
| `POST /api/attempts/{id}/messages` | Réserve quota+coût, lance une action vers un rôle autorisé |
| `GET /api/actions/{id}` | Statut, résultat partiel, débit confirmé, réservations |
| `POST /api/actions/{id}/confirm` | Confirme les délégations et réserve leur surcoût (sans replanification) |
| `POST /api/attempts/{id}/clarifications` | Question factuelle au client (max 2) |
| `POST /api/attempts/{id}/artifacts` | Version manuelle ou assemblage |
| `POST /api/attempts/{id}/submit` | Fige une version, lance l'évaluation |
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
| (requête invalide) | 422 | Validation d'entrée |
| (saturation) | 429 | File/concurrence saturée |
| `LLM_UNAVAILABLE` | 503 | Fournisseur indisponible |

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

## Fixtures par écran (à livrer en H2)
Un fichier JSON d'exemple par écran de `UX.md` : accueil, création, bureau, commande, atelier, boutique, livraison, retour client, carnet/fin ; plus les états limites (chargement, quota atteint, fonds insuffisants, agent verrouillé, évaluation en attente, déjà payé).

## Versionnage
Rôles dans des fichiers d'instructions, missions dans des fichiers de données, grilles sous ids stables (`m1_v1`…). Chaque appel journalise les versions utilisées.
