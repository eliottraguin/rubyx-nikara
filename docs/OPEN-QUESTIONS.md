# Points ouverts et décisions à confirmer

Chaque point a une valeur par défaut pour que l'équipe avance.

## 6e décision (2026-11-08) : pas d'atelier (Noah, « ok à tout »)
**Tranché** (référence `PARCOURS-BOT.md` §6) : **Q1** recherches **gratuites**, progression par **nombre de clients obtenus** ; **Q2** « précision » facultative de **300 caractères**, traitée comme donnée ; **Q3** un lieu se débloque quand le précédent a rapporté **≥ 3 prospects retenus** ; **Q4** Tutoriel sans commanditaire (corpus fictif, fiche d'exemple, bulles d'aide) ; **Q5** coach et événements de marché **supprimés en v1** (reprise en P2) ; immeuble basé sur le nombre de clients obtenus. Les lignes 3, 9, 27, 29, 36, 38, 45 et 57 ci-dessous sont **closes ou ajustées** en conséquence. **Reste ouvert** : fournisseur LLM (13, 24), sources réelles (2), juridique de la messagerie (30 à 32), art (50). **Nouveaux points** :

| # | Sujet | Recommandation (valeur par défaut) | À décider |
|---|---|---|---|
| 59 | **À quoi servent les $ sans gains d'expédition ?** Capital 30 $, achats `triage` 35, `replier` 45, `ads` 50 : **inatteignables** si rien ne rapporte | Défaut : **déblocage gratuit ou prix réduit** par nombre de clients obtenus (le prix reste affiché), ou un revenu forfaitaire par client obtenu ; **ne rien inventer côté code avant décision** | Supprimer les prix, rendre les agents gratuits, ou verser des $ par client obtenu (risque d'exploitation à examiner) |
| 60 | **Seuils de déblocage des agents par clients obtenus** | Proposé : `triage` à 1 client, `replier` à 2, `ads` à 3 (en Tutoriel) ; levés en Réel | Valeurs ; un client « obtenu » = statut `gagne` déclaré par le joueur (Réel) ou résultat de la persona (Tutoriel) |
| 61 | **Immeuble qui ne baisse jamais** | Le niveau suit le **maximum** de clients obtenus (un `gagne` repassé à `perdu` ne le fait pas redescendre) ; seuils à écrire dans `rules_v2.building.levels` | Seuils des 10 niveaux ; valeur du palier 1 |
| 62 | **Plafond de recherches** (gratuites mais coûteuses en appels) | Plafond par jour et par partie dans `rules_v2` ; au-delà, erreur stable `RATE_LIMITED`, aucun faux résultat | Valeurs ; code d'erreur dédié ou `RATE_LIMITED` |
| 63 | **Codes d'erreur proposés** `PLANET_LOCKED`, `PROFILE_INCOMPLETE` | Voir `CONTRACTS.md` §11 | Valider les noms |
| 64 | **Sort de `/api/notebook` (501)** et du carnet de prompts | Retirer la route et l'écran (plus de prompt de joueur) | Retirer ou réaffecter (ex. notes de recherche) |
| 65 | **Modèles codex non disponibles sur la relais AXIS** | Sur le groupe actuel de la relais, seuls des **modèles Claude** sont servis ; aucun modèle codex | Continuer avec Claude pour tous les rôles (non tranché) ; sinon demander un autre groupe |
| 66 | **Personas du client simulé tirées au hasard** | Persona tirée selon la graine de la partie parmi 10 (`data/clients/personas_v1.json`) : dont une **silencieuse** (ne répond jamais) et une qui **demande la désinscription** ; tirage uniforme sur 10 : environ 1 conversation sur 10 sans réponse (`p_silencieux`) et environ 1 sur 10 avec désinscription (`p_desinscription`) ; le test de parcours doit donc sauter ces prospects | Lisser pour le Tutoriel (garantir au moins une réponse au premier client) ? Sinon un joueur peut ne jamais obtenir de client |

