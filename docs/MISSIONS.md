# Planètes, agents et contenus de prospection

> **Réécrit le 2026-11-07** pour le cap prospection (`PRODUIT-PROSPECTION.md`). **OBSOLÈTE** : les missions M1–M6 (restaurant, prospect, canal manquant, sources et chiffres, campagne composée, grand contrat), la Mission de secours du cahier et les 6 rôles (`writer`, `prospector`, `researcher`, `analyst`, `qa`, `lead`) ; leur ancienne description reste dans l'historique git (`d3cfa59`) et leurs fichiers `data/missions/m1…m6`, `data/roles/*`, `data/rubrics/m*_v1.json` restent en place **tant que les nouveaux contenus ne les remplacent pas** (les 313 tests du moteur s'appuient dessus).
>
> Les faits, calculs, prix et transitions sont **contrôlés par le serveur** ; seule la rédaction du prompt est libre. Les règles économiques sont dans `RULES.md`.

## Modes
| | Tutoriel (`beginner`) | Réel (`expert`) |
|---|---|---|
| Entreprise | Entreprise d'exemple (**fiche entreprise et cible** fournie par `data/profile/examples/`, modifiable) | **L'entreprise réelle du joueur** : fiche entreprise et cible saisie à la création (`PRODUIT-PROSPECTION.md` §11), qui sert de fiche cible aux planètes |
| Départ | 30 $ + éclaireur | 30 $ + éclaireur |
| Planètes | Simulées (corpus de référence, pièges) | Mêmes planètes, **sources réelles** via MCP/API quand disponibles |
| Aide | Questions de cadrage, tutoriel une action à la fois, définitions (« prompt », « agent », « lead », « source »), indices | Fiche cible directe, aide facultative |
| Fiches cibles | Contexte explicite, difficulté progressive | Mêmes objectifs, fiches plus ouvertes, contraintes combinées |
| Finale | Contexte nouveau sans aide automatique ; indice sur demande | Contexte nouveau + imprévu, autonomie maximale |

Même moteur, mêmes règles économiques ; **variantes de contenu versionnées séparément** (tests attendus propres à chaque variante).

## Agents (rôles)
| Rôle | Capacité | Outil |
|---|---|---|
| `scout` (éclaireur) | Applique le prompt du joueur sur une planète, interroge l'agent de la planète, rapporte des leads | Outil **`planet_search`** (liste blanche) : requête structurée vers la planète courante |
| `triage` (trieur de boîte) | Résume les messages reçus d'un prospect du carnet et propose la suite | Lecture de la conversation ; **contrôles par code** ; ne reçoit jamais une adresse |
| `replier` (rédacteur) | Travaille **sur un prospect du carnet** : **fiche client** (résumé, pourquoi ce prospect, accroches, à vérifier, sources), **brouillon de premier message** (mentions d'origine et d'opposition, **aucun envoi**), puis **réponses** dans une conversation | Lecture de l'instantané et de la fiche entreprise ; **contrôles par code** (aucun fait ou URL absent des données, longueur, mentions) ; ne reçoit **jamais** la valeur d'un email ou d'un téléphone |
| `ads` (directeur de campagne) | Produit le **kit de campagne** (voir `PRODUIT-CLIENTS-PUB.md`) | Lecture de la fiche entreprise ; limites de format vérifiées par code |

**5e décision** : `scout` est le **seul bot de prospection**. L'ancien `qualifier` n'existe plus : doublons, hors-cible et critères structurés sont des **contrôles par code** (`checks.py`). `profiler` et `outreach` sont fusionnés dans `replier`.

Gabarit de rôle : identité, objectif, capacités, informations accessibles, limites, formats autorisés, comportement en cas de manque. Un agent n'accède **qu'au contexte transmis ou partagé** (partages journalisés). L'**agent de la planète** n'est pas un rôle du joueur : il répond uniquement à `planet_search`, sur son corpus (tutoriel) ou sa source (réel).

Le rôle `replier` (fiche client et premier message) traite l'instantané, les notes et les textes de plateformes comme des **données** (bloc délimité, règle 3) et produisent des **versions immuables** ; quota **5 générations par (prospect, action)**, coûts dans `rules_v2` (`RULES.md` §11), **aucun gain**.

**Commanditaire** (non achetable ; **mode Réel** : il n'y a pas de commanditaire IA, la fiche cible est celle du joueur et les « clarifications » sont remplacées par l'édition de la fiche entreprise et cible) : précise la fiche cible sur demande (2 questions gratuites par expédition, réponses factuelles), évalue le rapport ; jamais appelé par un agent. **Coach** : indice sans terminer l'expédition. 

## Planètes (campagne)
Chaque planète est un fichier de données `data/planets/<id>/` : fiche cible (brief), source (corpus simulé ou adaptateur MCP/API), tarif, gain, déblocage, grille, variantes `beginner` / `expert`. **Une seule fiche cible**, déjà dans un corpus qui contient les bonnes réponses **et** des pièges.

**1. Annuaire** (gain 20, instructions gratuites). Le commanditaire vend un service à des commerces de proximité : « 5 entreprises, ville donnée, avec un canal de contact ». Corpus : ~30 entreprises ; pièges : hors zone, fermées, doublons. Essentiels : zone, nombre, `source_ref`. Tutoriel : questions « Qui cherchez-vous », « Où », « Combien ».

