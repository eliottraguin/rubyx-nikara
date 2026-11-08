---
status: draft
date: 2026-11-08
decision-makers: [architecte, Noah]
consulted: []
informed: []
---

# Remplacer le rendu Phaser de `WorldScene` par Three.js pour la vue ville

## Context and Problem Statement

La 4e décision du `CLAUDE.md` (2026-11-07) fixe un style « semi-réaliste façon Les Sims » obtenu par des **sprites isométriques pré-rendus** (atlas 2D, `docs/VILLE-ET-BATIMENT.md` §12 : « Phaser 2D, pas de moteur 3D temps réel »). Le rendu actuel de la carte est `src/game/map/scenes/WorldScene.ts` (1 061 lignes) plus `src/game/map/art.ts` (1 040 lignes, art **placeholder** généré par le code), monté par `PhaserMap.tsx` / `createGame.ts`.

L'epic 1 (GR3-10, PR #2 et #3, branche `agent/architecte-entreprise-gamifi-e/f8fed80a`) a déjà posé **sans ADR** une scène **Three.js** pour le fond de `/connexion` : `src/game/login/CityScene.ts` (caméra orthographique isométrique `ISO_ELEVATION = atan(1/√2)`, ombres, nuages, `zoomToDistrict()` avec `onZoomEnd` et repli `prefers-reduced-motion`), `plan.ts` (plan de ville pur, déterministe par graine) et `CityBackdrop.tsx`. `three` ^0.180 et `@types/three` sont déjà dans `package.json`. Résultat : **deux moteurs de rendu coexistent** et la connexion annonce visuellement une ville 3D que la carte de jeu ne reproduit pas.

Il faut décider si la vue ville du jeu passe à Three.js (rendu 3D temps réel, ombres, caméra isométrique réelle) ou reste sur Phaser, et **acter par écrit la divergence avec la 4e décision** (règle n°10 : règles partagées modifiées par écrit avant fusion). La règle n°1 ne bouge pas : la scène affiche un état et joue des animations, elle ne décide ni solde, ni prix, ni quota, ni déblocage, ni niveau d'immeuble.

Contexte consulté : `docs/adrs/` (contient seulement `0001-choix-du-mode-d-authentification.md`, sans lien avec ce sujet) ; code : `src/game/map/**`, `src/game/login/**`, `src/components/map/{PhaserMap,MapHost}.tsx`, `src/components/login/CityBackdrop.tsx` ; docs : `docs/CARTE-TECH.md`, `docs/VILLE-ET-BATIMENT.md` §4, §5, §11, §12, `docs/ARCHITECTURE.md` (section « Carte et ville »).

## Decision Drivers

