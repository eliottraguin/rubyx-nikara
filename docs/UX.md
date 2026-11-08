# Écrans et expérience utilisateur

> **Cap ville (4e décision, 2026-11-07)** : la carte est une **ville plein écran** avec **votre immeuble** au centre, et on **entre dans l'immeuble** (coupe, un étage par activité) pour gérer le courrier, la pub et le carnet. Référence : `VILLE-ET-BATIMENT.md`. Ce document garde les écrans et règles d'interface ; **lire « planète » comme « lieu », « navette » comme « bot » et « base » comme « immeuble »**. Les tableaux « Vue d'ensemble », « Disposition » et « Les agents sur la carte » ci-dessous sont **remplacés** par les sections correspondantes de `VILLE-ET-BATIMENT.md` (§5, §7, §9).
>
> **6e décision (2026-11-08, `PARCOURS-BOT.md`) : pas d'atelier.** Parcours en **4 temps** : **1. Mon entreprise** (fiche) → **2. Chercher des clients** (bouton, le bot `scout` va sur un lieu) → **3. Carnet** (prospects, tri de pertinence sans points) → **4. Contact** (« Contacter » ouvre une conversation dans la section Clients). **Supprimés** : panneau de commande/atelier (prompt, n/5), dialogue noté, rapport à livrer, **Retour client** et « deux scores », gains, coach, événements, Constellation. Les lignes ou paragraphes ci-dessous marqués **OBSOLÈTE (6e décision)** sont à retirer par le ticket `UI-R3` ; ils restent tant que les écrans existent dans le code.
>
> **Réécrit le 2026-11-07** pour le cap « tycoon de prospection » (`PRODUIT-PROSPECTION.md`). Langue : **français**, solo, navigateur. L'ancien parcours « bureau + écrans de formulaires + 6 missions » est **obsolète**. Architecture de la carte : `CARTE-TECH.md`.

## Principe
Le jeu **se joue sur la carte**. Les écrans-formulaires deviennent des **panneaux** posés sur la carte. Tout ce qui est visible sur la carte a un **équivalent texte** (voir « Accessibilité ») ; l'interface ne permet jamais de modifier les règles économiques (le serveur décide solde, prix, quotas, score, déblocages).

**Le jeu est le moyen, le carnet est le produit** (`PRODUIT-PROSPECTION.md` §1). L'interface doit rendre le carnet de prospection aussi **accessible et utilisable** que la carte : il s'ouvre depuis le **classeur** de la base **et** depuis la barre de navigation (sans carte), ne dépend ni du score ni de l'argent, et reste complet en mode liste.

## Vue d'ensemble de la carte
Vue **de dessus en 3/4** (isométrique 2:1), **plein écran**. Interface minimale en surimpression.

```
┌──────────────────────────────────────────────────────────────┐
│ [30 $]  [Clients 0]  [Mode simulé]          [☰ Menu]  │  barre d'état (surimpression)
│                                                              │
│     ◯ Wall Street        ◯ Midtown                           │
│              ⇢ 🚲 (bot en route)        🌳 Central Park       │
│  ◯ Hôtel de ville     ┌───────────┐       ◯ SoHo             │
│                       │ VOTRE     │                          │
│        ◯ Bibliothèque │ IMMEUBLE ★│      ◯ Times Square      │
│                       └───────────┘      (hélico 🚁)          │
│ ┌ Panneau (lieu / recherche / carnet)        ┐                │
└──────────────────────────────────────────────────────────────┘
```

Au clic sur l'immeuble : zoom, puis **coupe** (Toit, Studio pub, Salle du courrier, Archives, Accueil et garage), détaillée dans `VILLE-ET-BATIMENT.md` §7.

