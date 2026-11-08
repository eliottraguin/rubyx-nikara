---
status: draft
date: 2026-11-08
decision-makers: [architecte, Noah]
consulted: []
informed: []
---

# Habiller la vue bureau (coupe d'immeuble) avec une scène Three.js conditionnée au gate de l'ADR 0002

## Context and Problem Statement

La vue « bureau » (`/immeuble`) est aujourd'hui du **HTML/CSS pur** : `BuildingView.tsx` + un panneau React par étage (`ToitPanel`, `PubPanel`, `CourrierPanel`, `ArchivesPanel`, `AccueilPanel`), avec liste d'étages au clavier. Le découpage fonctionnel est porté par `src/game/building/floors.ts` (module pur, sans React ni moteur : Toit, Studio pub, Salle du courrier, Archives, Accueil et garage). Il est la **référence quel que soit le choix visuel**.

La 4e décision du `CLAUDE.md` prévoit une « coupe d'immeuble en scène animée », et `docs/VILLE-ET-BATIMENT.md` §7 et `OPEN-QUESTIONS.md` n° 49 l'avaient tranchée comme **`BuildingScene` Phaser**. L'ADR 0002 (`draft`, validation de Noah en attente) remplace Phaser par Three.js pour la **ville** et laisse **ouverte** la question de la `BuildingScene` (INVESTIGATE de ses Decision Drivers ; « Neutral » : « elle sera créée directement sur Three.js »). Cet ADR la ferme, ou plutôt la **rend dépendante** de 0002.

Contraintes mesurées ou constatées (branche `agent/epic2-ville-threejs` @ `ae5078d`, `docs/QA-ville-threejs.md`) :

* **Le gate de performance de l'ADR 0002 n'est pas mesuré** : ≥ 30 images/s sur portable sans GPU dédié, pas de croissance mémoire après 20 montages/démontages. Aucun rendu navigateur n'a été vérifié. Le choix « un seul moteur » repose donc sur une hypothèse, pas sur une mesure.
* **Node** : le dépôt déclare `"node": ">=20.9"` mais vitest 5 / jsdom 31 exigent Node 22+. L'environnement des agents est en Node 20.19.4 : `pnpm test` n'y a **pas** été exécuté. Toute implémentation de la coupe sera livrée sans test automatisé vérifié tant que ce n'est pas réglé.
* Les zones de la coupe sont des **panneaux React** (texte copiable, accessible) : la scène ne porte que du décor et de l'animation cosmétique. Règle n°1 inchangée : la scène n'est jamais maître de l'argent, des quotas ou des déblocages ; règle n°2 : aucun texte du modèle rendu comme HTML dans la scène.

Question : quel moteur habille la coupe, et quel est le chemin de repli si la mesure échoue ?

## Decision Drivers

* **Cohérence de moteur** avec la ville (ADR 0002) : transition ville → immeuble continue (`zoomToDistrict`, `CityScene`, `MapView`) plutôt qu'un changement de canevas.
* **Maintenance** : un moteur de plus (Phaser pour la seule coupe) = un second cycle de vie, un second chunk, deux chaînes d'art.
* **Risque de performance non levé** : le gate 0002 n'est pas mesuré ; le choix ne doit pas dépendre d'un résultat inconnu sans repli.
* **Coût d'art et d'animation** : personnel qui vit, ascenseur, murs ouverts, 5 étages, niveau d'immeuble 1 à 10.
* **Accessibilité et mode liste** : parcours clavier complet et lecture sans WebGL, déjà couverts par la couche DOM actuelle (à ne pas régresser).
* **Testabilité** : logique pure testable par vitest (bloqué en Node 20) ; la scène elle-même ne l'est pas sans navigateur.
* **Ordre des jalons** : `BACKLOG.md` (jalon R) place le parcours Clients/Pub **avant** le décor ; l'habillage ne doit pas bloquer ni retarder le parcours déjà livré.

## Considered Options

1. **`BuildingScene` Three.js** (coupe 3D à murs ouverts, caméra orthographique iso, mêmes primitives/éclairage que `CityScene`), **sous réserve du gate 0002**, panneaux React conservés, DOM actuel conservé comme repli.
2. **`BuildingScene` Phaser** (décision initiale de Noah, n° 49), Phaser conservé uniquement pour la coupe.
3. **Coupe 2D stylisée sans moteur 3D** (SVG/CSS ou canvas 2D, vue de face en coupe, personnel animé en sprites/CSS), indépendante de Three.js et de Phaser.
4. **Statu quo** : rester sur le HTML/CSS par étage, sans scène animée.

