# Produit : tycoon de prospection

> **Cap décidé le 2026-11-07 (Noah).** Ce document remplace, pour tout ce qui touche au contenu du jeu, les missions M1–M6 et les 6 rôles du cahier v1.1. Les règles non négociables de `CLAUDE.md` et le moteur existant (sessions, économie, quotas, évaluation, idempotence, ledger) sont **gardés**. Les points non tranchés sont dans `OPEN-QUESTIONS.md` (section « Cap prospection »).
>
> **Précision du 2026-11-07 (Noah, 2e décision).** La prospection n'est pas un simple thème de jeu : c'est la **fonction réelle du produit**. En mode Réel, le joueur cherche **de vrais clients pour sa vraie entreprise**. La valeur du produit est la **liste de prospects exploitables** (carnet de prospection, fiches clients, premiers messages, export CSV) ; le score, les gains en $ et les déblocages sont des **mécaniques d'apprentissage et de progression**, jamais le but. Voir §1 et §11 à §14.
>
> **3e décision du 2026-11-07 (Noah).** Deux sections s'ajoutent à la prospection : **Clients** (messagerie gérée par des agents, simulée en Tutoriel, branchée à une vraie boîte mail en Réel) et **Pub** (agent publicitaire, contenus prêts à publier). Référence : `PRODUIT-CLIENTS-PUB.md`. « **Seule la prospection est traitée** » (§1) ne vaut donc plus pour le produit entier : ce document reste la référence de la **section Prospection**.
>
> **4e décision du 2026-11-07 (Noah) : le décor devient une ville.** Fini l'espace : la carte est **plein écran**, inspirée de **New York** ; **votre immeuble est au centre** et s'améliore avec l'argent gagné ; les agents sont des **bots** qui partent à pied, à vélo, en skate ou en hélicoptère ; les **planètes deviennent des lieux** (Bibliothèque publique, Hôtel de ville, SoHo, Midtown, Wall Street, Times Square). **Lire « planète » comme « lieu » et « vaisseau/navette » comme « bot » dans tout ce document** : les règles, gains, déblocages et identifiants techniques (`planet`, `hangar`) sont **inchangés**. Référence visuelle : `VILLE-ET-BATIMENT.md`.
>
> Ce cap n'est pas un retour à l'ancien cadrage « Prospect Tycoon » (hackathon 48 h, TypeScript seul, sans base de données) : la pile (Next.js + FastAPI + SQLite), le moteur et les tests restent ceux du dépôt.

## 1. Vision
Une **appweb** (navigateur uniquement, pas d'application native) en français, solo. Un **tycoon très visuel en vue de dessus 3/4** : le joueur dirige **sa propre entreprise** (une entreprise d'exemple en mode Tutoriel) et part à la recherche de **ses clients**. Le but est de **rendre agréable une tâche qu'on évite d'habitude** : trouver des prospects, puis en faire quelque chose.

- **Seule la prospection** est traitée. Pas de rédaction générale, pas de veille, pas d'analyse de tableaux.
- Une **carte unique** (une ville) : **votre immeuble** au centre, des **lieux** autour (anciennement planètes). Chaque lieu est une **plateforme** de données (Annuaire, Registre, Carte locale, LinkedIn, Glassdoor…), débloquée au fil de la partie.
- Le joueur **voit ses bots** quitter l'immeuble (à pied, à vélo, en skate ou en hélicoptère selon le lieu), arriver et **discuter avec l'agent du lieu**.
- Ce que le joueur apprend : **écrire le prompt qui fait trouver les bons prospects**. Le prompt est noté ; c'est lui qu'on améliore, version après version.

### Ce qui est le produit, ce qui est le jeu
| | Rôle | Exemples |
|---|---|---|
| **Le produit** (valeur réelle, utilisable hors du jeu) | Des prospects **vérifiables** et exploitables | Fiche entreprise et cible, **carnet de prospection**, fiches clients, premiers messages (brouillons), export CSV |
| **Le jeu** (apprentissage et progression) | Rendre la tâche agréable et faire progresser le prompt | Carte, voyages, planètes, score /100, gains en $, déblocages, hangar |

Conséquences de conception :
1. **Consulter, trier, exporter, annoter et supprimer** ses prospects n'est **jamais** conditionné par la monnaie ni par la progression du jeu (`RULES.md` §11).
2. En mode Réel, tout « résultat » montré au joueur est **vérifiable** (source, date, fiabilité) et **utilisable sans le jeu** (export).
3. Le score mesure la qualité du **prompt** et la fiabilité du **rapport**, pas la valeur commerciale d'un prospect : il ne doit jamais être présenté comme tel.
4. Rien n'est envoyé **automatiquement** au nom du joueur : le produit prépare, le joueur agit (§14). Seule exception : en mode Réel, le joueur peut **confirmer l'envoi** d'un email depuis sa boîte connectée (`PRODUIT-CLIENTS-PUB.md` §4).