## Écrans et panneaux
| Écran / panneau | Contenu et actions principales |
|---|---|
| **Accueil** | Promesse en une phrase, démarrer, reprendre (version épurée : un titre, un bouton, une ligne de reprise) |
| **Création** | Étape 1 : nom de l'entreprise, mode. Étape 2 : **fiche entreprise et cible** (Tutoriel : exemple pré-rempli, modifiable ; Réel : saisie guidée, 3 champs minimum). On arrive **sur la carte** |
| **Fiche entreprise et cible** | Formulaire guidé (offre, besoin, secteurs, zone, taille, fonctions, exclusions, ton), **diff** entre versions, rappel « décrivez une cible, pas des personnes » ; accessible depuis la base |
| **Ville** (écran principal) | Ville plein écran, **votre immeuble** au centre, lieux, bots mobiles, drones, barre d'état ; clic ou touche sur un lieu, un bot ou l'immeuble |
| **Immeuble en coupe** | Étages cliquables (ascenseur au clavier) : Toit, Studio pub, Salle du courrier, Archives, Accueil et garage ; chaque étage ouvre ses panneaux ; retour à la ville par bouton ou `Échap` |
| **Panneau lieu** | Description du lieu, **fiche cible du joueur** (lecture, lien vers la fiche), nombre de prospects retenus ici, condition de déblocage **en texte**, **précision facultative** (≤ 300 caractères, aide : « une phrase pour orienter cette recherche »), bouton **« Chercher des clients »** (gratuit). *(OBSOLÈTE 6e décision : fiche du commanditaire, récompense max, coût par instruction, meilleur score, « Préparer une expédition ».)* |
| **~~Panneau agent / prompt~~** | **OBSOLÈTE (6e décision), `UI-R3`** : éditeur de prompt, compteur n/5, coût avant envoi. Remplacé par le panneau lieu ci-dessus |
| **Dialogue du lieu** | Bulles du bot et de l'agent du lieu pendant la recherche ; **transcript complet** repliable ; bouton « Passer l'animation » (inchangé) |
| **Résultat de recherche** | Cartes des prospects **déjà ajoutés au carnet par le serveur** (entreprise, contact, signal, canal, source, **fiabilité** et **pertinence** `correspond` / `à vérifier` / `hors cible` en libellé, avec la **citation de la source**) ; message honnête si la recherche est vide (« rien ne correspond à votre cible ici ») ; bouton **« Contacter »** par prospect. *(OBSOLÈTE : versions de rapport, édition manuelle, « Ajouter au carnet », « Livrer cette version ».)* |
| **~~Retour client~~** | **OBSOLÈTE (6e décision), `UI-R3`** : deux scores, critères, paiement. Aucun remplaçant : le tri de pertinence est affiché dans le carnet |
| **Hangar** (boutique) | Agents, prix, rôle, condition de déblocage, confirmation d'achat |
| **~~Carnet de prompts~~** | **OBSOLÈTE (6e décision)** : plus de prompt de joueur ni de diff de prompts (`/api/notebook` en 501 : à retirer ou réaffecter) |
| **Section Clients** (menu principal, distincte de la carte) | Liste des **conversations** (tri par dernière activité, filtre par intention et statut), fil d'une conversation (messages envoyés et reçus, badge `simulé` ou `réel`), **synthèse** du trieur, brouillon du rédacteur de réponse (coût maximal et quota n/5 avant envoi), zone « écrire sans agent », bouton **Utiliser le brouillon de premier message** |
| **Envoi réel** (Réel, confirmation) | Écran de confirmation : **destinataire en clair, objet, texte exact**, mention « Ce message sera réellement envoyé depuis votre boîte », bouton **Envoyer** ; causes de refus affichées (désinscription, plafond, brouillon périmé). Tutoriel : bouton « Envoyer (simulé) » et bandeau « rien ne sort » |
| **Boîte mail** (Réel) | Connexion (OAuth), adresse masquée, plafonds du jour, **Actualiser**, déconnexion (révocation) avec choix de supprimer les messages importés |
| **Section Pub** (menu principal) | Liste des campagnes ; fiche de campagne (nom, objectif, plateforme, audience, budget indicatif, consigne) ; **kit** par sections avec **Copier** par section et **Exporter** ; contrôles réussis ; versions ; bandeau permanent « Rien n'a été publié ni dépensé » ; **aucun bouton Publier** |
| **Carnet de prospection** (produit) | Liste des prospects : **tri**, **filtres**, **recherche**, compteurs par statut, actions groupées (marquer contacté, écarter, supprimer), **Exporter en CSV** ; voir « Carnet de prospection et atelier du prospect » |
| **Fiche prospect** | Détail et provenance, statut, notes, **fiche client** (agent), **brouillons de message** (agent), historique ; suppression |
| **Bilan** | Nombre de clients obtenus, prospects trouvés et contactés ; nouvelle partie *(OBSOLÈTE : « compétences illustrées », score)* |

