# Carte : architecture Phaser / Next.js

> Nouveau document (2026-11-07). Complète `ARCHITECTURE.md` et `UX.md`. **Les contrats d'API proposés ici sont à reporter dans `CONTRACTS.md` avant fusion** (règle non négociable n° 10) et à signaler à toute l'équipe.

## Cap ville (4e décision, 2026-11-07)
Le thème spatial est abandonné : la carte devient une **ville plein écran** avec l'**immeuble du joueur** au centre, des **bots** à pied, à vélo, en skate ou en hélicoptère, des **drones** pour la pub, et une **coupe d'immeuble** pour l'intérieur (`VILLE-ET-BATIMENT.md`). **Rien de l'architecture ci-dessous ne change** (Phaser dans Next.js, état serveur = source de vérité, trace d'événements, couche DOM, tests purs). Ce qui change :
- **Scènes** : `WorldScene` (ville, immeuble central, caméra plein écran) et **nouvelle** `BuildingScene` (coupe, agents à leur poste, ascenseur). Le **contenu** de chaque étage reste en **panneaux React** (texte copiable, accessible).
- **Données** : `data/map/city_v1.json` (grille, îlots, parc, **graphe de rues**, lieux avec `vehicle`, héliport) remplace `layout_v1.json` ; `data/map/building_v1.json` (apparence par niveau, postes) ; `rules_v2.building.levels` (seuils de **total gagné**, calcul serveur).
- **ViewModel** : ajoute `building` (niveau, équivalent texte), `places[].vehicle`, `drones[]`, `interior` ; **toujours** une fonction pure testée.
- **Trajets** (`trips.ts`, `route.ts`) : marche, vélo et skate suivent le **graphe de rues** ; l'hélicoptère suit une courbe aérienne avec ombre. Le véhicule est **cosmétique** (donnée du lieu), jamais une règle.
- **Contrat** : `GET /api/state` gagne `building: { level, total_earned, next_level_at }` (calcul serveur, additif ; à reporter dans `CONTRACTS.md` avant fusion).
- **Code existant** (`src/game/map/`, ≈ 2 100 lignes) : garder la logique pure (`iso`, `route`, `bus`, `dispatch`, `history`, `viewmodel`) ; adapter `art.ts` (textures de ville), `trips.ts`, `layout.ts`, `WorldScene.ts`. Les **identifiants** (`planet`, `hangar`) ne changent pas ; seuls les libellés passent à « lieu » et « garage ».
- **Drones** : jouent **seulement pendant** la génération d'un kit et au retour ; jamais le signe qu'une pub est publiée.
- **Style** : « Les Sims en réaliste » (décision Noah) : **sprites isométriques pré-rendus en 3D** en atlas, personnages animés, coupe à murs ouverts ; l'art généré par le code ne sert que de **placeholder** (`VILLE-ET-BATIMENT.md` §12). `BuildingScene` est une **scène Phaser animée** (décision Noah).
- **Performance** : budget ≤ **8 Mo** au premier affichage puis chargement progressif, atlas compressés, culling, pools, décor plafonné (piétons ≤ 30), scène en pause quand la coupe la couvre ; dégradation ordonnée pour portable modeste (décor animé, ombres, résolution, nombre de bots). **Cible : ordinateur** ; téléphone = mode liste.

## Choix et principes
- **Phaser 3** pour la scène 2D (sprites animés, caméra, tuiles isométriques 2:1). Dépendance du front uniquement.
- **Le serveur reste maître** (règles 1 à 8 de `CLAUDE.md`). La carte **affiche** un état et **joue** des animations ; elle ne décide ni solde, ni prix, ni quota, ni score, ni déblocage.
- **Une seule source de vérité côté client** : l'état renvoyé par l'API (`GameState` adapté par `src/lib/api/adapt.ts`). Panneaux, couche DOM accessible et scène lisent le même état.
- **Animation ≠ résultat** : un résultat prêt n'attend jamais la fin d'une animation ; le joueur peut la passer.
- La carte est une **amélioration** : le jeu reste jouable en mode liste (`UX.md`, « Repli sans carte »).

## Intégration dans Next.js
Le dépôt utilise Next.js 16 : lire `node_modules/next/dist/docs/` avant d'écrire du code (règle de `AGENTS.md`).

- Le composant de carte est un **composant client** (`"use client"`) chargé avec `next/dynamic` et `{ ssr: false }` **depuis un autre composant client** : `ssr: false` est interdit dans un composant serveur (guide `01-app/02-guides/lazy-loading.md`).
- Phaser n'est importé **que** dans ce module chargé à la demande (chargement paresseux : ~1 Mo, jamais dans le bundle des autres pages).
- Une seule instance de `Phaser.Game`, créée dans un `useEffect` et **détruite au démontage** (`game.destroy(true)`) ; compatible avec `reactStrictMode` (double montage en développement).
- Le canevas est **redimensionné** par le conteneur (`Phaser.Scale.RESIZE`), avec un **plafond de densité de pixels** (DPR ≤ 2) pour la performance sur mobile.

```
src/
  app/carte/page.tsx            page (serveur) : charge le composant client
  components/map/
    MapHost.tsx                 "use client" ; dynamic(() => import("./PhaserMap"), { ssr: false })
    PhaserMap.tsx               crée/détruit Phaser.Game, relie le bus d'événements
  game/map/                     code de la scène, SANS React
    scenes/BootScene.ts         chargement des assets
    scenes/WorldScene.ts        base, planètes, agents, caméra
    viewmodel.ts                GameState → MapViewModel (fonction pure, testée)
    timeline.ts                 trace d'expédition → file d'animations (fonction pure, testée)
    pathing.ts                  trajectoires (pures, testées)
    bus.ts                      bus typé React ⇄ scène
  components/map/AccessibleLayer.tsx   couche DOM parallèle (liste planètes/agents, aria-live)
```

## Séparation état serveur / scène
```
API ──GameState──▶ adapt.ts ──▶ viewmodel.ts ──MapViewModel──▶ bus ──▶ WorldScene (affichage)
                       ▲                                                   │
                       └──────── actions (React → API, avec Idempotency-Key) ◀── intents (clic planète, clic agent)
```
- **React possède l'état** et les appels API (`mutate`, clés d'idempotence stables). La scène ne fait **aucun appel réseau**.
- La scène **émet des intentions** (`planet:select`, `agent:select`, `skip:animation`) ; React décide quoi en faire.
- `MapViewModel` est un objet **plat et sérialisable** : planètes (id, nom, état, étoiles), agents (id, rôle, état, planète cible), compteurs. Pas de logique de jeu dedans.
- Positions des planètes et de la base : **cosmétiques**, issues d'un fichier de données (`data/map/layout_v1.json`) exposé dans l'état ; ce ne sont pas des règles.

