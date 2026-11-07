# Ville, bâtiment et intérieur

> **4e décision, 2026-11-07 (Noah).** Le décor change : **on abandonne l'espace**. La carte est **plein écran** et représente une **ville inspirée de New York**. Le joueur possède **un immeuble au centre**, qui **s'améliore quand il gagne de l'argent**. Ses agents (des **bots**) partent **à pied, à vélo, en skate ou en hélicoptère** prospecter. Des **drones** illustrent la pub. **En cliquant sur l'immeuble, on y entre** : c'est là qu'on gère la communication (messagerie, pub, carnet).
>
> Ce document remplace, pour **tout ce qui est visuel et navigation**, le thème spatial de `PRODUIT-PROSPECTION.md` (§1, §4, §5, §9), `UX.md` et `CARTE-TECH.md`. **Aucune règle serveur ne change** : économie, quotas, score, déblocages, idempotence et fiabilité restent ceux de `RULES.md`. Le thème est une **peau** posée sur le même moteur.
>
> Ce que le joueur fait ne change pas : prospecter (`PRODUIT-PROSPECTION.md`), parler aux clients et faire de la pub (`PRODUIT-CLIENTS-PUB.md`). Les valeurs chiffrées vivent dans `data/` ; les points ouverts dans `OPEN-QUESTIONS.md` (section « Ville et bâtiment »).

> **Divergence moteur de rendu, 2026-11-08 (matthieu.coraleau).** La décision Noah (4e) prescrit **Phaser 2D** pour la ville (§12). Après discussion, **matthieu.coraleau a demandé une dérogation : utiliser Three.js pour la ville et les nuages** au lieu de Phaser, à titre de moteur 3D temps réel. Cela s'applique **uniquement au rendu visuel** : **aucune règle serveur ne change**, le contrat d'API reste inchangé, **les paliers et la logique restent dans `RULES.md` et `api/`**. La page de connexion et la transition de zoom utilisent aussi Three.js. La **coupe de l'immeuble** (`BuildingScene`, §7) reste une **scène Phaser**, pour l'instant, sauf décision ultérieure. Cette divergence est documentée ici et tracée (qui, quand, portée, ce qui ne change pas).

## 1. Vision
**Style graphique (décision Noah) : « un peu comme Les Sims, en réaliste ».** Une ville et un immeuble **semi-réalistes** : proportions crédibles, matières et éclairage doux, **personnages animés qui vivent leur journée** (ils tapent, lisent le courrier, téléphonent, marchent), et une **coupe d'immeuble à murs ouverts** comme le mode construction des Sims. Ce n'est **ni du pixel art ni du dessin minimaliste**. Conséquence sur les assets : §12.

Un **tycoon de ville** en vue de dessus 3/4 (isométrique 2:1) : la ville est **vivante** (rues, circulation légère, piétons de décor, parc) et le joueur y voit **son entreprise grandir**. Le but reste d'**aimer une tâche qu'on évite d'habitude**.

Trois idées simples guident l'interface :
1. **Dehors, on prospecte** : on voit les bots quitter l'immeuble et traverser la ville.
2. **Dedans, on communique** : l'immeuble en coupe contient la messagerie, la pub et le carnet.
3. **Tout ce qu'on voit a un équivalent texte** (couche DOM, mode liste) et **aucun décor ne décide d'une règle**.

## 2. Vocabulaire (le thème change, les identifiants non)
Les identifiants techniques de l'API et des données (`planet`, `planets`, `hangar`, `beginner`/`expert`) sont **conservés** : aucune migration. Seuls les **libellés** de l'interface changent.

| Avant (thème spatial) | Maintenant (thème ville) | Id technique conservé |
|---|---|---|
| Base | **Votre immeuble** (siège) | `base` |
| Planète | **Lieu** (un lieu emblématique de la ville) | `planet` |
| Navette, vaisseau | **Bot** (agent en déplacement) | `agent` |
| Voyage dans l'espace | **Trajet** dans la ville | `trace` |
| Hangar | **Garage** (rez-de-chaussée) et **héliport** (toit) | `hangar` |
| Classeur de la base | **Archives** (étage du carnet de prospection) | — |
| Constellation (finale) | **Times Square** | `constellation` |