**Livré (2026-11-08)** : panneau des assistants dans l'Accueil de l'immeuble (plan en français courant, « Oui, lancer » / « Non, annuler »), fiche entreprise (`/fiche`), lancement de recherche avec bulles d'aide Tutoriel, carnet, Contacter, Salle du courrier, Studio pub, boutique ; liste des lieux au clavier (`AccessibleLayer`). **Non fait** : vérification dans un navigateur, écrans Boîte mail et Envoi réel, lieux autres que l'Annuaire et le Registre.

## Disposition
- **Bureau (≥ 900 px)** : la carte occupe l'écran ; panneau latéral droit (lieu, résultats de recherche). Trésorerie et **nombre de clients obtenus** toujours visibles dans la barre d'état.
- **Mobile (390 px)** : carte plein écran avec **zoom/déplacement tactiles bornés** (un doigt = déplacer, pincer = zoom, plage limitée) ; les panneaux deviennent une **feuille inférieure** à trois onglets : « Lieu » (description et précision), « Recherche » (bot et résultats), « Carnet ». Cibles tactiles ≥ **44 px**.
- **Première recherche en ≤ 3 actions** après la création : ouvrir la fiche (exemple en Tutoriel), choisir le lieu, « Chercher des clients ».
- Commandes indisponibles : **explication textuelle**, jamais seulement grisées.
- **Carnet sur mobile** : liste de **cartes** (une par prospect : entreprise, fonction, statut, pertinence, fiabilité), filtres dans une feuille, export et suppression dans un menu d'actions ; fiche prospect en plein écran avec onglets « Résumé », « Fiche client », « Message » ; cibles ≥ 44 px.

## Les agents sur la carte
| État | Représentation | Équivalent texte |
|---|---|---|
| Au garage | Sprite à l'immeuble | « Éclaireur : au garage » |
| En vol | Bot qui suit une trajectoire vers le lieu | « Éclaireur : en route vers le Registre » |
| En discussion | Arrivé, bulles avec l'agent du lieu | « Éclaireur : discute avec le Registre » + transcript |
| Retour | Le bot revient, les prospects arrivent au carnet | « Éclaireur : de retour, 7 prospects ajoutés » |
| En panne | Fumée, bot immobile, bouton « Relancer la recherche » (sûr, idempotent) | « Éclaireur : en panne, aucun débit » |

La trajectoire et la durée du voyage sont **cosmétiques** ; l'animation attend le serveur (boucle de vol) et ne retarde jamais un résultat déjà prêt.

## Carnet de prospection et atelier du prospect
Parcours (6e décision) : **carte → « Chercher des clients » → prospects ajoutés au carnet par le serveur → fiche prospect → « Contacter » (conversation, section Clients) → fiche client / premier message → export**.

