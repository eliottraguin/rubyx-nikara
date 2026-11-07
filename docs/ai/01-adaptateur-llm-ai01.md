# AI01 — Adaptateur LLM : ce qu'il doit exposer (documentation uniquement)

**Non exécuté** : la confirmation du fournisseur (« SuperFlix », nom à confirmer, voir `docs/OPEN-QUESTIONS.md`) exige des accès réels. Aucun fichier de secret n'a été lu. L'adaptateur `mock` est dans BE01 (P2) ; il n'est pas réécrit ici.

## Interface (rappel de `docs/CONTRACTS.md`)
Entrée : `role`, `context`, `allowed_tools`, `expected_schema`, `max_output_tokens`.
Sortie : `content`, `tool_calls` (autorisés seulement), `usage` (si dispo), `duration_ms`, `provider_call_id`, `status`.

## Précisions demandées à l'adaptateur (propositions à valider avec P2)
1. `status` : `ok` | `invalid_output` | `error` | `timeout`. Les fixtures `data/fixtures/model_outputs/**` utilisent `status: ok` quand le fournisseur a répondu (même si la validation serveur échoue ensuite), et `error` / `timeout` + `error_code: LLM_UNAVAILABLE` pour une panne.
2. `usage` et `duration_ms` valent `null` quand le fournisseur ne les remonte pas ; **jamais** une valeur inventée. Une estimation est marquée `estimated: true` dans le suivi (voir `06`).
3. `tool_calls` : le serveur rejette tout outil absent de `allowed_tools` (liste de `data/roles/<rôle>.json`) et valide les arguments avec `data/roles/tools.json`. Aucun interpréteur libre.
4. Contexte : le serveur assemble `context` avec des **délimiteurs aléatoires** autour de chaque pièce non fiable (voir `03`) ; il n'envoie jamais de clé, de prompt d'un autre rôle ni de donnée d'une autre session.
5. Version journalisée à chaque appel : `role_version`, `mission_variant_id`, `rubric_id`, `adapter_version`, `prompt_version`.
6. Plafonds de sortie : 800 (métier) / 1 200 (chef, évaluateur) tokens, lus dans `rules_v1.limits` ; timeout 45 s, 1 nouvelle tentative technique.
7. Sorties structurées : si le fournisseur les propose, les utiliser pour `agent_response`, `lead_plan`, `evaluator_output` (schémas dans `data/schemas/`) ; elles ne dispensent pas de la validation serveur.

## Protocole de vérification du fournisseur réel (à exécuter par une personne ayant les accès)
| Étape | À constater | À consigner (sans secret) |
|---|---|---|
| 1 | URL officielle et modèles accessibles | URL publique, identifiants de modèles |
| 2 | Une requête minimale depuis le serveur Python (clé en variable d'environnement serveur) | Statut, forme de la réponse |
| 3 | Format des messages, rôles système/utilisateur | Exemple de payload anonymisé |
| 4 | Sorties structurées / schéma JSON disponibles ? | Oui/non, limites |
| 5 | Remontée des tokens (entrée, sortie, cache) | Champs présents ou absents |
| 6 | Limites de débit, concurrence (5 attendus), taille de contexte | Valeurs lues dans la doc ou mesurées |
| 7 | Comportement en cas de timeout et d'erreur 429/5xx | Codes observés |
| 8 | Conservation des données | Politique du fournisseur |
Critère de fin AI01 : 1 appel réel réussi et la fiche ci-dessus remplie. **Rien de tout cela n'est fait ici.** La passerelle `AXIS_GATEWAY_URL` ou le SDK Node ne doivent pas être présumés compatibles.

## Comportement attendu du `mock` (pour les tests P3)
Déterministe : même entrée, même sortie. Il rejoue les fixtures `data/fixtures/model_outputs/<rôle>/{success,missing_info,failure}.json`, plus les plans invalides du chef et les évaluations invalides du client. Il porte un badge visible en démonstration.