## 3. La ville et les lieux
Une **ville stylisée** : îlots d'immeubles de hauteurs variées, avenues, un **grand parc** (Central Park), un fleuve en bordure, des ponts. **Votre immeuble est au centre**. Il se repère d'un coup d'œil (§4).

Les six lieux remplacent les six planètes (mêmes contrats de prospection, mêmes gains, mêmes déblocages). **Noms réels de lieux de New York** (décision Noah), **illustrés de façon générique** (silhouettes évocatrices, **aucun logo ni marque**, mention « non affilié » dans l'écran d'information). Tableau de départ, **modifiable dans les données** :

| # | Plateforme (id) | Lieu | Véhicule par défaut | Pourquoi ce lieu |
|---|---|---|---|---|
| 1 | Annuaire (`annuaire`) | **Bibliothèque publique** (Bryant Park) | À pied | Lieu de référence, tout près |
| 2 | Registre (`registre`) | **Hôtel de ville** (City Hall) | Vélo | Registres officiels |
| 3 | Carte locale (`carte-locale`) | **SoHo** | Skate | Boutiques, avis, horaires |
| 4 | LinkedIn (`linkedin`) | **Midtown** (tours de bureaux) | Vélo | Décideurs et entreprises |
| 5 | Glassdoor (`glassdoor`) | **Wall Street** | Skate | Signaux de croissance et de recrutement |
| 6 | Constellation, finale (`constellation`) | **Times Square** | **Hélicoptère** | Plusieurs sources combinées |

- Le **parc central** est un **décor** (bots au repos qui se promènent, pas de lieu de prospection au MVP).
- Un lieu **verrouillé** s'affiche **voilé** (immeubles grisés, brouillard) avec **la condition de déblocage en texte** ; **disponible** : halo et pastille ; **expédition en cours** : bot devant le lieu ; **visité** : étoiles (meilleur score). **Jamais la couleur seule** : chaque état a une icône et un libellé.
- Le nom de la **plateforme** (Annuaire, LinkedIn…) reste affiché avec le lieu (« Midtown : LinkedIn ») : le joueur doit comprendre quelle source il interroge. Les noms de marques sont affichés avec « non affilié » (`OPEN-QUESTIONS.md` n° 6).
- **Positions et tracés** sont **cosmétiques** (`data/map/city_v1.json`, §10). Aucune règle n'en dépend.

## 4. Votre immeuble : on doit comprendre que c'est le nôtre
**Repérage immédiat** (tous obligatoires, aucun ne repose sur la couleur seule) :
- Il est **au centre de la ville** ; la caméra démarre dessus.
- **Enseigne lumineuse** avec **le nom de l'entreprise** (texte tronqué à 24 caractères, rendu en texte brut, jamais en HTML) et un **fanion** à la couleur de la partie.
- **Halo discret** au sol et **flèche « Votre siège »** à la première ouverture et quand la caméra s'éloigne.
- **Cliquable** : curseur main, infobulle « Entrer dans votre immeuble », équivalent clavier (touche `Entrée` sur le bouton « Entrer » de la couche DOM).

