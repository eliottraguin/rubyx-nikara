# Plan V2 — référence produit et règles d'exécution (7e décision, 2026-11-08)

**Statut : décidé par l'équipe, orchestré dans SuperFlip (projet « Prospect Tycoon V2 »).** Ce document **prime** sur `docs/PARCOURS-BOT.md` (6e décision) là où ils diffèrent : le plan V2 **réintroduit** un agent évaluateur, des prompts écrits par le joueur et une progression par objectifs. Les règles de fiabilité de `CLAUDE.md` (propriété de session, idempotence, quotas, sorties IA non fiables, pas d'action externe automatique…) **restent toutes valables**. Les contrats détaillés sont produits par le ticket B1 dans `docs/CONTRACTS-V2.md` ; en cas de désaccord entre ce plan et ce fichier, **B1 fait foi** pour les formes (routes, schémas), ce plan pour l'intention.

## 1. Idée et but
Site web interactif gamifié. L'utilisateur **apprend à utiliser des agents IA dans le cadre d'une PME**. Il doit donner de la visibilité à son entreprise à travers **3 métiers, 3 agents** : **Prospection, Relation client, Publicité**. À chaque fois, il **écrit un prompt** pour faire réaliser une tâche. Un agent **évaluateur** joue le rôle du client et donne plus ou moins de récompense selon la **qualité du prompt et du contexte** : plus ou moins de **clients** (prospection), plus ou moins d'**argent** (relation client), plus ou moins de **visibilité** (pub). Un agent **orchestrateur** sert d'assistant : le joueur lui parle, il distribue les tâches aux agents spécialisés, et il peut **améliorer les agents** sur demande.

**But : apprendre l'IA en jouant**, pour des personnes peu à l'aise avec l'IA et qui ne savent pas écrire de prompts. Le jeu n'est pas une simulation parfaite : il est **simplifié**, mais vise à faire apprendre le métier avec des agents.

## 2. État des lieux (au 2026-11-08)
Les trois vues (connexion, ville, immeuble) sont **fonctionnelles et correctes visuellement**. L'immeuble a ses étages (garage pour envoyer des agents, studio pub…). On peut envoyer des agents, gagner de l'argent, débloquer de nouveaux moyens de prospection et de nouveaux agents.

## 3. Objectif
- L'utilisateur gère **la prospection de nouveaux clients, la communication avec ses clients, et la pub**.
- Il **passe obligatoirement par l'orchestrateur** : celui-ci communique avec les sous-agents pour distribuer les tâches. **L'orchestrateur a son étage** dans l'immeuble.
- On commence avec **un agent prospecteur, un agent communication, un agent pub** ; on peut **en acheter d'autres** pour mener **plusieurs missions en parallèle**.
- Le joueur **fait des retours à l'orchestrateur pour améliorer les agents spécialisés** : cette fonctionnalité doit être **mise en avant**.
- Les agents de prospection fonctionnent avec le **SDK AXIS / Codex** (voir `index.mjs`, `api/app/llm/`), avec la **clé renseignée dans `.env`**. Ils ne vont **jamais** sur de vrais sites : ils interrogent une **base de données interne** où ces sites sont **simulés**. Ils prennent un **temps minimum** pour que ce soit réaliste.
- L'agent **évaluateur** (SDK Codex aussi) vit dans **un bâtiment de la ville**. Il évalue les prompts et les échanges avec le client ; c'est lui qui fait progresser le joueur en prompt.
- Tout le processus et tous les agents sont **adaptés à la fiche de l'entreprise**.