## Cap prospection (2026-11-07) : à trancher par Noah
**Tranché** (voir `PRODUIT-PROSPECTION.md`) : appweb uniquement ; tycoon en vue de dessus 3/4 avec **Phaser 3** dans Next.js ; **prospection seule** ; **carte unique** (base + planètes-plateformes) ; le joueur écrit le prompt et c'est lui qui est noté ; tuto = agent simulant la recherche, réel = MCP/API ; **moteur existant gardé**, contenu M1–M6 et 6 rôles remplacés ; pas de scraping direct de LinkedIn. **Tranché le 2026-11-07 (2e décision)** : la prospection est la **fonction réelle** du produit (recherche de vrais clients pour la vraie entreprise du joueur) ; le mode Réel produit de **vrais prospects** et le Tutoriel reste simulé pour apprendre à écrire de bons prompts ; après une recherche, on doit pouvoir **conserver** le prospect dans un dossier, le **consulter**, le **trier**, l'**exporter en CSV**, le **marquer « contacté »**, **rédiger un premier message** et obtenir une **fiche client** par un **agent spécialisé** (`PRODUIT-PROSPECTION.md` §11 à §14). Les points ouverts de cette 2e décision sont dans la section « Produit réel » plus bas.

| # | Sujet | Recommandation (valeur par défaut) | À décider |
|---|---|---|---|
| 1 | **Mode réel : phrase coupée.** L'énoncé disait « en tuto, un agent… ; en réel, un MCP ou une API fera les recherches en vraies conditions. Le but… » (phrase non terminée) | Lecture retenue : **tuto = planète simulée par un agent IA sur corpus fictif ; réel = mêmes planètes branchées à de vraies sources**, le but étant d'apprendre à écrire le prompt dans des conditions réalistes | **Partiellement levé** : Noah a confirmé que le réel = de **vrais prospects** et que le tuto reste simulé pour apprendre les prompts. Reste à confirmer la suite exacte de la phrase d'origine (« le but… ») |
| 2 | **Choix du MCP / de l'API par planète** | Commencer par des sources **ouvertes et licites** : registre d'entreprises (API publique), cartes/lieux (API officielle à clé), actualités (flux/API). **LinkedIn** et **Glassdoor** : accès officiels restreints ou sans API publique de recherche connue → **à vérifier** ; sinon rester **simulés** (badge) ou passer par un fournisseur de données licencié | Quelles sources, quelles clés, quels budgets ; accès LinkedIn/Glassdoor réel ou non |
| 3 | **Critères et poids de notation** | **CLOS (6e décision)** : plus de score ni de grille ; tri de pertinence sans points (`PRODUIT-PROSPECTION.md` §7). Les rapports annotés (`data/annotated/`) serviront à calibrer le tri | — |
| 4 | **Assets graphiques** | Pack **CC0** isométrique 2:1 (64×32) au départ + un atlas unique par catégorie ; `ASSETS.md` pour les licences ; remplacer par un style propre plus tard | Pack libre vs création sur mesure ; qui produit l'art |
| 5 | **Thème des planètes** | **Tranché le 2026-11-07 (4e décision)** : **ville inspirée de New York**, immeuble du joueur au centre, lieux à la place des planètes, bots à la place des navettes (`VILLE-ET-BATIMENT.md`) | — (voir « Ville et bâtiment » pour les points restants) |
| 6 | **Noms de marques dans le jeu** (LinkedIn, Glassdoor) et **noms de lieux de New York** | Noms réels de **lieux** choisis par Noah ; **illustrations génériques**, aucun logo, mention « non affilié » ; données **simulées** en tuto | Noms réels de plateformes vs jumeaux fictifs (« Réseau pro », « Avis employeurs ») ; avis juridique avant diffusion publique |
| 7 | **Données personnelles en mode réel** (leads = personnes) | **Entreprises d'abord** ; contacts = fonctions ou coordonnées professionnelles publiques ; minimisation, rétention courte, suppression avec la partie ; aucun envoi réel | **Mesures par défaut écrites** (`PRODUIT-PROSPECTION.md` §14, `RULES.md` §12) ; reste la **validation juridique** : cadre RGPD, durée de rétention, base légale (voir « Produit réel » ci-dessous) |
| 8 | **Rôles d'agents du MVP** | **4 rôles** (5e décision) : `scout` (seul bot de prospection), `triage`, `replier` (fiche client, premier message, réponses), `ads` ; chef d'équipe reporté en P2 ; ids à migrer (API-R1) | Valider la liste, les prix (0 / 35 / 45 / 50) et les déblocages |
| 9 | **Ordre et nombre de lieux** | **Ajusté (6e décision)** : 5 lieux (Annuaire, Registre, Carte locale, Réseau pro, Signaux), **sans gains** ni Constellation ; déblocage ≥ 3 prospects retenus ; Annuaire et Registre d'abord (`DATA-S1`) ; Actualités en P1 | Ordre des lieux 3 à 5 |
| 10 | **Vocabulaire des modes** | Valeurs API `beginner` / `expert` conservées ; interface « Tutoriel » / « Réel » | Confirmer les libellés |
| 11 | **Durée du voyage** (cosmétique) | 2–4 s, comprimée si le serveur répond avant, boucle de vol sinon ; bouton « passer » | Ajuster après essais ; option « mode rapide » |
| 12 | **Cahier des charges `.docx`** | Il ne fait plus foi sur missions et rôles (voir `CLAUDE.md`) ; le mettre à jour ou le marquer obsolète | Qui réécrit le cahier, ou on garde `PRODUIT-PROSPECTION.md` comme référence |
| 13 | **Fournisseur LLM réel** | Toujours ouvert (voir tableau suivant) ; le cap augmente le besoin (agent de planète + évaluateur) | Fournisseur, modèles, clés, budget |

