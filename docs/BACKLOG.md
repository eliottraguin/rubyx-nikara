# Backlog et jalons

> **Réécrit le 2026-11-07** pour le cap prospection (`PRODUIT-PROSPECTION.md`). L'ancien backlog (F01–F14 « six missions », UI01–UI08, AI01–AI08, jalons H0–H24 du hackathon) est **OBSOLÈTE** dans son contenu ; ce qui est **déjà livré** est résumé ci-dessous. Tailles : **S** ≈ ≤ 0,5 j · **M** ≈ 1 j · **L** ≈ 2 j (estimations à confirmer à chaque jalon).

## Déjà livré (GARDÉ)
| Ticket | État | Contenu |
|---|---|---|
| BE01 | Livré | API lançable, sessions, migrations, schémas, règles dans `data/rules/` |
| BE02 | Livré | Moteur de campagne : états, passages, victoire serveur (contenu M1–M6 à remplacer) |
| BE03 | Livré | Ledger, réservations, achats, différentiel de reprise |
| BE04 | Livré | Actions et quotas (5 instructions), idempotence, timeout, reprise sans double débit |
| BE05 | Livré | Versions immuables, livraison figée, partage de pièces |
| BE06 | Livré | Évaluation serveur avec fournisseur `mock` : score calculé par le serveur, règlement, grille figée |
| BE07 | Livré | Tests critiques (paiement unique, concurrence, fonds, accès inter-session, événements) ; 313 tests pytest |
| Front branché | Livré | `src/lib/api/{http,adapt,types}.ts` : l'ancien parcours est jouable contre l'API réelle |
| BE08 | **À faire** | Déploiement : variables serveur, stockage persistant, santé, sauvegarde de démo (inchangé) |

**OBSOLÈTE** (à retirer quand remplacé, jamais avant) : contenu M1–M6, 6 rôles, chef d'équipe (BE04 `actions_lead`), écrans « bureau / commande / atelier / boutique » de l'ancien parcours.

## Périmètre
- **P0** : jalons A à E **plus H et I** (jouable de bout en bout en **mode Tutoriel**, planètes simulées, avec fiche entreprise et cible et **carnet de prospection** consultable, triable, exportable en CSV).
- **P1 prioritaire** : jalons **J** (fiche client), **K** (premier message) et **L** (données personnelles et rétention), puis **F** (mode Réel MCP/API). **L est un préalable de F** : aucune vraie donnée avant minimisation, rétention et suppression.
- **P1 prioritaire, section Clients et section Pub** (3e décision, `PRODUIT-CLIENTS-PUB.md`) : jalons **M** (navigation à trois sections), **N** (messagerie simulée), **P** (pub), puis **O** (messagerie réelle, **bloquée** par L et par la validation juridique, `OPEN-QUESTIONS.md` n° 32).
- **Ville (4e décision)** : jalon **Q**, en **P0 visuel** : il remplace le décor spatial des jalons A et B (déjà codés) ; il ne change aucune règle et peut avancer **en parallèle** de H à L. Les étages de la coupe hébergent les écrans de M, N et P.
- **Rendu Three.js (6e décision, jalon S)** : remplace Phaser et les sprites pré-rendus du jalon Q par une **ville 3D générée par code** (Three.js / react-three-fiber), ajoute **connexion par compte** et **trois vues** (ciel, quartier, intérieur) reliées par des zooms. **Visuel seulement** : aucune règle serveur ne change, sauf les comptes (API-S1, API-S2). Voir « Jalon S ».
- **P1** : événements de marché, planète Actualités, animations enrichies, export du bilan, dossiers nommés, enrichissement d'un prospect par nouvelle requête de source.
- **P2** : chef d'équipe, comptes, multijoueur, génération libre de planètes, navigation web ouverte.