## Decision Outcome

Chosen option : **1. `BuildingScene` Three.js, conditionnée au gate de l'ADR 0002**, avec **l'option 4 (DOM actuel) comme repli permanent** et l'option 3 comme repli visuel si le gate échoue.

Raisons : une seule technologie de rendu pour ville et bureau, réutilisation directe de `CityScene` (renderer, caméra, ombres, `dispose()`) et de `zoomToDistrict` pour entrer dans l'immeuble, pas d'atlas pré-rendus par étage et par niveau. Le contenu fonctionnel reste dans `floors.ts` et les panneaux React : la scène **consomme** `FLOORS` (ordre, `slug`, `label`) et ne le redéfinit pas.

Règles d'architecture imposées :

* **Contrat identique à la ville** : la scène reçoit un view-model pur (étage sélectionné, agents achetés/« À recruter », niveau de l'immeuble) et émet des événements (`onFloorSelect(FloorId)`) via un bus ; elle n'importe ni l'API ni le store. La sélection d'étage reste pilotée par l'URL `?etage=` (`buildingHref`).
* **Une seule instance WebGL à la fois** : la ville et la coupe **partagent le renderer** (ou la coupe détruit la ville avant de monter) ; deux `WebGLRenderer` simultanés sont interdits (limite de contextes, mémoire).
* **Chargement à la demande** (`dynamic`, `ssr: false`), pause quand l'onglet est caché, DPR ≤ 2, `prefers-reduced-motion` respecté (pas d'animation, vue figée).
* **Le DOM n'est pas retiré** : liste d'étages et panneaux restent la source d'accessibilité et le chemin sans WebGL ; la scène est un **enrichissement progressif** (aucune action du jeu n'exige la scène).

**Couplage explicite avec l'ADR 0002 (condition de validité)** : si le gate échoue et que 0002 retombe sur l'option 2 (Phaser pour la ville), cet ADR est à **réviser** : la coupe suivrait alors Phaser (option 2 ci-dessus) ou resterait en DOM/2D (option 3/4), mais ne ferait pas coexister Three.js pour 2 écrans et Phaser pour un autre. Il ne doit pas passer `accepted` avant 0002.

### Gate de validation (avant toute fusion de l'implémentation)

* (a) ≥ 30 images/s sur portable sans GPU dédié : ville + immeuble niveau 10 + personnel de la coupe (5 étages animés), **mesuré** et consigné dans `docs/QA-*.md` ; le même protocole que 0002, pas un second jeu de chiffres.
* (b) Aucune croissance mémoire après 20 montages/démontages de la coupe **et** 20 allers-retours ville ↔ immeuble (StrictMode inclus).
* (c) Parcours clavier complet et mode liste intacts sans WebGL.
* (d) `pnpm test` exécuté en Node 22+ (ou `engines` aligné) : la logique pure de la coupe (positions de postes par étage, affectation des agents) est couverte.

## Consequences

### Good

* Un seul moteur pour connexion, ville et bureau si le gate passe ; transitions continues.
* Le découpage `floors.ts` reste l'unique source des étages ; changer l'habillage ne touche pas aux panneaux.
* Dégradation progressive : le DOM actuel, déjà livré et testé, reste le plancher de qualité.
* Rotation de la caméra par quarts de tour (n° 56) quasi gratuite.

### Bad

* L'ADR hérite du risque de 0002 : tant que le gate n'est pas mesuré, « un seul moteur » est un pari. Si 0002 retombe sur Phaser, la moitié de cet ADR est caduque.
* Divergence supplémentaire avec des documents devenus périmés : `VILLE-ET-BATIMENT.md` §7/§12, `CARTE-TECH.md` (l. 7, 14), `ARCHITECTURE.md` l. 51, `OPEN-QUESTIONS.md` n° 49, `BACKLOG.md` MAP-Q4 (tous disent « BuildingScene Phaser »). À aligner lors des tickets d'implémentation, pas dans cette PR.
* Coût d'animation 3D (personnel, ascenseur, murs ouverts) plus élevé que des états CSS ; ressources WebGL supplémentaires à libérer correctement.
* La scène n'est pas testable sans navigateur ; seul le modèle pur l'est, et pas encore en Node 20.

### Neutral

* Aucune règle serveur, aucun contrat d'API ne change ; `building` (niveau, calculé par le serveur) reste la seule donnée consommée.
* `phaser` reste dans `package.json` tant que l'ADR 0002 n'est pas implémentée et validée.
* Cet ADR ne tranche pas le style visuel détaillé (low-poly vs glTF) : sujet de l'implémentation.

