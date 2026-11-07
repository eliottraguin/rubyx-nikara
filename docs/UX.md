# Écrans et expérience utilisateur

> **Réécrit le 2026-11-07** pour le cap « tycoon de prospection » (`PRODUIT-PROSPECTION.md`). Langue : **français**, solo, navigateur. L'ancien parcours « bureau + écrans de formulaires + 6 missions » est **obsolète**. Architecture de la carte : `CARTE-TECH.md`.

## Principe
Le jeu **se joue sur la carte**. Les écrans-formulaires deviennent des **panneaux** posés sur la carte. Tout ce qui est visible sur la carte a un **équivalent texte** (voir « Accessibilité ») ; l'interface ne permet jamais de modifier les règles économiques (le serveur décide solde, prix, quotas, score, déblocages).

**Le jeu est le moyen, le carnet est le produit** (`PRODUIT-PROSPECTION.md` §1). L'interface doit rendre le carnet de prospection aussi **accessible et utilisable** que la carte : il s'ouvre depuis le **classeur** de la base **et** depuis la barre de navigation (sans carte), ne dépend ni du score ni de l'argent, et reste complet en mode liste.

## Vue d'ensemble de la carte
Vue **de dessus en 3/4** (projection isométrique 2:1).

```
┌──────────────────────────────────────────────────────────────┐
│ [Trésorerie 30 $]  [Instructions restantes 5/5]  [Mode simulé]│  barre d'état (toujours visible)
│                                                              │
│           ◯ Glassdoor        ◯ LinkedIn                      │
│                      ⇢ (navette en vol)                      │
│   ◯ Registre            ┌──────────┐        ◯ Carte locale   │
│                         │   BASE   │                         │
│              ◯ Annuaire │ hangar ▣ │                         │
│                         └──────────┘                         │
│ ┌ Panneau (planète / agent / prompt / résultats) ┐           │
└──────────────────────────────────────────────────────────────┘
```

## Écrans et panneaux
| Écran / panneau | Contenu et actions principales |
|---|---|
| **Accueil** | Promesse en une phrase, démarrer, reprendre, explication des deux modes (Tutoriel / Réel) |
| **Création** | Étape 1 : nom de l'entreprise, mode. Étape 2 : **fiche entreprise et cible** (Tutoriel : exemple pré-rempli, modifiable ; Réel : saisie guidée, 3 champs minimum). On arrive **sur la carte** |
| **Fiche entreprise et cible** | Formulaire guidé (offre, besoin, secteurs, zone, taille, fonctions, exclusions, ton), **diff** entre versions, rappel « décrivez une cible, pas des personnes » ; accessible depuis la base |
| **Carte** (écran principal) | Base, planètes, agents mobiles, barre d'état ; clic ou touche sur une planète ou un agent |
| **Panneau planète** | Fiche cible du commanditaire, récompense max, coût par instruction, meilleur score, condition de déblocage **en texte**, bouton « Préparer une expédition » |
| **Panneau agent / prompt** | Éditeur du prompt, version courante et versions précédentes, compteur « n/5 », **coût maximal avant envoi**, bouton « Envoyer » ; envois impossibles désactivés **avec la cause affichée** |
| **Dialogue de planète** | Bulles de l'agent et de la planète pendant la discussion ; **transcript complet** repliable ; bouton « Passer l'animation » |
| **Rapport de leads** | Cartes de leads (entreprise, contact, signal, canal, source, **fiabilité** en libellé) ; choix de version ; édition manuelle (version enfant avec son auteur) ; **« Ajouter au carnet »** (par lead ou « tout ajouter » ; refus expliqué pour un lead non vérifiable) ; bouton « Livrer cette version » avec confirmation |
| **Retour client** | **Deux scores** (« Votre prompt », « Vos résultats »), critères réussis/ratés, phrases du prompt en cause, paiement, dépenses, prochain objectif |
| **Hangar** (boutique) | Agents, prix, rôle, condition de déblocage, confirmation d'achat |
| **Carnet de prompts** (apprentissage ; distinct du carnet de prospection) | Versions de prompts, score de chacune, **diff** entre deux versions, réutilisation (consomme une instruction dans un envoi normal) |
| **Carnet de prospection** (produit) | Liste des prospects : **tri**, **filtres**, **recherche**, compteurs par statut, actions groupées (marquer contacté, écarter, supprimer), **Exporter en CSV** ; voir « Carnet de prospection et atelier du prospect » |
| **Fiche prospect** | Détail et provenance, statut, notes, **fiche client** (agent), **brouillons de message** (agent), historique ; suppression |
| **Fin et bilan** | Résultats, compétences illustrées par des actions observées, nouvelle partie |

