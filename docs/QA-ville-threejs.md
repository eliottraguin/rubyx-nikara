# QA non-régression — vue ville Three.js (GR3-36)

## Automatisé (Node ≥ 22 requis : vitest 5 / jsdom 31)
- `pnpm exec vitest run` : 39 fichiers, 273 tests verts (iso, layout, bots, trips, vehicles, paths, streets, bus, engine, three/*, AccessibleLayer…), aucun test modifié.
- `pnpm exec tsc --noEmit` et `pnpm exec eslint src` : sans erreur.

## Manuel navigateur (à exécuter par un humain — pas d'outillage navigateur dans l'env agent)
1. `/carte` : la scène Three.js s'affiche, pas d'erreur console.
2. Clic sur un lieu / sur l'immeuble du joueur → panneau/ouverture attendus (raycaster).
3. Rotation par glisser, zoom molette, dézoom au logout.
4. Recherche : sélection d'un lieu centre/surligne la cible.
5. Bots, véhicules et piétons s'animent et suivent les routes.
6. Mode liste : activer `prefers-reduced-motion: reduce` (DevTools > Rendering) → repli liste/AccessibleLayer, aucune animation.
7. Repli si rendu lent (ThreeMap) et drapeau Phaser désactivé par défaut.
