# Points ouverts et décisions à confirmer

Chaque point a une valeur par défaut pour que l'équipe avance.

## Cap prospection (2026-11-07) : à trancher par Noah
**Tranché** (voir `PRODUIT-PROSPECTION.md`) : appweb uniquement ; tycoon en vue de dessus 3/4 avec **Phaser 3** dans Next.js ; **prospection seule** ; **carte unique** (base + planètes-plateformes) ; le joueur écrit le prompt et c'est lui qui est noté ; tuto = agent simulant la recherche, réel = MCP/API ; **moteur existant gardé**, contenu M1–M6 et 6 rôles remplacés ; pas de scraping direct de LinkedIn. **Tranché le 2026-11-07 (2e décision)** : la prospection est la **fonction réelle** du produit (recherche de vrais clients pour la vraie entreprise du joueur) ; le mode Réel produit de **vrais prospects** et le Tutoriel reste simulé pour apprendre à écrire de bons prompts ; après une recherche, on doit pouvoir **conserver** le prospect dans un dossier, le **consulter**, le **trier**, l'**exporter en CSV**, le **marquer « contacté »**, **rédiger un premier message** et obtenir une **fiche client** par un **agent spécialisé** (`PRODUIT-PROSPECTION.md` §11 à §14). Les points ouverts de cette 2e décision sont dans la section « Produit réel » plus bas.