Écran additionnel (P2, chef d'équipe reporté) : validation d'un plan de délégation.

## Disposition
- **Bureau (≥ 900 px)** : la carte occupe l'écran ; panneau latéral droit (prompt, résultats). Trésorerie, instructions restantes et coût de l'action **toujours visibles** dans la barre d'état.
- **Mobile (390 px)** : carte plein écran avec **zoom/déplacement tactiles bornés** (un doigt = déplacer, pincer = zoom, plage limitée) ; les panneaux deviennent une **feuille inférieure** à trois onglets : « Mission » (planète et fiche cible), « Agent » (prompt), « Rapport » (leads et retour). Cibles tactiles ≥ **44 px**. Bouton de livraison avec confirmation montrant clairement la version envoyée.
- **Première planète en ≤ 3 actions** après la création : choisir la planète, écrire un prompt, envoyer.
- Commandes indisponibles : **explication textuelle**, jamais seulement grisées.
- **Carnet sur mobile** : liste de **cartes** (une par prospect : entreprise, fonction, statut, pertinence, fiabilité), filtres dans une feuille, export et suppression dans un menu d'actions ; fiche prospect en plein écran avec onglets « Résumé », « Fiche client », « Message » ; cibles ≥ 44 px.

## Les agents sur la carte
| État | Représentation | Équivalent texte |
|---|---|---|
| Au hangar | Sprite à la base | « Éclaireur : au hangar » |
| En vol | Navette qui suit une trajectoire vers la planète | « Éclaireur : en route vers LinkedIn » |
| En discussion | Atterri, bulles avec l'agent de la planète | « Éclaireur : discute avec LinkedIn » + transcript |
| Retour | Navette revient, soute qui s'ouvre, cartes de leads | « Éclaireur : de retour, 7 leads » |
| En panne | Fumée, navette immobile, bouton « Réessayer » (reprise sûre) | « Éclaireur : en panne, aucun débit » |

La trajectoire et la durée du voyage sont **cosmétiques** ; l'animation attend le serveur (boucle de vol) et ne retarde jamais un résultat déjà prêt.

## Carnet de prospection et atelier du prospect
Parcours : **carte → rapport d'expédition → « Ajouter au carnet » → carnet → fiche prospect → fiche client / brouillon de message → export**.

| Vue | Contenu et comportements |
|---|---|
| **Ajout** | Depuis le rapport. Confirmation « 5 prospects ajoutés, 1 déjà présent, 1 refusé (source non vérifiable) » en texte (région `aria-live`) ; sur la carte, les cartes de leads **volent vers le classeur** (cosmétique, désactivé en reduced-motion) |
| **Liste** | **Vrai tableau** sur grand écran : colonnes entreprise, contact, fonction, pertinence, fiabilité, source, statut, ajouté le ; en-têtes triables (`aria-sort`) ; recherche ; filtres ; pagination ; ligne cliquable **et** lien nommé. Marqueurs « possible doublon », « à relancer » en **texte** |
| **Fiche prospect** | Bandeau fiabilité (libellé + icône) avec ce qui manque ; **sélecteur de statut** (`nouveau`, `contacté`, …) ; **notes** (enregistrement explicite, conflit de version expliqué) ; provenance (planète, expédition, date de collecte, version de la fiche cible) ; bouton « Supprimer » avec confirmation |
| **Marquer « contacté »** | Un clic ; rappel « Le produit n'envoie rien : indiquez que *vous* avez contacté ce prospect » ; date affichée |
| **Fiche client** | Bouton « Générer la fiche » avec **coût maximal et quota (n/5) avant envoi** ; consigne facultative (≤ 500 caractères) ; résultat en sections (résumé, pourquoi ce prospect, points d'accroche, **à vérifier**, sources) ; **contrôles automatiques** listés (ex. « 5 sur 5 ») ; versions précédentes consultables ; agent non acheté ⇒ message expliquant où l'acheter |
| **Brouillon de message** | Même schéma ; bandeau permanent « **Brouillon : rien n'a été envoyé** » ; bouton **« Copier »** (texte brut) ; **aucun bouton d'envoi** ; les mentions d'origine et d'opposition sont visibles ; régénérer (n/5) |
| **Export** | Bouton « Exporter en CSV » (liste filtrée ou tout) ; rappel avant téléchargement : « contient des données personnelles professionnelles, à protéger » (Réel) ; nom de fichier `prospects-SIMULE-…` en Tutoriel ; l'export n'est **jamais désactivé** par un manque d'argent ni de score |
| **Mes données** (Réel) | Durée de conservation et date de purge, bouton « Conserver », export complet (JSON), suppression du carnet et de la partie, rappel « sans compte, ce carnet est lié à ce navigateur : exportez régulièrement » |

Les prospects `simulé` portent un **badge visible** partout (liste, fiche, export). Un carnet vide explique comment obtenir des prospects (« lancez une expédition ») avec un lien.

## Retours visuels
- **Gain** : le montant s'envole de la base vers le coffre ; la trésorerie de la barre d'état est mise à jour depuis l'état serveur.
- **Leads** : cartes qui tombent dans la soute, avec une pastille (qualité) **et un libellé**.
- **Planète débloquée** : le voile se lève, message texte « LinkedIn est maintenant disponible ».
- **Échec technique** : message en français avec code stable, aucun débit annoncé, bouton de reprise.
- Aucune évaluation de l'orthographe.

## États à concevoir dès la maquette
- Chargement avec expédition en cours · réponse longue · connexion perdue · expédition récupérable
- 5 instructions utilisées · fonds insuffisants · agent ou planète verrouillé · aucun rapport à livrer
- Évaluation en attente · échec de validation · récompense déjà attribuée · planète terminée
- Mode simulé / données réelles / repli sur le simulé (badges)
- Carte qui n'a pas pu se charger (voir « Repli sans carte »)
- Carnet vide · carnet plein (500) · lead non vérifiable refusé · prospect déjà présent · conflit de version sur les notes · fiche ou brouillon en cours de génération · génération échouée (aucun débit) · quota 5/5 atteint · agent non acheté · export prêt / export impossible · purge de rétention proche · carnet supprimé

## Accessibilité
La carte est un **canevas** : elle n'est **pas** accessible en soi. Le jeu doit donc rester **jouable sans la carte** :
- Une **couche DOM parallèle** (liste de planètes, liste d'agents, boutons) offre les **mêmes actions** : choisir une planète, ouvrir le prompt, envoyer, livrer, acheter. Elle est visible en mode « liste » et dans l'arbre d'accessibilité même quand la carte est affichée.
- Tous les éléments interactifs sont utilisables **au clavier** (ordre logique, focus visible, nom accessible). Raccourcis de la carte documentés ; la carte ne piège jamais le focus.
- Les événements importants (« L'éclaireur a atterri », « 7 leads rapportés », « Planète débloquée », erreurs) sont annoncés dans une **région `aria-live` polie**.
- **`prefers-reduced-motion`** : plus de trajectoires ni de balancement ; les agents **apparaissent à destination**, les bulles s'affichent sans mouvement, le journal texte reste complet. Un réglage manuel « Réduire les animations » est aussi proposé.
- **Jamais la couleur seule** : états de planète et d'agent doublés d'une **icône et d'un libellé** ; contrastes suffisants ; palette utilisable en daltonisme.
- Statuts et erreurs en **texte**, formats monétaires et codes d'erreur stables partagés.
- **Carnet** : élément `<table>` réel avec en-têtes, `aria-sort` sur la colonne triée, légende, navigation clavier ; filtres étiquetés ; résultats du filtrage annoncés (« 12 prospects ») ; sur mobile, la liste de cartes garde le même ordre de lecture. Le bouton « Copier » annonce « Message copié » ; le texte du brouillon reste sélectionnable.
- Ne pas déclarer la conformité complète sur la seule absence d'erreur automatisée ; test manuel clavier et lecteur d'écran avant la démo.

## Repli sans carte
Si Phaser ne se charge pas (réseau, WebGL indisponible, appareil faible) : bandeau en français, et le jeu **reste jouable en mode « liste »** (la couche DOM ci-dessus devient l'interface principale). Aucune règle de fiabilité n'est retirée.

## Pédagogie
- **Tutoriel** : une action à la fois (lire la fiche cible → choisir la planète → écrire le prompt → envoyer → lire le retour). Définitions courtes au clic pour « prompt », « agent », « lead », « source » ; accessibles aussi en mode Réel, sans parcours imposé.
- **Apprentissage par comparaison** : le carnet affiche, pour deux versions d'un prompt, ce qui a changé et la variation de score. Indices à 2 niveaux (attirer l'attention sur une information ; suggérer une question) : **jamais de prompt complet à recopier**.
- Après notation, le coach relie l'écart à une **phrase du prompt** (« vous n'avez pas précisé la zone »).
- Réponse d'agent : sources utilisées affichées (`source_ref`) ; distinction fait de la source / proposition de l'agent.
- Bilan fondé sur les actions observées, sans diplôme ni maîtrise non démontrée.

## Cohérence
Pages et composants partagent mêmes statuts, formats monétaires et messages d'erreur (codes stables de `CONTRACTS.md`). Les panneaux et la couche DOM lisent **le même état serveur** que la carte ; il n'existe pas deux sources de vérité.