## Produit réel : la prospection au cœur (2026-11-07, 2e décision)
| # | Sujet | Recommandation (valeur par défaut) | À décider |
|---|---|---|---|
| 14 | **Persistance sans compte** : le carnet est lié au cookie de session ; le perdre = perdre ses prospects réels | Pour le MVP : **rappels d'export** (bandeau, rappel avant purge) et export JSON/CSV facile. **Comptes** (aujourd'hui P2) à **remonter en P1** dès que le mode Réel stocke de vrais prospects | Faut-il avancer les comptes avant le mode Réel ? |
| 15 | **Un dossier ou plusieurs** | Un seul carnet par partie au MVP ; **dossiers nommés** (listes, campagnes) en P1 | Besoin de plusieurs listes dès le départ ? |
| 16 | **Statuts du pipeline** | `nouveau`, `contacte`, `en_discussion`, `gagne`, `perdu`, `ecarte`, transitions libres ; l'interface met en avant `nouveau` / `contacte` / `ecarte` | Garder les 6, ou seulement 3 au MVP ? |
| 17 | **Coût en $ des actions sur un prospect** | Fiche 3 $ et message 2 $ par génération, quota 5, **aucun gain** ; consulter, trier, exporter, supprimer **toujours gratuits** | Ces montants, et faut-il rendre ces actions gratuites en mode Réel (la monnaie n'a alors plus de sens pour elles) ? |
| 18 | **Déblocage des agents en Réel** | Condition de score **levée** pour `triage`, `replier`, `ads` (seul le prix reste) | Confirmer, ou garder les déblocages par score aussi en Réel |
| 19 | **Format du CSV** | UTF-8 **avec BOM**, séparateur `;`, CRLF, RFC 4180 (Excel français) ; neutralisation des formules par apostrophe | `;` ou `,` ? Option d'export en `,` ? Colonnes à ajouter (fiche, message) ? |
| 20 | **Durée de conservation** | **180 jours d'inactivité**, rappel à 30 jours, action « Conserver » | Valeur légale et métier (la CNIL recommande de borner la durée de conservation en prospection ; à valider avec un juriste) |
| 21 | **Périmètre B2B et base légale** | **B2B uniquement** (entreprises et fonctions professionnelles), intérêt légitime sous conditions (rapport avec la fonction, information sur l'origine, droit d'opposition) ; ciblage de particuliers exclu | Validation juridique ; faut-il tolérer les entreprises individuelles ? |
| 22 | **Enrichissement d'un prospect** | MVP : **instantané seul** (aucune nouvelle requête de source) ; P1 : requête de source supplémentaire via `PlanetSource` (liste blanche, coût) | Priorité de l'enrichissement |
| 23 | **Intégrations (CRM, envoi réel)** | **Hors périmètre** : export CSV et brouillon à copier ; aucun envoi, aucun `mailto:` | Une intégration CRM plus tard ? Laquelle |
| 24 | **Fournisseur LLM et données personnelles** | Le modèle ne reçoit que des champs minimisés (pas de valeur de coordonnée, pas de notes) ; vérifier **localisation et rétention** du fournisseur avant tout vrai prospect | Fournisseur retenu et ses garanties (lien avec le point 13) |
| 25 | **Mentions d'origine et d'opposition** | Texte standard français dans le brouillon, configurable (`data/`), contrôlé par code | Formulation validée par un juriste |
| 26 | **Fiche entreprise : secteurs** | Liste courte proposée + saisie libre ; correspondance avec les codes d'activité des registres réels à étudier pour les critères structurés | Nomenclature à retenir (codes d'activité officiels ou libre) |
| 27 | **Prompts propres à l'agent `replier`** | MVP : **consigne facultative** (≤ 500 caractères), contrôlée par code ; **notation de ces prompts : CLOS (6e décision, plus de notation)** | — |
| 28 | **Ajouter un lead « partiel »** | Autorisé s'il a un `source_ref` vérifié (fiabilité `partiel`, manques affichés) ; refusé sans `source_ref` (`LEAD_UNVERIFIED`) | Seuil de fraîcheur à partir duquel un lead devient `partiel` |
| 29 | **`/api/notebook` (501)** | **Ajusté (6e décision)** : le carnet de prompts n'a plus de raison d'être (point 64). Le carnet de prospection reste une ressource **distincte** (`/api/prospects`) | Voir 64 |