| # | Sujet | Recommandation (valeur par défaut) | À décider |
|---|---|---|---|
| 1 | **Mode réel : phrase coupée.** L'énoncé disait « en tuto, un agent… ; en réel, un MCP ou une API fera les recherches en vraies conditions. Le but… » (phrase non terminée) | Lecture retenue : **tuto = planète simulée par un agent IA sur corpus fictif ; réel = mêmes planètes branchées à de vraies sources**, le but étant d'apprendre à écrire le prompt dans des conditions réalistes | **Partiellement levé** : Noah a confirmé que le réel = de **vrais prospects** et que le tuto reste simulé pour apprendre les prompts. Reste à confirmer la suite exacte de la phrase d'origine (« le but… ») |
| 2 | **Choix du MCP / de l'API par planète** | Commencer par des sources **ouvertes et licites** : registre d'entreprises (API publique), cartes/lieux (API officielle à clé), actualités (flux/API). **LinkedIn** et **Glassdoor** : accès officiels restreints ou sans API publique de recherche connue → **à vérifier** ; sinon rester **simulés** (badge) ou passer par un fournisseur de données licencié | Quelles sources, quelles clés, quels budgets ; accès LinkedIn/Glassdoor réel ou non |
| 3 | **Critères et poids de notation** | Poids de départ de `RULES.md` §5 (prompt 40 / résultats 60) ; **calibrer** sur `data/annotated/` (réussite, hors-cible, leads inventés, prompt vague) | Faut-il payer sur les résultats seuls et n'afficher la note du prompt que comme apprentissage ? (défaut : score unique, deux affichages) |
| 4 | **Assets graphiques** | Pack **CC0** isométrique 2:1 (64×32) au départ + un atlas unique par catégorie ; `ASSETS.md` pour les licences ; remplacer par un style propre plus tard | Pack libre vs création sur mesure ; qui produit l'art |
| 5 | **Thème des planètes** | Espace : base-station au centre, planètes = plateformes, agents en **navettes** (cohérent avec « planètes » et « voyage ») | Garder le thème spatial ou un autre (archipel, ville) |
| 6 | **Noms de marques dans le jeu** (LinkedIn, Glassdoor) | Afficher les noms avec la mention « non affilié », données **simulées** en tuto | Noms réels vs jumeaux fictifs (« Réseau pro », « Avis employeurs ») ; avis juridique avant diffusion publique |
| 7 | **Données personnelles en mode réel** (leads = personnes) | **Entreprises d'abord** ; contacts = fonctions ou coordonnées professionnelles publiques ; minimisation, rétention courte, suppression avec la partie ; aucun envoi réel | **Mesures par défaut écrites** (`PRODUIT-PROSPECTION.md` §14, `RULES.md` §12) ; reste la **validation juridique** : cadre RGPD, durée de rétention, base légale (voir « Produit réel » ci-dessous) |
| 8 | **Rôles d'agents du MVP** | **4 rôles** : `scout`, `qualifier`, `profiler` (analyste de fiche client), `outreach` (rédacteur de premier message) ; chef d'équipe reporté en P2 ; ids à migrer (API-E1) | Valider la liste, les prix (0 / 30 / 40 / 45) et les déblocages |
| 9 | **Ordre et nombre de planètes** | 5 planètes + Constellation (finale) ; Actualités en bonus P1 ; gains identiques au cahier pour garder l'économie calibrée | Ordre (Annuaire, Registre, Carte locale, LinkedIn, Glassdoor) et gains |
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
| 18 | **Déblocage des agents en Réel** | Condition de score **levée** pour `qualifier`, `profiler`, `outreach` (seul le prix reste) : la valeur réelle n'attend pas la progression | Confirmer, ou garder les déblocages par score aussi en Réel |
| 19 | **Format du CSV** | UTF-8 **avec BOM**, séparateur `;`, CRLF, RFC 4180 (Excel français) ; neutralisation des formules par apostrophe | `;` ou `,` ? Option d'export en `,` ? Colonnes à ajouter (fiche, message) ? |
| 20 | **Durée de conservation** | **180 jours d'inactivité**, rappel à 30 jours, action « Conserver » | Valeur légale et métier (la CNIL recommande de borner la durée de conservation en prospection ; à valider avec un juriste) |
| 21 | **Périmètre B2B et base légale** | **B2B uniquement** (entreprises et fonctions professionnelles), intérêt légitime sous conditions (rapport avec la fonction, information sur l'origine, droit d'opposition) ; ciblage de particuliers exclu | Validation juridique ; faut-il tolérer les entreprises individuelles ? |
| 22 | **Enrichissement d'un prospect** | MVP : **instantané seul** (aucune nouvelle requête de source) ; P1 : requête de source supplémentaire via `PlanetSource` (liste blanche, coût) | Priorité de l'enrichissement |
| 23 | **Intégrations (CRM, envoi réel)** | **Hors périmètre** : export CSV et brouillon à copier ; aucun envoi, aucun `mailto:` | Une intégration CRM plus tard ? Laquelle |
| 24 | **Fournisseur LLM et données personnelles** | Le modèle ne reçoit que des champs minimisés (pas de valeur de coordonnée, pas de notes) ; vérifier **localisation et rétention** du fournisseur avant tout vrai prospect | Fournisseur retenu et ses garanties (lien avec le point 13) |
| 25 | **Mentions d'origine et d'opposition** | Texte standard français dans le brouillon, configurable (`data/`), contrôlé par code | Formulation validée par un juriste |
| 26 | **Fiche entreprise : secteurs** | Liste courte proposée + saisie libre ; correspondance avec les codes d'activité des registres réels à étudier pour les critères structurés | Nomenclature à retenir (codes d'activité officiels ou libre) |
| 27 | **Prompts propres aux agents `profiler` / `outreach`** | MVP : **consigne facultative** (≤ 500 caractères), contrôlée par code ; **notation de ces prompts** (apprentissage) en P1 via une planète bonus « Atelier » | Noter ou non ces prompts dès le MVP |
| 28 | **Ajouter un lead « partiel »** | Autorisé s'il a un `source_ref` vérifié (fiabilité `partiel`, manques affichés) ; refusé sans `source_ref` (`LEAD_UNVERIFIED`) | Seuil de fraîcheur à partir duquel un lead devient `partiel` |
| 29 | **`/api/notebook` (501)** | **Tranché** : reste le **carnet de prompts** (apprentissage). Le carnet de prospection est une ressource **distincte** (`/api/prospects`) | — |

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
