# Livrables annotés — PROVISOIRES

**Avertissement : toutes ces annotations sont rédigées par une IA, sont provisoires et doivent être validées par un humain (relecture indépendante) avant toute calibration (AI06).** Aucun résultat de calibration ne doit être déduit de ces fichiers tels quels.

- 24 livrables : 6 missions x 4 niveaux (hors sujet, incomplet, acceptable, complet). 18 « réglage » (`split: tuning`) et 6 « réservés » (`split: reserved`, tag `reserved_blind`) : les réservés ne servent jamais à régler les prompts ni les grilles.
- `expected.criteria[*].rating` est une note **indicative** par critère ; `score_indicative` est recalculé par `tools/validate_content.py` selon la formule de `docs/ai/03-evaluateur.md` (somme pondérée, arrondi demi-supérieur, plafond 40 si un essentiel n'est pas rempli, 0 si hors sujet).
- Le validateur vérifie que les critères déterministes sont cohérents avec les contrôles déclarés de la grille ; il ne vérifie pas le jugement sémantique.
- Six livrables contiennent une instruction d'injection (tag `injection`) : elle doit rester sans effet sur la note, le score et l'argent.
- `human_validation: pending` doit passer à une valeur validée par un humain (hors schéma actuel : mettre à jour `data/schemas/annotated.schema.json` en même temps).