### Il s'améliore avec l'argent gagné
- **Niveau d'immeuble** (`building.level`, 1 à 10) **calculé par le serveur** à partir du **total gagné depuis le début** (`building.total_earned`) : somme des **paiements d'expédition** inscrits au ledger. **Il ne baisse jamais**, même si le joueur dépense en agents. Les 30 $ de départ, les remboursements et les actions sans gain n'y comptent pas.
- **Dix niveaux, très progressifs** (décision Noah : « plus de paliers ») : `building.level` va de 1 à 10, de façon que le joueur **voie son immeuble changer souvent**. Seuils dans `data/rules/rules_v2.json` (`building.levels`, **modifiables sans toucher au code** : on peut en ajouter ou passer à une progression continue). Valeurs de départ proposées (à régler sur l'économie réelle, `OPEN-QUESTIONS.md` n° 45) :

| Niveau | Total gagné | Ce qui change (cosmétique) |
|---|---|---|
| 1 | 0 $ | Petit immeuble de briques, enseigne simple, rez-de-chaussée seul occupé |
| 2 | 20 $ | Peinture refaite, auvent, plantes à l'entrée |
| 3 | 45 $ | Un étage de plus, fenêtres neuves |
| 4 | 80 $ | Enseigne lumineuse, terrasse sur le toit |
| 5 | 125 $ | Façade vitrée partielle, lobby agrandi |
| 6 | 180 $ | Deux étages de plus, éclairage de façade |
| 7 | 250 $ | Tour : héliport sur le toit, ascenseur panoramique |
| 8 | 340 $ | Façade vitrée complète, jardin suspendu |
| 9 | 450 $ | Gratte-ciel, couronne éclairée |
| 10 | 600 $ | Siège emblématique, drones décoratifs en orbite, hall monumental |

- Le niveau est **uniquement visuel** : il **ne débloque aucun droit** (règle 1, le serveur reste maître). Ce que le joueur peut faire dépend des **achats d'agents** et des **déblocages de lieux**, comme avant. **Consulter, exporter et supprimer** carnet, conversations et campagnes n'est **jamais** lié au niveau.
- **Montée de niveau** : animation de chantier (grue, échafaudage), **jamais bloquante** (bouton « passer »). En `prefers-reduced-motion` : message texte « Votre immeuble passe au niveau 3 ».
- **Équivalent texte** permanent : « Immeuble niveau 5 sur 10, 112 $ gagnés au total, prochain niveau à 125 $ ».
- Le niveau **s'affiche aussi à l'intérieur** (§7, rez-de-chaussée).

## 5. Les bots dans la ville
Chaque agent en expédition est un **bot** qui quitte l'immeuble par la porte du garage (ou l'héliport) et se rend au lieu.

### Véhicule : décidé par la destination
Le véhicule vient de la **donnée du lieu** (`vehicle` dans `data/map/city_v1.json`) : `foot`, `bike`, `skate`, `helicopter`. **Purement visuel** : le serveur ne le connaît pas, ne le choisit pas et n'en dépend pas. Une même expédition garde le même véhicule à l'aller et au retour.

### Trajets
- **À pied, vélo, skate** : suivent le **graphe de rues** cosmétique (`streets` dans `city_v1.json`), avec carrefours et passages piétons ; vitesse selon le véhicule.
- **Hélicoptère** : décolle de l'héliport (toit), **ligne courbe au-dessus des immeubles**, ombre portée au sol, atterrit sur un **hélipad** du lieu.
- **Durée** : 2 à 4 s par trajet (réglable) ; l'animation **ne retarde jamais** un résultat déjà prêt et **boucle** (marche sur place, tour d'attente) tant que le serveur n'a pas répondu (principe de `CARTE-TECH.md`).

### États d'un bot
| État | Représentation | Équivalent texte |
|---|---|---|
| Au garage | Bot devant la porte, ou sur l'héliport | « Éclaireur : au garage » |
| En route | Bot qui marche, pédale, glisse ou vole | « Éclaireur : part à vélo vers Midtown » |
| Sur place | Devant le lieu, **bulles de dialogue** avec l'**agent du lieu** (un réceptionniste ou un gardien de la plateforme) | « Éclaireur : discute avec Midtown » + transcript |
| Retour | Revient avec un **dossier sous le bras** (cartes de leads) | « Éclaireur : de retour, 7 leads » |
| En panne | Vélo crevé, skate renversé, hélico posé, fumée ; bouton « Réessayer » (reprise sûre, aucun débit) | « Éclaireur : en panne, aucun débit » |

