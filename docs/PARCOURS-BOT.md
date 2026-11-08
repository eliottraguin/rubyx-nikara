# Parcours du bot de prospection — référence produit (6e décision, 2026-11-08)

**Décision de Noah** : « pas d'atelier. Il faut faire **juste un bot qui va chercher des clients**, et qui nous **met ensuite en relation** dans la partie Contact. » Cette page **remplace** l'ancien parcours « commande → atelier → livraison → retour » et tout ce qui en dépend (client qui donne une tâche, brief, clarifications, prompt à écrire, livraison, évaluation par le client, score et paiement par expédition). Statut : **VALIDÉ par Noah le 2026-11-08** (« ok à tout », décisions Q1 à Q5 du §6 retenues telles que recommandées). Les docs sont réalignées d'abord, le code ensuite.

## 1. Le parcours en quatre temps
1. **Mon entreprise** : le joueur remplit sa **fiche entreprise et cible** (déjà livrée : `/api/profile`). C'est la **seule consigne** du bot. Il n'y a **ni commanditaire, ni brief à valider, ni prompt à écrire**.
2. **Chercher des clients** : un bouton (sur la carte, dans l'immeuble, ou via l'assistant Prospection) lance **le bot** (`scout`). Il part, visiblement, vers un lieu (annuaire, registre, carte locale, réseau pro…), interroge l'**agent du lieu** et revient avec des **prospects**. Le joueur n'a rien d'autre à faire pendant ce temps.
3. **Carnet de prospection** : les prospects arrivent dans le carnet, chacun avec sa **source**, sa date et une **fiabilité**. Le code garantit les faits (le prospect existe dans la source, pas de doublon, respecte la zone, le secteur, la taille de la fiche). Un **agent de tri** ajoute pour chacun « correspond / à vérifier / hors cible » avec **une citation de la source** : c'est une **aide à la décision, pas une note** pour le joueur.
4. **Contact** : le joueur choisit un prospect et clique **« Contacter »**. Une **conversation** s'ouvre dans la section **Clients (Contact)** ; le rédacteur (`replier`) propose le **premier message** (brouillon). Si le prospect répond (simulé en Tutoriel, vraie boîte mail en Réel), la réponse arrive dans cette conversation (`triage` la résume). On obtient **ou non** un client : c'est le résultat.