* **Cohérence visuelle** entre la connexion (déjà Three.js, zoom vers un quartier) et la carte de jeu : le zoom `zoomToDistrict` doit pouvoir **se prolonger** dans la vue de jeu sans rupture de moteur.
* **Coût de production d'art** : le style Sims en sprites pré-rendus suppose des atlas par angle, par niveau d'immeuble (10) et par véhicule/personnage, avec production d'assets encore **non tranchée** (`OPEN-QUESTIONS.md` n° 50, 55) ; le 3D temps réel utilise des primitives/modèles glTF et une seule source de géométrie.
* **Budget** : ≤ 8 Mo au premier affichage, 60 images/s visées, **30 minimum sur portable sans GPU dédié**, DPR ≤ 2 (`VILLE-ET-BATIMENT.md` §12).
* **Réutilisation du code testé** : la logique pure (`iso`, `layout`, `streets`, `bots`, `trips`, `vehicles`, `paths`, `route`, `viewmodel`, `bus`) est couverte par vitest ; la migration ne doit pas la réécrire.
* **Maintenance** : ne pas maintenir deux moteurs ; un seul gros chunk chargé à la demande.
* **Accessibilité et sécurité** inchangées : couche DOM / mode liste, `prefers-reduced-motion`, texte du modèle = donnée non fiable (jamais de HTML dans la scène), aucune clé ni appel réseau dans la scène.
* Fidélité au style « Sims » **déjà acté** par Noah (coupe d'immeuble animée, murs ouverts).
* [INVESTIGATE: mesurer FPS et mémoire de `CityScene` à l'échelle de la ville de jeu (≈ 30 piétons/voitures + bots + immeuble 10 niveaux) sur un portable sans GPU dédié]
* [INVESTIGATE: confirmer avec Noah que la `BuildingScene` (coupe) suit le même moteur, ou si elle reste hors périmètre de cet ADR]

## Considered Options

1. **Three.js pour la vue ville** (`WorldScene` réécrite sur le modèle de `CityScene`), logique pure conservée, Phaser retiré de la ville.
2. **Garder Phaser** et enrichir visuellement (sprites pré-rendus en 3D, ombres baked, atlas) conformément à la 4e décision ; Three.js reste cantonné au fond de connexion.
3. **Hybride** : Three.js pour le décor de ville (statique, caméra, ombres) et Phaser en surimpression pour bots/UI/coupe d'immeuble.

## Decision Outcome

Chosen option : **1. Three.js pour la vue ville**, parce qu'elle supprime le double moteur, prolonge directement l'epic 1 (même `plan.ts`/caméra, `zoomToDistrict` réutilisable pour les transitions connexion → ville → immeuble), évite la production d'atlas pré-rendus dont la source d'art n'est pas tranchée, et garde intacte la logique métier pure. L'option 2 reste le **repli** si la mesure de performance (INVESTIGATE ci-dessus) échoue sur portable modeste : le contrat `bus`/`viewmodel` étant indépendant du moteur, le retour est possible sans toucher au reste.

Cette décision **diverge de la 4e décision** sur un seul point : le style « Sims » n'est plus obtenu par des **sprites pré-rendus** mais par du **rendu 3D temps réel** (modèles low-poly, ombres, caméra isométrique orthographique). Le reste de la 4e décision (ville inspirée de New York, immeuble central à 10 niveaux, bots à pied/vélo/skate/hélicoptère, drones, coupe d'immeuble) est **inchangé**. `CLAUDE.md` est mis à jour dans la même PR.

### Réutilisable tel quel (aucune dépendance Phaser, vérifié : ces modules n'importent pas `phaser`)

| Module | Rôle conservé |
|---|---|
| `iso.ts` | Projection 2:1 : reste utile pour la grille logique ; à adapter (ou remplacer par coordonnées monde `x,z`) à l'échelle Three.js, tests à conserver |
| `layout.ts` (+ `data/map/city_v1.json`) | Disposition des lieux et de l'immeuble |
| `streets.ts`, `paths.ts`, `route.ts` | Graphe de rues, trajets, polylignes (`polylinePoint`, `pathPose`, `routePoint`) |
| `bots.ts`, `vehicles.ts`, `trips.ts` | États des bots, véhicule décidé par le lieu, voyages (`tripFrame`) |
| `building.ts` | Niveaux, hauteur, bannière (`PX_PER_FLOOR`, `buildingHeightPx` : unités à convertir) |
| `viewmodel.ts`, `bus.ts`, `dispatch.ts`, `planets.ts` | GameState → MapViewModel → bus ; contrat React ↔ scène inchangé |
| `src/game/login/plan.ts` | Générateur de plan déterministe (graine) à étendre ou fusionner avec `layout.ts` |
| `src/game/login/CityScene.ts` | Socle : renderer, caméra orthographique iso, éclairage, nettoyage `dispose()`, `zoomToDistrict` |

### À réécrire

| Élément | Raison |
|---|---|
| `scenes/WorldScene.ts` (1 061 l.) | 100 % Phaser (sprites, containers, caméra, tweens, entrées) ; remplacé par une scène Three.js qui consomme le même bus et le même `MapViewModel` |
| `art.ts` (1 040 l.) | Textures/polygones Phaser générés par code ; remplacé par géométries/matériaux Three.js (primitives puis glTF) |
| `createGame.ts`, `PhaserMap.tsx` | Création/destruction de `Phaser.Game` ; équivalent Three.js (une seule instance, `dispose()` au démontage, compatible StrictMode) |
| `MapHost.tsx` | Garde le `dynamic(..., { ssr: false })` mais pointe vers le nouveau composant |
| Tests de fumée navigateur de la carte | Cibles différentes (WebGL) |

À prévoir : **picking** (raycaster à la place des zones interactives Phaser), texte en sprites/DOM (pas de HTML venant du modèle), pause quand la scène est cachée, plafond DPR 2, `WebGLRenderer` indisponible → **mode liste** (déjà périmètre de secours).

## Consequences

### Good

* Un seul moteur de rendu pour connexion et ville ; transitions continues (`zoomToDistrict` + `onZoomEnd`).
* Pas d'atlas pré-rendus par angle/niveau ; le style Sims vient de la lumière, des ombres et des modèles, donc rotation de caméra par quarts de tour (`OPEN-QUESTIONS.md` n° 56) quasi gratuite.
* ~2 100 lignes de logique pure testée conservées ; contrat `bus`/`viewmodel` stable donc travail parallèle front possible.
* Phaser sort du bundle de la carte (économie de ~1 Mo ; Three.js déjà chargé à la demande pour la connexion, `three` ~ 0,6 Mo minifié, à confirmer).

### Bad

* **Réécriture** de ~2 100 lignes (`WorldScene` + `art.ts`) et de leurs tests de fumée ; risque de régression sur un écran déjà livré.
* Rendu 3D temps réel plus gourmand que des sprites : risque sous 30 images/s sur portable sans GPU ; fuites mémoire WebGL si `dispose()` incomplet (géométries, matériaux, textures).
* La 4e décision et `docs/VILLE-ET-BATIMENT.md` §12, `docs/CARTE-TECH.md`, `docs/ARCHITECTURE.md` (qui disent encore « Phaser 2D, pas de moteur 3D temps réel ») deviennent **périmés** et doivent être alignés.
* Perte du « look pré-rendu » photoréaliste si l'on visait un rendu type Sims plus qu'un low-poly ; compétence Three.js à acquérir par l'équipe.
* WebGL absent ou bloqué (navigateurs durcis, VM) : le mode liste devient le seul chemin, il doit rester complet.

### Neutral

* La `BuildingScene` (coupe) n'existait pas encore : elle sera créée directement sur Three.js (hors périmètre de cette PR, cf. INVESTIGATE).
* Les identifiants techniques (`planet`, `hangar`) et l'API ne changent pas ; aucune règle serveur ne change.
* `phaser` restera dans `package.json` tant que `WorldScene` n'est pas retirée ; sa suppression est un ticket distinct.

## Pros and Cons of the Options

### 1. Three.js pour la vue ville

* Good, car réutilise l'epic 1 (scène, `plan.ts`, zoom) et supprime le double moteur.
* Good, car ombres, caméra isométrique réelle et rotation sans atlas.
* Bad, car réécriture lourde et risque de performance sur machines modestes.
* Bad, car diverge d'une décision partagée (coût de coordination).

### 2. Garder Phaser et l'enrichir

* Good, car aucune réécriture ; respecte la 4e décision à la lettre ; performances prévisibles du 2D.
* Bad, car il faut produire de vrais atlas pré-rendus (Blender/artiste/pack, point ouvert n° 50) : coût et délai d'art élevés, 10 niveaux d'immeuble × angles.
* Bad, car **deux moteurs** durablement ; la connexion (3D) et la carte (2D) ne se raccordent pas visuellement, `zoomToDistrict` n'a pas de suite.
* Bad, car l'art actuel (`art.ts`) est explicitement un placeholder et ne tient pas le style visé.

### 3. Hybride Three.js décor + Phaser bots/UI

* Good, car migration progressive.
* Bad, car deux canevas synchronisés (caméra, picking, ordre des couches), double chargement et deux cycles de vie à détruire ; complexité supérieure aux deux autres options sans bénéfice durable.

## More Information

* Sécurité (à vérifier en revue de la PR, skill `security-review`) : la scène ne fait **aucun appel réseau**, ne reçoit **aucune donnée de prospect** (compteurs uniquement), n'affiche aucun texte du modèle comme HTML ; aucune clé côté client ; textures générées par canvas locales uniquement (pas de chargement d'URL tierce sans liste blanche).
* Gate de validation avant fusion de l'implémentation : (a) ≥ 30 images/s sur portable sans GPU dédié avec ville + immeuble niveau 10 + 30 figurants, (b) pas de croissance mémoire après 20 montages/démontages (StrictMode), (c) mode liste complet si WebGL indisponible.
* Alternative de repli documentée : option 2 (Phaser) ; le bus et le viewmodel étant indépendants du moteur, le coût de retour est limité à une scène.
* Suite : mettre à jour `docs/CARTE-TECH.md`, `docs/VILLE-ET-BATIMENT.md` §12 et `docs/ARCHITECTURE.md` lors des tickets d'implémentation (non fait ici : hors périmètre de l'ADR).
* Statut : `draft`, à valider par Noah.

## Mise à jour du 2026-11-08 : nouveau moteur de ville

`WorldScene.ts`/`art.ts` ne sont plus utilisés par la carte par défaut : la ville est dessinée par `src/game/map/three/world/` (`CityWorld`) à partir de `data/map/city_v1.json` (36 blocs, rues, parc, rivières et ponts, lieux et siège). Éléments statiques fusionnés par matériau, mobiles (voitures, piétons, bateaux, arbres) en instances. Phaser reste livré derrière `NEXT_PUBLIC_MAP_ENGINE=phaser`. Le gate de performance (≥ 30 images/s, 20 montages/démontages) reste **non mesuré** : à faire sur un vrai GPU.