- **Messagerie et pub** : les agents `triage`, `replier` et `ads` travaillent **à l'intérieur** (§7), pas dans la rue. Les **drones** sont les « véhicules » de la pub (§6).
- Au repos, les bots **se promènent** près de l'immeuble ou dans le parc (décor, désactivé en `prefers-reduced-motion`).
- **Piétons et voitures de décor** : nombre plafonné (≤ 30), **purement décoratifs**, **masqués des lecteurs d'écran**, désactivables (« Réduire les animations »).
- La **trace d'événements serveur** (`departed`, `arrived`, `dialogue`, `returned`, `failed`) est **inchangée** : c'est la même histoire, jouée avec d'autres sprites.

## 6. Les drones (la pub)
Un **drone** apparaît dans la ville quand l'agent publicitaire `ads` **génère un kit** pour une campagne.

| État | Représentation | Équivalent texte |
|---|---|---|
| Au toit | Drone posé sur l'héliport (atelier du Studio pub) | « Aucun kit en cours de préparation » |
| En vol | Drone qui survole la ville avec une **bannière** (nom de la campagne, tronqué, texte brut) pendant la génération | « Directeur de campagne : prépare le kit de « Rentrée » » |
| Retour | Drone qui revient et **dépose le kit** sur le toit (le kit apparaît dans le Studio) | « Kit prêt (version 2) » |

**Règle d'honnêteté** : les drones **n'indiquent jamais qu'une pub est publiée ni diffusée**, puisque **le produit ne publie rien** (`PRODUIT-CLIENTS-PUB.md` §5). Ils ne volent que **pendant la préparation** et au retour. Le bandeau « Rien n'a été publié ni dépensé » reste visible dans le Studio. Un statut déclaratif « j'ai publié » (qui ferait patrouiller un drone) est une **idée P1** soumise à décision (`OPEN-QUESTIONS.md` n° 47).

Au niveau 10, des drones **décoratifs** gravitent autour de l'immeuble (aucun lien avec une campagne).

## 7. L'intérieur : l'immeuble en coupe
Cliquer sur l'immeuble (ou « Entrer » dans la couche DOM) **zoome la caméra** et ouvre l'**immeuble en coupe** : une façade ouverte, **un étage par activité**. Choisir un étage : clic sur l'étage, **ascenseur** (liste de boutons, clavier) ou flèches haut/bas. **Retour à la ville** : bouton, touche `Échap`, ou cliquer hors de l'immeuble.

```
TOIT        ▲ héliport · atelier des drones          (vue sur la ville)
┌───────────────────────────────┐
│ Étage 3  STUDIO PUB           │  agent ads · campagnes · kits · drones
├───────────────────────────────┤
│ Étage 2  SALLE DU COURRIER    │  agents triage + replier · conversations
├───────────────────────────────┤
│ Étage 1  ARCHIVES             │  carnet de prospection · fiches clients
├───────────────────────────────┤
│ RDC      ACCUEIL ET GARAGE    │  fiche entreprise · hangar · boutique · coffre
└───────────────────────────────┘
```

| Étage | Ce qu'on y voit | Ce qu'on y fait (panneaux React) |
|---|---|---|
| **Toit** | Héliport, atelier des drones, vue sur la ville | Voir les drones et les bots hélicoptères ; retour à la ville |
| **3 · Studio pub** | Bureaux de création, tableau d'inspiration, drones en maintenance ; l'agent `ads` à sa table | Campagnes, génération du kit (coût max, n/5), **Copier**, **Exporter** ; bandeau « Rien n'a été publié ni dépensé » |
| **2 · Salle du courrier** | Bureaux de tri et de rédaction, tubes pneumatiques, **boîte aux lettres** ; chaque conversation est une **enveloppe** ; les agents `triage` et `replier` travaillent | Conversations, synthèse, brouillons, **départ du courrier** (§8) |
| **1 · Archives** | Rangées de classeurs : **un tiroir par statut** (nouveau, contacté, en discussion, gagné, perdu, écarté) avec son **compteur** | Carnet de prospection (liste, tri, filtres, export CSV), fiches prospects, fiche client, brouillon de premier message |
| **RDC · Accueil et garage** | Réception (la **fiche entreprise** sur le comptoir), **coffre** (trésorerie), garage où attendent les bots, **panneau de niveau** de l'immeuble | Fiche entreprise et cible, hangar et boutique d'agents, « Mes données », carnet de prompts |

