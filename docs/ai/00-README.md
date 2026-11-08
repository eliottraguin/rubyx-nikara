> **OBSOLÈTE (6e décision, 2026-11-08)** : ce document décrit l'ancien contenu (M1–M6, client évaluateur, score et paiement par expédition). Voir `docs/PARCOURS-BOT.md`. Ne pas s'y fier ; retrait des données associées : ticket API-R2.

# Notes de conception P3 — agents, missions, évaluateur, calibration

Statut : **livraison de contenu et de spécifications** (tickets AI01 à AI08). Aucun appel à un fournisseur réel n'a été fait, aucune mesure de calibration ni de latence n'a été réalisée : ces éléments sont livrés « prêts à exécuter » (voir `07-calibration-protocole.md`, `09-recette-demo.md`, `01-adaptateur-llm-ai01.md`).

| Fichier | Contenu | Ticket |
|---|---|---|
| `01-adaptateur-llm-ai01.md` | Ce que l'adaptateur doit exposer, protocole de vérification du fournisseur, comportement du `mock` | AI01 |
| `02-roles-et-outils.md` | Rôles, outils en liste blanche, clarifications, format de réponse | AI02 |
| `03-evaluateur.md` | Grilles, contrôles déterministes, score, preuves, résistance aux instructions du livrable | AI03 |
| `04-campagne.md` | Missions M1–M6 + secours, variantes, événements, faits et inventions | AI04 |
| `05-chef-equipe.md` | Plans bornés, validation, délégations, restitution | AI05 |
| `06-aides-bilan-tokens.md` | Indices, coach, bilan fondé sur les traces, suivi des tokens | AI07 |
| `07-calibration-protocole.md` | Protocole de calibration (AI06) prêt à exécuter | AI06 |
| `08-tests-injection.md` | Plan de tests T07 / T08 et sécurité des contenus | AI03 / T07 / T08 |
| `09-recette-demo.md` | Parties seedées, checklist de recette, limites à observer | AI08 |
| `10-hypotheses-et-ecarts.md` | Inventions, hypothèses, incohérences relevées, questions pour P2/P1 | tous |

## Où est le contenu
`data/roles/` (rôles, outils, rôles système) · `data/missions/<mission>/` (`corpus.json`, `beginner_v1.json`, `expert_v1.json`) · `data/missions/_shared/` (coach/bilan, parties seedées) · `data/rubrics/` · `data/schemas/` · `data/annotated/` (provisoire) · `data/fixtures/model_outputs/<rôle>/` · `tools/validate_content.py`.

## Vérifier l'intégrité
```
python3 tools/validate_content.py
```
Bibliothèque standard uniquement. Contrôle : schémas, ids uniques, poids de grille = 100, essentiels présents, références de corpus, cohérence avec `data/rules/rules_v1.json` (gains, tarifs, déblocages, seuils), variantes beginner/expert, 18/6 des annotés, cohérence des annotés avec les contrôles déterministes (implémentation de référence incluse), solutions de référence qui passent leurs contrôles, fixtures (outils autorisés, plans valides/invalides, évaluations valides/invalides), parties seedées (fonds, quotas, T12).

## Règle de lecture
Les faits, prix, horaires et chiffres des missions sont ceux de `docs/MISSIONS.md` et du cahier ; tout ce qui a été inventé (noms fictifs, adresses, chiffres des corpus M3–M6) est listé dans `10-hypotheses-et-ecarts.md`.