| Vue | Contenu et comportements |
|---|---|
| **Ajout** | Fait **par le serveur** à la fin de la recherche. Confirmation « 5 prospects ajoutés, 1 déjà présent, 1 rejeté (source non vérifiable) » en texte (région `aria-live`) ; sur la carte, les cartes de prospects **volent vers le classeur** (cosmétique, désactivé en reduced-motion) |
| **Liste** | **Vrai tableau** sur grand écran : colonnes entreprise, contact, fonction, pertinence, fiabilité, source, statut, ajouté le ; en-têtes triables (`aria-sort`) ; recherche ; filtres ; pagination ; ligne cliquable **et** lien nommé. Marqueurs « possible doublon », « à relancer » en **texte** |
| **Fiche prospect** | Bandeau fiabilité (libellé + icône) avec ce qui manque ; **sélecteur de statut** (`nouveau`, `contacté`, …) ; **notes** (enregistrement explicite, conflit de version expliqué) ; provenance (lieu, recherche, date de collecte, version de la fiche cible) ; bouton « Supprimer » avec confirmation |
| **Marquer « contacté »** | Un clic ; rappel « Le produit n'envoie rien : indiquez que *vous* avez contacté ce prospect » ; date affichée |
| **Fiche client** | Bouton « Générer la fiche » avec **coût maximal et quota (n/5) avant envoi** ; consigne facultative (≤ 500 caractères) ; résultat en sections (résumé, pourquoi ce prospect, points d'accroche, **à vérifier**, sources) ; **contrôles automatiques** listés (ex. « 5 sur 5 ») ; versions précédentes consultables ; agent non acheté ⇒ message expliquant où l'acheter |
| **Brouillon de message** | Même schéma ; bandeau permanent « **Brouillon : rien n'a été envoyé** » ; bouton **« Copier »** (texte brut) ; **aucun bouton d'envoi** ; les mentions d'origine et d'opposition sont visibles ; régénérer (n/5) |
| **Export** | Bouton « Exporter en CSV » (liste filtrée ou tout) ; rappel avant téléchargement : « contient des données personnelles professionnelles, à protéger » (Réel) ; nom de fichier `prospects-SIMULE-…` en Tutoriel ; l'export n'est **jamais désactivé** par un manque d'argent ni de score |
| **Mes données** (Réel) | Durée de conservation et date de purge, bouton « Conserver », export complet (JSON), suppression du carnet et de la partie, rappel « sans compte, ce carnet est lié à ce navigateur : exportez régulièrement » |

Les prospects `simulé` portent un **badge visible** partout (liste, fiche, export). Un carnet vide explique comment obtenir des prospects (« lancez une recherche ») avec un lien.

## Retours visuels
- ~~**Gain**~~ : **OBSOLÈTE (6e décision)**, plus de gain d'expédition. La trésorerie de la barre d'état reste mise à jour depuis l'état serveur (achats, générations).
- **Prospects** : cartes qui arrivent au carnet, avec une pastille (pertinence) **et un libellé**.
- **Lieu débloqué** : le voile se lève, message texte « Le Registre est maintenant disponible » (le précédent a rapporté au moins 3 prospects retenus).
- **Échec technique** : message en français avec code stable, aucun débit annoncé, bouton pour relancer.
- Aucune évaluation de l'orthographe.

## États à concevoir dès la maquette
- Chargement avec recherche en cours · réponse longue · connexion perdue · recherche récupérable
- Fonds insuffisants (achat) · agent ou lieu verrouillé · **recherche vide** (résultat honnête) · fiche entreprise incomplète
- *(OBSOLÈTE : 5 instructions utilisées, évaluation en attente, récompense déjà attribuée.)*
- Mode simulé / données réelles / repli sur le simulé (badges)
- Carte qui n'a pas pu se charger (voir « Repli sans carte »)
- Carnet vide · carnet plein (500) · lead non vérifiable refusé · prospect déjà présent · conflit de version sur les notes · fiche ou brouillon en cours de génération · génération échouée (aucun débit) · quota 5/5 atteint · agent non acheté · export prêt / export impossible · purge de rétention proche · carnet supprimé

## Accessibilité
La carte est un **canevas** : elle n'est **pas** accessible en soi. Le jeu doit donc rester **jouable sans la carte** :
- Une **couche DOM parallèle** (liste de lieux, liste d'agents, boutons) offre les **mêmes actions** : choisir un lieu, chercher des clients, ouvrir le carnet, contacter un prospect, acheter. Elle est visible en mode « liste » et dans l'arbre d'accessibilité même quand la carte est affichée.
- Tous les éléments interactifs sont utilisables **au clavier** (ordre logique, focus visible, nom accessible). Raccourcis de la carte documentés ; la carte ne piège jamais le focus.
- Les événements importants (« L'éclaireur a atterri », « 7 prospects ajoutés au carnet », « Lieu débloqué », erreurs) sont annoncés dans une **région `aria-live` polie**.
- **`prefers-reduced-motion`** : plus de trajectoires ni de balancement ; les agents **apparaissent à destination**, les bulles s'affichent sans mouvement, le journal texte reste complet. Un réglage manuel « Réduire les animations » est aussi proposé.
- **Jamais la couleur seule** : états de lieu et d'agent doublés d'une **icône et d'un libellé** ; contrastes suffisants ; palette utilisable en daltonisme.
- Statuts et erreurs en **texte**, formats monétaires et codes d'erreur stables partagés.
- **Carnet** : élément `<table>` réel avec en-têtes, `aria-sort` sur la colonne triée, légende, navigation clavier ; filtres étiquetés ; résultats du filtrage annoncés (« 12 prospects ») ; sur mobile, la liste de cartes garde le même ordre de lecture. Le bouton « Copier » annonce « Message copié » ; le texte du brouillon reste sélectionnable.
- Ne pas déclarer la conformité complète sur la seule absence d'erreur automatisée ; test manuel clavier et lecteur d'écran avant la démo.

## Repli sans carte
Si Phaser ne se charge pas (réseau, WebGL indisponible, appareil faible) : bandeau en français, et le jeu **reste jouable en mode « liste »** (la couche DOM ci-dessus devient l'interface principale). Aucune règle de fiabilité n'est retirée.

## Pédagogie (6e décision)
- **Tutoriel** : **fiche d'exemple pré-remplie**, corpus fictif, **pas de commanditaire**, et **une bulle d'aide à chaque étape** (Q4) : « voici votre cible » (fiche) → « voici ce que le bot a trouvé » (résultat de recherche et pertinence) → « contactez-en un » (bouton Contacter) → « voici la réponse » (conversation simulée). Définitions courtes au clic pour « lead », « source », « fiabilité », « pertinence » ; accessibles aussi en mode Réel, sans parcours imposé. Les bulles sont du **texte statique des données**, jamais produit par un modèle.
- Le joueur apprend à **décrire une bonne cible** (la fiche, plus la précision facultative) et à **lire un résultat avec esprit critique** (source citée, « à vérifier »). Pas de score, pas d'indice à niveaux, pas de coach (supprimé en v1, P2).
- Réponse d'agent : sources utilisées affichées (`source_ref`) ; distinction fait de la source / proposition de l'agent.
- Bilan fondé sur les actions observées (recherches, prospects, contacts, clients obtenus), sans diplôme ni maîtrise non démontrée.
- *(OBSOLÈTE : « apprentissage par comparaison » de deux versions de prompt, indices, coach, `UI-R3`.)*

## Cohérence
Pages et composants partagent mêmes statuts, formats monétaires et messages d'erreur (codes stables de `CONTRACTS.md`). Les panneaux et la couche DOM lisent **le même état serveur** que la carte ; il n'existe pas deux sources de vérité.

## Navigation : ville, immeuble, étages (3e et 4e décisions, 2026-11-07)
La navigation à trois sections (Prospection, Clients, Pub) devient **trois endroits d'une même ville** : Prospection = la ville (et les Archives pour le carnet), Clients = Salle du courrier (étage 2), Pub = Studio (étage 3). Un **raccourci** du menu ouvre directement chacun. Le hangar et « Mes données » sont au rez-de-chaussée. Aucune section ne dépend de la carte (le mode liste couvre tout).

Règles communes : envois impossibles **désactivés avec la cause affichée** ; tout texte reçu d'un client est rendu en **texte**, jamais en HTML ; aucun écran n'affiche une adresse email au modèle ni dans un journal, l'adresse n'apparaît **qu'au joueur**, sur l'écran de confirmation d'envoi, au **Départ du courrier**. Le niveau de l'immeuble (selon le **nombre de clients obtenus**) est **visuel** : il ne conditionne aucune action. Détails : `VILLE-ET-BATIMENT.md` et `PRODUIT-CLIENTS-PUB.md`.