## 2. Boucle de jeu
1. **Choisir une planète** disponible sur la carte. Un panneau montre la **fiche cible** (le commanditaire cherche quel type de prospects), la récompense maximale, le coût par instruction.
2. **Rédiger le prompt** de l'agent (l'éclaireur) : qui chercher, où, avec quelles contraintes, quel format de rapport.
3. **Envoyer** : le serveur réserve le coût et un message du quota (voir `RULES.md` §4), puis lance l'expédition.
4. **Voyage** : l'agent quitte le hangar de la base et vole vers la planète (animation, indépendante de la durée réelle de l'appel IA).
5. **Dialogue** : l'agent atterrit et converse avec l'**agent de la planète** (bulles lisibles, transcript complet consultable). L'agent du joueur applique le prompt ; la planète répond avec des données.
6. **Retour** : l'agent revient avec un **rapport de leads** (cartes de prospects qui tombent dans la soute).
7. **Notation** : le serveur note le **prompt** et la **qualité des leads** (§6). Le retour client explique les écarts et les relie à des phrases du prompt.
8. **Amélioration** : le joueur corrige son prompt (5 instructions maximum par agent et par expédition). Le **carnet de prompts** garde les versions et leurs scores ; un diff montre ce qui a changé et ce que ça a rapporté.
9. **Livraison et paiement** : une version de rapport est figée et livrée. Le serveur calcule le paiement (§8).
10. **Déblocage** : un bon score ouvre la planète suivante ou un agent au hangar.
11. **Exploitation (le produit)** : le joueur **ajoute au carnet de prospection** (§12) les leads vérifiés du rapport ; il y consulte, trie, marque « contacté », demande une **fiche client** et un **premier message** à des agents spécialisés (§13) et **exporte en CSV**. Cette étape ne dépend ni du score ni de l'argent.

M1 (la première planète) doit être atteignable en **3 actions** après la création : choisir la planète, écrire un prompt, envoyer.

## 3. Deux modes, un seul moteur
| | **Tutoriel** (`beginner`) | **Réel** (`expert`) |
|---|---|---|
| Planètes | Toutes disponibles, **simulées** | Les mêmes, **branchées à de vraies sources** via MCP/API (côté serveur) |
| Agent de la planète | Agent IA qui **simule** la recherche sur un **corpus de référence** (données fictives, avec pièges) | Appels réels à la source ; l'agent de la planète met en forme les résultats |
| Reproductibilité | Déterministe avec le fournisseur `mock` (tests) ; variantes pilotées par la **graine** | Résultats variables : la notation s'appuie sur des **vérifications par code** de la source |
| Fiche cible (brief) | Celle d'un **commanditaire fictif** propre à la planète ; fiche entreprise d'exemple fournie par les données | **La fiche entreprise et cible du joueur** (§11) |
| Prospects du carnet | Fictifs, marqués `simulé` partout (carnet, export) | Réels, avec source, date de collecte et fiabilité (§14) |
| Aide | Cadrage guidé, une action à la fois, indices, définitions | Brief direct, aide facultative |
| Badge | « Mode simulé » toujours visible | « Données réelles » + sources affichées ; repli sur le simulé signalé par le badge |

Les valeurs `beginner` et `expert` de l'API sont **conservées** (aucune migration de schéma). L'interface dit « Tutoriel » et « Réel ».

**Sources en mode réel :** uniquement des **API officielles, MCP autorisés ou fournisseurs de données licenciés**. **Aucun scraping direct** de LinkedIn ni d'une plateforme dont les CGU l'interdisent. Si une planète n'a pas de source légale disponible, elle reste **simulée** (badge visible) jusqu'à décision contraire. Choix des sources : `OPEN-QUESTIONS.md`.

## 4. Planètes
Chaque planète est un **contrat de prospection** (données dans `data/planets/`, voir §10). Ordre de déblocage proposé, par difficulté de prompt croissante :

| # | Planète | Nature des données | Ce que le joueur apprend | Gain max | Coût / instruction | Déblocage |
|---|---|---|---|---|---|---|
| 1 | **Annuaire** | Liste simple d'entreprises locales | Dire qui chercher, où, en combien | 20 | 0 | Au lancement |
| 2 | **Registre** | Données structurées d'entreprises (secteur, taille, zone, âge) | Filtres précis, critères d'exclusion | 30 | 1 | Score ≥ 60 sur la planète 1 |
| 3 | **Carte locale** | Établissements, avis, horaires, contact | Prospection de proximité, canal de contact | 40 | 1 | Score ≥ 60 sur la planète 2 |
| 4 | **LinkedIn** | Entreprises et décideurs (poste, ancienneté) | Cibler un **décideur**, pas seulement une entreprise | 60 | 2 | Score ≥ 60 sur la planète 3 |
| 5 | **Glassdoor** | Signaux sur l'entreprise (recrutement, croissance, climat) | Repérer le **bon moment** pour approcher | 90 | 2 | Score ≥ 60 sur la planète 4 |
| 6 | **Constellation** (finale) | Plusieurs planètes pour un nouveau commanditaire | Combiner sources et agents, sous budget | 150 | 3 | Score ≥ 60 sur la planète 5 |