## 2. Ce qui disparaît
- Écrans et routes **commande, atelier, livraison, retour** (et leurs composants `OrderScreen`, `WorkshopScreen`, `DeliveryScreen`, `FeedbackScreen`) ; **bureau** si son seul rôle est de mener à la commande.
- Le **commanditaire** (client simulé qui donne une tâche), les **clarifications** (2 questions gratuites), le **brief** et ses versions, le **changement de cible** par événement.
- L'**écriture d'un prompt**, le **diff de prompts** et les **5 instructions par expédition** : le bot n'a pas de prompt de joueur (voir §6, Q2 pour une « précision » facultative).
- La **livraison** (`submit`), le **score /100 de l'expédition**, le **paiement `floor(gain × score)`**, la **reprise**, les « deux scores » (prompt et résultats).
- Les rôles M1–M6 `writer`, `prospector`, `researcher`, `analyst`, `qa`, `lead` et les missions `m1` à `m6`, `rescue`.
- Ma proposition de grille « 40 code / 60 agent » (`MISSIONS.md`, « Évaluation d'une expédition ») : **remplacée** par le tri de pertinence du §1.3, sans points.

## 3. Ce qui reste (inchangé)
Fiche entreprise et cible · carnet de prospection (copie par le serveur, `source_ref` revérifié, export CSV, suppression) · agent du lieu (corpus simulé en Tutoriel, source réelle en Réel, jamais de scraping) · conversations, `triage`, `replier`, envoi réel confirmé en Réel · pub (`ads`) · assistants personnels (`docs/ASSISTANT.md`) · économie : ledger, réservation avant appel, idempotence, quotas, propriété de session · carte, ville et immeuble.

## 4. Le bot et ses garde-fous
- **Un seul bot de prospection** : `scout`. Aucun autre rôle n'est utilisable pour chercher des clients.
- Le bot ne reçoit **que la fiche cible** et le lieu ; ses sorties sont des **données non fiables** (règles 2 et 3). Un lead sans `source_ref` renvoyé par le lieu pendant la recherche est **rejeté par le code**.
- Le modèle ne reçoit jamais la valeur d'un email ou d'un téléphone. Mode Réel : **B2B uniquement**, liste blanche de champs.
- **Rien n'est envoyé** à la recherche. L'envoi n'existe que dans Contact, sur confirmation (règle 13).
- Une recherche vide est un **résultat honnête** (« rien ne correspond »), jamais punie ni comblée par invention.

## 5. Conséquences sur les travaux en cours
- **Assistant Prospection** : le type d'étape `scout_expedition` devient `scout_search` (cible : un lieu) ; il lance une **recherche**, pas une expédition notée. Les assistants Clients et Pub sont **inchangés** (`ASSIST-3` peut continuer pour eux).
- **Lieux** (`DATA-C1`) : un lieu = une source + une description + un corpus (avec pièges) ; **plus de fiche de commanditaire** ni de grille de score.
- **Immeuble (10 niveaux)** : il évolue avec le « total gagné ». Sans gains d'expédition, il faut une autre mesure (Q1).
- **Backlog** : tickets `API-R2` (retirer les rôles et le parcours atelier), `API-E2` (tri de pertinence au lieu d'évaluation), `UI-R3` (retirer les écrans), à (re)chiffrer après validation.

## 6. Décisions (Noah, 2026-11-08 : « ok à tout », recommandations retenues)
- **Q1 (retenu : b) — L'argent et la progression.** Sans score ni paiement par expédition : (a) une **recherche coûte des $** (prix du lieu) et on gagne des $ **quand un prospect répond / devient client** ; (b) les recherches sont **gratuites** et seule la progression (lieux, agents, immeuble) se débloque avec le **nombre de clients obtenus** ; (c) autre. Mon avis : **(b) au début** (plus simple, rien à calibrer), les $ servent à acheter des agents.
- **Q2 (retenu : oui) — Une « précision » facultative ?** Le bot suit la fiche seule, ou le joueur peut-il ajouter une phrase (ex. « plutôt des commerces du centre ») avant de lancer ? Mon avis : **oui, facultative**, 300 caractères, traitée comme donnée.
- **Q3 (retenu : N = 3) — Débloquer les lieux.** Aujourd'hui : un score de 50 sur le lieu précédent. Sans score : débloquer un lieu quand le précédent a **rapporté au moins N prospects retenus** (proposition N = 3) ?
- **Q4 (retenu) — Tutoriel.** Corpus fictif + fiche d'exemple pré-remplie, **sans commanditaire**, avec une bulle d'aide à chaque étape (« voici votre cible », « voici ce que le bot a trouvé », « contactez-en un »). D'accord ?
- **Q5 (retenu : supprimer en v1) — Coach et événements de marché.** Les supprimer pour la v1, ou garder des **aléas** (« une source est indisponible aujourd'hui ») ? Mon avis : supprimer, à reprendre en P2.

**Conséquence retenue pour l'immeuble** : ses 10 niveaux ne dépendent plus du « total gagné » mais du **nombre de clients obtenus** (seuils dans les données) ; à reporter dans `VILLE-ET-BATIMENT.md` et `rules_v2`.

## 7. Décisions complémentaires (Noah, 2026-11-08)
- **Les $ se gagnent quand un client accepte** : quand un prospect **accepte notre démarche** (il devient **client**), le joueur gagne un montant fixé dans `rules_v2` (**proposé : 20 $ par client obtenu**), **une seule fois par prospect** (idempotent, source de paiement unique). Garde-fou serveur : le statut « client » n'est accepté que si la **conversation du prospect a reçu au moins une réponse du prospect** (simulée en Tutoriel). Ticket `API-S4`. Les recherches restent gratuites ; les $ servent à acheter agents et exemplaires.
- **Déblocage des agents confirmé** : `triage` à **1** client obtenu, `replier` à **2**, `ads` à **3** (valeurs dans `rules_v2`).
- **Immeuble** : seuils des 10 niveaux **non décidés par Noah** ; **proposition** (à corriger) : 0, 1, 2, 4, 7, 11, 16, 22, 30, 40 clients obtenus ; le niveau **ne baisse jamais**.
- **`/api/notebook`** (carnet de prompts) : **retiré** avec l'atelier (plus de prompt écrit par le joueur, plus de score).
