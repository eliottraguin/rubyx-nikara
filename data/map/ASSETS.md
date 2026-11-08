# Assets de la carte

Thème **ville** (4e décision, `docs/VILLE-ET-BATIMENT.md`) : l'ancien thème spatial est abandonné.

| Élément | Source | Licence |
|---|---|---|
| Ville (sol, rues, parc, fleuves, îlots), immeuble du joueur (10 niveaux), six lieux, bots, vélo, skate, hélicoptère, arbres, icônes (cadenas, étoiles de score) | **Placeholders générés par le code** (canvas 2D, `src/game/map/art.ts`), aucun fichier image | Code du projet (MIT) |
| Phaser 3.90.0 | npm `phaser` | MIT |
| Police | Atkinson Hyperlegible via `next/font` (déjà utilisée par l'interface) | SIL OFL 1.1 |

## Données (cosmétiques, aucune règle de jeu)

| Fichier | Contenu |
|---|---|
| `city_v1.json` | Grille isométrique 2:1 (tuile 64x32), terre, fleuves, rives, ponts, parc (Central Park, décor), îlots (style, étages), **graphe de rues** (`streets.nodes`, `streets.edges`), immeuble du joueur au centre (`hq`), héliport, **six lieux** (`id`, `name`, `district`, `vehicle`, position, `street_node`, `helipad`), **deux bâtiments** sans lien avec la prospection (`buildings` : boutique, évaluateur — `id`, `name`, `kind`, `district`, position, `street_node`, `route`, aucun état serveur). Remplace `layout_v1.json` (supprimé : plus rien n'en dépend). |
| `building_v1.json` | Apparence de l'immeuble pour les niveaux 1 à 10 (étages, couleurs, enseigne, éléments). Les **seuils de niveau** ne sont **pas** ici : ils sont calculés par le serveur (`building.level`, `rules_v2`). |

Notes :
- `vehicle` (`foot`, `bike`, `skate`, `helicopter`) est purement visuel : le serveur ne le connaît pas.
- Les noms de lieux de New York sont illustrés de façon **générique** (silhouettes évocatrices, aucun logo, aucune marque, aucune image sous droits) ; mention « non affilié ».
- L'identifiant du lieu (`annuaire`, `registre`, `carte-locale`, `linkedin`, `glassdoor`, `constellation`) est l'identifiant technique de la plateforme (ex-planète) et ne change pas.

## Remplacer les placeholders

Quand de vrais sprites (style « Les Sims en réaliste », ticket ART-Q1) remplaceront les primitives, charger un atlas sous les **mêmes clés de texture** (objet `TEX` de `art.ts`) et supprimer l'appel à `generateMapTextures`. Lister ici chaque fichier, sa source et sa licence **avant fusion** (`docs/CARTE-TECH.md`, « Assets »).
