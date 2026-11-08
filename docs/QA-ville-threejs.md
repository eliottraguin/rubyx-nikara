# QA non-régression — vue ville Three.js (GR3-36)

Base : `agent/epic2-ville-threejs` @ bf80a8a. Environnement agent : Node 20.19.4, pas de navigateur.

## Prouvé (exécuté, Node 20.19.4)
- `pnpm typecheck` : OK. `pnpm lint` : OK. `pnpm build` : OK (routes /, /boutique, /carte, /connexion, /creer, /fiche, /immeuble).

## Non prouvé
- `pnpm test` : **non exécuté** (vitest 5 / jsdom 31 exigent Node 22+, absent). Aucun résultat de test n'est revendiqué.
  Un run antérieur de cette tâche (39 fichiers / 273 tests verts) a utilisé un Node 22 installé localement par l'agent, ce qui n'était pas autorisé : à ne pas compter comme preuve.
- Gate ADR 0002 (≥ 30 images/s ; 20 montages/démontages sans fuite) : **non mesuré**.
- Aucun rendu navigateur vérifié.

## Relecture à la main des tests jamais exécutés officiellement
`buildingPlan.test.ts`, `decor.test.ts`, `motion.test.ts`, `plan.test.ts`, `http.test.ts` (14 codes) : assertions cohérentes avec le code lu, aucune ne me paraît fausse. Points fragiles seulement : `motion.test` suppose que le départ est au garage sauf hélicoptère et que 3500 ms = phase « dialogue » (dépend de `legMs`/constantes) ; `decor.test` suppose des arbres à ≥ 0,8 de l'axe du parc. Lecture ≠ exécution.

## Régression par lecture de code
- `/carte` → `MapHost` → `ThreeMap` (Phaser seulement si `NEXT_PUBLIC_MAP_ENGINE=phaser`). `MapScreen` garde BasePanel, BotList, PlanetList/BuildingStatus, panneaux agents ; `mapError` bascule en mode liste ; `reducedMotion` propagé au bus.
- `features` du bâtiment sans rendu Three.js : `new_windows`, `glass_partial`, `glass_full`, `facade_lights`, `decor_drones` (seulement gérés dans `art.ts`, Phaser). Rendus : awning, plants, big_lobby, rooftop_terrace, heliport, hanging_garden, panoramic_elevator, crown, grand_hall.
- Événements du bus ignorés par `MapView` : `reward` (pas de FX de gain), `building:construction` (jamais émis → `constructing` reste faux, pas de chantier), `building:skip` (sans effet).

## Checklist manuelle (humain)
1. Connexion/création de session → animation de zoom vers la ville.
2. `/carte` : scène Three.js visible, console sans erreur WebGL.
3. Clic sur un lieu → sélection + panneau agents du lieu ; clic immeuble → BasePanel/BuildingStatus.
4. Rotation (glisser), zoom molette ; bots/véhicules/piétons animés.
5. Recherche, carnet, HUD (argent) fonctionnels.
6. Acheter un agent / gain : le HUD se met à jour (pas d'effet visuel `reward` attendu).
7. `prefers-reduced-motion: reduce` : pas d'animation, mode liste utilisable.
8. Navigateur lent / sans WebGL → repli liste.
9. Naviguer carte ↔ immeuble 20 fois : pas de croissance mémoire (DevTools), FPS ≥ 30.
10. Logout → dézoom, retour connexion.