## Pros and Cons of the Options

### 1. `BuildingScene` Three.js (gated)

* Good, car cohérence de moteur et réutilisation de `CityScene` / `zoomToDistrict`.
* Good, car pas d'atlas par étage et par niveau.
* Bad, car dépend d'un gate non mesuré (0002) ; risque de réécriture si 0002 échoue.
* Bad, car animation 3D plus coûteuse à produire que le 2D.

### 2. `BuildingScene` Phaser

* Good, car décision déjà prise par Noah (n° 49) et animation 2D prévisible en performance.
* Bad, car, avec 0002, Phaser ne servirait plus qu'à un écran : deux moteurs durables et un chargement supplémentaire.
* Bad, car transition ville (Three.js) → coupe (Phaser) discontinue ; atlas à produire (point n° 50 ouvert).
* Pertinent seulement si 0002 retombe sur Phaser.

### 3. Coupe 2D stylisée sans moteur 3D (SVG/CSS)

* Good, car très léger, accessible, sans WebGL, testable en jsdom ; bon repli.
* Good, car découplé du verdict de 0002.
* Bad, car « murs ouverts façon Sims » animés, rotation de caméra et personnel qui circule sont limités ; rupture visuelle avec la ville 3D.
* Bad, car encore un troisième langage visuel à maintenir si la ville est en 3D.

### 4. Statu quo (HTML/CSS)

* Good, car déjà livré, accessible et sans risque de performance.
* Bad, car n'honore pas la « coupe animée » de la 4e décision ni la cohérence visuelle avec la ville.
* Conservé comme **plancher**, pas comme cible.

## More Information

* Code consulté : `src/game/building/floors.ts` (+ test), `src/components/building/BuildingView.tsx` et panneaux, `src/game/login/CityScene.ts`, `zoomToDistrict`.
* Docs consultés : `docs/adrs/0002-remplacer-phaser-par-three-js-pour-la-vue-ville.md`, `docs/QA-ville-threejs.md`, `docs/VILLE-ET-BATIMENT.md` §7/§8/§12, `docs/CARTE-TECH.md`, `docs/OPEN-QUESTIONS.md` n° 49/56, `docs/BACKLOG.md` MAP-Q4. Autres ADR : 0001 (authentification), sans lien.
* Sécurité (à revoir avec le skill `security-review` à l'implémentation) : aucun appel réseau ni clé dans la scène ; aucun texte de prospect ou du modèle rendu en HTML dans la scène (textes en DOM, nettoyés) ; textures locales uniquement.
* [INVESTIGATE: Noah valide-t-il que la coupe suive le moteur de la ville, y compris l'abandon de la décision n° 49 « Phaser » ?]
* [INVESTIGATE: mesurer le gate (a) à (d) sur un portable sans GPU dédié ; aucun rendu navigateur n'a été vérifié à ce jour]
* [INVESTIGATE: aligner `engines.node` du `package.json` sur Node 22+ ou figer vitest, décision à prendre hors de cet ADR]
* Statut : `draft`, à valider par Noah, **après** 0002.

## Mise à jour du 2026-11-08 : refonte de la ville et de la coupe

La demande du porteur du projet (rendu « pas à la hauteur », ville inutilisable, coupe trop pauvre) a conduit à **refaire** le rendu plutôt qu'à l'enrichir :

* **Moteur par défaut.** `buildingEngine()` renvoie désormais `three` ; `NEXT_PUBLIC_BUILDING_ENGINE=dom` force le DOM. Le **repli automatique reste en place** : sans WebGL, ou si la boucle reste sous `FPS_MIN` images/s (`createFpsGuard`), la scène se retire et la liste DOM des étages continue de fonctionner. Cela déplace le défaut décidé plus haut (« DOM par défaut tant que le gate n'est pas mesuré ») : **le gate (a) à (d) n'est toujours pas mesuré sur un vrai GPU**, ce qui reste à faire.
* **Coupe meublée.** `src/game/building/three/BuildingScene.ts` et `rooms.ts` : cinq pièces (terrasse avec héliport, studio pub, salle du courrier avec convoyeur, archives, accueil et garage), robots animés, ascenseur, lueur de survol et de sélection, caméra qui cadre l'étage ouvert. La caméra y est plus basse (24°) que l'isométrique de la ville (35°) : à 35°, la dalle du dessus masque l'intérieur de la pièce du dessous.
* **Raccord avec la ville.** `src/game/map/handoff.ts` : l'écran qui part (connexion, bureau) dit où sa caméra s'est arrêtée, la carte reprend là puis s'éloigne.