- **Scène animée Phaser** (coupe de l'immeuble, pour maintenant) : la coupe est une **scène Phaser** (`BuildingScene`) où les agents et le personnel **vivent** : ils tapent, trient les enveloppes, téléphonent, vont d'un étage à l'autre par l'ascenseur. Les animations sont **cosmétiques** et suivent l'état serveur (un agent « travaille » seulement s'il a une action en cours). Murs ouverts façon Sims ; **rotation de la caméra** par quarts de tour en option (`OPEN-QUESTIONS.md` n° 56). **La ville et la page de connexion utilisent Three.js** (divergence 2026-11-08).
- Les **agents achetés** sont **visibles à leur poste**. Un agent **non acheté** laisse un **bureau vide** avec une étiquette « À recruter » qui mène à la boutique (message expliquant le prix).
- **Tous les contenus** (listes, fils de conversation, kits, formulaires) sont des **panneaux React** posés sur la coupe : texte **sélectionnable et copiable**, rendu **texte sans HTML**, accessibles au clavier. La coupe est **l'illustration et la navigation**, jamais le contenu.
- Mode **Tutoriel** : tampon « SIMULÉ » sur les enveloppes et badge « Mode simulé » permanent. Mode **Réel** : badge « Données réelles ».

## 8. Gérer la communication : le parcours dans la Salle du courrier
L'idée : **le courrier suit un circuit lisible**, du réception à l'envoi, et **l'envoi réel n'existe qu'à un seul endroit**.

```
 ✉ Arrivée        →   🗂 Tri            →   ✍ Rédaction         →   ✔ Validation      →   📤 Départ
 (boîte aux lettres)  agent triage          agent replier           vous, toujours         vous, un clic
 réponses des         synthèse, intention   brouillon de réponse    relecture du texte     Réel : envoi réel
 prospects            désinscription ?      contrôles par code      exact                  Tutoriel : simulé
```