## Clients et pub (2026-11-07, 3e décision)
**Tranché par Noah** : trois sections séparées (Prospection, Clients, Pub) ; messagerie **simulée** en Tutoriel et **connectée à une vraie messagerie** en Réel ; la pub produit des **contenus prêts à publier** (le joueur publie lui-même). Référence : `PRODUIT-CLIENTS-PUB.md`.

| # | Sujet | Recommandation (valeur par défaut) | À décider |
|---|---|---|---|
| 30 | **Règle 13 assouplie** | Une seule exception : envoi d'un email **confirmé par le joueur**, en Réel, depuis sa boîte connectée ; aucun outil d'envoi pour les agents ; plafonds et garde-fous (`RULES.md` §13) | Confirmer l'exception et ses limites (20/jour, 5/heure, 1 envoi par 24 h sans réponse) |
| 31 | **Fournisseur de messagerie** | **Gmail et Microsoft 365** via OAuth 2.0 + PKCE, portées minimales (lecture + envoi) | Quels fournisseurs ; IMAP/SMTP avec mot de passe d'application en alternative ; **vérification de l'application** par Google/Microsoft (portées sensibles) avant l'usage public |
| 32 | **Droit de la prospection par email (B2B)** | Mentions d'origine et d'opposition dans chaque message, désinscription honorée **par le code**, cadence plafonnée | **Validation juridique** (RGPD, ePrivacy, règles anti-spam) avant tout vrai envoi ; responsabilité de l'expéditeur (le joueur) à rappeler |
| 33 | **Relevé des réponses** | MVP : bouton « Actualiser » ; P1 : relevé périodique côté serveur | Faut-il un relevé automatique dès le MVP (jeton conservé plus longtemps, tâche de fond) ? |
| 34 | **Boîtes multiples** | Une seule boîte par partie au MVP | Besoin de plusieurs boîtes ? |
| 35 | **Corpus des clients simulés** | Une dizaine de personas avec pièges (prix absent, objection, désinscription, injection, hostile, silence) dans `data/clients/` | Nombre et contenu ; qui rédige le corpus |
| 36 | **Résultat de conversation en Tutoriel** | Calculé **par code** (objectif de la persona atteint ou non) ; **devient le « client obtenu »** qui fait progresser le joueur (6e décision) ; **sans gain en $** | Voir 59 et 60 |
| 37 | **Prix des nouveaux rôles** | `triage` 35 $ (1 $ par génération), `replier` 45 $ (2 $), `ads` 50 $ (4 $) ; quota 5, aucun gain | Valider les montants et la progression de l'économie (le joueur n'a que 30 $ au départ) |
| 38 | **Déblocage des nouveaux rôles** | **Ajusté (6e décision)** : par nombre de clients obtenus en Tutoriel (point 60), levé en Réel | Voir 60 |
| 39 | **Visuels de pub** | MVP : **brief visuel + prompt** texte ; **pas d'image générée** | Fournisseur d'images, coût, droits d'usage, modération ; à ajouter en P1 ? |
| 40 | **Plateformes et formats de pub** | `linkedin`, `meta`, `google_search`, `local`, `email` ; limites de caractères dans `data/ads/formats.json` | Liste exacte ; limites à vérifier à la source (elles changent) ; qui maintient le fichier |
| 41 | **Section Clients : « client »** | Client = prospect `en_discussion` ou `gagne` avec une conversation ; pas de nouvelle entité | Faut-il une fiche client distincte (facturation, suivi) ? |
| 42 | **Chiffrement des jetons de messagerie** | Chiffrement au repos avec une clé hors base (variable d'environnement ou coffre) | Où vit la clé en démo et en production ; rotation |
| 43 | **Export des conversations** | MVP : dans le **JSON complet** de la partie ; pas d'export CSV des messages | Besoin d'un export dédié ? |

## Ville et bâtiment (2026-11-07, 4e décision)
**Tranché par Noah** : on **abandonne l'espace** ; carte **plein écran**, **ville inspirée de New York** (grand parc, immeubles), **notre immeuble au centre**, reconnaissable ; il **s'améliore avec l'argent** (**total gagné depuis le début**, jamais en baisse) ; bots à **pied, vélo, skate, hélicoptère** (véhicule **décidé par la destination**) ; **drones** pour la pub ; on **entre dans l'immeuble** (**coupe, un étage par activité**) pour gérer la communication ; lieux **réels** de New York. Référence : `VILLE-ET-BATIMENT.md`.

| # | Sujet | Recommandation (valeur par défaut) | À décider |
|---|---|---|---|
| 44 | **Correspondance lieux et plateformes** | Annuaire = Bibliothèque publique (à pied) · Registre = Hôtel de ville (vélo) · Carte locale = SoHo (skate) · LinkedIn = Midtown (vélo) · Glassdoor = Wall Street (skate) · Constellation = Times Square (hélico) ; Central Park = décor | Valider ou changer lieux et véhicules (données, sans coût de code) |
| 45 | **Niveaux de l'immeuble** | **Tranché en partie (Noah : « plus de paliers »)** : **10 niveaux** ; **6e décision** : seuils en **nombre de clients obtenus** (les valeurs ci-contre 0 / 20 / 45 / 80 / 125 / 180 / 250 / 340 / 450 / 600 $ étaient en total gagné : **OBSOLÈTES**, nouvelles valeurs à écrire, point 61) ; cosmétique, aucun droit débloqué ; seuils en données, progression continue possible | Valeurs à caler sur l'économie réelle (≈ 170 $ de gains sur les lieux 1 à 5 d'après le contrôle de `RULES.md` §10) ; garder 10 niveaux ou une progression continue |
| 46 | **Étages et agents à leur poste** | Toit, Studio pub, Salle du courrier, Archives, Accueil et garage ; agents non achetés = bureau vide « À recruter » | Ajouter d'autres pièces (salle de réunion, cafétéria) pour la décoration ? |
| 47 | **Statut « publiée » déclaratif et drone de patrouille** | MVP : **non**, les drones ne volent que pendant la préparation d'un kit (le produit ne publie rien) ; P1 possible : « Marquer comme publiée (déclaré par vous) » qui fait patrouiller un drone, étiqueté comme déclaratif | Souhaité en P1 ? |
| 48 | **Coursier à scooter pour les envois réels** | Aucun au MVP ; P1 possible : animation **après** la réponse serveur `ENVOYE` uniquement (jamais avant) | Souhaité ? |
| 49 | **Coupe d'immeuble : Phaser ou DOM** | **Tranché (Noah)** : **scène Phaser animée** `BuildingScene` + panneaux React + liste d'étages en DOM ; repli en liste | — |
| 50 | **Production de l'art « Sims réaliste »** | **Style tranché (Noah)** : semi-réaliste façon Les Sims, **sprites pré-rendus 3D**, personnages animés. L'art généré par le code ne sert que de placeholder. **Le plus gros risque de délai et de budget du produit** | **Qui produit l'art** : création sur mesure (Blender, artiste), pack sous licence commerciale, génération assistée avec droits clairs ; budget ; délai ; licences dans `data/map/ASSETS.md` |
| 55 | **Apparence des bots** | Personnages **humains stylisés réalistes** (employés en tenue) à pied, à vélo, en skate, en hélico ; variété d'apparences | Humains, robots, ou mélange (le mot « bot ») ; diversité des personnages |
| 56 | **Rotation de la caméra façon Sims** | MVP : **vue fixe** ; P1 : rotation par quarts de tour (ville et coupe), ce qui **quadruple** les sprites à produire | Souhaitée ? Impact sur le budget d'assets |
| 57 | **Appareils et poids des assets** | **Tranché (Noah : « toujours ordi »)** : cible **ordinateur** ; téléphone = **mode liste** seulement ; budget ≤ 8 Mo au premier affichage, chargement progressif, dégradation ordonnée | Portable minimum à supporter (sans carte graphique dédiée ?) |
| 51 | **Ambiance** | Jour seulement, météo et nuit en P1 | Cycle jour/nuit ? Saisons ? |
| 52 | **Foule et circulation de décor** | Plafonnées (30), masquées des lecteurs d'écran, désactivables | Niveau d'animation souhaité ; impact sur les portables modestes |
| 53 | **Nom de l'immeuble** | Enseigne = **nom de l'entreprise** de la partie (texte tronqué à 24 caractères) | Le joueur peut-il aussi choisir un logo ou une couleur ? |
| 54 | **Reprise de la carte spatiale déjà codée** | Garder la logique pure et les tests ; remplacer `art.ts`, `layout`, `trips`, `WorldScene` (jalon Q) | Calendrier du jalon Q par rapport à H à L |
| 57 | **Seuils et prix des 4 rôles** (5e décision) | `scout` 0, `triage` 35, `replier` 45, `ads` 50 ; déblocages **par nombre de clients obtenus** (6e décision, point 60 ; ex-score sur les lieux 2, 3, 4) ; quota `replier` **5 par (prospect, action)** et **5 par (conversation, rôle)** | Confirmer les seuils, ou débloquer `replier` dès le début (c'est lui qui rend le carnet utile) |
| 58 | **Ordre de livraison** (5e décision) | **Jalon R (immeuble jouable) avant le décor du jalon Q** : entrer dans l'immeuble, gérer Clients et Pub, carnet aux Archives, d'abord en mode liste | Valider que l'art de la ville passe après |

## À confirmer au démarrage (hérité de la phase hackathon, toujours ouvert)
| Sujet | Défaut retenu | À vérifier |
|---|---|---|
| Fournisseur LLM | Adaptateur neutre + fournisseur **simulé** d'abord | Le cahier cite « SuperFlix » (nom à confirmer). Le dépôt contient un essai `@axis/sdk` (Node, `index.mjs`) alors que l'API est Python : le SDK n'est pas utilisable tel quel. Option à évaluer : passerelle HTTP (`AXIS_GATEWAY_URL`) si son protocole est compatible — **non présumé**. Vérifier URL, modèles, clés serveur, formats de messages, sorties structurées, limites de débit, remontée des tokens. |
| Orchestrateur de Noah | Exécuteur interne du cahier | Adoption possible seulement s'il respecte contrats, traces, plafonds ; décision au 1er jalon |
| Budget tokens | Réserve 60 M, ≤ 240 M | Conditions réelles du hackathon |
| Rétention des données | 7 jours ou fin du hackathon | Politique effective du fournisseur |
| Quotas de concurrence | 5 appels simultanés | Limites réelles de débit |
| Plafonds de sortie | 800 / 1 200 tokens | Calibrage après mesures |

## Écarts avec l'existant à résoudre
- Le `CLAUDE.md` initial venu du scaffold décrivait « Prospect Tycoon » (TypeScript seul, sans BDD, 48 h, SDK Anthropic). Le cahier fait foi : `CLAUDE.md` est réaligné.
- Le scaffold Next.js (`src/app/`, pnpm, `README.md`, `AGENTS.md`, `CONTRIBUTING.md`) reflète encore l'ancien cadrage ; à aligner avec son auteur (Matthieu) avant de les modifier.
- Emplacement du front (`web/` vs racine) : **tranché de fait**, le front est à la racine (`src/`, pnpm).
- Gestion de paquets côté Python : **tranché**, `uv` (voir `api/README.md`).
- Le `.docx` du cahier est à la racine, non versionné ; décider s'il est commité ou déplacé dans `docs/`.

## Cohérences relevées dans le cahier (en grande partie OBSOLÈTES avec le cap prospection)
- Exemple de parcours §7 vérifié : 80/70/70/70/70 ⇒ 170 de gains ; 30+170−35−80−30 = 55. Cohérent.
- Le plan du chef utilise `researcher` ; l'interface affiche « chargé de veille ». Convention retenue : id `researcher`, libellé « chargé de veille ».
- Tarif M5 « hors crédit exceptionnel » : le crédit rend un message gratuit, il n'ajoute jamais de message (quota 5 strict).
- M4 ne débloque aucun agent ; seul M5 débloque le chef.

## Hors périmètre première livraison
Comptes synchronisés, multijoueur, recruteur, salaires, génération libre de planètes, navigation web ouverte, **scraping direct de plateformes** (interdit par le cap), chef d'équipe (P2), **envoi réel de messages et intégrations CRM**, application mobile native ; mode Réel MCP/API, événements de marché, planète Actualités, animations enrichies, export du bilan (P1 après le parcours Tutoriel complet).
