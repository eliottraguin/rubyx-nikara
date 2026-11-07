# AI04 — Campagne : missions, variantes, corpus, événements

Chaque mission a `data/missions/<id>/corpus.json`, `beginner_v1.json`, `expert_v1.json` (versionnées séparément, schéma `mission_variant.schema.json`), une grille `data/rubrics/<id>_v1.json` et des solutions de référence (dans chaque variante).

## Faits (issus de docs/MISSIONS.md et du cahier)
| Mission | Gain | Appel | Débloque | Faits imposés |
|---|---|---|---|---|
| M1 | 20 | 0 | prospector | 9,90 ; 12 h–14 h lun–ven ; adresse fictive ; boisson incluse ; ≤ 80 mots ; essentiels : prix, horaires, cible |
| M2 | 30 | 1 | researcher, qa | catalogue fictif de 8 entrées (secteur, besoins, préférence de contact), certaines hors offre ; email court citant un besoin ; aucun envoi |
| M3 | 40 | 1 | analyst | canal de diffusion manquant (réseau social, révélé si demandé, 2 questions) ; incertitude signalée ou version conditionnelle |
| M4 | 60 | 2 | — | 3 documents datés + tableau ; ancienne offre remplacée ; taux de conversion et CPA essentiels, tolérance explicite |
| M5 | 90 | 2 | lead | email + publication cohérents ; changement de cible après la 1re proposition ; crédit de correction |
| M6 | 150 | 3 | — | plafond 30, ≥ 2 rôles, événement avant la 1re action, victoire ≥ 70 |
| Secours | 10 | 0 | — | rédacteur, 5 messages gratuits, rejouable |
Le validateur recoupe gains, tarifs, déblocages, plafond et rôles avec `data/rules/rules_v1.json`.

## Variantes Débutant / Expert
| | beginner | expert |
|---|---|---|
| Brief | structuré, objectif et contraintes explicites | brief « client » ouvert, contraintes combinées |
| Aide | `tutorial` (étapes une à une, questions de cadrage ; M1 : « Pour qui ? », « Quel résultat ? », « Quelles informations ? »), 2 indices | pas de parcours guidé, 2 indices facultatifs |
| M6 | contexte nouveau, **sans** aide automatique, indices sur demande | contexte nouveau + imprévu |
| Grille | commune à la mission (`applies_to_variants`), `variant_guidance` pour la partie sémantique | idem |
Choix de conception : mêmes faits, mêmes essentiels et mêmes contrôles pour les deux variantes (une seule grille par mission), seuls le brief, l'aide et la guidance sémantique changent. Les tests attendus propres à chaque variante sont les annotés (champ `variant`) et les indices.

## Événements (id, déclenchement, brief versionné + diff)
| Id | Mission | Déclenchement | Effet |
|---|---|---|---|
| `ev_m3_context_incomplete` | M3 | `mission_start` | brief v2 : canal signalé « non communiqué » ; clarification du canal ⇒ brief v3 |
| `ev_m4_contradictory_sources` | M4 | `mission_start` | deux offres divergentes ; date + « annule et remplace » tranchent |
| `ev_m5_target_change` | M5 | `after_first_proposal` | brief v2 : public familles/week-end ; diff ; crédit de correction |
| `ev_m6_contradictory_sources` | M6 | `before_first_action` | un ancien flyer à prix divergent est ajouté ; brief v2 |
**M5 — crédit de correction** : `free_message_per_concerned_role = 1`, une fois par rôle, `quota_unchanged = 5`, `never_adds_message`. Rôles concernés = rôles ayant produit une sortie avant l'événement. Le crédit rend gratuit **le prochain message** de ce rôle, jamais un 6e message. Déclenché après la 1re proposition ⇒ chaque rôle concerné a au moins un message restant (T10). Spécification serveur à implémenter par P2 ; le contenu ne fait que la déclarer.
**M6** : événement injecté avant la 1re action, donc aucun crédit exceptionnel nécessaire ; plafond de dépense de jeu 30 (3 par appel ⇒ 10 appels au plus) ; ≥ 2 rôles ; victoire ≥ 70 avec essentiels. Le critère `coordination` (10) reflète la trace mais la règle de victoire reste serveur.
**Budget réduit** : non instancié (ambiguïté entre budget client et plafond de jeu, voir `10`). **Mode Démo** : `demo_selectable` marque les événements admissibles ; aucun événement caché en partie normale (`normal_play`).

## Solutions de référence
Dans `reference_solution` de chaque variante : texte livrable, rôles utilisés, trace attendue. `validate_content.py` vérifie que chaque solution **passe tous les contrôles déterministes** de sa grille. Elles ne sont pas un barème sémantique.
- M4 : chemin libre (le joueur peut tout vérifier lui-même) ; valeurs vérifiables avec `compute_metrics`.
- M2 : le prospecteur est facultatif ; les propositions retenues ouvrent M3 (client P03 du catalogue).

## Corpus
18 documents datés (dont client_sheet, catalog, table) ; certains `client_private` (M3) ou ajoutés par événement. Corpus de référence : reproductible, ids préfixés par la mission. Les documents `client_private` ne sont jamais transmis aux agents ni au responsable qualité.

## Hasard et graines
Aucun hasard dans les prix, gains, critères. La graine d'une partie sert à choisir les variantes reproductibles (voir `data/missions/_shared/seeded_games.json`). Une seule variante de contenu par mission/mode existe aujourd'hui : la graine n'a donc pas encore d'effet sur le contenu.