1. **Arrivée** : les réponses des prospects tombent dans la **boîte aux lettres** (Réel : après « Actualiser » ; Tutoriel : après chaque envoi simulé, le client simulé répond).
2. **Tri** : l'agent `triage` classe chaque enveloppe (intérêt, question, objection, refus, désinscription, hors sujet). Les enveloppes se rangent dans des **bacs** : « À traiter », « En attente de réponse », « Clos », « À ne plus contacter ».
3. **Rédaction** : sur une enveloppe « À traiter », l'agent `replier` prépare un **brouillon** (coût et quota n/5 affichés avant). Le joueur peut aussi écrire seul.
4. **Validation** : le joueur **relit et corrige** ; les contrôles par code sont listés (faits issus de la fiche, mentions d'opposition, longueur).
5. **Départ du courrier** : **seul endroit où l'on envoie**. Écran de confirmation (destinataire, objet, texte exact). Tutoriel : « Envoyer (simulé) », rien ne sort. Réel : envoi réel après confirmation (`PRODUIT-CLIENTS-PUB.md` §4).

**Tableau de bord du courrier** (en haut de l'étage) : compteurs `À traiter`, `En attente`, `À ne plus contacter`, et une **file « À faire »** (ex. « 3 réponses à relire », « 1 prospect s'est désinscrit ») : le joueur voit **quoi faire ensuite** sans chercher. Le **lien avec la prospection** est direct : un prospect `contacté` depuis le carnet ouvre sa conversation ; un prospect `gagné` apparaît dans les **clients**.

**Pourquoi ce choix** : une métaphore concrète (courrier, tri, rédaction, départ) fait comprendre le **circuit** et rend visible la règle essentielle (**les agents rédigent, le joueur décide et envoie**) sans écran technique. Alternatives étudiées et écartées : une seule grande pièce (lisible mais sans hiérarchie), un hall à trois portes (trop proche d'un menu, peu « jeu »).

## 9. Plein écran et navigation
- La **carte occupe tout l'écran**. Interface minimale en **surimpression** : **barre d'état** (trésorerie, instructions restantes, badge de mode), bouton **menu** (Entrer dans l'immeuble, Carnet, Boutique, Mes données, réglages), **panneau latéral** (lieu, prompt, rapport) qui se superpose sans réduire la carte.
- **Cible : ordinateur** (décision Noah : « toujours ordi »). Le jeu n'est **pas conçu pour téléphone** ; sur un petit écran, l'appli propose le **mode liste** (déjà responsive), sans la ville ni la coupe.
- **Caméra** : glisser pour déplacer, molette ou pincer pour zoomer (plage bornée, la ville ne sort jamais de l'écran), double-clic sur l'immeuble ou touche `H` pour **recentrer sur votre siège**.
- **Trois sections** (décision précédente) : elles deviennent **trois endroits** de la même ville : **Prospection** = la ville ; **Clients** = étage du courrier ; **Pub** = studio. Le carnet vit aux **Archives**. Un **raccourci** du menu ouvre directement chacun (sans passer par la caméra).

## 10. Données et contrats (additifs)
Aucune règle de jeu dans ces fichiers : **cosmétique** et paliers d'affichage.

| Fichier | Contenu |
|---|---|
| `data/map/city_v1.json` *(remplace `layout_v1.json`)* | Grille 2:1, îlots, parc, fleuve, **graphe de rues**, position de l'immeuble, **lieux** (id, nom affiché, quartier, position, hélipad éventuel, `vehicle`), héliport, points de départ des drones |
| `data/map/building_v1.json` | Apparence par niveau (sprites, enseigne, étages de la coupe), postes des agents par étage |
| `data/rules/rules_v2.json` | `building.levels` (seuils de **total gagné**) ; **les seuils sont des règles d'affichage**, calculés par le serveur |

Contrat proposé (à reporter dans `CONTRACTS.md` avant fusion, signalé à l'équipe) : `GET /api/state` gagne `building: { level, total_earned, next_level_at }`. `building` est **calculé par le serveur** ; le navigateur ne le choisit jamais (règle 1). Aucune nouvelle route.

`MapViewModel` gagne : `building` (niveau, texte d'équivalent), `places[].vehicle` et `places[].district`, `drones[]` (depuis les actions `ad_campaign` en cours ou terminées), `interior` (étage courant, postes occupés selon les agents achetés).

## 11. Impact sur le code existant
`src/game/map/` (≈ 2 100 lignes, thème spatial, **art généré par le code** dans `art.ts`) :

| Garder | Adapter ou remplacer |
|---|---|
| `iso.ts`, `route.ts`, `bus.ts`, `dispatch.ts`, `history.ts`, `viewmodel.ts` (logique pure testée) | `art.ts` → **moteur Three.js** pour la ville, les nuages, les véhicules, les drones, la page de connexion (divergence 2026-11-08) |
| Protocole de trace et file d'animations (`trips.ts`) | `trips.ts` : véhicules (marche, vélo, skate, hélico) et trajets sur graphe de rues, animés en **Three.js** |
| Couche DOM accessible, mode liste, `prefers-reduced-motion` | `layout.ts` + `data/map/layout_v1.json` → `city_v1.json` |
| Tests purs (`*.test.ts`) | `scenes/WorldScene.ts` → **Three.js scene** pour ville, immeuble central, caméra plein écran ; **`scenes/BuildingScene.ts`** (coupe) reste **Phaser** pour maintenant |

Les **libellés** de l'interface passent de « planète » à « lieu » ; les **identifiants** de l'API et des données restent. Détails techniques : `CARTE-TECH.md`.

## 12. Assets et performance
**Le style « Sims réaliste » exclut l'art généré par le code** (rectangles et polygones de `art.ts`) : il faut de **vrais assets**. Le code actuel ne sert plus que de **placeholders** pendant la production (mêmes clés de texture).

| Sujet | Choix proposé |
|---|---|
| Technique | **Three.js 3D temps réel** (divergence 2026-11-08) : géométrie low-poly stylisée, éclairage en temps réel, ombres dynamiques, animation GPU où possible. La **page de connexion** et la **transition de zoom** vers la ville sont aussi en Three.js. **Coupe de l'immeuble** (`BuildingScene`) reste Phaser 2D pour maintenant. Performance cible : 60 fps sur ordinateur courant, dégradation en mode « léger » si nécessaire (ombres, décor animé). |
| Production | **Point ouvert** (`OPEN-QUESTIONS.md` n° 50) : création sur mesure (Blender ou artiste), pack sous licence commerciale, ou génération assistée avec **droits d'usage clairs**. Un pack **CC0 réaliste** complet est **peu probable** |
| Personnages | Bots **animés** (marche, vélo, skate, hélicoptère, travail au bureau, attente, panne) ; apparence à décider (`OPEN-QUESTIONS.md` n° 55) |
| Lieux de New York | **Silhouettes génériques évocatrices**, **aucun logo, aucune marque, aucune image sous droits** ; mention « non affilié » |
| Licences | Chaque fichier listé dans `data/map/ASSETS.md` avec **source et licence avant fusion** (aucun asset sans licence claire) |

**Budget** (revu à la hausse, un rendu réaliste pèse plus) : ≤ **8 Mo** au premier affichage (ville et rez-de-chaussée) sur ordinateur, puis **chargement progressif** : quartiers lointains, étages, véhicules rares, niveaux de l'immeuble suivants. Atlas **compressés** (WebP ou KTX2 si pris en charge). **Culling** des sprites hors écran ; pools pour bots, piétons, véhicules, drones ; piétons et voitures de décor plafonnés (§5, ≤ 30) ; texte en **BitmapText** pour les compteurs.

**Performance** : cible **60 images/s** sur un **ordinateur courant**, **30 minimum** sur un portable modeste (sans carte graphique dédiée). Si le rendu réaliste dépasse le budget, **dégrader dans l'ordre** : décor animé, ombres, résolution des atlas (version « légère »), puis nombre de bots affichés ; jamais une règle de jeu. La scène **se met en pause** quand elle est cachée et quand la coupe la couvre. **Plein écran** : plafond de densité de pixels (DPR ≤ 2).

## 13. Accessibilité
- La carte et la coupe sont des **canevas** : elles ne sont **pas accessibles en soi**. La **couche DOM parallèle** (liste des lieux, liste des bots et drones, bouton « Entrer dans l'immeuble », liste des étages) offre **les mêmes actions** ; elle reste le **mode liste** de secours.
- Annonces `aria-live` polies : « L'éclaireur part à vélo vers Midtown », « 7 leads rapportés », « Votre immeuble passe au niveau 3 », « Kit prêt (version 2) », « 1 prospect s'est désinscrit ».
- **`prefers-reduced-motion`** : pas de trajets (les bots apparaissent à destination), pas de chantier, pas de piétons ni de voitures de décor, drones immobiles ; le journal texte reste complet. Réglage manuel « Réduire les animations ».
- **Jamais la couleur seule** ; contrastes suffisants ; la ville de nuit (si ajoutée) n'est jamais le seul mode lisible.
- Les éléments de décor (foule, circulation, nuages) sont **masqués** de l'arbre d'accessibilité.
- Test manuel clavier et lecteur d'écran avant démo (`QA-G1`).

## 14. Ce qui ne change pas
Moteur (sessions, ledger, quotas, idempotence, évaluation), règles de fiabilité, carnet de prospection, agent `replier` (fiche client, premier message), messagerie et pub (`PRODUIT-CLIENTS-PUB.md`), règle 13 (une seule exception : l'envoi confirmé), mode liste de secours, aucune dépendance de règle au décor.

## 16. Ordre de livraison (5e décision, 2026-11-07)
L'**intérieur de l'immeuble** (§7 et §8) est livré **avant** le décor de la ville : jalon R de `BACKLOG.md`. Première version : entrée par le clic sur le siège ou « Entrer » (couche DOM), liste des étages, panneaux Clients, Pub et Archives, **sans animation** ; la scène Phaser animée (`BuildingScene`, MAP-Q4) les habille ensuite. Hangar : 4 rôles (`scout`, `triage`, `replier`, `ads`).
