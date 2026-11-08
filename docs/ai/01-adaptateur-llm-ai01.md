# AI01 — Adaptateur LLM : ce qu'il doit exposer (documentation uniquement)

**Statut (GR3-61)** : fournisseur `codex` ajouté (`api/app/llm/codex.py`, `api/tests/test_llm_codex.py`), même contrat et même protocole que `real` (`api/app/llm/real.py`) — **investigation** : la relais AXIS parle directement le protocole Messages d'Anthropic en HTTP, appelable depuis le serveur Python sans pont Node ; `index.mjs` (essai isolé `@axis/sdk`) reste inutilisé, aucune dépendance Node ajoutée. Les deux fournisseurs sont **écrits et testés sur faux transport**, aucun réseau. L'étape **« un appel réel réussi » reste À FAIRE par le propriétaire** avec ses accès (commande ci-dessous, `RUBIX_LLM_PROVIDER=codex` ou `real`). Aucun fichier de secret n'a été lu. L'adaptateur `mock` reste le défaut. Rappel (`docs/OPEN-QUESTIONS.md` #65) : le groupe AXIS sondé jusqu'ici ne sert que des modèles Claude, aucun modèle « codex » à proprement parler — `codex` est le nom de fournisseur attendu par le produit (`docs/PLAN-V2.md` §5), pas un modèle distinct ; décision de modèles par rôle toujours portée par `data/llm/models.json`.

## Protocole vérifié (relais AXIS, sondée en amont)
- Protocole **Messages d'Anthropic** : `POST {base}/v1/messages`, en-têtes `x-api-key` (et/ou `Authorization: Bearer`), `anthropic-version: 2023-06-01`, `content-type: application/json`.
- Corps : `{model, max_tokens, system?, messages:[{role:"user",content}], temperature?, tools?}`. Réponse : `{id, model, content:[{type:"text",text}|{type:"tool_use",id,name,input}], stop_reason, usage:{input_tokens, output_tokens, cache_*}}`.
- Modèles : `claude-haiku-4-5-20251001`, `claude-sonnet-5-5`, `claude-sonnet-5`, `claude-sonnet-4-6`, `claude-sonnet-4-5-20250929` (`GET {base}/v1/models`). Aucun modèle OpenAI/codex sur ce groupe : on reste sur Claude. Modèles par rôle dans `data/llm/models.json` (haiku : scout, triage, tri de pertinence ; sonnet-5-5 : replier, ads, assistants).
- Erreurs : `{"error":{"code","message","type"}}`, 404 `model_not_found` pour un modèle indisponible. L'adaptateur ne relaie jamais ce corps : statut `error` générique, retry technique par `call_provider`.
- Non vérifié : limites de débit, sorties structurées natives (on demande du JSON dans le message), conservation des données du fournisseur (étapes 6 et 8).

## Configuration et premier appel réel (propriétaire)
Variables serveur : `RUBIX_LLM_PROVIDER=codex` (ou `real`, même protocole), `RUBIX_LLM_API_KEY` (repli : `AXIS_GATEWAY_KEY`), `RUBIX_LLM_BASE_URL` (repli : `AXIS_GATEWAY_URL` ; https hors localhost). Au démarrage, une variable manquante ou un modèle inconnu dans `data/llm/models.json` est signalé.
Diagnostic manuel (GR3-61), depuis `api/`, clés déjà dans l'environnement (affiche seulement succès/échec, latence, tokens — jamais la clé ni le contenu) :
`RUBIX_LLM_PROVIDER=codex uv run python -m app.cli llm-check`
Équivalent explicite :
`RUBIX_LLM_PROVIDER=codex uv run python -c "import asyncio; from app.config import Settings; from app.llm import get_adapter, LLMRequest; s=Settings.from_env(); r=asyncio.run(get_adapter('codex', s).generate(LLMRequest(role='scout', context='Réponds par le mot OK.', max_output_tokens=20))); print(r.status, r.usage, r.duration_ms)"`

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