- En mode **Réel**, la fiche cible d'une planète est la **fiche entreprise et cible du joueur** (§11) ; en Tutoriel, c'est celle du commanditaire fictif de la planète.
- Les noms de plateformes sont affichés tels quels dans le jeu (mention « non affilié » à prévoir) ; décision de marque dans `OPEN-QUESTIONS.md`.
- Une **planète bonus** (Actualités : levées de fonds, recrutements) est proposée en P1.
- Une planète verrouillée affiche **la condition de déblocage en texte** (jamais une simple icône).
- Reprise : on peut rejouer une planète ; le paiement supplémentaire suit le **différentiel de reprise** (`max(0, cible − meilleur paiement déjà acquis)`).
- Une **planète de secours** (financement, 5 messages gratuits, rejouable) reste accessible sans argent.

## 5. Agents et hangar
Le MVP a **un seul bot de prospection**, l'**éclaireur** (`scout`, gratuit), qui travaille **en expédition**. **5e décision (2026-11-07)** : plus de `qualifier`, `profiler` ni `outreach`. Le tri des leads (doublons, hors-cible, critères structurés) est fait **par code**. Les autres rôles servent la **communication** et se gèrent **dans l'immeuble** :

| Rôle | Id technique | Fonction | Prix | Déblocage |
|---|---|---|---|---|
| **Éclaireur** | `scout` | Va sur un lieu, applique le prompt, rapporte des leads | 0 | Au lancement |
| **Trieur de boîte** | `triage` | Résume les messages reçus (Salle du courrier) | 35 | Score ≥ 50 sur le lieu 2 (Tutoriel) |
| **Rédacteur** | `replier` | **Fiche client** et **premier message** d'un prospect du carnet (§13), puis réponses aux conversations ; **aucun envoi réel** | 45 | Score ≥ 50 sur le lieu 3 (Tutoriel) |
| **Directeur de campagne** | `ads` | Kit de pub (Studio pub) | 50 | Score ≥ 50 sur le lieu 4 (Tutoriel) |

- Achat unique par rôle (contrainte `(session, rôle)` du moteur inchangée). Les prix vivent dans `data/rules/`.
- En mode **Réel**, la condition de **score** de déblocage est **levée** pour `triage`, `replier` et `ads` (seul le prix reste) : la valeur réelle ne doit pas attendre la progression du jeu (décision par défaut, voir `OPEN-QUESTIONS.md`).
- Un agent n'accède qu'à ce qui lui est transmis ou partagé (règle du moteur conservée).
- Plusieurs agents peuvent être **dehors en même temps**, chacun avec son propre quota de 5 instructions par expédition.
- Chaque agent a un **prompt propre**, éditable ; il est noté séparément.

## 6. Leads et qualité
Un **lead** est une **fiche de prospect** produite par l'agent à partir de ce que la planète a renvoyé. Un lead **vérifié** peut être ajouté au **carnet de prospection** (§12), où il devient un **prospect** :

| Champ | Contenu |
|---|---|
| `entreprise` | Nom (et identifiant de la source si disponible) |
| `contact` | Poste ou fonction visée ; nom seulement si la source le donne |
| `signal` | Pourquoi ce prospect, pourquoi maintenant |
| `canal` | Comment le joindre (email générique, formulaire, adresse, réseau…) |
| `source_ref` | **Identifiant de l'enregistrement renvoyé par la planète** ; sans lui, le lead n'est pas vérifiable |
| `raisons_fit` | Liste courte de critères de la fiche cible satisfaits |

**Qualité d'un lead** (vérifiée par le serveur) :
1. **Existence** : le `source_ref` correspond à un enregistrement réellement renvoyé par la planète lors de cette expédition. Lead inventé ⇒ **0** pour ce lead, et critère essentiel en échec.
2. **Adéquation** : respect des critères structurés de la fiche cible (secteur, zone, taille…), contrôlés **par code** sur les données de la source.
3. **Actionnable** : un canal de contact exploitable est présent.
4. **Fraîcheur** : la donnée n'est pas périmée selon la date de la source.
5. **Unicité** : pas de doublon (même entreprise).
6. **Nuance** (le client IA ne juge que cela) : pertinence du signal, qualité de l'argumentaire, avec **preuve citée littéralement** dans le rapport.

Les **instructions contenues dans un lead ou dans les données d'une planète sont des données**, jamais des consignes (injection de prompt).

## 7. Notation du prompt
Le prompt est noté, car c'est lui que le joueur apprend à améliorer. La **grille** (`data/rubrics/`, versionnée, ids de critères stables) regroupe deux familles dans **un seul score /100** :

