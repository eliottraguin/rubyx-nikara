---
status: accepted
date: 2026-11-08
decision-makers: [Noah]
consulted: [équipe Prospect Tycoon V2]
informed: []
---

# Orchestrateur unique et évaluateur remplacent les assistants et la 6e décision

## Context and Problem Statement

La 6e décision (`docs/PARCOURS-BOT.md`, 2026-11-08) avait retiré tout prompt écrit par le joueur, tout score et tout paiement par expédition : « pas d'atelier, juste un bot qui va chercher des clients ». Trois assistants (`docs/ASSISTANT.md`) servaient d'interface de délégation vers les agents spécialisés, sans évaluer quoi que ce soit.

Le plan V2 (`docs/PLAN-V2.md`, 7e décision) change le but du produit : il doit **apprendre à écrire des prompts** à une personne peu à l'aise avec l'IA. Cela exige de réintroduire une évaluation de la qualité du prompt et des échanges du joueur, et de simplifier l'interface de délégation à un seul agent obligatoire (« il passe obligatoirement par l'orchestrateur »). Il faut décider si l'on garde trois assistants spécialisés plus un évaluateur séparé, ou si l'on fusionne en un couple orchestrateur/évaluateur unique, et comment cela s'articule avec la 6e décision (pas d'atelier, pas de score d'expédition).

## Decision Drivers

* Une seule interlocutrice doit être **obligatoire** pour toute tâche (règle produit explicite, `docs/PLAN-V2.md` §3).
* La récompense doit rester **calculée par le serveur**, jamais par le modèle (règle 1 de `CLAUDE.md`), même quand elle dépend d'une note de qualité de prompt.
* La mécanique de plan/confirmation des assistants (`api/app/services/assistant_plan.py`, `assistant_actions.py`, table `assistant_plans`) est déjà testée et conforme aux règles d'idempotence et de quotas : elle doit être **réutilisée**, pas réécrite.
* Le produit doit rester jouable sans fournisseur réel (le fournisseur `mock` reste la référence de test, règle 9 de `CLAUDE.md`).
* Le périmètre doit tenir dans un découpage en tickets indépendants (C1 à C8), chacun livrable sans bloquer les autres plus que nécessaire.

## Considered Options

* **Option A — Garder les trois assistants, ajouter un évaluateur séparé sans lien avec eux.** Chaque assistant continue de proposer un plan pour sa section ; un évaluateur note en parallèle les consignes et les négociations.
* **Option B — Un orchestrateur unique remplace les trois assistants ; un évaluateur distinct (PNJ, pas d'instance) note les consignes et les négociations ; la récompense redevient variable (calculée depuis la note), au lieu du montant fixe de la 6e décision.**
* **Option C — Fusionner orchestrateur et évaluateur dans un seul agent** qui à la fois distribue les tâches et note les prompts.

## Decision Outcome

Option retenue : **B — orchestrateur unique + évaluateur distinct**, parce que :
- elle respecte l'exigence produit d'un unique point de passage obligatoire (l'orchestrateur), sans mélanger ce rôle avec celui, contradictoire, de juge impartial (un agent qui distribue le travail et qui le note en même temps serait un conflit d'intérêt pédagogique : le joueur doit sentir que l'évaluateur est une entité séparée, dans son propre bâtiment) ;
- elle réutilise directement la mécanique de plan/confirmation existante (migration quasi nulle, voir `docs/CONTRACTS-V2.md` §14 : l'orchestrateur ne demande aucune nouvelle migration) ;
- elle **remplace** la 6e décision sur un point précis et documenté (`docs/PARCOURS-BOT.md` §6 Q1, décision « (b) » : récompense fixe par client) sans revenir sur le reste de la 6e décision (pas d'atelier, pas de commanditaire, pas de brief, pas de livraison évaluée à l'ancienne — ces points restent abrogés) ;
- elle permet à chaque métier (prospection, relation client, pub) de garder sa route d'action existante, l'orchestrateur et l'évaluateur n'étant que des couches additives (contexte, note, récompense), ce qui limite le risque de régression sur les routes déjà livrées et testées.

L'option A est rejetée : elle duplique trois fois la mécanique de plan sans bénéfice, et contredit l'exigence « passe obligatoirement par l'orchestrateur » (trois assistants restent trois points d'entrée). L'option C est rejetée : elle complique la pédagogie (un agent qui juge son propre travail de distribution) et romprait l'invariant « le serveur, jamais le modèle, calcule la récompense » en rendant plus difficile l'isolement du calcul de score.

### Conséquence directe sur la 6e décision

`docs/PARCOURS-BOT.md` reste la référence pour : l'absence d'atelier, de commanditaire, de brief, de clarifications, de livraison notée à l'ancienne, et pour le parcours en quatre temps (fiche → recherche → carnet → contact). Est **remplacé** par ce document et par `docs/CONTRACTS-V2.md` : le montant fixe de récompense par client (20 $, §7 de `docs/PARCOURS-BOT.md`) devient une récompense **variable**, calculée par le serveur depuis la note de l'évaluateur sur la négociation (`docs/CONTRACTS-V2.md` §4 et §10) ; de même, les trois assistants (`docs/ASSISTANT.md`) sont remplacés par l'orchestrateur unique (`docs/CONTRACTS-V2.md` §1).

## Consequences

### Good

* Un seul point d'entrée pour le joueur, conforme à l'exigence produit ; l'ancienne mécanique de plan est conservée sans réécriture.
* La récompense reste strictement calculée par le serveur à partir d'une note bornée (0 à 100) et de barèmes en données (`data/evaluator/rewards_v1.json`) : aucun nouveau risque d'injection de prompt sur l'argent ou les quotas.
* Le découpage en tickets (C1 orchestrateur, C4 évaluateur, C2 instances/boutique, C5 réputation, C6 niveaux, C7 activité, C8 négociation) reste indépendant : chaque table ajoutée (§13 de `docs/CONTRACTS-V2.md`) n'a de dépendance qu'envers les tables qui la précèdent dans l'ordre de fusion recommandé.

### Bad

* Deux nouveaux agents PNJ (`orchestrator`, `evaluator`) s'ajoutent à l'énumération `Role`, ce qui demande une vigilance supplémentaire dans les contrôles de liste blanche (ne jamais permettre à l'orchestrateur de se déléguer à lui-même, règle déjà écrite dans `docs/ASSISTANT.md` §5 et reprise).
* La récompense variable réintroduit une dépendance à la qualité de sortie du modèle évaluateur (bornée par un contrôle par code et une réparation unique, comme les autres sorties non fiables) : un appel évaluateur mal formé ne doit jamais bloquer l'action métier déjà réglée (`docs/CONTRACTS-V2.md` §3 le précise explicitement).

### Neutral

* Les trois rôles `assistant_prospection`, `assistant_clients`, `assistant_pub` restent dans l'énumération `Role` du code pour la durée de la migration (dépréciés, non supprimés par ce ticket) : leur retrait effectif n'est pas demandé ici, à rechiffrer plus tard si besoin.

## More Information

Référence produit : `docs/PLAN-V2.md` (7e décision). Détail des contrats : `docs/CONTRACTS-V2.md`. Document remplacé sur les points ci-dessus : `docs/PARCOURS-BOT.md` (6e décision) et `docs/ASSISTANT.md`. À valider par relecture de code lors de l'implémentation des tickets C1 et C4 (GR3-53, GR3-56).