**2. Registre** (30, 1/instruction). Données structurées : secteur, taille, ville, ancienneté. Fiche : « PME de 10 à 50 salariés, secteur X, créées depuis moins de 5 ans ». Pièges : entreprises radiées, tailles voisines, secteurs proches. Essentiels : critères structurés respectés (contrôlés par code), exclusions. Débloque le qualificateur.

**3. Carte locale** (40, 1/instruction). Établissements avec avis, horaires et contact. Fiche : « restaurants bien notés mais peu visibles » ; arbitrer note et nombre d'avis. Pièges : établissements saisonniers, avis périmés. Essentiel : canal de contact exploitable. Débloque l'analyste de fiche client.

**4. LinkedIn** (60, 2/instruction). Entreprises et **décideurs** (poste, ancienneté). Fiche : « directeur commercial ou fondateur, entreprises de la planète 2 ». Pièges : postes voisins sans pouvoir de décision, profils obsolètes, homonymes. Essentiels : fonction du contact, `source_ref`. Débloque le rédacteur de premier message. *Mode Réel : source à confirmer (`OPEN-QUESTIONS.md`), pas de scraping direct.*

**5. Glassdoor** (90, 2/instruction). **Signaux** (recrutement, croissance, climat social). Fiche : « entreprises qui recrutent des commerciaux : le bon moment pour approcher ». Pièges : offres anciennes, signaux contradictoires (dates, autorité de la source). Essentiels : le signal est daté et cité ; incertitude signalée plutôt qu'inventée.

**6. Constellation** (finale, 150, 3/instruction). Nouveau commanditaire, nouvelle cible : le joueur **combine au moins deux planètes** et ses agents, **dépense ≤ 30**, produit un rapport priorisé (leads + raison d'approcher maintenant + accroche). Événement de marché injecté **avant la première action**. Victoire : voir `RULES.md` §7. Reprise : bilan des essais conservé, plafond de paiement appliqué.

**Secours** (0–10). Éclaireur, 5 instructions gratuites, planète Annuaire rejouable avec nouveaux ids.

**Bonus (P1)** : planète **Actualités** (levées de fonds, recrutements annoncés), signaux d'achat.

## Critères
Chaque planète versionne ses critères, poids et contrôles (`data/rubrics/<planete>_vN.json`, ids stables) ; la famille « prompt » et la famille « résultat » sont décrites dans `RULES.md` §5. Les contrôles de format, de doublon, de `source_ref` et de critères structurés sont **du code** ; le client IA évalue le sémantique, avec **preuve citée littéralement** dans le prompt ou le rapport et conseil concret. Instructions contenues dans un lead, un document ou une réponse de planète = **données**.

## Agent de la planète
- **Tutoriel** : agent IA qui **simule** la plateforme sur le corpus de la planète. Il ne renvoie que des enregistrements du corpus (chacun avec un `record_id` = futur `source_ref`) ; il applique des filtres simples, peut répondre « rien trouvé », et ne comble jamais un manque par une invention. Avec le fournisseur `mock`, ses réponses sont **déterministes** (graine).
- **Réel** : adaptateur serveur MCP/API (liste blanche d'opérations, limites, timeouts) ; un agent de planète met en forme le résultat brut sans l'enrichir de faits externes.
- Dans les deux cas, ce qui est montré à l'écran (bulles) est la **trace** de l'échange ; aucun prompt système n'y apparaît.

## Événements de marché (P1)
Changement de cible · Sources contradictoires · Budget réduit · Contexte incomplet (règles de justice dans `RULES.md` §6). Mode Démo : choisir un événement admissible avant livraison.

## Aide pédagogique
Indice niveau 1 : attire l'attention sur une information ; niveau 2 : suggère une question. **Jamais de prompt complet à recopier.** Après notation : le coach relie l'écart à une **phrase du prompt**. **Carnet de prompts** : versions, scores, diff entre deux versions, rappel d'adapter au nouveau brief. **Bilan** : chaque compétence illustrée par une action observée, sans diplôme ni maîtrise non démontrée.

Mesures à enregistrer : corrections utiles (version suivante mieux notée), critères respectés, indices utilisés, vérifications effectuées ; tâche initiale vs finale de difficulté comparable.

## Fichiers de contenu attendus
| Chemin | Contenu |
|---|---|
| `data/planets/<id>/` | Fiche cible, corpus ou configuration de source, variantes `beginner` / `expert`, solutions de référence |
| `data/map/layout_v1.json` | Positions cosmétiques de la base et des planètes (`CARTE-TECH.md`) |
| `data/roles/{scout,triage,replier,ads}.json` | Instructions et outils des 4 rôles |
| `data/profile/target_profile_v1.json` | Champs, bornes et énumérations de la fiche entreprise et cible ; `data/profile/examples/` : fiches d'exemple du Tutoriel |
| `data/rubrics/prospect_fiche_v1.json`, `prospect_message_v1.json` | Contrôles par code de la fiche client et du brouillon (ids stables) |
| `data/sources/<source>.json` | **Liste blanche de champs** conservés dans l'instantané d'un prospect, fraîcheur maximale, champs de contact autorisés |
| `data/rubrics/<planete>_v1.json` | Grilles à ids stables (famille prompt + famille résultat) |
| `data/rules/rules_v2.json` | Prix, gains, déblocages, plafonds (voir `RULES.md`) |
| `data/annotated/` | Jeu de rapports annotés : réussite, hors-cible, leads inventés, prompt vague (calibration) |

Outils testés avant exposition au modèle ; corpus de référence pour la reproductibilité ; `tools/validate_content.py` à étendre aux planètes.