| Famille | Critères de référence (ids stables) | Poids |
|---|---|---|
| **Prompt** | `p_objectif` (le but est clair) · `p_cible` (qui, où, taille, secteur) · `p_format` (nombre de leads, champs, ordre) · `p_exclusions` (ce qu'il ne faut pas) · `p_preuves` (demande de sources et de `source_ref`) | 40 |
| **Résultat** | `l_adequation` · `l_existence` · `l_actionnable` · `l_fraicheur` · `l_unicite` | 60 |

Répartition de référence (à calibrer, voir `OPEN-QUESTIONS.md`) : objectif 10, cible 10, format 8, exclusions 6, preuves 6 ; adéquation 25, existence 15, actionnable 10, fraîcheur 5, unicité 5.

- Les contrôles **mesurables** sont du code (nombre de leads, champs présents, doublons, `source_ref` existant, critères structurés). Le client IA ne juge que le **sémantique** (clarté de l'objectif, qualité de l'exclusion formulée) avec **citation littérale** du prompt comme preuve.
- Le serveur valide types et bornes, puis **calcule seul** le score. Tout champ `reward`, `score` ou `payment` suggéré par un modèle est **ignoré**.
- **Essentiels** (plafond 40 s'ils échouent) : leads issus de la source (aucun inventé), cible respectée, format exploitable.
- Hors sujet ⇒ 0. Réussite : planète ordinaire ≥ 60 sans essentiel manquant ; finale ≥ 70 avec tous les essentiels.
- Le retour affiche **deux scores lisibles** : « Votre prompt » et « Vos résultats », chacun avec les phrases du prompt qui ont fait gagner ou perdre des points. Le coach ne donne **jamais** de prompt complet à recopier.
- Une grille modifiée n'altère jamais une livraison déjà évaluée.

## 8. Économie
Le **ledger du moteur est réutilisé tel quel** ; seules les valeurs changent (données `rules_v2` à créer).

- Monnaie : dollars de jeu entiers. **Capital initial : 30 $** et un éclaireur gratuit.
- Une instruction envoyée coûte `coût/instruction` de la planète (« carburant »). Le **maximum est affiché avant l'envoi** ; réservation atomique avant l'appel, règlement après, jamais de débit sans réponse exploitable.
- **Quota : 5 instructions par agent et par expédition** (jamais 6). Le premier prompt et chaque correction comptent.
- Paiement = `floor(gain_max × score / 100)`, figé à la livraison ; une livraison ne se paie qu'une fois.
- Les gains alimentent : l'achat d'agents (§5) et les coûts des planètes plus chères. La **fin de partie** (Constellation) exige une **dépense ≤ 30 $** et **≥ 2 agents** ayant contribué.
- En mode réel, les appels de sources ont un **coût réel** (limites de débit, quotas API, budget tokens) : plafonds côté serveur, pause explicite si un seuil est atteint, jamais de faux résultat (`RULES.md` §8).
- Les **actions sur un prospect** (fiche client, premier message) coûtent un petit montant par génération, avec le même mécanisme de réservation et de règlement, mais **ne rapportent aucun gain** ; consulter, trier, exporter, annoter et supprimer ses prospects est **toujours gratuit** (`RULES.md` §11).

## 9. Ce qui est visuel
Détails d'interface dans `UX.md`, d'architecture dans `CARTE-TECH.md`. Principe : **tout état serveur a une représentation visible sur la carte ET un équivalent texte**.

| Élément | États visibles |
|---|---|
| **Immeuble** | Niveau 1 à 10 selon le **total gagné** (apparence seulement), enseigne au nom de l'entreprise, halo « Votre siège » ; à l'intérieur : coffre (trésorerie), garage (bots présents / dehors), archives (nombre de prospects, ouvre le carnet) |
| **Lieu** | Verrouillé (voilé + condition en texte) · disponible (halo) · expédition en cours · visité (étoiles = meilleur score) |
| **Bot** | Au garage · en route (à pied, vélo, skate ou hélicoptère) · en discussion (bulle) · de retour avec rapport · en panne (échec technique, reprise sûre) |
| **Retours** | Gain en $ qui s'envole vers le coffre · leads qui arrivent en dossier · compteur d'instructions restantes |

Les animations ne **retardent jamais** un résultat : bouton « passer », et l'animation s'adapte à la durée réelle de l'appel (boucle de vol tant que la réponse n'est pas arrivée).

## 10. Correspondance avec le moteur existant
Aucune règle n'est réécrite ; on **renomme et remplit** :

| Moteur (dépôt actuel) | Nouveau sens | Travail |
|---|---|---|
| `MissionDefinition` (`data/missions/*`) | **Planète / contrat** : fiche cible, corpus ou source, tarif, gain, déblocage | Nouveaux fichiers `data/planets/*` ; le chargeur de missions les lit |
| `MissionAttempt` | **Expédition** | Aucun |
| `Message` (5 par rôle) | **Instruction / version de prompt** | Aucun |
| `ArtifactVersion` | **Rapport de leads** (versions immuables) | Schéma de contenu structuré (liste de leads) |
| `Submission` + `Evaluation` | **Rapport remis** + **note** (prompt + résultats) | Nouvelle grille, nouveaux contrôles dans `checks.py` |
| `AgentOwnership` + rôles | **Hangar** (4 rôles : `scout`, `triage`, `replier`, `ads`) | Remplacer l'énumération des rôles |
| `NotebookEntry` | **Carnet de prompts** (cœur de l'apprentissage ; **distinct** du carnet de prospection, §12) | Livrer `GET/POST /api/notebook` (501 aujourd'hui) |
| Événements de brief versionnés | **Événements de marché** (« la cible change ») | Contenu à écrire (P1) |
| Clarifications au client (2 gratuites) | **Briefer le commanditaire** | Contenu à écrire |
| Fournisseur LLM `mock` / `real` | Agent de la planète simulé (tuto) / source MCP-API (réel) | Adaptateur de sources (§3) |
| *(nouveau)* `TargetProfile` | **Fiche entreprise et cible** (§11), versionnée, rattachée à la session | Stockage + `PUT /api/profile` ; l'ancien `company.profile` (texte ≤ 200) est repris comme champ `offre` |
| *(nouveau)* `Prospect` | **Prospect du carnet** (§12) | Table, routes `/api/prospects`, export CSV |
| *(nouveau)* actions `prospect_profile` / `prospect_message` | Fiche client, brouillon de message (§13) | Réutilise réservation, règlement, idempotence ; **nouvelle clé de quota `(prospect, rôle)`** |

Mission **obsolète** : M1–M6, 6 rôles (`writer`, `prospector`, `researcher`, `analyst`, `qa`, `lead`), prix et gains du cahier, corpus M1–M6. Ils restent dans le dépôt (et les 313 tests) tant que les nouveaux contenus ne les remplacent pas.

## 11. Fiche entreprise et cible
Ensemble structuré, **par partie**, **versionné** (`profile_version`), modifiable à tout moment. C'est lui qui **pilote les agents** : il dit ce que l'entreprise vend et qui elle cherche.

| Champ | Contenu | Nature |
|---|---|---|
| `entreprise_nom` | Nom de l'entreprise du joueur (1 à 60 caractères) | Texte |
| `offre` | Ce que l'entreprise vend, en une à trois phrases (≤ 400 caractères) | Texte |
| `besoin` | Le problème que l'offre résout pour le client (≤ 300 caractères) | Texte |
| `cible_secteurs` | 1 à 5 secteurs visés (liste courte proposée + saisie libre) | **Structuré** |
| `cible_zone` | 1 à 5 zones : pays, région ou ville | **Structuré** |
| `cible_taille` | Effectif minimal et maximal des entreprises visées (entiers) | **Structuré** |
| `cible_fonctions` | 0 à 5 fonctions de décideurs visées (ex. « directeur commercial ») | **Structuré** |
| `exclusions` | 0 à 10 critères d'exclusion (secteurs, zones, entreprises déjà clientes) | Structuré + texte |
| `ton` | Registre des messages : vouvoiement formel, vouvoiement chaleureux, tutoiement | Énumération |

Les bornes ci-dessus sont des valeurs de départ, versionnées dans `data/` (`data/profile/`), pas dans le code.

- **Rôles de la fiche** : (1) **fiche cible des planètes** en mode Réel (§4) ; (2) **contexte des agents**, transmis comme **bloc de données délimité**, jamais comme consigne système (règle 3) ; (3) **critères structurés** contrôlés **par code** pour `l_adequation` (§6) et pour la **pertinence** d'un prospect (§12) ; (4) personnalisation des fiches clients et des messages (§13).
- **Tutoriel** : une fiche d'exemple est fournie par les données (`data/profile/examples/`) et peut être modifiée pour s'exercer ; les planètes gardent la fiche de leur commanditaire fictif.
- **Réel** : saisie guidée à la **création** (étape 2 ; minimum requis : `offre`, `cible_secteurs`, `cible_zone`), modifiable ensuite depuis la base. Pas de saisie libre de données personnelles de tiers (consigne affichée : on décrit une **cible**, pas des personnes).
- **Versions** : modifier la fiche crée une **nouvelle version** avec diff affiché. Une expédition garde la version qui était courante à son ouverture ; une livraison **fige** la version utilisée (règle 7). Envoyer une action sur une version périmée donne `VERSION_CONFLICT` (rechargez).
- Tous les champs texte sont du **texte brut**, nettoyé au rendu ; leur contenu est une **donnée** pour les agents, jamais une consigne.

## 12. Carnet de prospection
**Le cœur du produit.** Dossier de la partie qui **conserve** les prospects trouvés, indépendamment du score. Un seul dossier par partie au MVP (dossiers nommés en P1, `OPEN-QUESTIONS.md`). Il est accessible **depuis la carte (le classeur de la base) et depuis la liste** (sans carte).

**Ne pas confondre** : le **carnet de prompts** (`/api/notebook`, apprentissage, §10) garde les versions de **prompts** ; le **carnet de prospection** (`/api/prospects`) garde les **prospects**.

### Entité Prospect
| Champ | Contenu | Modifiable par le joueur |
|---|---|---|
| `id` | Identifiant stable | Non |
| `entreprise` | Nom de l'entreprise | Non (provenance) |
| `contact_nom` | Nom du contact, **seulement si la source le donne** comme donnée professionnelle | Non |
| `contact_fonction` | Fonction visée ou constatée | Non |
| `canal` | Type (`email_generique`, `formulaire`, `adresse`, `telephone_standard`, `reseau_pro`) **et** valeur | Non |
| `source` / `source_ref` | Planète ou source, et **identifiant de l'enregistrement renvoyé pendant l'expédition**, **vérifié par code** | Non |
| `raisons_fit` / `signal` | Pourquoi ce prospect, pourquoi maintenant | Non |
| `pertinence` | Score 0 à 100 **calculé par le serveur** (critères structurés de la fiche cible vérifiés par code ; score de fit du qualificateur s'il a travaillé) | Non |
| `fiabilite` | `verifie`, `partiel` ou `simule` (§14) | Non |
| `statut` | `nouveau`, `contacte`, `en_discussion`, `gagne`, `perdu`, `ecarte` | **Oui** |
| `notes` | Texte brut libre (≤ 2 000 caractères) | **Oui** |
| `instantane_source` | Copie **minimisée** de l'enregistrement de la source (liste blanche de champs), base des fiches et messages | Non |
| `expedition_id`, `rapport_version_id`, `profile_version` | Provenance : d'où vient ce prospect | Non |
| `cree_le`, `modifie_le`, `contacte_le`, `derniere_activite_le` | Dates (UTC, ISO 8601) ; `contacte_le` posé au **premier** passage à `contacte` | Non (posées par le serveur) |
| `version` | Compteur de modification (concurrence optimiste) | Non |

La **provenance est immuable** (comme les versions de livrables, règle 7) ; le joueur ne modifie que `statut` et `notes`.

### Ajouter au carnet
- Depuis un **rapport de leads livré ou en cours** : « Ajouter au carnet » sur un lead ou sur tous les leads retenus. Le navigateur envoie **seulement des références** (expédition, version de rapport, positions des leads) ; le **serveur recopie** les champs depuis la version figée du rapport et **revérifie le `source_ref`** contre les enregistrements renvoyés pendant l'expédition. Le navigateur ne fournit jamais le contenu d'un prospect.
- **Lead sans `source_ref` vérifiable** : refusé (code d'erreur stable proposé `LEAD_UNVERIFIED`, à documenter dans `CONTRACTS.md`). Aucun prospect inventé n'entre dans le carnet.
- **Doublons** : clé de dédoublonnage `(source, source_ref)` ; ajouter deux fois le même lead renvoie le **même prospect** (idempotent, sans erreur). Même entreprise via deux sources : deux prospects distincts, signalés « possible doublon » à l'affichage.
- Limite initiale : **500 prospects** par partie (`rules_v2`), erreur stable au-delà.
- Mutation avec `Idempotency-Key` (règle 4).

### Consulter, trier, filtrer, rechercher
Côté **serveur** (jamais seulement dans le navigateur, pour rester juste avec pagination) :
- **Tri** : pertinence, date d'ajout, entreprise (alphabétique), statut, fiabilité, source ; ordre stable (départage par `id`).
- **Filtres** : statut, source/planète, fiabilité, présence d'une fiche client, présence d'un brouillon, « à relancer » (contacté depuis plus de N jours, valeur dans `rules_v2`).
- **Recherche texte** : entreprise, contact, fonction, notes.
- Pagination par curseur ; compteurs par statut.
- **Détail** : tout le prospect, sa provenance, sa fiche client, ses brouillons, l'historique de statut.

### Statuts
`nouveau` → `contacte` → `en_discussion` → `gagne` | `perdu` ; `ecarte` (hors cible, sans suite). Les transitions sont **libres** (le joueur seul décide) mais horodatées. **Marquer « contacté » est déclaratif** : le produit n'envoie rien et ne détecte rien ; c'est le joueur qui indique qu'il a agi.

### Supprimer
Suppression **définitive** d'un prospect avec sa fiche client, ses brouillons et son instantané (confirmation affichée) ; suppression de **tout le carnet** ; suppression de **la partie** (`DELETE /api/session`) purge tout. Idempotente.

### Export CSV
Produit **par le serveur** (jamais construit dans le navigateur), pour garantir un échappement unique et testé.

| Sujet | Règle |
|---|---|
| Route proposée | `GET /api/prospects/export.csv` (mêmes filtres et tri que la liste) ; lecture, propriété de session vérifiée ; `Cache-Control: no-store` ; `Content-Disposition: attachment; filename="prospects-AAAAMMJJ.csv"` |
| Encodage | **UTF-8 avec BOM** (ouverture correcte dans Excel) |
| Séparateur | **point-virgule `;`** (Excel en configuration française) ; fin de ligne **CRLF** |
| Échappement | RFC 4180 : tout champ contenant `;`, `"`, retour à la ligne est entouré de guillemets, les guillemets internes sont **doublés** |
| En-tête | Première ligne, libellés français |
| Colonnes | `id`, `entreprise`, `contact`, `fonction`, `canal_type`, `canal`, `raison_de_correspondance`, `pertinence`, `fiabilite`, `origine`, `simule`, `statut`, `notes`, `ajoute_le`, `contacte_le`, `source_ref` |
| Valeurs | Dates ISO 8601 UTC ; listes jointes par ` \| ` ; `simule` = `oui`/`non` ; entiers sans séparateur de milliers |
| Tutoriel | Colonne `simule` = `oui` et nom de fichier `prospects-SIMULE-AAAAMMJJ.csv` |
| Fiches et brouillons | Non inclus par défaut (option `inclure=fiche,message` en P1) |
| Journal | Nombre de lignes et durée seulement, **jamais le contenu** |

**Protection contre l'injection de formules (obligatoire).** Un tableur interprète comme une formule toute cellule qui commence par `=`, `+`, `-` ou `@` (ainsi que par une tabulation ou un retour chariot). Or le contenu des prospects vient de plateformes et de modèles : il est **non fiable** (règles 2 et 3). Le serveur **préfixe d'une apostrophe `'`** toute cellule **texte** dont le **premier caractère** est `=`, `+`, `-`, `@`, tabulation (`\t`) ou retour chariot (`\r`), **dans toutes les colonnes texte** (entreprise, contact, fonction, canal, raisons, notes, `source_ref`…). Seules les colonnes numériques générées par le serveur (`pertinence`) ne sont pas préfixées. Compromis assumé : un numéro `+33…` s'affiche `'+33…` (lisible, jamais exécuté). Cette neutralisation vit **à un seul endroit** (génération du CSV) et a des tests dédiés (une cellule par caractère dangereux, avec et sans guillemets, y compris sur les notes saisies par le joueur).

L'export est **gratuit**, répétable (lecture) et **jamais refusé pour manque de fonds**. Le **JSON complet des données de la partie** (portabilité) est décrit en §14.

## 13. Fiche client et premier message (rôle `replier`)
> **5e décision** : ces deux productions sont faites par **un seul agent, `replier`** ; ci-dessous, « `profiler` » et « `outreach` » désignent désormais les **deux actions** `prospect_profile` et `prospect_message` du même rôle, avec chacune son quota 5 par `(prospect, action)`. Elles se lancent depuis la **fiche prospect aux Archives** de l'immeuble.

Deux productions se font **à partir d'un prospect du carnet** (« atelier du prospect »), pas en expédition. Ils s'achètent au hangar (§5). Ils ne font **aucune requête vers une source** au MVP : ils lisent l'**instantané minimisé** du prospect et la **fiche entreprise et cible** (enrichissement par nouvelle requête de source : P1).

| | **Analyste de fiche client** (`profiler`) | **Rédacteur de premier message** (`outreach`) |
|---|---|---|
| Produit | **Fiche client** (versionnée) | **Brouillon** de message (versionné) |
| Sections / champs | `resume` (≤ 600 caractères) · `pourquoi_ce_prospect` (1 à 5 éléments, chacun relié à un critère de la fiche cible et à un champ de l'instantané) · `points_d_accroche` (1 à 5) · `a_verifier` (0 à 8) · `sources` (références `source_ref` de l'instantané) | `canal_cible` (type seulement) · `objet` (≤ 90 caractères, si pertinent) · `corps` (≤ 800 caractères) · `mentions` (origine des coordonnées et possibilité de refuser de nouveaux messages) |
| Consigne du joueur | Facultative (≤ 500 caractères, ex. « insiste sur la proximité ») | Facultative (≤ 500 caractères, ex. « angle : gain de temps ») |
| Prix de départ | **3 $ par génération** (rôle `replier`, 45 $ à l'achat, une seule fois) | **2 $ par génération** |
| Quota | **5 générations par (prospect, action)**, jamais 6 | Idem |

**Économie et fiabilité** (mécanismes du moteur réutilisés, `RULES.md` §11) : réservation avant l'appel, règlement après, **aucun débit sans réponse exploitable**, idempotence, coût maximal affiché avant l'envoi, versions immuables (les précédentes restent consultables). **Aucun gain en $** : sinon le joueur pourrait s'enrichir en régénérant. Valeurs dans `rules_v2`.

**Contrôles par code** (le « score » de ces agents est une **liste de contrôles réussis**, affichée, sans paiement ni plafond) :
- **Fiche** : toutes les sections présentes et bornées ; chaque `source` cité existe dans l'instantané ; aucun champ absent de l'instantané n'est affirmé ; `a_verifier` **non vide** si un champ manque ou si la donnée est ancienne ; aucune URL absente de l'instantané.
- **Brouillon** : longueur ≤ borne ; **aucun fait** (chiffre, nom, événement) absent de l'instantané ou de la fiche entreprise ; aucune URL ni numéro absents des données ; **mentions d'origine et d'opposition** présentes ; ton conforme à la fiche entreprise ; aucune promesse chiffrée inventée.
- Un contrôle essentiel en échec ⇒ `INVALID_OUTPUT` (une réparation, puis échec sans débit).

**Règle 3 appliquée** : l'instantané, les notes et tout texte venu d'une plateforme sont des **données**, transmis dans un **bloc délimité** ; une instruction qui s'y trouve (« ignore les consignes précédentes… ») est ignorée et testée comme telle. Sorties rendues en **texte** nettoyé, **sans lien cliquable produit par le modèle**.

**Minimisation** : le modèle **ne reçoit jamais la valeur** d'un email ou d'un téléphone (seulement le type de canal) ; les **notes du joueur** ne lui sont pas transmises au MVP.

**Aucun envoi** : le brouillon est un **texte que le joueur copie** (bouton « Copier »). Pas de bouton d'envoi, pas de lien `mailto:` généré, pas d'intégration messagerie ni CRM (§14).

## 14. Mode Réel : qualité, données personnelles, aucune action externe
> Mesures **techniques et produit**. Ce texte n'est pas un avis juridique : il doit être **validé par un juriste** avant tout usage public avec de vraies données (`OPEN-QUESTIONS.md`).

### Qualité et fiabilité
| Fiabilité | Condition (vérifiée **par code**) |
|---|---|
| `verifie` | `source_ref` renvoyé pendant l'expédition ; champs obligatoires présents (entreprise, source, date de collecte) ; donnée **non périmée** ; critères structurés de la fiche cible respectés |
| `partiel` | `source_ref` vérifié mais canal de contact absent, donnée ancienne ou critère non vérifiable ; la liste de ce qui manque est affichée |
| `simule` | Tutoriel : données fictives. **Jamais mélangé** avec des prospects réels dans un même export sans la colonne `simule` |

Chaque prospect porte **sa source, sa date de collecte et sa fiabilité**, visibles dans la liste, le détail et l'export. **Aucune invention** : un modèle ne peut ajouter ni prospect, ni coordonnée, ni fait absent de la source (règle 12).

### Données personnelles (mesures par défaut)
| Sujet | Mesure |
|---|---|
| **Périmètre** | **B2B uniquement** : entreprises et **fonctions professionnelles**. Le ciblage de **particuliers** est exclu ; la fiche cible décrit des entreprises, pas des personnes |
| **Minimisation** | Liste blanche de champs conservés : entreprise, fonction, nom du contact **seulement si fourni comme donnée professionnelle**, canal professionnel, signal, source. **Jamais** : données sensibles, vie privée, adresse personnelle, date de naissance, photo, réseaux personnels. Tout champ hors liste est écarté **côté serveur** avant stockage |
| **Base légale visée** | Intérêt légitime de prospection **B2B**, sous conditions : message en rapport avec la fonction du destinataire, **information sur l'origine** des données, **droit d'opposition** facile. À valider juridiquement |
| **Information** | Source et date de collecte conservées ; le brouillon de message propose les **mentions d'origine et d'opposition** (contrôle de §13) |
| **Rétention** | **180 jours d'inactivité** par défaut (`rules_v2` : `retention_days`) ; rappel visible **30 jours avant** ; l'action « Conserver » prolonge ; purge automatique ensuite (journalisée **sans contenu**). Les données fictives du Tutoriel partent avec la partie |
| **Droits** | **Suppression** d'un prospect, du carnet, de la partie (§12). **Export** : CSV du carnet et **JSON complet** des données de la partie (`GET /api/session/export`, route proposée) |
| **Journaux et erreurs** | **Aucun contenu personnel** (noms, contacts, notes, instantanés) : identifiants, compteurs et durées seulement (règle 6) |
| **Fournisseurs externes** | Le **fournisseur LLM ne reçoit que des champs minimisés**, sans valeur de coordonnée ni notes ; les **sources** ne reçoivent que des requêtes dérivées de la fiche cible. Localisation et rétention du fournisseur : à vérifier (`OPEN-QUESTIONS.md`) |
| **Sauvegardes** | Une sauvegarde de démo (BE08) qui contiendrait de vrais prospects est **exclue ou chiffrée** |

### Aucune action externe automatique
- Le produit **n'envoie jamais de lui-même** un message, un email, une invitation ou une demande de connexion, et ne se connecte à aucun CRM. **Exception unique (3e décision)** : en mode Réel, la section **Clients** peut se connecter à la boîte mail du joueur et envoyer **un email à la fois, après confirmation explicite du joueur**, avec les garde-fous de `PRODUIT-CLIENTS-PUB.md` §4. Aucun agent ne dispose d'un outil d'envoi.
- Dans la section Prospection, le brouillon `replier` (premier message) reste du **texte à copier** ; « contacté » est **déclaratif**. Le joueur peut aussi l'utiliser comme premier message d'une **conversation** (section Clients).
- Les seules sorties vers l'extérieur sont : l'**export** que le joueur télécharge, les **requêtes de sources** pilotées par le serveur (liste blanche) et, en mode Réel, l'**envoi d'email confirmé** de la section Clients.

### Persistance sans compte
Le moteur n'a **pas de comptes** (cookie de session). Un carnet réel est donc **lié au navigateur** : si le cookie est perdu, il est perdu. Le produit **rappelle d'exporter** (bandeau après N prospects, rappel avant purge). Décision sur l'ajout de comptes : `OPEN-QUESTIONS.md`.
