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
- **P1** : événements de marché, planète Actualités, animations enrichies, export du bilan, dossiers nommés, enrichissement d'un prospect par nouvelle requête de source.
- **P2** : chef d'équipe, comptes, multijoueur, génération libre de planètes, navigation web ouverte.

## Jalons
| Jalon | Vérifiable quand… |
|---|---|
| **A — Carte statique** | La carte s'affiche (base + 6 planètes), planètes cliquables, état lu depuis l'API, **couche DOM accessible** équivalente, repli en mode liste |
| **B — Agent mobile** | Un agent quitte le hangar, vole vers une planète, atterrit et revient ; rejouable depuis une trace ; `prefers-reduced-motion` respecté |
| **C — Dialogue de planète** | Un prompt envoyé produit une vraie expédition : l'agent de la planète (simulé) répond sur un corpus, bulles + transcript, rapport de leads reçu |
| **D — Notation du prompt** | Le serveur note **prompt + résultats**, paie, affiche deux scores ; carnet de prompts et diff entre versions |
| **E — Déblocages et fin** | Planètes 1 à 6 jouables, hangar (4 rôles), secours, finale et bilan ; parcours complet sans l'ancien contenu |
| **F — Mode Réel** | Au moins une planète branchée à une source réelle légale ; repli sur le simulé signalé ; **jalon L terminé** |
| **G — Finition** | Mobile 390 px, audit clavier et lecteur d'écran, recette, démo répétée |
| **H — Fiche entreprise et cible** | La fiche est saisie à la création, versionnée, lue par les agents ; en Tutoriel un exemple est pré-rempli ; à placer **avant C** (elle sert de fiche cible en Réel), en parallèle de A et B |
| **I — Carnet de prospection** | Depuis un rapport, « Ajouter au carnet » (serveur : copie + `source_ref` revérifié) ; liste triable, filtrable, recherchable ; fiche prospect, notes, statut « contacté » ; suppression ; **export CSV** neutralisant les formules ; **après C** (rapport structuré), en parallèle de D |
| **J — Agent fiche client** | Un prospect obtient une fiche (résumé, pourquoi, accroches, à vérifier, sources) par `profiler` ; coût et quota respectés ; contrôles par code ; **après I et API-E1** |
| **K — Agent premier message** | Un prospect obtient un brouillon par `outreach` ; aucun envoi ; mentions d'origine et d'opposition ; **après J** (même mécanisme d'action) |
| **L — Données personnelles et rétention** | Minimisation en liste blanche, purge de rétention, suppression en cascade, export JSON complet, journaux sans contenu personnel ; **bloque F** |

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
| API-E1 | M | `api/` | Remplacer l'énumération des rôles par `scout` / `qualifier` / `profiler` / `outreach` (migration, achat, hangar) ; déblocage par score en Tutoriel, **levé en Réel** (`RULES.md` §2) |
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

## Ordre et dépendances
`MAP01 → MAP02 → MAP03` en parallèle de `API-A1` · `MAP05/06` dépend de `API-B1` · `UI-C1/C2` dépendent de `API-C1…C3` et `DATA-C1/C2` · `API-D1/D2` dépendent de `API-C3` · `API-E1` précède `UI-E1` · `API-F1` est **indépendant** (peut démarrer dès `API-C2`, qui fixe l'interface `PlanetSource`), mais `API-F2` (première source **réelle**) est **bloqué par le jalon L** (`API-L1` à `API-L3`). Jalons produit : `DATA-H1`/`API-H1` **avant** `API-C1` (la fiche cible en Réel est la fiche du joueur) · `UI-H1` après `API-H1` · `API-I1…I4` après `API-C3` (rapport structuré) et en parallèle de `API-D*` · `UI-I1` après `API-I3` · `API-J1` après `API-I1` et `API-E1` (rôle `profiler`) · `API-K1` après `API-J1` · `API-L1…L3` après `API-I1`. L'export CSV (`API-I4`) et la suppression sont **P0 et jamais conditionnés** par le score ni par l'argent. Les tickets `src/`, `api/` et `data/` d'un même jalon sont conçus pour être menés **en parallèle** si les contrats (`CONTRACTS.md`, `CARTE-TECH.md`) sont écrits d'abord.

## Collaboration
Dépôt commun, **branches courtes**, revue par une autre personne, branche principale toujours lançable. Changement de schéma ou de contrat **écrit avant fusion** et signalé immédiatement ; fixtures versionnées. Chaque personne reste dans son périmètre : interface (`src/`), API et moteur (`api/`), agents, planètes et contenu (`data/`).

**En cas de retard** : simplifier la carte (placeholders, une seule planète animée), les variantes Réel et les animations **avant** de supprimer une règle de fiabilité. Le **mode liste** (sans carte) est le périmètre de secours : il garde tout le jeu jouable.
