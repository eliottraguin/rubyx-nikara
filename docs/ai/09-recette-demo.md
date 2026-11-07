# AI08 — Parties seedées, checklist de recette et démo (préparation, NON exécutée)

## Parties seedées (`data/missions/_shared/seeded_games.json`)
| Id | Mode | Graine | But |
|---|---|---|---|
| `seed_beginner_typical` | beginner | 20260601 | Parcours de `RULES.md` §9 (scores supposés 80/70/70/70/70), achat veille puis chef |
| `seed_expert_analyst_path` | expert | 20260602 | T12 : second parcours avec le seul analyste acheté |
| `seed_rescue_replay` | beginner | 20260603 | T11 : secours rejoué sans argent |
Les graines sont des entiers choisis arbitrairement. Les notes (`assumed_score`) sont des **hypothèses de planification**, pas des mesures. Le validateur simule trésorerie, quotas (≤ 5 par rôle), déblocages, plafond M6 (≤ 30), ≥ 2 rôles en M6 et la contrainte « tous les agents achetés = interdit » pour T12. La trésorerie finale annoncée est celle de cette simulation (elle diffère de l'exemple §9 car le plan de messages est différent).

## Checklist de recette (à exécuter par l'équipe)
1. Partie complète en mode **débutant**, appels **réels**, graine `seed_beginner_typical` : noter score, solde, tokens et durées rapportés par l'adaptateur.
2. Partie complète en mode **expert**, appels réels, graine `seed_expert_analyst_path`.
3. Répétition de secours **simulée** (mock) avec badge visible.
4. T07/T08 : rejouer `08-tests-injection.md`.
5. T09 : plans invalides du chef (fixtures `lead/invalid_*`) refusés ; 6e message refusé.
6. T10 : M5, diff de brief affiché ; au plus 1 crédit par rôle concerné ; quota toujours 5.
7. T11 : secours accessible avec solde nul ; nouveaux ids de commande à chaque rejeu.
8. T12 : les deux parcours seedés atteignent M6 et la victoire sans acheter tous les agents.
9. Calibration AI06 (`07`).
10. Recette exploratoire : 5 testeurs peu familiers de l'IA, ≥ 4 terminent M1 sans assistance ; le bilan sépare observé et non mesuré.
11. Mesures : ~10 parties avant toute extrapolation de tokens/latence ; consigner les conditions de test.

## Limites à observer et consigner (aucune valeur supposée)
Latence de la 1re réponse agent (objectif cahier : < 15 s, **non mesuré**) ; tokens par appel et par mission ; taux de réparation de l'évaluateur ; appels échoués ; seuil de concurrence réellement supporté ; cas où le plafond de 36 appels est approché.

## Démo
Mode Démo : choisir un événement admissible (`demo_selectable`) avant livraison, badge visible, note et solde inchangés. Imprévu préparé conseillé : M5 (`ev_m5_target_change`). Sauvegarde de démo : BE08.

## Prérequis pour exécuter
API (BE01–BE06) lançable, adaptateur `real` validé (AI01), accès au fournisseur, annotations validées par un humain, un exemplaire du gabarit de rapport (`07`).
