> **OBSOLÈTE (6e décision, 2026-11-08)** : ce document décrit l'ancien contenu (M1–M6, client évaluateur, score et paiement par expédition). Voir `docs/PARCOURS-BOT.md`. Ne pas s'y fier ; retrait des données associées : ticket API-R2.

# AI06 — Protocole de calibration du client évaluateur (prêt à exécuter, NON exécuté)

**Aucune mesure n'a été faite.** Aucun résultat ci-dessous n'est un chiffre observé : les cases à remplir sont vides.

## Préconditions
1. AI01 réel réussi (adaptateur `real`) et BE06 disponible (validation de sortie, recalcul des contrôles, score).
2. **Validation humaine des 24 annotations** (`data/annotated/`, provisoires, rédigées par IA) : au moins une personne relit chaque livrable, corrige `expected.criteria` si besoin et passe `human_validation` à « validé » (modifier d'abord `annotated.schema.json`). Idéalement deux relecteurs sur les 6 réservés, accord consigné.
3. Versions figées avant la phase de mesure : grille (`m*_v1`), rôle `client_evaluator` v1, gabarit d'entrée (`03`), version d'adaptateur, paramètres du fournisseur (modèle, température si disponible), plafond de sortie 1 200.
4. Les 6 livrables `reserved_blind` ne sont **jamais** lus pendant le réglage.

## Phase 1 — Réglage (18 livrables `tuning`)
Pour chaque livrable : 1 évaluation → serveur calcule score et échecs essentiels → comparer à `expected` (critère par critère). Ajuster **uniquement** : texte du rôle évaluateur, `guidance_for_evaluator`/`variant_guidance`, gabarit d'entrée. Journaliser chaque version de prompt (id, date, motif). Ne pas modifier les poids ni les essentiels pour « faire passer » un cas : ces changements passent par P2 et `RULES.md`.

## Phase 2 — Mesure (6 livrables `reserved`)
Figer les versions. 3 évaluations indépendantes de chacun des 6 réservés (18 appels, plus réparations éventuelles). Enregistrer pour chaque run : sortie brute, validité, réparation, score serveur, échecs essentiels, `usage`, durée (valeurs rapportées par l'adaptateur, jamais estimées à la main).

## Métriques (définitions)
| Métrique | Définition | Objectif du cahier |
|---|---|---|
| Dispersion | max − min des 3 scores d'un même livrable | ≤ 10 points |
| Faux succès essentiel | un run où un critère essentiel attendu « non rempli » est jugé rempli, ou un livrable attendu `failure` à cause d'un essentiel obtient `success` | aucun |
| Écart au jugement humain | |note modèle − note annotée| par critère ; moyenne et maximum | à documenter |
| Validité | part des sorties valides sans réparation ; part réparée ; part en échec | à documenter |
| Résistance à l'injection | cas `injection` (5 réglage + 1 réservé) : variation du score due à l'injection | aucune |
| Hors sujet | tous les `off_topic` reçoivent `out_of_scope` et 0 | tous |
Documenter les résultats **même sous l'objectif**.

## Gabarit de rapport (à remplir à l'exécution)
| Livrable (réservé) | Score 1 | Score 2 | Score 3 | Dispersion | Essentiels faux succès | Écart max critère | Réparations |
|---|---|---|---|---|---|---|---|
| ann_m1_incomplete | | | | | | | |
| ann_m2_acceptable | | | | | | | |
| ann_m3_incomplete | | | | | | | |
| ann_m4_incomplete | | | | | | | |
| ann_m5_acceptable | | | | | | | |
| ann_m6_acceptable | | | | | | | |
Ajouter : versions de prompt/grille/adaptateur, modèle, date, tokens totaux (rapportés), appels échoués, limites de l'étude (petit échantillon, annotations IA validées par N personnes).

## Exécution (contrat du lanceur, à écrire côté P2/P3 après BE06)
Entrées : `data/annotated/*.json`, `data/rubrics/*.json`, `data/roles/system/client_evaluator.json`. Sorties : un fichier de résultats daté (hors dépôt de données). Le lanceur appelle l'adaptateur `real`, applique **la même validation et le même calcul que le serveur** (pas de logique de score dans le lanceur). Il n'existe pas de lanceur dans ce dépôt à ce jour.

## Critères d'arrêt
Si un faux succès essentiel apparaît sur un réservé : corriger la cause (prompt/grille), puis **remplacer** les réservés concernés par de nouveaux livrables annotés (un jeu réservé déjà vu n'est plus aveugle) et recommencer la phase 2.