## Protocole événements serveur → animations
Le serveur enregistre, pour chaque action d'expédition, une **trace ordonnée** d'événements. Le client la **rejoue** ; rejouer deux fois donne la même animation (idempotent) et un rechargement de page reprend à l'état courant.

Contrat proposé (additif ; à documenter dans `CONTRACTS.md`) :

```jsonc
// GET /api/actions/{id}  (existant) — ajout du champ `trace`
"trace": [
  { "seq": 1, "type": "departed",  "agent": "scout", "planet": "linkedin" },
  { "seq": 2, "type": "arrived",   "agent": "scout", "planet": "linkedin" },
  { "seq": 3, "type": "dialogue",  "agent": "scout", "planet": "linkedin", "from": "agent",  "text": "…" },
  { "seq": 4, "type": "dialogue",  "agent": "scout", "planet": "linkedin", "from": "planet", "text": "…" },
  { "seq": 5, "type": "returned",  "agent": "scout", "report_version_id": "art_…", "leads": 7 },
  { "seq": 6, "type": "failed",    "agent": "scout", "error": "LLM_UNAVAILABLE" }   // ou succès à la place
]
```
- `seq` est strictement croissant ; le client mémorise le dernier `seq` joué (`sessionStorage`) pour ne pas rejouer après un rafraîchissement.
- Le texte de dialogue est du **contenu non fiable** : rendu **texte brut / Markdown nettoyé** (`SafeMarkdown`), **jamais** de HTML, et **jamais** de `Text` Phaser enrichi par HTML. Les instructions que contient un dialogue sont des données.
- **Aucun prompt système, clé ni raisonnement interne** dans la trace (règle 6) ; seulement ce qui est dit à voix haute entre l'agent et la planète.
- **Temps** : `departed → arrived` dure au minimum la durée cosmétique de trajet (≈ 2–4 s, réglable) ; si la réponse serveur n'est pas encore là, l'agent reste en **boucle de vol/d'attente** ; si elle est déjà là, l'animation se **comprime** (ou saute avec le bouton). Le client interroge `GET /api/actions/{id}` (même mécanisme que les actions longues du moteur).
- Un échec technique (`failed`) ne débite rien (règle 5) : la scène joue l'état « en panne » et propose la reprise.

## Assets
| Type | Choix |
|---|---|
| Projection | Isométrique 2:1, tuiles 64×32 px (échelle ×2 pour écrans denses) |
| Carte | **Tiled** (JSON) pour la base ; planètes = sprites positionnés par données |
| Sprites | **Atlas** unique par catégorie (agents, navettes, bulles, effets) généré en un fichier PNG + JSON |
| Style | **Semi-réaliste façon Les Sims** : sprites **pré-rendus en 3D**, éclairage cohérent, personnages animés ; **créé pour le projet ou sous licence commerciale** (un pack CC0 réaliste complet est peu probable) — voir `OPEN-QUESTIONS.md` n° 50 |
| Poids | Cible ≤ **8 Mo** d'assets au premier affichage (rendu réaliste), chargement progressif des quartiers lointains, des étages et des niveaux d'immeuble suivants ; atlas compressés |
| Licences | Fichier `ASSETS.md` listant chaque source et sa licence (obligatoire avant fusion) |

