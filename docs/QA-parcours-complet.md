# QA parcours complet : connexion → ville → bureau → retour → déconnexion (GR3-42)

Base : `agent/epic3-bureau-threejs` @ `80b142a` (PR #8, **à ne jamais fusionner** depuis cette tâche). Auteur : Game Designer / QA.
Environnement de l'auteur : **Node 20.19.4, pas de navigateur, pas de GPU, pas de back-end lancé.**

## 1. Ce qui est prouvé, et par qui

| Affirmation | Source | Statut |
|---|---|---|
| 41 fichiers, **284 tests passés**, typecheck et lint propres | **Exécuté par la coordination** sous Node 22.23.4 (worktree jetable). Repris tel quel, cité ici sans l'avoir rejoué. | Rapporté par un tiers, non reproduit par moi |
| Les écarts de la section 3 | Lecture de code (commandes `grep` et lecture de fichiers sur `80b142a`) | Lu, pas exécuté |
| Tout le reste | — | **Non prouvé** (section 4) |

Je n'ai lancé ni `pnpm test`, ni `typecheck`, ni `lint`, ni `build` pour cette tâche. Je n'ai installé aucun runtime (Node 22 absent de ma machine).

## 2. Parcours manuel (humain, navigateur avec WebGL et GPU)

Préparation : back-end et front lancés selon `README.md`. Compte `qa-seed` : identifiants dans `api/var/qa-accounts.json` (fichier 0600, hors dépôt). Ne les copiez ni dans le dépôt ni dans un commentaire. Si le compte `qa-seed` n'y figure pas, regarder les comptes présents (le code de `qa_seed.py` crée `qa-vierge`, `qa-debutant`, `qa-expert`) : **écart de nom à confirmer**.
Deux passes complètes : **A** sans variable (moteur DOM, défaut) ; **B** avec `NEXT_PUBLIC_BUILDING_ENGINE=three` (variable lue au build/démarrage : relancer `pnpm dev`). Ouvrir DevTools (console + Performance) dans les deux passes.

| # | Action | Résultat attendu (A et B sauf mention) |
|---|---|---|
| 1 | Ouvrir `/connexion`, se connecter avec `qa-seed` | Décor de ville animé derrière le formulaire. Pas d'erreur console. Message d'erreur lisible si mauvais mot de passe. |
| 2 | Valider | Zoom caméra sur un quartier (`zoomToDistrict`), puis navigation. Compte avec partie → `/carte` ; sans partie → `/creer` (`LoginScreen.tsx:40`). |
| 3 | Sur `/carte` | Ville Three.js affichée (moteur carte = three par défaut), HUD (coffre, garage), liste de lieux, bots animés. Aucune erreur WebGL. |
| 4 | Souris : glisser, molette, boutons ±, touche H | Rotation, zoom, recentrage sur l'immeuble. |
| 5 | Clic sur l'immeuble (ou « Entrer dans votre immeuble », ou puce Coffre/Garage) | Zoom caméra vers l'immeuble, puis `/immeuble`. La navigation arrive au plus tard après 2 s même si le zoom échoue. Un double clic ne déclenche qu'une navigation. |
| 6A | `/immeuble` sans la variable | Titre « Votre immeuble : <entreprise> », liste de 5 étages, **aucun canvas**. |
| 6B | `/immeuble` avec la variable | Canvas `data-testid="three-building"` au-dessus de la liste : pile de 5 dalles colorées, survol = surbrillance, clic sur une dalle = ouvre l'étage. La liste DOM reste présente. |
| 7 | Ouvrir chaque étage (clic, flèches + Entrée) : Toit, Studio pub, Salle du courrier, Archives, Accueil et garage | Panneau de l'étage, URL mise à jour (`?etage=<slug>`), annonce vocale « <étage> ouvert ». En B, la dalle de l'étage est en surbrillance. |
| 8 | Accueil : lancer une recherche ; Archives : ouvrir le carnet ; ouvrir « Contacter » depuis un prospect | Recherche exécutée et coffre mis à jour. Carnet affiché. « Contacter » ouvre la conversation dans la salle du courrier. |
| 9 | Studio pub : créer/consulter une campagne | Comportement identique avant l'epic 3 (aucune régression). Le serveur reste maître de l'argent et des quotas. |
| 10 | Acheter un agent (Accueil) | Coffre mis à jour après réponse serveur (pas de calcul côté client). |
| 11 | Retour : bouton « Retour à la ville (Échap) », puis une seconde fois avec la touche Échap | A : navigation immédiate vers `/carte`. B : dézoom animé, puis `/carte`, 2 s maximum. Échap dans un champ de saisie ne quitte pas la vue. |
| 12 | Arrivée sur `/carte` | Ville affichée. **Attendu connu : caméra recentrée par défaut** (voir écart 3.1), sélection perdue. |
| 13 | Déconnexion (sur `/carte`) | Dézoom de la ville (2 s maximum), fin de session serveur, `/connexion`. Le bouton « retour » du navigateur ne doit pas redonner accès à la partie. |
| 14 | Variantes à passer | `prefers-reduced-motion: reduce` (animations coupées, mode liste utilisable) ; WebGL désactivé (`chrome://flags`) : en B, pas d'écran vide, retour au DOM ; navigation au clavier seul (Tab, flèches, Entrée, Échap) ; accès direct à `/immeuble` sans session (message « partie introuvable », pas de crash). |
| 15 | Mesures (voir 4.1) | FPS et mémoire consignés dans ce fichier, avec machine, navigateur et date. |

Remarque : la déconnexion n'existe que sur `/carte` (`MapScreen.tsx:326`), pas sur `/immeuble`. Le parcours demandé « retour → logout » passe donc forcément par la ville. À confirmer si c'est voulu.

## 3. Incohérences relevées par lecture de code

1. **État de la ville non conservé au retour.** `/carte` est une route distincte : au retour, `MapScreen`/`ThreeMap` sont remontés à neuf, donc caméra, lieu sélectionné et panneau ouvert sont perdus. Le dézoom du bureau se termine sur un canvas qui est ensuite détruit, puis la ville repart de sa vue par défaut : pas de continuité visuelle ville ↔ bureau (la décision de l'ADR 0003 parlait de transition continue). Aucun stockage de l'état de la vue (`sessionStorage` n'est utilisé que par `http.ts`).
2. **`features` du bâtiment sans rendu Three.js** : `new_windows`, `glass_partial`, `glass_full`, `facade_lights`, `decor_drones` ne sont lus que dans `src/game/map/art.ts` (chemin Phaser). Rendus en Three.js : awning, plants, big_lobby, rooftop_terrace, heliport, hanging_garden, panoramic_elevator, crown, grand_hall (relevé repris de `docs/QA-ville-threejs.md`, non revérifié ligne à ligne). Conséquence joueur : certains déblocages payés n'ont aucun effet visible dans la ville par défaut.
3. **Événements ignorés par `MapView`** : `reward` (aucun effet visuel de gain), `building:construction` (testé dans `bus.test.ts` mais jamais émis en production : `constructing` reste faux, pas de chantier), `building:skip` (sans effet). Relevé repris de `docs/QA-ville-threejs.md`.
4. **Le bureau Three.js est minimal** : `BuildingScene` ne dessine que 5 dalles (`ZONES`) avec survol et surbrillance. Pas de niveau d'immeuble, pas de personnel, pas d'agents « À recruter », alors que l'ADR 0003 prévoit un view-model (étage, agents, niveau). Le canvas est `aria-hidden` et l'accès réel reste le DOM : c'est cohérent avec l'ADR, mais l'enrichissement visuel annoncé n'est pas livré.
5. **`.nvmrc` = 20** et `engines.node` = `>=20.9`, alors que vitest 5 / jsdom 31 exigent Node 22+. Un contributeur qui suit `.nvmrc` ne peut pas lancer `pnpm test`. Le gate (d) de l'ADR 0003 (« `pnpm test` en Node 22+ ou `engines` aligné ») reste donc ouvert tant que `.nvmrc` et `engines` ne sont pas alignés.
6. **Défauts de moteur asymétriques** : ville = three par défaut (`NEXT_PUBLIC_MAP_ENGINE`), bureau = DOM par défaut. Par défaut, le parcours passe d'une scène 3D à une page DOM sans transition visuelle ; l'animation de zoom précède alors une page sans canvas.
7. **Seuil de repli différent du gate** : `FPS_MIN = 12` images/s (repli automatique) contre un gate ADR 0002 à 30. Une machine à 15 images/s ne bascule pas en mode liste et échoue pourtant le gate.
8. **Sécurité (règles non négociables)** : par lecture, `BuildingView`/`BuildingScreen` ne calculent ni argent ni quota (achat via `mutate(purchaseAgent)`, coffre lu depuis l'état serveur) ; la scène n'émet que `onSelect(FloorId)`. **Non vérifié par moi** : la propriété de session côté API (je n'ai pas audité `api/app/routes` ni lancé les tests d'API). Aucun problème de sécurité identifié ; absence de preuve n'est pas preuve d'absence.

## 4. Ce qui n'est pas prouvé

### 4.1 Gate ADR 0002 / 0003
- **≥ 30 images/s** sur portable sans GPU dédié (ville + immeuble niveau 10 + personnel) : **non mesuré**.
- **20 montages/démontages sans croissance mémoire**, et 20 allers-retours ville ↔ immeuble, StrictMode inclus : **non mesuré**.
- Protocole minimal : DevTools > Performance (30 s sur `/carte`, puis sur `/immeuble` en B) ; DevTools > Memory, snapshot après un 1er cycle puis après 20 cycles, comparer ; relever `renderer.info` si exposé. Consigner ici : machine, navigateur, version, date, chiffres.
- ADR 0002 et 0003 restent `draft` (validation de Noah en attente). L'ADR 0003 ne doit pas passer `accepted` avant 0002.

### 4.2 Rendu réel
Aucune capture, aucune vidéo, aucun rendu navigateur n'a été vu : lisibilité de la pile de dalles, couleurs, ombres, survol, dézoom animé, absence de clignotement lors du changement de canevas ville → bureau : **non vérifiés**.

### 4.3 Accessibilité réelle
Parcours clavier, annonces `aria-live`, lecteur d'écran, contraste, `prefers-reduced-motion`, focus après ouverture d'un panneau : conçus et testés en jsdom par la coordination (rapport tiers), **jamais essayés avec un lecteur d'écran ni dans un navigateur**.

### 4.4 Tests
Les 284 tests sont un résultat de la coordination. Un test jsdom avec `ThreeBuilding` simulé (`BuildingView.three.test.tsx`) ne prouve ni le rendu WebGL ni le cycle de vie du renderer.

## 5. Recommandations (pour le jeu et le suivi)

1. Exécuter les passes A et B ci-dessus et consigner les mesures dans ce fichier avant toute décision sur le moteur par défaut (le défaut DOM doit rester tant que le gate n'est pas passé).
2. Décision produit à prendre : conserver ou restaurer caméra/sélection de la ville au retour (écart 3.1).
3. Décision produit : rendre les `features` manquantes (3.2) ou documenter qu'elles sont sans effet visuel, pour ne pas faire payer un déblocage invisible.
4. Aligner `.nvmrc` et `engines.node` sur Node 22 (écart 3.5).
5. Si le gate est visé à 30 images/s, aligner `FPS_MIN` ou documenter l'écart (3.7).

## 6. Statut

**Aucune étape du parcours n'est marquée « vérifiée ».** Ce document est une procédure de recette et un relevé de lecture de code, pas un procès-verbal de test.
