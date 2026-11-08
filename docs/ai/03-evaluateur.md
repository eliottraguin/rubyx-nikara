> **OBSOLÈTE (6e décision, 2026-11-08)** : ce document décrit l'ancien contenu (M1–M6, client évaluateur, score et paiement par expédition). Voir `docs/PARCOURS-BOT.md`. Ne pas s'y fier ; retrait des données associées : ticket API-R2.

# AI03 — Client évaluateur : grilles, schéma, preuves, résistance

Fichiers : `data/rubrics/{m1..m6,rescue}_v1.json` (schéma `rubric.schema.json`), `data/schemas/evaluator_output.schema.json`, rôle `data/roles/system/client_evaluator.json`, fixtures `data/fixtures/model_outputs/client_evaluator/`.

## Principe
Le modèle ne produit **aucune récompense, aucun score, aucun montant**. Il note chaque critère entre 0 et 1, cite une preuve et conseille. Le serveur valide, recalcule les contrôles déterministes, calcule le score /100 et le paiement. Tout champ inconnu (`reward`, `score`, `payment`…) est ignoré (fixture `client_evaluator/reward_field_ignored`).

## Structure d'une grille
`id` stable (`m1_v1`…), `criteria` pondérés (somme = 100), `essential` (+ `essential_min_rating` optionnel), `kind` (`deterministic` | `semantic` | `mixed`), `basis` (`public_brief`, `corpus`, `clarification`, `trace`, `calculation`), `depends_on_facts`, `check_ids`, `deterministic_checks` déclaratifs, `evaluator_policy`.
Poids : la référence 40/20/20/10/10 est conservée ; l'exactitude (40) est répartie en sous-critères (ex. M1 : prix 20 + horaires 20). Tableau de synthèse :

| Grille | Critères (poids) — essentiels marqués * |
|---|---|
| m1_v1 (max 20) | price 20*, hours 20*, delivery 20, target 20*, clarity 10, coherence 10 |
| m2_v1 (30) | prospect_relevance 20*, need_cited 20*, delivery 20, realistic_action 20, clarity 10, coherence 10 |
| m3_v1 (40) | facts_accuracy 20*, uncertainty_handling 20*, delivery 20, fit_need 20, clarity 10, coherence 10 |
| m4_v1 (60) | conversion_rate 15*, cpa 15*, applicable_offer 10, delivery 20, need_fit 20, clarity 10, sources 10 |
| m5_v1 (90) | facts_accuracy 20*, target_adaptation 20*, delivery 20, budget_benefit_cta 20, clarity 10, coherence 10 |
| m6_v1 (150, finale, seuil 70) | facts_accuracy 20*, numeric_recommendation 20* (min 0,8), delivery 15, need_fit 15, clarity 10, sources_coherence 10, coordination 10 |
| rescue_v1 (10) | closure_info 20*, reopening_info 20*, delivery 20, need_fit 20, clarity 10, coherence 10 |

Pour M4 : tolérance d'arrondi **explicite** : 2 décimales, écart absolu ≤ 0,05 (point de pourcentage pour les taux, euro pour les coûts) ; les valeurs attendues sont recalculées depuis le tableau par `validate_content.py`.

## Faits non communiqués (M3)
Le canal de diffusion est un fait privé non déductible. Règle appliquée et vérifiée : aucun critère essentiel n'a `depends_on_facts` ∩ faits privés ≠ ∅ et aucun essentiel n'a une base privée. L'essentiel de M3 porte sur la **gestion de l'incertitude** (clarification obtenue, hypothèse signalée ou texte conditionnel), jamais sur le canal lui-même. Le critère `fit_need` (non essentiel) peut dépendre du canal.