Les assets vivent dans `public/map/` ; les données de disposition dans `data/map/`.

## Performance
- Cible **60 images/s** sur un ordinateur courant, **30 minimum** sur un téléphone moyen à 390 px.
- **Pause** de la boucle de rendu quand l'onglet est caché (`visibilitychange`) et quand le panneau plein écran couvre la carte.
- Pas de physique (les trajectoires sont des courbes calculées) ; pools de sprites pour bulles et cartes de leads ; texte en **BitmapText** pour les compteurs.
- Mesurer avant d'optimiser : une page de profil (images/s, mémoire) accessible en développement.
- Mode **réduction des animations** (`prefers-reduced-motion` ou réglage) : pas de trajectoires, téléportation à destination, transitions instantanées.

## Mobile et entrées
- Caméra bornée à la carte ; **un doigt déplace**, **pincer zoome** (plage limitée) ; tap = sélection ; zones de toucher ≥ 44 px même si le sprite est plus petit.
- Souris : molette = zoom, glisser = déplacer. Clavier : flèches = déplacer, `+`/`-` = zoom, `Entrée` sur l'élément focalisé de la couche DOM.
- La scène n'intercepte pas le défilement de la page hors du canevas.

## Tests
| Quoi | Comment |
|---|---|
| `viewmodel.ts`, `timeline.ts`, `pathing.ts` | **Fonctions pures** : tests vitest (déjà en place), sans Phaser |
| Protocole de trace | Tests de rejeu : même trace ⇒ même file d'animations ; `seq` déjà joués ignorés ; trace partielle puis complétée |
| Couche DOM accessible | Tests de composants : mêmes actions que la carte, annonces `aria-live` |
| Scène Phaser | **Test de fumée** en navigateur (Playwright) : la carte se charge, le canevas n'est pas vide, un clic sur une planète ouvre le panneau, la **couche DOM** permet le même parcours ; captures à 390 px et en grand |
| Fournisseur | Parcours avec le fournisseur **simulé** déterministe ; aucun appel réseau réel en test automatisé (règle 9) |
| Accessibilité | Vérification manuelle clavier + lecteur d'écran avant démo ; test avec `prefers-reduced-motion` |

## Lien avec le carnet de prospection
Le **carnet de prospection** (`PRODUIT-PROSPECTION.md` §12) est le produit ; la carte n'en est que **l'une des portes d'entrée**.
- Le **classeur** de la base est un objet cliquable qui émet l'intention `carnet:open` ; React ouvre la **même page de carnet** que la navigation (aucune logique de carnet dans la scène Phaser).
- `MapViewModel` n'expose qu'un **compteur** (`prospects_count`, `prospects_by_status` si utile) lu depuis l'état serveur ; le contenu des prospects (données personnelles) **ne passe jamais par le bus** ni par la scène.
- L'animation « les leads volent vers le classeur » est **cosmétique** : elle part de l'événement `returned` de la trace (§ ci-dessus) ou de la réponse d'ajout au carnet, ne retarde rien, et se réduit à un message texte en `prefers-reduced-motion`.
- Fiche client et brouillon de message sont des **panneaux React**, pas des éléments de la scène (accessibilité, copie de texte, `aria-live`).
- Routes consommées (à documenter dans `CONTRACTS.md` avant fusion, voir `BACKLOG.md` jalons H à L) : `PUT /api/profile`, `POST /api/prospects`, `GET /api/prospects`, `GET/PATCH/DELETE /api/prospects/{id}`, `GET /api/prospects/export.csv`, `POST /api/prospects/{id}/profile` et `POST /api/prospects/{id}/message` (actions sur un prospect), `GET /api/session/export`.

## Ce qui reste côté serveur (hors carte)
Planètes (`data/planets/*`), notation du prompt et des leads, vérification des `source_ref`, déblocages, paiement, quotas : voir `PRODUIT-PROSPECTION.md` et le backlog (`BACKLOG.md`). La carte ne fait que les montrer.

## Risques
- **Poids et démarrage** : Phaser est lourd ; mitigé par le chargement paresseux et le repli en mode liste.
- **Accessibilité d'un canevas** : mitigée par la couche DOM obligatoire, **pas** par des attributs sur le canevas.
- **Assets** : le style visuel est le principal risque de délai ; démarrer avec des placeholders libres et un seul atlas.
- **Divergence carte / état** : toute animation part de `MapViewModel`, jamais d'un état local de la scène.