## Jalons
| Jalon | Vérifiable quand… |
|---|---|
| **A — Carte statique** | La carte s'affiche (base + 6 planètes), planètes cliquables, état lu depuis l'API, **couche DOM accessible** équivalente, repli en mode liste |
| **B — Agent mobile** | Un agent quitte le hangar, vole vers une planète, atterrit et revient ; rejouable depuis une trace ; `prefers-reduced-motion` respecté |
| **C — Dialogue de planète** | Un prompt envoyé produit une vraie expédition : l'agent de la planète (simulé) répond sur un corpus, bulles + transcript, rapport de leads reçu |
| **D — Notation du prompt** | Le serveur note **prompt + résultats**, paie, affiche deux scores ; carnet de prompts et diff entre versions |
| **E — Déblocages et fin** | Planètes 1 à 6 jouables, hangar (4 rôles : `scout`, `triage`, `replier`, `ads`), secours, finale et bilan ; parcours complet sans l'ancien contenu |
| **F — Mode Réel** | Au moins une planète branchée à une source réelle légale ; repli sur le simulé signalé ; **jalon L terminé** |
| **G — Finition** | Mobile 390 px, audit clavier et lecteur d'écran, recette, démo répétée |
| **H — Fiche entreprise et cible** | La fiche est saisie à la création, versionnée, lue par les agents ; en Tutoriel un exemple est pré-rempli ; à placer **avant C** (elle sert de fiche cible en Réel), en parallèle de A et B |
| **I — Carnet de prospection** | Depuis un rapport, « Ajouter au carnet » (serveur : copie + `source_ref` revérifié) ; liste triable, filtrable, recherchable ; fiche prospect, notes, statut « contacté » ; suppression ; **export CSV** neutralisant les formules ; **après C** (rapport structuré), en parallèle de D |
| **J — Agent fiche client** | Un prospect obtient une fiche (résumé, pourquoi, accroches, à vérifier, sources) par `replier` (action `prospect_profile`) ; coût et quota respectés ; contrôles par code ; **après I et API-E1** |
| **K — Agent premier message** | Un prospect obtient un brouillon par `replier` (action `prospect_message`) ; aucun envoi ; mentions d'origine et d'opposition ; **après J** (même mécanisme d'action) |
| **L — Données personnelles et rétention** | Minimisation en liste blanche, purge de rétention, suppression en cascade, export JSON complet, journaux sans contenu personnel ; **bloque F** |
| **M — Trois sections** | Accès aux trois sections par un **menu de raccourcis** (Prospection, Clients, Pub), hangar à 4 rôles, `rules_v2` étendu ; sections vides mais navigables en **mode liste**, contrats écrits dans `CONTRACTS.md` **avant** N, O et P ; les étages de l'immeuble arrivent avec Q |
| **N — Messagerie simulée (Tutoriel)** | Une conversation par prospect ; envoi simulé ; client simulé (personas, pièges) ; `triage` et `replier` avec contrôles par code ; résultat de conversation calculé par code ; **après I et K** |
| **O — Messagerie réelle (Réel)** | Connexion OAuth, import des seules réponses des prospects du carnet, **envoi confirmé par le joueur** avec tous les garde-fous (`RULES.md` §13) ; **après N et L**, **bloqué** par la validation juridique et la décision n° 31 |
| **P — Pub** | Une campagne produit un kit versionné par `ads` (positionnement, accroches, textes aux limites du format, brief visuel, plan, checklist) ; contrôles par code ; export Markdown ; aucun bouton Publier ; **après M** |
| **Q — Ville et immeuble** | Carte **plein écran** en ville (Bibliothèque, Hôtel de ville, SoHo, Midtown, Wall Street, Times Square), **immeuble central** reconnaissable qui monte de **10 niveaux** avec le **total gagné**, rendu **semi-réaliste façon Les Sims**, bots à pied, à vélo, en skate ou en hélicoptère, **coupe d'immeuble** (Toit, Studio pub, Salle du courrier, Archives, Accueil et garage), drones de pub ; couche DOM et mode liste équivalents ; **remplace le décor spatial** sans toucher aux règles |
| **S — Ville Three.js, connexion et zooms** | Page de connexion sur une **vue très haute** de la ville sous les nuages ; comptes e-mail + mot de passe ; création d'entreprise ; **zoom** vers le quartier ; **rotation et zoom léger** ; clic sur le siège ⇒ **zoom vers l'intérieur (bureau)** ; déconnexion ⇒ **dézoom** vers l'accueil ; agents et **pigeons voyageurs** animés depuis les événements existants ; mode liste et `prefers-reduced-motion` équivalents ; **aucune règle de jeu modifiée** |

## Tickets par jalon et par périmètre
`api/` = moteur et routes · `src/` = interface · `data/` = contenu et règles.

### Jalon A — Carte statique
| Ticket | Taille | Périm. | Travail et critère de fin |
|---|---|---|---|
| MAP01 | M | `src/` | Installer Phaser ; `MapHost` (client, `dynamic` `ssr:false`) + `PhaserMap` (création/destruction propre) ; scène de base avec placeholders ; pas de Phaser hors de ce module |
| MAP02 | M | `src/` | `viewmodel.ts` (état → `MapViewModel`) et planètes cliquables ; tests vitest purs |
| MAP03 | M | `src/` | **Couche DOM accessible** (liste planètes/agents, mêmes actions, `aria-live`) + **mode liste** de repli |
| MAP04 | S | `data/` | `data/map/layout_v1.json` (positions cosmétiques) + `ASSETS.md` (licences) |
| API-A1 | S | `api/` | Exposer dans `GET /api/state` la liste de **planètes** (id, nom, état, étoiles, condition de déblocage en texte, tarif, gain) ; documenter dans `CONTRACTS.md` avant fusion |

### Jalon B — Agent mobile
| Ticket | Taille | Périm. | Travail et critère de fin |
|---|---|---|---|
| MAP05 | M | `src/` | Sprites d'agent, trajectoire (`pathing.ts`), états hangar / vol / discussion / retour / panne |
| MAP06 | M | `src/` | `timeline.ts` : trace → file d'animations ; rejeu idempotent ; boucle de vol tant que le serveur n'a pas répondu ; bouton « passer » |
| API-B1 | M | `api/` | **Trace d'expédition** : champ `trace` ordonné (`seq`) dans `GET /api/actions/{id}` (voir `CARTE-TECH.md`) ; aucun prompt système ni clé dedans ; contrat documenté avant fusion |
| MAP07 | S | `src/` | `prefers-reduced-motion` + réglage manuel ; caméra et entrées tactiles bornées (390 px) |

### Jalon C — Dialogue de planète
| Ticket | Taille | Périm. | Travail et critère de fin |
|---|---|---|---|
| DATA-C1 | L | `data/` | `data/planets/annuaire` et `registre` : fiche cible, corpus avec pièges, variantes `beginner`/`expert`, solutions de référence |
| DATA-C2 | S | `data/` | `data/roles/scout.json` (instructions, outil `planet_search`) |
| API-C1 | L | `api/` | Chargeur de **planètes** (remplace le chargeur de missions ; mêmes états, tarif figé à l'ouverture, `POST /api/missions/{id}/start` conservé) ; `rules_v2` (voir `RULES.md`) |
| API-C2 | L | `api/` | **Agent de la planète simulé** : outil `planet_search` côté serveur (liste blanche), réponses limitées au corpus avec `record_id`, déterministe avec `mock` ; adaptateur de sources (interface `PlanetSource`) |
| API-C3 | M | `api/` | Rapport de leads : schéma de contenu structuré (liste de leads), versions immuables, rendu non fiable (texte seulement) |
| UI-C1 | M | `src/` | Panneau planète + panneau prompt (compteur n/5, coût maximal avant envoi, envois impossibles expliqués) |
| UI-C2 | M | `src/` | Dialogue : bulles + transcript ; cartes de leads ; livraison avec confirmation de la version |

### Jalon D — Notation du prompt
| Ticket | Taille | Périm. | Travail et critère de fin |
|---|---|---|---|
| DATA-D1 | M | `data/` | Grilles `annuaire_v1`, `registre_v1` : famille prompt + famille résultat, ids stables (`RULES.md` §5) |
| API-D1 | L | `api/` | Nouveaux contrôles dans `checks.py` : `source_ref` existant, doublons, critères structurés, champs, fraîcheur ; **aucune récompense lue depuis le modèle** |
| API-D2 | M | `api/` | Client évaluateur : jugement du prompt avec citation littérale ; résistance aux instructions dans les leads (tests d'injection) |
| API-D3 | M | `api/` | **Carnet de prompts** : `GET/POST /api/notebook` (501 aujourd'hui) ; version, score, diff. **À ne pas confondre** avec le carnet de prospection (jalon I, `/api/prospects`) : `/api/notebook` **reste réservé aux prompts** |
| UI-D1 | M | `src/` | Retour client à **deux scores**, phrases du prompt en cause, paiement ; carnet avec diff |
| DATA-D2 | M | `data/` | Rapports annotés (réussite, hors-cible, leads inventés, prompt vague) pour calibrer ; étendre `tools/validate_content.py` |

### Jalon E — Déblocages et fin
| Ticket | Taille | Périm. | Travail et critère de fin |
|---|---|---|---|
| DATA-E1 | L | `data/` | Planètes 3 à 6 (Carte locale, LinkedIn, Glassdoor, Constellation) + planète de secours |
| API-E1 | M | `api/` | **(5e décision : voir API-R1)** Remplacer l'énumération des rôles par `scout` / `triage` / `replier` / `ads` (ex-liste `scout` / `qualifier` / `profiler` / `outreach` (migration, achat, hangar) ; déblocage par score en Tutoriel, **levé en Réel** (`RULES.md` §2) |
| API-E2 | M | `api/` | Fin de campagne : Constellation (≥ 2 agents, ≥ 2 planètes, dépense ≤ 30) ; bilan fondé sur les traces |
| UI-E1 | M | `src/` | Hangar (achat, condition en texte), planètes qui se débloquent (voile, annonce `aria-live`), fin et bilan |
| QA-E1 | M | tous | **Parcours complet** automatisé (fournisseur simulé) + captures navigateur ; retrait de l'ancien contenu M1–M6 et de ses écrans quand le nouveau parcours est vert |

### Jalon F — Mode Réel (P1)
| Ticket | Taille | Périm. | Travail et critère de fin |
|---|---|---|---|
| API-F1 | L | `api/` | Adaptateurs `PlanetSource` MCP/API : liste blanche, timeout, limite de débit, cache, journaux sans clé ni contenu personnel ; **tests avec réponses enregistrées**, aucun réseau réel en test (règle 9) |
| API-F2 | M | `api/` | Première planète réelle (source légale ouverte recommandée : voir `OPEN-QUESTIONS.md`) ; vérification de `source_ref` sur la réponse réelle |
| API-F3 | M | `api/` | Plafonds de budget et quotas de sources ; **repli sur le simulé** signalé (badge) ; pause explicite au seuil |
| UI-F1 | S | `src/` | Badge « Données réelles » / « Mode simulé » ; affichage des sources |
| API-F4 | — | — | **Remplacé par le jalon L** (minimisation, rétention, suppression, export) : préalable de `API-F2` |

### Jalon G — Finition
| Ticket | Taille | Périm. | Travail et critère de fin |
|---|---|---|---|
| UI-G1 | M | `src/` | Mobile 390 px : feuille inférieure à 3 onglets, cibles 44 px, performance (30 images/s) |
| QA-G1 | M | `src/` | Audit clavier + lecteur d'écran ; test avec `prefers-reduced-motion` |
| QA-G2 | S | `docs/` | `RECETTE.md` réaligné sur le nouveau contenu ; `docs/ai/*` marqués OBSOLÈTES ou réécrits |
| BE08 | M | `api/` | Déploiement (inchangé) ; sauvegardes de démo : **exclure ou chiffrer** les vrais prospects |

### Jalon H — Fiche entreprise et cible
| Ticket | Taille | Périm. | Travail et critère de fin |
|---|---|---|---|
| DATA-H1 | S | `data/` | `data/profile/target_profile_v1.json` (champs, bornes, énumérations de `ton`, liste courte de secteurs) et `data/profile/examples/` (≥ 2 fiches d'exemple Tutoriel). Validé par `tools/validate_content.py`. **Critère** : bornes lues depuis les données, pas du code |
| API-H1 | M | `api/` | Stockage de la fiche (migration ; l'ancien `company.profile` devient `offre`), `profile_version`, `PUT /api/profile` (`Idempotency-Key`, `expected_version`, `VERSION_CONFLICT`), fiche dans `GET /api/state` ; contrat documenté dans `CONTRACTS.md` **avant fusion**. **Tests** : validation des bornes, version périmée, accès inter-session (404), un texte contenant une « consigne » est stocké comme donnée, rejeu idempotent |
| API-H2 | M | `api/` | Les agents reçoivent la fiche comme **bloc de données délimité** ; en Réel, elle est la fiche cible des planètes ; critères structurés (`cible_secteurs`, `cible_zone`, `cible_taille`) utilisables par `checks.py` (alimente `l_adequation`, dépend de API-D1). **Tests** : injection dans `offre` sans effet sur le score ni les droits ; une expédition garde la version d'ouverture |
| UI-H1 | M | `src/` | Étape 2 de la création + page « Fiche entreprise et cible » (formulaire guidé, diff de versions, rappel « une cible, pas des personnes »). **Critère** : Tutoriel jouable sans rien saisir ; Réel exige 3 champs ; tests vitest de validation |

### Jalon I — Carnet de prospection
| Ticket | Taille | Périm. | Travail et critère de fin |
|---|---|---|---|
| DATA-I1 | S | `data/` | `rules_v2` : `limits.prospects_max` (500), `notes_max_chars` (2 000), `followup_days`, statuts ; `data/sources/<source>.json` : **liste blanche de champs** de l'instantané |
| API-I1 | L | `api/` | Modèle `Prospect` + migration + dépôt ; propriété de session ; provenance immuable ; `version` pour la concurrence ; contrat documenté dans `CONTRACTS.md` avant fusion. **Tests** : accès inter-session (404 identique à « introuvable »), limites, champs hors liste blanche écartés |
| API-I2 | M | `api/` | `POST /api/prospects` : ajout depuis `(expedition, version de rapport, positions)` ; le **serveur recopie** et **revérifie `source_ref`** ; dédoublonnage `(source, source_ref)` idempotent ; lead non vérifiable refusé (`LEAD_UNVERIFIED`, à ajouter aux codes stables) ; `Idempotency-Key`. **Tests** : lead inventé refusé, deux ajouts concurrents du même lead ⇒ un seul prospect, le navigateur ne peut pas imposer de contenu |
| API-I3 | M | `api/` | `GET /api/prospects` (tri, filtres, recherche, curseur, compteurs), `GET/PATCH/DELETE /api/prospects/{id}` (`PATCH` : `statut`, `notes`, `version`, `VERSION_CONFLICT` ; `contacte_le` au premier passage à `contacte`), suppression du carnet. **Tests** : tri stable, filtres combinés, conflit de version, suppression idempotente |
| API-I4 | M | `api/` | `GET /api/prospects/export.csv` : UTF-8 avec BOM, `;`, CRLF, RFC 4180, en-têtes français, `Cache-Control: no-store`, nom `prospects-SIMULE-…` en Tutoriel. **Neutralisation des formules** (préfixe `'` si premier caractère `=` `+` `-` `@` tabulation ou retour chariot) dans **toutes** les colonnes texte. **Tests** : une cellule par caractère dangereux (entreprise, notes, `source_ref`), guillemets et `;` dans les valeurs, notes saisies par le joueur, aucun contenu dans les journaux |
| UI-I1 | L | `src/` | Carnet : tableau accessible (`aria-sort`), cartes sur mobile, filtres, recherche, pagination, détail, notes, statut, « marquer contacté », suppression avec confirmation, bouton d'export ; mode liste complet sans carte. **Critère** : parcours clavier complet ; tests vitest de l'adaptateur et des vues |
| UI-I2 | S | `src/` | « Ajouter au carnet » dans le rapport (retour « n ajoutés, m déjà présents, k refusés ») ; classeur de la base avec compteur ; animation cosmétique (reduced-motion respecté) |
| QA-I1 | S | tous | Parcours automatisé Tutoriel : expédition → ajout → tri → « contacté » → export CSV relu et vérifié (formules neutralisées) |

### Jalon J — Agent fiche client
| Ticket | Taille | Périm. | Travail et critère de fin |
|---|---|---|---|
| DATA-J1 | S | `data/` | `data/roles/profiler.json` ; `data/rubrics/prospect_fiche_v1.json` (contrôles par code, ids stables) ; coût et quota dans `rules_v2` (`prospect_actions`) |
| API-J1 | L | `api/` | Action `prospect_profile` (`POST /api/prospects/{id}/profile`) : **réutilise** réservation, règlement, idempotence ; **nouvelle clé de quota `(prospect, rôle)`** (5, jamais 6) ; entrée = instantané minimisé + fiche entreprise (bloc de données délimité) ; sortie `FicheClient` validée par code (sections, bornes, `sources` ⊂ instantané, `a_verifier` non vide si donnée manquante) ; versions immuables ; **aucun gain** ; `INVALID_OUTPUT` ⇒ une réparation puis échec sans débit. **Tests (mock)** : coût et quota, 6ᵉ génération refusée sous concurrence, rejeu idempotent, instruction cachée dans l'instantané sans effet, fonds insuffisants, accès inter-session |
| UI-J1 | M | `src/` | Section « Fiche client » de la fiche prospect : coût max et quota avant envoi, consigne facultative, sections, contrôles réussis, versions, agent non acheté expliqué |

### Jalon K — Agent premier message
| Ticket | Taille | Périm. | Travail et critère de fin |
|---|---|---|---|
| DATA-K1 | S | `data/` | `data/roles/outreach.json` (rédacteur de premier message) ; `data/rubrics/prospect_message_v1.json` ; texte standard des **mentions d'origine et d'opposition** (français, configurable) |
| API-K1 | M | `api/` | Action `prospect_message` (`POST /api/prospects/{id}/message`) sur le mécanisme de API-J1 ; sortie `Brouillon` validée par code (longueur, **aucun fait, URL ni numéro absent des données**, mentions présentes, ton) ; **le modèle ne reçoit jamais la valeur d'un email ou d'un téléphone** ni les notes. **Tests** : fait inventé ⇒ `INVALID_OUTPUT` sans débit, valeur de contact absente du contexte envoyé au fournisseur simulé, quota 5 |
| UI-K1 | M | `src/` | Section « Brouillon de message » : bandeau « rien n'a été envoyé », bouton **Copier** (texte brut), **aucun bouton d'envoi ni lien `mailto:`**, régénération n/5 |

### Jalon L — Données personnelles et rétention
| Ticket | Taille | Périm. | Travail et critère de fin |
|---|---|---|---|
| API-L1 | M | `api/` | Minimisation : seule la liste blanche est stockée ; champs sensibles écartés avant stockage ; B2B uniquement (fiche cible sans particuliers). **Tests** : champ hors liste jamais persisté |
| API-L2 | M | `api/` | Rétention : `derniere_activite_le`, rappel 30 jours avant (visible dans l'état), « Conserver », purge à 180 jours ; **horloge injectable**. **Tests** : purge, rappel, prolongation, journal sans contenu |
| API-L3 | M | `api/` | `GET /api/session/export` (JSON complet) ; `DELETE /api/session` purge prospects, fiches, brouillons, instantanés. **Tests** : aucune ligne orpheline après suppression, export limité à la session propriétaire |
| QA-L1 | S | `api/` | Test de non-fuite : noms, contacts, notes et instantanés **absents** des journaux et des erreurs ; aucune valeur de coordonnée dans les requêtes au fournisseur simulé |
| UI-L1 | S | `src/` | Écran « Mes données » (durée, purge, Conserver, export complet, suppression), bandeau « données réelles », rappel d'export (carnet lié au navigateur) |
| DOC-L1 | S | `docs/` | Texte d'information à valider par un juriste (finalités, base légale, durée, droits) ; mise à jour de `CONTRACTS.md` et `DATA-MODEL.md` avec les routes et entités des jalons H à L |

### Jalon M — Trois sections
| Ticket | Taille | Périm. | Travail et critère de fin |
|---|---|---|---|
| DOC-M1 | S | `docs/` | Reporter dans `CONTRACTS.md` et `DATA-MODEL.md` les routes, entités et codes d'erreur de `PRODUIT-CLIENTS-PUB.md` §7 **avant fusion** de N, O, P ; signaler aux autres personnes |
| DATA-M1 | S | `data/` | `rules_v2` : `messaging.*`, `prospect_actions.triage/replier/ads`, `limits.campaigns_max`, prix des rôles `triage` (35), `replier` (45), `ads` (50) ; `data/roles/{triage,replier,ads}.json`. Validé par `tools/validate_content.py` |
| API-M1 | S | `api/` | Les 3 nouveaux rôles dans le catalogue du hangar ; nouvelles clés de quota `(conversation, rôle)` et `(campagne, rôle)` sur le mécanisme `(prospect, rôle)`. **Tests** : quota 5 jamais 6 sous concurrence, rôle non acheté ⇒ `ROLE_LOCKED` |
| UI-M1 | M | `src/` | Menu de raccourcis (Prospection, Clients, Pub) ; pages Clients et Pub vides (état vide expliqué) ; hangar à 4 rôles ; mode liste. Les **étages** de l'immeuble (jalon Q) viennent **par-dessus** cette navigation sans la remplacer. **Critère** : parcours clavier complet, tests vitest de navigation |

### Jalon N — Messagerie simulée (Tutoriel)
| Ticket | Taille | Périm. | Travail et critère de fin |
|---|---|---|---|
| DATA-N1 | M | `data/` | `data/clients/personas_v1.json` (≈ 10 personas avec objectif, ton, pièges : prix absent, objection, désinscription, injection, hostile, silence) ; `data/clients/optout_keywords.json` ; `data/rubrics/conversation_synthese_v1.json` et `conversation_reponse_v1.json` (contrôles par code, ids stables) |
| API-N1 | L | `api/` | Modèles `Conversation`, `ConversationMessage`, `ReplyDraft` + migration ; propriété de session ; statut du prospect suivi (`contacte`, `en_discussion`, `ecarte`) ; cascade de suppression. **Tests** : accès inter-session (404 identique), une conversation par prospect, suppression sans ligne orpheline |
| API-N2 | M | `api/` | `POST /api/conversations/{id}/messages` (envoi **simulé**) + **client simulé** (persona par graine, réponse à la demande, plafond de tours) ; résultat de conversation **calculé par code**. **Tests (mock)** : déterminisme, plafond de 6 tours, piège « prix absent » détecté, injection dans le message client sans effet, aucun envoi hors du jeu |
| API-N3 | L | `api/` | Actions `conversation_triage` et `conversation_reply` sur le mécanisme de API-J1 : coût, quota 5 par `(conversation, rôle)`, **aucun gain**, versions immuables ; sortie validée par code (faits ⊂ fiche/instantané/fil, mentions d'opposition, désinscription détectée par code qui l'emporte, longueur). **Tests** : fait inventé ⇒ `INVALID_OUTPUT` sans débit, **aucune adresse ni numéro dans le contexte envoyé au fournisseur simulé**, 6ᵉ génération refusée, rejeu idempotent |
| UI-N1 | L | `src/` | Section Clients : liste, fil, synthèse, brouillon (coût max, n/5), zone libre, « Utiliser le brouillon de premier message », badge `simulé`, bandeau « rien ne sort », résultat de conversation. **Critère** : clavier complet, texte seulement (jamais de HTML) |
| QA-N1 | S | tous | Parcours automatisé Tutoriel : carnet → conversation → brouillon → envoi simulé → réponse → synthèse → résultat ; piège d'injection et de désinscription couverts |

### Jalon O — Messagerie réelle (Réel)
> **Bloqué** par le jalon L (données personnelles) et par la **validation juridique** (`OPEN-QUESTIONS.md` n° 32) ; **aucun vrai envoi** avant les deux. Développable derrière un **fournisseur de messagerie simulé** (`mock`) pour les tests : aucun appel réseau réel en test automatisé.

| Ticket | Taille | Périm. | Travail et critère de fin |
|---|---|---|---|
| API-O1 | L | `api/` | Interface `MailProvider` (liste blanche) avec fournisseur `mock` et un fournisseur réel ; OAuth 2.0 + PKCE (`/api/mailbox/connect`, `/callback`) ; jetons **chiffrés au repos**, jamais renvoyés ni journalisés ; `DELETE /api/mailbox` révoque et supprime ; une boîte par partie ; Tutoriel refusé. **Tests** : jeton absent des réponses, des erreurs et des journaux ; état OAuth rejoué ou falsifié refusé ; déconnexion purge |
| API-O2 | M | `api/` | `POST /api/mailbox/sync` : import **idempotent** des messages dont l'expéditeur correspond **exactement** à un prospect du carnet ayant une conversation ; autres messages **ignorés sans stockage** ; texte brut (HTML nettoyé, pièces jointes ignorées), longueur bornée ; désinscription ⇒ `ecarte`. **Tests** : expéditeur inconnu non stocké, doublon ignoré, HTML/script neutralisé, instruction dans un mail sans effet |
| API-O3 | L | `api/` | `POST /api/conversations/{id}/send` : `confirm`, version de brouillon figée, destinataire = adresse stockée du prospect, pas de copie, plafonds jour/heure et un envoi par 24 h sans réponse, contrôles du brouillon repassés, `Idempotency-Key`, échec ⇒ `NON_ENVOYE`. **Tests** : sans `confirm` ⇒ `SEND_NOT_CONFIRMED` ; adresse fournie par le navigateur ignorée ; prospect `ecarte` ⇒ `OPTED_OUT` ; double clic ⇒ **un seul envoi** ; **aucun chemin ne permet à une sortie de modèle de déclencher un envoi** |
| API-O4 | S | `api/` | Rétention et export JSON étendus aux conversations ; journaux **sans contenu ni adresse**. **Tests** : non-fuite (QA-L1 étendu aux messages et adresses) |
| UI-O1 | M | `src/` | Écran Boîte mail (connexion, adresse masquée, plafonds, Actualiser, déconnexion) ; **écran de confirmation d'envoi** (destinataire en clair, objet, texte exact, mention d'envoi réel) ; causes de refus affichées. **Critère** : aucun bouton d'envoi hors de cet écran, clavier complet |
| QA-O1 | M | tous | Revue sécurité : OAuth, stockage des jetons, injection par email entrant, plafonds ; liste de contrôle signée avant tout vrai envoi |

### Jalon P — Pub
| Ticket | Taille | Périm. | Travail et critère de fin |
|---|---|---|---|
| DATA-P1 | M | `data/` | `data/ads/formats.json` (plateformes, formats, **limites de caractères**, vérifiées à la source), `data/ads/checklist.json`, énumérations d'objectifs ; `data/rubrics/ad_kit_v1.json` (contrôles par code) ; `data/roles/ads.json` |
| API-P1 | L | `api/` | Modèles `Campaign` et `CampaignVersion` + migration ; CRUD (`/api/campaigns`) avec `version` (concurrence), propriété de session, cascade ; audience dérivée de la fiche cible. **Tests** : bornes, `VERSION_CONFLICT`, accès inter-session (404), suppression sans orphelins |
| API-P2 | L | `api/` | Action `ad_campaign` (`POST /api/campaigns/{id}/generate`) sur le mécanisme de API-J1 : coût 4 $, quota 5 par `(campagne, rôle)`, **aucun gain** ; sortie validée par code (sections, **limites par format**, aucun fait ou chiffre absent de la fiche, `a_verifier` non vide si fait manquant, aucune cible nominative). **Tests** : texte au-dessus de la limite ⇒ `INVALID_OUTPUT` sans débit, « +30 % » inventé refusé, consigne cachée dans l'offre sans effet, 6ᵉ génération refusée, rejeu idempotent |
| API-P3 | S | `api/` | `GET /api/campaigns/{id}/export.md` (serveur, `no-store`, `attachment`) et copie éditée (version enfant). **Tests** : export limité à la session propriétaire |
| UI-P1 | L | `src/` | Section Pub : liste, fiche de campagne, kit par sections avec **Copier** et **Exporter**, contrôles réussis, versions, bandeau « Rien n'a été publié ni dépensé », **aucun bouton Publier**. **Critère** : clavier complet, texte seulement |
| QA-P1 | S | tous | Parcours automatisé : fiche → campagne → kit → contrôle de limites → export ; non-fuite dans les journaux |

### Jalon Q — Ville et immeuble
> Remplace le **décor** des jalons A et B (thème spatial déjà codé dans `src/game/map/`) : la logique pure (iso, trajets, bus, viewmodel, trace) est **gardée et testée** ; seuls l'art, le layout, la scène et les véhicules changent. Aucune règle serveur, sauf la lecture du total gagné (API-Q1).

| Ticket | Taille | Périm. | Travail et critère de fin |
|---|---|---|---|
| ART-Q1 | L | `data/` + `public/` | **Direction artistique** « Sims réaliste » : planche de style, personnages, immeuble (10 niveaux), façade en coupe, véhicules, drones ; **pipeline de production** (sprites pré-rendus 3D, atlas compressés, budget ≤ 8 Mo premier affichage) ; **décision sur la production** (création, licence, génération assistée, `OPEN-QUESTIONS.md` n° 50) ; `data/map/ASSETS.md` à jour **avant fusion**. **Critère** : un lieu, l'immeuble niveau 1 et un bot animé rendus dans le style cible, validés par Noah avant la production en série |
| DATA-Q1 | M | `data/` | `data/map/city_v1.json` (grille, îlots, parc, fleuve, **graphe de rues**, immeuble au centre, 6 lieux avec `vehicle`, héliport) remplaçant `layout_v1.json` ; `data/map/building_v1.json` (apparence par niveau, postes par étage) ; `rules_v2.building.levels` (**10 niveaux**, seuils de **total gagné**) ; `data/map/ASSETS.md` mis à jour. Validé par `tools/validate_content.py`. **Critère** : aucune règle de jeu dans ces fichiers |
| API-Q1 | S | `api/` | `GET /api/state` gagne `building: { level, total_earned, next_level_at }`, **calculé par le serveur** à partir des **paiements d'expédition** du ledger (ni les 30 $ de départ, ni remboursements, ni actions sans gain) ; **ne baisse jamais**. Contrat dans `CONTRACTS.md` avant fusion. **Tests** : achat d'agents ne fait pas baisser le niveau, paliers exacts, paiement rejoué (idempotent) ne compte qu'une fois, le navigateur ne peut rien imposer |
| MAP-Q1 | L | `src/` | Ville plein écran : **placeholders** puis assets d'ART-Q1 (immeubles, rues, parc, fleuve), `WorldScene` (décor, caméra bornée, recentrage `H`), barre d'état et menu **en surimpression**. **Critère** : 30 images/s à 390 px ; tests purs du layout et du viewmodel |
| MAP-Q2 | L | `src/` | Bots et véhicules : marche, vélo, skate sur le **graphe de rues**, hélicoptère en courbe avec ombre ; états (garage, en route, sur place, retour, en panne) ; même trace serveur. **Critère** : `route.ts` et `trips.ts` testés (même trace ⇒ même animation) ; `prefers-reduced-motion` : apparition à destination |
| MAP-Q3 | M | `src/` | **Immeuble central** : enseigne au nom de l'entreprise (texte brut tronqué), halo et flèche « Votre siège », 10 apparences par niveau (progressives), animation de chantier non bloquante, équivalent texte permanent. **Critère** : un nouveau joueur identifie son immeuble sans aide (test utilisateur) ; niveau lu uniquement depuis l'état serveur |
| MAP-Q4 | L | `src/` | **Immeuble en coupe animée** : `BuildingScene` (Phaser), personnel qui vit (travail, ascenseur), étages cliquables, ascenseur au clavier, agents achetés à leur poste, bureaux « À recruter » pour les non achetés, retour à la ville (`Échap`). Les contenus d'étage sont des **panneaux React** (M, N, P, I). **Critère** : parcours clavier complet, repli en liste |
| MAP-Q5 | M | `src/` | **Drones de pub** : vol pendant la génération d'un kit et dépôt au Studio ; **jamais** le signe d'une diffusion ; dépend de API-P2. **Critère** : test « aucun drone si aucune génération » ; bandeau « Rien n'a été publié » toujours visible |
| UI-Q1 | M | `src/` | Libellés « lieu », « garage », « immeuble » (ids inchangés) ; mobile : feuille inférieure et coupe un étage à la fois ; file « À faire » du courrier. **Critère** : cibles ≥ 44 px, tests vitest des libellés et de la navigation |
| QA-Q1 | M | `src/` | Couche DOM équivalente (lieux, bots, drones, immeuble, étages), annonces `aria-live`, `prefers-reduced-motion`, piétons de décor masqués ; profil de performance mobile ; captures à 390 px et en grand |

### Jalon R — Immeuble jouable (priorité avant le décor de Q)
> **5e décision (2026-11-07)** : le joueur doit **entrer dans l'immeuble** et y **gérer la communication et la pub**. Ce jalon passe **avant** ART-Q1, MAP-Q1 à MAP-Q3 et MAP-Q5. Le rendu peut rester en **placeholders** et en **mode liste** ; ce qui compte est que **Clients, Pub et Archives soient utilisables**. Réfère `VILLE-ET-BATIMENT.md` §7 et §8.

| Ticket | Taille | Périm. | Travail et critère de fin |
|---|---|---|---|
| API-R1 | M | `api/` | **Migration des rôles** : énumération `Role` = `scout`, `triage`, `replier`, `ads` ; retrait de `qualifier`, `profiler`, `outreach` (données, achats existants, hangar) ; quotas `(prospect, action)` et `(conversation, rôle)` ; tri des leads par code dans `checks.py`. **Tests** : quota 5 jamais 6 sous concurrence, rôle non acheté ⇒ `ROLE_LOCKED`, aucune régression BE01–BE07 |
| DATA-R1 | S | `data/` | `data/roles/{scout,triage,replier,ads}.json` ; retrait de `qualifier.json`, `profiler.json`, `outreach.json` (ou archivage) ; `rules_v2` mis à jour ; `tools/validate_content.py` vert |
| UI-R1 | M | `src/` | **Entrer dans l'immeuble** : le clic sur le siège (et « Entrer » dans la couche DOM) ouvre l'intérieur ; **liste des étages** (Toit, Studio pub, Salle du courrier, Archives, Accueil et garage), `Échap` pour sortir. **Critère** : parcours clavier complet, repli en liste |
| UI-R2 | L | `src/` | **Salle du courrier** (Clients) : conversations, synthèse `triage`, brouillons `replier`, bandeau « rien n'a été envoyé » ; dépend de API-N1…N3 |
| UI-R3 | L | `src/` | **Studio pub** : campagnes, kit `ads`, copier, exporter, bandeau « rien n'a été publié ni dépensé » ; dépend de API-P1…P3 |
| UI-R4 | M | `src/` | **Archives** : carnet de prospection (UI-I1) et fiche prospect avec fiche client et premier message `replier` ; dépend de API-I1…I3 |
| UI-R5 | S | `src/` | Menu de raccourcis (Prospection, Clients, Pub) ouvrant directement chaque étage (UI-M1) |
| QA-R1 | S | tous | Parcours automatisé Tutoriel : expédition → carnet → fiche client → premier message → conversation simulée → kit de pub, **sans carte** ; puis avec la coupe |

**Ordre** : API-R1 et DATA-R1 → API-I1…I3, API-N*, API-P* (en parallèle) → UI-R1 → UI-R4, UI-R2, UI-R3 → UI-R5, QA-R1. `MAP-Q4` (coupe animée Phaser) vient **ensuite** et habille UI-R1 sans changer les panneaux.

### Jalon S — Ville Three.js, connexion et zooms
> **6e décision (2026-11-08)** : refonte **visuelle** en Three.js, livrée en **une seule PR**. Elle **remplace** la scène Phaser (`src/game/map/scenes/WorldScene.ts`, `art.ts`) et la piste « sprites pré-rendus » d'ART-Q1/MAP-Q1 : tout est **généré par code** (aucun fichier d'asset externe, budget premier affichage bien inférieur à 8 Mo). Est **gardée** toute la logique pure testée de `src/game/map/` (`iso`, `route`, `trips`, `bus`, `viewmodel`, `layout`, `streets`, `vehicles`, `bots`, `dispatch`, `history`) et tous les panneaux React de `src/components/{map,building}/`. Aucun contrat de jeu ne change ; **seuls les comptes sont nouveaux** (API-S1, API-S2).
>
> **À savoir avant de commencer** : la branche distante `origin/feature/threejs-city-overhaul` contient déjà un premier jet (ville seedée `src/lib/city/generate-skyline.ts`, trajectoire caméra `camera-path.ts`, `LoginScene`, `CityScene`, `/login`, et côté API `auth.py`, `routes/auth.py`, migration `0010_auth_users`, `create_test_user.py`). Elle date d'avant la refonte des sections (jalons R, N, P) : **la relire et la réutiliser** (cherry-pick ou reprise de code), ne pas la fusionner telle quelle. Elle utilise Three.js « nu » ; ce jalon choisit `@react-three/fiber` (S-DEC).
>
> **Les trois vues** : **Ciel** (connexion, très haute, nuages) → zoom → **Quartier** (vue centrale, jeu) → zoom → **Intérieur** (bureau, panneaux d'étage). Chaque transition est **réversible** ; la déconnexion ramène au Ciel par un dézoom.

#### S0 — Cadrage et contrats (avant tout code)
| Ticket | Taille | Périm. | Travail et critère de fin |
|---|---|---|---|
| S-DEC | S | doc | **Décisions écrites** dans `OPEN-QUESTIONS.md` : (1) `@react-three/fiber` + `drei` (rendu déclaratif, cohabite avec React) plutôt que Three.js impératif ; (2) abandon de Phaser **à la fin** du jalon, pas avant la parité ; (3) assets : **100 % procédural** (CC0 Kenney/Quaternius seulement en repli, avec `GLTFLoader`/`useGLTF`) ; (4) version de Three.js figée (r128 ou plus récent). **Critère** : décisions validées par l'équipe avant S1 |
| DOC-S1 | S | doc | `CONTRACTS.md` : contrat des **comptes** (inscription, connexion, déconnexion, `GET /api/auth/me`, cookie de session, codes `AUTH_REQUIRED`, `EMAIL_TAKEN`, `INVALID_CREDENTIALS`) et lien compte → parties. `RULES.md` : règle de propriété (règle 6) étendue au compte. `OPEN-QUESTIONS.md` n° 14 (comptes) passe de P2 à **fait**. **À écrire avant API-S1** |
| DOC-S2 | S | doc | `docs/VILLE-ET-BATIMENT.md` : section « Rendu Three.js » (caméra, trois vues, correspondance lieux ↔ îlots, correspondance état serveur ↔ apparence, liste des événements du `bus` qui déclenchent bots et pigeons). Mise à jour de l'en-tête de `CARTE-TECH.md` (Phaser remplacé). **Critère** : un nouveau développeur peut coder S2 à S6 sans autre explication |

#### S1 — Comptes et connexion (`api/` + `src/`)
| Ticket | Taille | Périm. | Travail et critère de fin |
|---|---|---|---|
| API-S1 | M | `api/` | **Comptes** : table `users` (e-mail normalisé unique, mot de passe haché **argon2id ou bcrypt**, jamais renvoyé ni journalisé), `POST /api/auth/register`, `/login`, `/logout`, `GET /api/auth/me` ; cookie `HttpOnly`, `SameSite=Lax`, `Secure` hors local ; limitation de tentatives ; message d'erreur identique pour e-mail inconnu et mot de passe faux. Reprendre `feature/threejs-city-overhaul` (`auth.py`, migration 0010). **Tests** : doublon d'e-mail, mot de passe faible, mot de passe absent des journaux et des réponses, brute force limité, déconnexion invalide le cookie, fixtures d'erreurs et `openapi.json` régénérés |
| API-S2 | M | `api/` | **Lier compte et partie** : un compte possède **une ou plusieurs sessions de jeu** ; après connexion, la session existante est reprise (sinon « Créer mon entreprise » en crée une) ; la vérification de propriété (règle 6) s'appuie sur le compte **sans casser** l'accès par cookie de session des tests existants. **Tests** : accès inter-comptes refusé, **313 tests BE01 à BE07 toujours verts**, idempotence conservée |
| API-S3 | S | `api/` | **Comptes de test** : `python -m app.create_test_user` (e-mail, mot de passe en argument ou variable d'environnement), jeu de 3 comptes de démo documentés dans `api/README.md` (partie neuve, partie avancée niveau 5, partie finie) ; **désactivé hors dev/démo**. **Critère** : `uv run python -m app.create_test_user` crée les comptes de façon idempotente |
| UI-S1 | M | `src/` | **Page de connexion** `/` (ou `/login`) : formulaire e-mail + mot de passe, bascule « Se connecter / Créer mon entreprise » (le second champ demande le nom de l'entreprise et enchaîne sur la fiche entreprise existante `CreateScreen`), erreurs en français affichées par code stable, états de chargement, **clavier complet**, libellés et `autocomplete` corrects. Le formulaire est un **panneau HTML par-dessus** le canvas. **Critère** : tests vitest du formulaire (champs, erreurs, double envoi bloqué) |
| UI-S2 | S | `src/` | **Garde de session** : routes du jeu redirigent vers l'accueil sans compte ; client `src/lib/api/http.ts` gère `AUTH_REQUIRED` (retour à l'accueil avec dézoom) ; **bouton Se déconnecter** dans la barre d'état. **Critère** : test de la redirection et de la déconnexion |

#### S2 — Socle Three.js (`src/`)
| Ticket | Taille | Périm. | Travail et critère de fin |
|---|---|---|---|
| UI-S3 | S | `src/` | **Dépendances et chargement à la demande** : `three`, `@react-three/fiber`, `@react-three/drei` en versions **exactes** ; composant `CityCanvas` chargé par `next/dynamic` (`ssr: false`) ; **aucune** importation Three.js dans le code serveur ; repli clair si WebGL indisponible (mode liste). **Critère** : `pnpm build` vert, bundle de la page de connexion mesuré et noté |
| UI-S4 | M | `src/lib/city/` | **Générateur de ville seedé** : `mulberry32(seed)` ; grille d'îlots, **routes** (graphe de rues à coordonnées fixes, réutilise/étend `streets.ts` et `data/map/city_v1.json` quand il existe), **grand parc**, immeubles de hauteurs variées, fleuve optionnel ; sortie = **données pures** (pas d'objets Three). **Tests** : même graine ⇒ même ville, aucune collision entre îlots, toutes les rues connectées, les 6 lieux et l'emplacement central du siège existent |
| UI-S5 | M | `src/` | **Rendu des immeubles** : `BoxGeometry` empilées, toits en pyramide (`ConeGeometry` à 4 faces, rotation de 45°), **façades** en `CanvasTexture` + `RepeatWrapping` (tuile de fenêtres dessinée en canvas, variantes jour/nuit, fenêtres allumées au hasard seedé), `MeshLambertMaterial`. **Une** texture par variante, partagée. **Critère** : 0 fichier d'image dans `public/`, textures libérées au démontage (`dispose`) |
| UI-S6 | S | `src/` | **Lumière et ombres** : `AmbientLight` + `DirectionalLight` avec ombres (`PCFSoftShadowMap`, frustum d'ombre ajusté à la ville), `ShadowMaterial` sous le socle de la ville ; ciel dégradé et brume légère. **Critère** : pas d'ombre « acnée », pas de flottement |
| UI-S7 | S | `src/` | **Routes et décor instanciés** : `InstancedMesh` pour tirets de route, arbres du parc, lampadaires ; une seule matrice par instance mise à jour hors rendu. **Critère** : < 60 appels de dessin pour tout le quartier |
| UI-S8 | M | `src/` | **Caméra orthographique isométrique** : `OrthographicCamera`, élévation `atan(1/√2)`, azimut 45° par défaut ; **rotation par glisser** (pas de bascule verticale), **zoom léger à la molette** (bornes serrées), recentrage sur le siège (touche `H`, déjà prévue), inertie douce. Contrôles écrits en **logique pure testée** (bornes, normalisation d'angle). **Critère** : la caméra ne sort jamais de la ville ; sur écran tactile, deux doigts pour pivoter et pincer pour zoomer |
| UI-S9 | S | `src/` | **Boucle et performance** : `dt` plafonné (ex. 50 ms), rendu **à la demande** quand rien ne bouge (`frameloop="demand"` hors animations), pause quand l'onglet est caché, `devicePixelRatio` plafonné à 2, repli qualité (ombres off) si < 30 images/s mesurées. **Critère** : 60 images/s sur un portable moyen, quartier complet |

#### S3 — Vue 1 : le Ciel (connexion)
| Ticket | Taille | Périm. | Travail et critère de fin |
|---|---|---|---|
| UI-S10 | M | `src/` | **Scène du Ciel** : caméra très haute et lointaine, quelques immeubles qui émergent, **nuages** (plans ou sprites de bruit générés en canvas, translucides, dérive lente, deux couches pour la profondeur), lumière douce, léger mouvement de caméra. **Critère** : lisible derrière le formulaire (contraste ≥ 4,5:1 du texte du formulaire, panneau à fond semi-opaque) |
| UI-S11 | M | `src/` | **Machine d'états des vues** `sky → district → interior` (logique pure testée, sans Three) : transitions autorisées, état « en transition » bloque les clics, **annulation** si l'utilisateur recharge ou se déconnecte en cours de route. **Tests** : chaque transition et chaque refus |
| UI-S12 | M | `src/` | **Zoom Ciel → Quartier** après connexion ou création : trajectoire de caméra (position, zoom, cible) **interpolée avec une courbe douce**, les nuages s'écartent et s'effacent, le formulaire se retire, ~2,5 s, **sauté** si `prefers-reduced-motion` (apparition directe). Reprendre `camera-path.ts` de la branche existante (interpolation exacte aux bornes). **Tests** : bornes exactes (t = 0 et t = 1), monotonie |
| UI-S13 | S | `src/` | **Dézoom à la déconnexion** : même trajectoire **inversée** vers le Ciel, nuages qui reviennent, puis formulaire. **Critère** : un test enchaîne connexion → déconnexion → connexion sans fuite mémoire (renderer, textures) |

#### S4 — Vue 2 : le Quartier (vue centrale)
| Ticket | Taille | Périm. | Travail et critère de fin |
|---|---|---|---|
| UI-S14 | M | `src/` | **Branchement état → scène** : `viewmodel.ts` et `bus.ts` pilotent la scène Three (lieux, statut débloqué/verrouillé, siège, niveau) ; **lecture seule** depuis l'état serveur, aucune valeur choisie par le navigateur. **Critère** : test « même viewmodel ⇒ même scène » (instantané des données de rendu) |
| UI-S15 | M | `src/` | **Lieux débloquables** : bâtiments distincts pour chaque lieu (Bibliothèque, Hôtel de ville, SoHo, Midtown, Wall Street, Times Square), **verrouillés** (grisés, cadenas flottant) tant que non débloqués, **déverrouillage animé** (montée du bâtiment, particules sobres) ; clic = panneau existant `PlanetPanel`. **Critère** : couche DOM `AccessibleLayer` équivalente et à jour |
| UI-S16 | L | `src/` | **Picking** : `Raycaster` (ou événements r3f) pour clic et survol des bâtiments, **surbrillance** (contour ou éclaircissement), curseur main, **tolérance au glisser** (un glisser de caméra n'est pas un clic), indépendant du redimensionnement (bug connu de la branche existante). **Tests** : logique de tolérance au glisser ; picking couvert par un test de rayon sur la géométrie |
| UI-S17 | L | `src/` | **Immeuble de l'entreprise** : au centre, reconnaissable (enseigne avec le nom en **texte brut tronqué**, halo, flèche « Votre siège »), **10 apparences progressives** (empilement de volumes, toit, antennes, héliport) pilotées par `building.level` de l'état serveur (API-Q1) ; animation de chantier au changement de niveau ; ne régresse jamais. **Critère** : test unitaire niveau → paramètres de rendu pour les 10 niveaux |
| UI-S18 | L | `src/` | **Agents en déplacement** : bots (marche, vélo, skate sur le **graphe de rues**, hélicoptère en courbe avec ombre) rejouant **la même trace** que `route.ts`/`trips.ts` ; rotation vers le sens de marche ; garage → lieu → retour ; état « en panne ». **Aucun** changement de logique de trajet. **Critère** : mêmes tests `route`/`trips`, plus un test « même trace ⇒ mêmes positions échantillonnées » |
| UI-S19 | M | `src/` | **Voitures et piétons de décor** (purement cosmétiques) : voitures sur le graphe de routes (choix de direction aux intersections par graine, interpolation position et orientation, ralentissement aux virages) via `InstancedMesh` ; piétons le long du périmètre des îlots avec **petit rebond vertical**. **Critère** : masqués avec `prefers-reduced-motion` ; ne ralentissent pas sous 30 images/s (désactivation automatique) |
| UI-S20 | M | `src/` | **Pigeons voyageurs** : un pigeon (modèle simple en primitives, battement d'ailes) part de l'immeuble **quand un message est envoyé** dans Clients (événement `bus`) et dessine une courbe de vol vers le côté de la carte, puis revient. **Garde-fou règle 13** : en Tutoriel le pigeon est marqué « simulé » ; en Réel il ne vole qu'**après confirmation serveur** de l'envoi, jamais sur un simple brouillon. **Critère** : test « aucun pigeon sans envoi » |
| UI-S21 | S | `src/` | **Barre d'état et HUD** par-dessus le canvas (argent, score, niveau de l'immeuble, boutons Tourner/Recentrer/Entrer, Se déconnecter) ; panneaux latéraux existants conservés. **Critère** : aucun élément du HUD n'est dans le canvas ; navigation clavier complète |

#### S5 — Vue 3 : l'Intérieur (bureau)
| Ticket | Taille | Périm. | Travail et critère de fin |
|---|---|---|---|
| UI-S22 | L | `src/` | **Zoom Quartier → Intérieur** : clic (ou « Entrer », ou touche `Entrée` sur le siège) ⇒ la caméra plonge vers l'immeuble, la façade devient **transparente** (coupe), la scène bascule vers le bureau ; `Échap` ou « Sortir » revient au quartier (zoom arrière). Même gestion de `prefers-reduced-motion` que S12. **Critère** : transitions réversibles, test de la machine d'états (S11) |
| UI-S23 | L | `src/` | **Scène de bureau en coupe** : étages empilés (Toit, Studio pub, Salle du courrier, Archives, Accueil et garage, cohérent avec `src/game/building/floors.ts`), pièces meublées en primitives (bureaux, écrans, étagères), **personnel/agents à leur poste** (agents achetés présents, postes « À recruter » vides), petite animation d'activité. **Critère** : le contenu visible dépend uniquement de l'état serveur |
| UI-S24 | M | `src/` | **Sélection d'un étage** : clic ou clavier sur un étage ⇒ la caméra cadre l'étage et ouvre le **panneau React existant** (`ToitPanel`, `PubPanel`, `CourrierPanel`, `ArchivesPanel`, `AccueilPanel`) **sans le modifier**. **Critère** : tous les comportements existants restent accessibles (lancer des agents, chatter avec les clients, carnet, pub) ; `BuildingView.test.tsx` et `ShortcutsMenu.test.tsx` toujours verts |
| UI-S25 | S | `src/` | **Menu de raccourcis** (Prospection, Clients, Pub) : saute directement au bon étage avec le bon zoom, depuis le quartier ou l'intérieur. **Critère** : `ShortcutsMenu.test.tsx` adapté et vert |

#### S6 — Accessibilité, repli, nettoyage, livraison
| Ticket | Taille | Périm. | Travail et critère de fin |
|---|---|---|---|
| QA-S1 | M | `src/` | **Mode liste et couche DOM** équivalents pour les trois vues (lieux, siège, étages, agents, pigeons annoncés en `aria-live`), repli automatique sans WebGL ; `prefers-reduced-motion` : plus d'animation de zoom, de nuages, de voitures, de piétons. **Critère** : parcours complet **au clavier et sans canvas** |
| QA-S2 | S | `src/` | **Performance et fuites** : profil à 390 px et en grand écran, 3 cycles connexion/déconnexion sans hausse de la mémoire GPU (`renderer.info`), appels de dessin et triangles consignés dans `docs/CARTE-TECH.md`. **Critère** : budget respecté (voir UI-S9) |
| QA-S3 | M | tous | **Parcours automatisé** : compte de test → connexion → zoom quartier → expédition d'un agent (bot visible) → clic sur le siège → Salle du courrier → envoi simulé (pigeon) → retour → déconnexion (dézoom). Aucun appel réseau réel (fournisseur `mock`, règle 9) |
| UI-S26 | S | `src/` | **Retrait de Phaser** : suppression de `scenes/WorldScene.ts`, `art.ts`, `createGame.ts`, `PhaserMap.tsx`, dépendance `phaser` de `package.json`, **uniquement** quand QA-S3 est vert et que les tests purs de `src/game/map/` passent encore. **Critère** : `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` verts ; `CLAUDE.md` et `docs/CARTE-TECH.md` mis à jour (Phaser → Three.js) |
| DOC-S3 | S | doc | Mise à jour de `CLAUDE.md` (6e décision, pile, commandes, état du dépôt), `docs/UX.md`, `docs/RECETTE.md` (parcours S) et de `README` ; captures des trois vues dans la PR |

**Ordre** : S-DEC, DOC-S1, DOC-S2 → (API-S1 → API-S2 → API-S3) en parallèle de (UI-S3 → UI-S4 → UI-S5, UI-S6, UI-S7 → UI-S8 → UI-S9) → UI-S11 → UI-S10 → UI-S1, UI-S2, UI-S12, UI-S13 → UI-S14 → UI-S15, UI-S16, UI-S17 → UI-S18, UI-S19, UI-S20, UI-S21 → UI-S22 → UI-S23 → UI-S24, UI-S25 → QA-S1, QA-S2, QA-S3 → UI-S26 → DOC-S3. **Si le temps manque** : couper dans cet ordre UI-S19 (voitures et piétons), UI-S20 (pigeons), nuages animés de UI-S10, UI-S15 (animation de déverrouillage), **jamais** la logique de propriété du compte, le mode liste, ni les contrôles des règles 13 à 15. **Définition de fini de la PR** : `pnpm typecheck && pnpm lint && pnpm test && pnpm build` et `uv run pytest` verts ; aucun fichier d'asset binaire ajouté ; `.env` non commité.

## Ordre et dépendances
`MAP01 → MAP02 → MAP03` en parallèle de `API-A1` · `MAP05/06` dépend de `API-B1` · `UI-C1/C2` dépendent de `API-C1…C3` et `DATA-C1/C2` · `API-D1/D2` dépendent de `API-C3` · `API-E1` précède `UI-E1` · `API-F1` est **indépendant** (peut démarrer dès `API-C2`, qui fixe l'interface `PlanetSource`), mais `API-F2` (première source **réelle**) est **bloqué par le jalon L** (`API-L1` à `API-L3`). Jalons produit : `DATA-H1`/`API-H1` **avant** `API-C1` (la fiche cible en Réel est la fiche du joueur) · `UI-H1` après `API-H1` · `API-I1…I4` après `API-C3` (rapport structuré) et en parallèle de `API-D*` · `UI-I1` après `API-I3` · `API-J1` après `API-I1` et `API-E1` (rôle `profiler`) · `API-K1` après `API-J1` · `API-L1…L3` après `API-I1`. **5e décision : le jalon R passe avant tout le reste de Q.** Ville (après R) : `ART-Q1` (direction artistique), car il conditionne budget et assets ; `DATA-Q1` et `API-Q1` ensuite · `MAP-Q1` après `DATA-Q1` · `MAP-Q2` et `MAP-Q3` après `MAP-Q1` · `MAP-Q4` après `MAP-Q1` et fournit les étages à `UI-N1`, `UI-P1` et `UI-I1` (qui restent d'abord jouables en **mode liste**) · `MAP-Q5` après `API-P2`. **Jalon S (6e décision)** : remplace le rendu Phaser de Q (ART-Q1 « sprites pré-rendus », MAP-Q1 à MAP-Q3, MAP-Q5) par du Three.js procédural ; MAP-Q4 (coupe) est couverte par UI-S22 à UI-S25 ; API-Q1 (`building.level`) reste un **préalable** d'UI-S17, DATA-Q1 est utile à UI-S4. Q est **indépendant** des règles : aucun jalon H à P n'attend Q. Clients et pub : `DOC-M1` (contrats) **avant** `API-N*`, `API-O*`, `API-P*` · `DATA-M1`/`API-M1`/`UI-M1` avant N et P · `API-N1…N3` après `API-I1`, `API-J1` et `API-K1` (même mécanisme d'action, brouillon `outreach` réutilisé) · `UI-N1` après `API-N3` · `API-O*` après `API-N1` et `API-L1…L3`, **bloqué** par la validation juridique et la décision n° 31 de `OPEN-QUESTIONS.md` · `API-P1…P3` après `API-J1` (mécanisme d'action), en **parallèle** de N · N et P sont **indépendants** l'un de l'autre. L'export CSV (`API-I4`) et la suppression sont **P0 et jamais conditionnés** par le score ni par l'argent. Les tickets `src/`, `api/` et `data/` d'un même jalon sont conçus pour être menés **en parallèle** si les contrats (`CONTRACTS.md`, `CARTE-TECH.md`) sont écrits d'abord.

## Collaboration
Dépôt commun, **branches courtes**, revue par une autre personne, branche principale toujours lançable. Changement de schéma ou de contrat **écrit avant fusion** et signalé immédiatement ; fixtures versionnées. Chaque personne reste dans son périmètre : interface (`src/`), API et moteur (`api/`), agents, planètes et contenu (`data/`).

**En cas de retard** : simplifier la carte (placeholders, une seule planète animée), les variantes Réel et les animations **avant** de supprimer une règle de fiabilité. Le **mode liste** (sans carte) est le périmètre de secours : il garde tout le jeu jouable.