## Contrôles déterministes (vocabulaire, sémantique de référence)
Implémentation de référence : `tools/validate_content.py` (fonctions `run_check`, `run_rubric_checks`). **BE06 doit reproduire la même sémantique** ou la corriger par écrit ici.
| Type | Paramètres | Résultat |
|---|---|---|
| `regex_all` / `regex_any` / `regex_none` | `patterns`, `scope?` | 1 ou 0 (insensible à la casse) |
| `max_words` / `min_words` | `max`/`min`, `exclude_pattern?`, `scope?` | 1 ou 0 ; mot = jeton séparé par des espaces contenant au moins un caractère alphanumérique |
| `amounts_allowed` | `allowed` | 1 si tous les montants suivis de € / euro(s) / EUR sont dans la liste (tolérance 0,005) |
| `percents_allowed` | `allowed` | idem pour les pourcentages |
| `number_tolerance` | `targets[{line_pattern, unit_regex, expected, tolerance}]` | fraction de cibles atteintes : une ligne correspondant au motif contient un nombre suivi de l'unité, à ± tolérance |
| `capture_in_set` | `pattern` (1 groupe), `allowed` | 1 si l'id capturé est autorisé |
| `capture_keyed_regex` | `capture_pattern`, `keyed_patterns` | 1 si le texte cite un besoin propre à la fiche capturée |
| `trace_flag` | `name`, `op`, `value` | lit la trace serveur (ex. `clarification_obtained`, `contributing_roles`) |
| `any_of` | `check_ids` | maximum des fractions |
`scope` = portion du texte entre un motif de début et un motif de fin (ex. section « Email »). Nombres au format français (virgule décimale, espace insécable de milliers).
Combinaison : note déterministe d'un critère = moyenne de ses contrôles (`check_ids`). `deterministic` : note = note déterministe. `mixed` : note finale = min(note modèle, note déterministe). `semantic` : note du modèle.

## Score (formule de référence, à confirmer par P2)
`score = arrondi_demi_supérieur(Σ poids × note)` ; si `out_of_scope` → 0 ; si un critère essentiel a une note < `essential_min_rating` (0,5 par défaut ; 0,99 pour les essentiels déterministes ; 0,8 pour le calcul chiffré de M6) → `min(score, 40)`. Réussite : ≥ 60 (≥ 70 en finale) sans échec essentiel. Paiement : `floor(max × score / 100)` (RULES §5). **Hypothèses non écrites dans RULES.md** : l'arrondi du score et la définition de « essentiel rempli » (seuil de note) ; à valider par P2 (voir `10`).

## Preuves
`evidence` doit être une **citation littérale** du livrable figé (comparaison après normalisation des espaces et de la casse). Note > 0 avec preuve vide ou non littérale ⇒ sortie invalide ⇒ une réparation. Note 0 : preuve vide autorisée. Les comptes rendus de contrôle déterministe n'ont pas besoin de preuve du modèle.

## Complétude et réparation
Tous les critères de la grille, aucun doublon, `rubric_version` identique, notes dans [0,1]. Sinon une seule réparation (rappel du schéma + erreurs) ; sinon livraison `EVALUATING` récupérable, **sans récompense inventée** (RULES §5). Les 2 appels réservés du plafond de 36 servent à l'évaluation et à sa réparation.

## Résistance aux instructions contenues dans un livrable ou un document
1. Assemblage du contexte avec délimiteurs aléatoires (`nonce`) générés par le serveur ; toute occurrence du délimiteur dans le livrable est supprimée avant envoi.
2. Ordre : consignes et grille d'abord, pièces non fiables ensuite, rappel final des règles (sortie JSON seule, aucune récompense).
3. Le modèle ne reçoit ni les prompts du joueur, ni sa dépense, ni les montants des paiements.
4. `trace_flag` fournis comme données serveur, jamais déduits du livrable.
5. Validation serveur indépendante : même si le modèle obéissait, le score est recalculé, plafonné et converti par le serveur.
6. Contenu : 6 livrables annotés contiennent une injection (tag `injection`), dont 1 réservé ; fixture `client_evaluator/injection_ignored`. Plan de test : `08-tests-injection.md`.
Un livrable hors sujet avec injection reçoit `out_of_scope: true` ⇒ score 0.

## Gabarit d'entrée de l'évaluateur (assemblé par le serveur)
```
[RÈGLES] (rôle client_evaluator) 
[GRILLE m1_v1] critères, poids, variant_guidance du mode de la tentative
[BRIEF version N] [DOCUMENTS DE RÉFÉRENCE] (hors pièces privées inutiles)
[FAITS DE TRACE] {"clarification_obtained": false, ...}
<<<LIVRABLE nonce=…>>> texte figé <<<FIN nonce=…>>>
[RAPPEL] JSON evaluator_output uniquement ; aucune récompense.
```