## 4. Ce qu'il reste à faire (liste d'origine, source des tickets)
**Game design** : donner envie de jouer, **réduire le texte** des tâches.
**Départs visibles** : quand on lance des agents chercher des clients, on les **voit partir sur la route** (à pied, en voiture, en drone, selon l'agent).
**Orchestrateur** : toute la mécanique d'envoi + l'orchestrateur. Le joueur lui donne son avis sur un agent ; **lui peut modifier sa structure** (instructions, contexte…) — **limité** pour ne pas dépasser les agents déblocables — et **cela coûte de l'argent**.
**Réputation** de l'entreprise. **Niveaux d'entreprise** avec **objectifs** (nombre de clients, argent) qui **changent l'apparence du bâtiment**.
**Boutique** (agents de prospection plus rapides ou spécialisés, agents relation client, meilleurs agents RH) : **dans un bâtiment de la ville**, pas dans l'immeuble.
**Bâtiment de l'évaluateur** dans la ville. **Fiche entreprise** : plus claire, simple à remplir, éléments graphiques « jeu ». **Archives** : plus clair, fun, utilisable. **Salle du courrier** : une **messagerie, une conversation par client** ; quand un client est prospecté, **message automatique** « je suis le client, ok pour tant d'argent » et on peut **négocier** ; les échanges sont **évalués** par l'évaluateur. **Connexion des agents à Codex** avec notre clé.
**Bugs** : (1) impossible de se déconnecter une fois connecté ; (2) transitions entre vues très lentes, parfois **boucles infinies** ; (3) on ne sait pas si les agents sont partis, revenus, ce qu'ils ont rapporté.

## 5. Hypothèses de départ (le ticket B1 peut les corriger, par écrit, en moins d'une heure)
- **Ressources** : argent ($), **visibilité** (points de pub), **réputation** (0 à 100), clients obtenus, **niveau d'entreprise** (1 à 10) calculé **par le serveur** d'après des **objectifs** (clients, argent, réputation) définis dans des fichiers de données.
- **Agents** : trois métiers (`scout` prospection, `replier`/`triage` relation client, `ads` pub) + `orchestrator` + `evaluator`. Chaque **instance** d'agent est achetable en plusieurs exemplaires ; chacune a une **configuration versionnée** (instructions, contexte, outils) et un **palier**.
- **Orchestrateur** : unique, obligatoire pour lancer une tâche. Le joueur lui écrit (le prompt est évalué) ; il propose un **plan** (qui fait quoi), le joueur confirme, le serveur exécute. Il remplace les 3 assistants actuels (`assistant_*`), dont la mécanique de plans/confirmation est **réutilisée**.
- **Amélioration d'agent** : le joueur dit à l'orchestrateur ce qui ne va pas ; il propose une **nouvelle version** de la configuration, **plafonnée par palier** (jamais plus forte que l'agent du palier suivant en boutique), **payante**, **versionnée** (retour arrière possible). Le serveur valide et facture ; le modèle ne fixe jamais ni prix ni plafond.
- **Évaluateur** : note le prompt (clarté, contexte de la fiche, contraintes, ton…) et les échanges de négociation, avec **conseils pédagogiques courts**. Les **récompenses sont calculées par le serveur** d'après la note (règle 3 : le serveur **ignore** toute récompense suggérée par le modèle). Prospection → nombre de clients ; relation client → argent ; pub → visibilité.
- **Boutique** et **évaluateur** : bâtiments distincts de la ville (lieux cliquables), catalogue de la boutique en **fichiers de données** (`data/shop/`).
- **Prospection** : durée minimale réaliste par type d'agent (secondes à minutes de jeu, **pilotée par l'horloge serveur**, pas par le navigateur) ; sources **simulées** en base interne (`data/sources/`).
- **LLM** : fournisseur `codex`/AXIS branché via l'adaptateur existant (`api/app/llm/`), **clé lue dans `.env`**, **jamais affichée ni journalisée** ; **tests toujours avec le fournisseur simulé** ; `TOKEN_CAP` respecté.

## 6. Règles d'exécution pour les agents (obligatoires)
1. **Branche et base.** Une branche par ticket : `feat/<CLÉ>-<slug>` (ex. `feat/GR3-52-logout`), créée depuis **`origin/integration/v2`**. Travailler dans **un worktree dédié** (`git worktree add ../wt-<CLÉ> -b feat/<CLÉ>-<slug> origin/integration/v2`). **Ne jamais modifier le checkout principal** du dépôt (il appartient à l'utilisateur) et **ne jamais pousser sur `main` ni sur `integration/v2`**.
2. **PR vers `integration/v2`** (jamais `main`), avec : ce qui a été fait, **SHA exacts**, vérifications **exécutées** (commande + résultat), ce qui **n'est pas** vérifié. Ne jamais écrire « tests verts » sans les avoir lancés.
3. **Avant la PR** : `git fetch origin && git rebase origin/integration/v2` ; résoudre les conflits en **gardant l'intention des deux côtés**. Fichiers générés : `api/openapi.json` et `api/tests/fixtures` se **régénèrent** (`uv run python -m app.export_openapi`, `uv run python -m app.export_fixtures`) au lieu de se fusionner à la main ; `pnpm-lock.yaml` se régénère (`pnpm install`).
4. **Node 22.** vitest 5 exige Node 22+ (la machine a Node 20) : `source tools/node22.sh` avant `pnpm test` / `pnpm typecheck` / `pnpm lint` / `pnpm build`. Ne modifie ni `.nvmrc`, ni `package.json`, ni le PATH global.
5. **Tests ciblés.** `uv run pytest api/tests/test_<x>.py` (la suite API complète dure ~11 min : réservée à l'intégrateur) ; `pnpm vitest run <fichiers>`. Ajoute des tests pour ce que tu changes.
6. **Migrations Alembic.** Une migration par ticket au plus, `down_revision` = **tête courante d'`integration/v2` au moment du rebase** ; si une autre migration a été fusionnée entre-temps, **rebase de nouveau et renumérote**. Un seul « head » (un test le vérifie).
7. **Zones de propriété (limiter les conflits).** Nouveau code dans **de nouveaux fichiers** par fonctionnalité : `api/app/services/<x>.py`, `api/app/routes/<x>.py`, `src/lib/api/<x>.ts`, `src/components/<x>/`, CSS dans `src/styles/<x>.css` importé par le composant. N'édite `globals.css`, `types.ts`, `adapt.ts`, `AppShell.tsx`, `main.py` que par **petits ajouts localisés**.
8. **Secrets.** `.env` contient des clés : **ne jamais afficher ses valeurs**, ni les copier dans un commentaire, un journal, un test ou une capture. N'affiche que les **noms** des variables.
9. **Ressources de la machine.** Elle est **presque saturée** (15 Go, swap plein) : pas de `next dev` ni de navigateur sauf nécessité, ferme ce que tu ouvres, ne lance pas la suite complète.
10. **Fin de ticket.** Commentaire de complétion (preuves) puis statut **`in_review`**. Bloqué par une dépendance réelle : commentaire précis + statut `blocked`. Problème de sécurité ou question bloquante : **commentaire immédiat** et continue sur ce qui est possible.
11. **Sorties IA = données non fiables.** Rendu texte/Markdown nettoyé, jamais de HTML ; le modèle ne reçoit jamais un email ni un téléphone ; aucun agent n'a d'outil d'envoi (règles 2, 3, 13 à 15 de `CLAUDE.md`).
12. **Langue.** Interface et textes du jeu en **français**, **courts** (le joueur lit peu) ; messages d'erreur avec codes stables.

## 7. Définition de « fini »
Code + tests exécutés + docs/contrats à jour **pour ce que le ticket change** + PR vers `integration/v2` ouverte, rebasée, sans conflit. L'orchestrateur (SuperFlip) fusionne dans `integration/v2` après vérification ; `integration/v2` n'est fusionnée dans `main` qu'après la recette complète (ticket F1).
