# Notre usage de l'IA pour développer (note pour le jury)

Ce document décrit **comment l'IA a servi à construire** le projet pendant le hackathon (pas l'IA à l'intérieur du produit, traitée dans `docs/ai/`).

## 1. Outils

| Outil | Rôle |
|---|---|
| **Claude Code (CLI)** | Agent de code utilisé dans le dépôt : lecture du code, écriture, tests, commits. |
| **Superflip** | **Orchestrateur d'agents** : il lance et coordonne plusieurs agents Claude en parallèle. |
| **Squads** | Groupes d'agents créés dans Superflip, **un squad par rôle**, auxquels on confie des tickets. |

Traces dans le dépôt : branches `agent/*` et `worktree-agent-*`, worktrees isolés dans `.claude/worktrees/`, skills d'agents dans `.claude/skills/` (commit `9791dc7`).

## 2. Organisation : des squads par rôle

Chaque squad a un rôle défini (développement, revue, QA, etc.) et travaille sur des tickets du `docs/BACKLOG.md`, en parallèle des autres. Chaque agent travaille dans une branche et un worktree git à lui, ce qui évite les collisions entre squads. Les humains choisissent les tickets, fixent le cap et fusionnent.

## 3. Les docs comme contrat

Le contrôle principal sur les agents est **écrit, pas oral** :

- `CLAUDE.md` : cap produit, ordre de lecture des docs, périmètres de chacun, **15 règles non négociables** (le backend maître de l'argent et du score, sorties IA non fiables, idempotence, quota strict de 5 messages, aucune action externe automatique…).
- `docs/RULES.md`, `docs/CONTRACTS.md`, `docs/DATA-MODEL.md` : règles et contrats que le code doit respecter. Une règle ou un contrat change **par écrit avant fusion**.
- `docs/BACKLOG.md` : tickets découpés en jalons (ex. `API-I1` à `API-I4`, `API-P1` à `API-P3`), assez précis pour être confiés à un agent.

Exemple concret : le 2026-11-07, le produit a pivoté cinq fois (prospection réelle, sections Clients et Pub, ville plein écran, un seul bot, 4 rôles). Chaque décision a été inscrite dans `CLAUDE.md` et les docs, et les agents suivants ont repris le nouveau cap sans repartir de zéro.

## 4. Tests verts comme filet de sécurité

Les agents livrent du code, et **les tests décident si c'est acceptable** :

- API (`api/`) : **313 tests pytest** annoncés dans `CLAUDE.md`, avec un fournisseur LLM **simulé déterministe** (aucun appel réseau réel en test).
- Interface (`src/`) : **25 tests vitest** annoncés dans `CLAUDE.md`.
- OpenAPI et fixtures sont régénérés par du code, et les tests échouent s'ils sont périmés, donc un agent ne peut pas modifier un contrat sans que cela se voie.

À reverrouiller avant la présentation : relancer `uv run pytest` (dans `api/`) et `pnpm test` pour confirmer les chiffres. Je ne les ai pas revalidés au moment d'écrire cette note.

## 5. Exemples de livraisons par les squads (historique git)

- `94fc0e8` API FastAPI, moteur économie, quotas et évaluation (BE01–BE07).
- `d3a1d98` carnet de prospection (API-I1 à API-I4).
- `5c5020f` pub et kits de campagne (API-P1 à P3).
- `061de22` messagerie simulée (conversations, client simulé, triage, réponse).
- `6ba7915` carnet, salle du courrier, studio pub et hangar branchés sur l'API.

## 6. Garde-fous et limites assumées

- Les agents ne peuvent pas contourner les règles non négociables : le backend reste maître de l'argent, des quotas et du score, quel que soit le code produit par l'IA.
- Certaines docs (`docs/RECETTE.md`, `docs/ai/*`, `CONTRACTS.md`) décrivent encore l'ancien contenu : la réécriture suit le code, elle ne l'a pas précédé.
- Fournisseur LLM réel, déploiement (BE08) et sources du mode Réel ne sont pas faits : le produit tourne avec le fournisseur `mock`, signalé par un badge.
- La relecture humaine reste nécessaire : un agent peut produire du code qui passe les tests mais s'écarte du cap, d'où l'importance des docs à jour.
