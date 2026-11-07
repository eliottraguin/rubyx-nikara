# Contrats API et schémas

> Source : cahier §14, §15, puis cap prospection (2026-11-07 : `PRODUIT-PROSPECTION.md`, `PRODUIT-CLIENTS-PUB.md` §7, `VILLE-ET-BATIMENT.md` §10, `CARTE-TECH.md`). Tout changement de schéma est écrit ici **avant** fusion et signalé immédiatement à toute l'équipe. P2 publie l'OpenAPI et les fixtures JSON.
>
> **Versions** : le texte historique porte « 0.1 » en tête mais décrit déjà les versions 0.2 à 0.4 (BE01 à BE07). **Livré** = contrat v0.4, vérifié par `api/openapi.json` (18 routes). **Proposé** = contrat **v0.5** (cap prospection, clients et pub) : **aucune de ces routes n'existe encore dans l'API**, la 501 `NOT_IMPLEMENTED` ou un 404 serait renvoyé. Tout ce qui est marqué **[PROPOSÉ]** est un contrat à valider, pas un comportement livré ; les arbitrages manquants sont listés en fin de fichier (« Points à trancher »).
>
> **Vocabulaire** : mission = planète/lieu, tentative = expédition, message = instruction, livrable = rapport de leads (`PRODUIT-PROSPECTION.md` §10). Les chemins `/api/missions/*` et `/api/attempts/*` **gardent leur nom** tant que ce fichier n'est pas modifié.

## Conventions
- Réponses = objets validés (Pydantic côté API ; types TS générés/alignés côté web).
- Session : **cookie serveur opaque**. Le navigateur ne choisit jamais solde, score ni droits.
- Toute mutation exige `Idempotency-Key`. Même clé ⇒ même résultat.
- Actions longues : réponse `202 Accepted` + id d'action, le navigateur interroge `GET /api/actions/{id}`.
- Messages d'erreur en français ; jamais de clé, de prompt système privé ni de données d'une autre partie.

## Routes livrées (v0.4, BE01 à BE07)
> Le contenu servi est encore M1–M6 / 6 rôles (obsolète). Les routes et schémas, eux, sont ceux de `api/openapi.json`.

| Route | Effet |
|---|---|
| `POST /api/sessions` | Crée une partie ; retourne l'état initial + cookie. Rejouable par `Idempotency-Key` (voir « Corrections moteur ») |
| `GET /api/state` | État complet utile à l'UI + actions en cours |
| `POST /api/missions/{id}/start` | Ouvre une tentative, fige le tarif |
| `POST /api/attempts/{id}/messages` | Réserve quota+coût, lance une action vers un rôle autorisé |
| `GET /api/actions/{id}` | Statut, résultat partiel, débit confirmé, réservations |
| `POST /api/actions/{id}/confirm` | Confirme les délégations et réserve leur surcoût (sans replanification) |
| `POST /api/attempts/{id}/clarifications` | Question factuelle au client (max 2) |
| `GET /api/attempts/{id}` | Détail d'une tentative : brief et ses changements, pièces visibles, messages, versions de livrable, partages, livraisons et évaluations |
| `POST /api/attempts/{id}/artifacts` | Version manuelle ou assemblage |
| `POST /api/attempts/{id}/shares` | Partage d'une version ou d'un document avec un rôle possédé (l'agent n'accède qu'à ce qui est partagé) |
| `POST /api/attempts/{id}/submit` | Fige une version, lance l'évaluation serveur (BE06, voir « Évaluation d'une livraison ») |
| `POST /api/missions/{id}/retry` | Ouvre une reprise (historique + plafond de paiement conservés) |
| `POST /api/agents/purchase` | Achète un rôle débloqué après contrôle du solde |
| `POST /api/notebook` / `GET /api/notebook` | Enregistre / liste les prompts |
| `POST /api/demo/events` | Injecte un événement admissible (accès démo protégé) |
| `DELETE /api/session` | Supprime la partie et ses contenus personnels |

`GET /api/health` figure **déjà** dans `api/openapi.json` (schéma `HealthOut`) ; l'ancienne mention « à prévoir (BE08) » est périmée pour la route elle-même (le déploiement BE08 reste à faire). Voir « Points à trancher ».

Les routes **proposées** (v0.5) sont décrites plus bas, par section : fiche entreprise et cible, carnet de prospection, actions sur un prospect, données de la partie, clients (conversations et boîte mail), pub (campagnes), `GET /api/state` (`building`) et `trace` des actions.

## Erreurs
| Code stable | HTTP | Cas |
|---|---|---|
| `INSUFFICIENT_FUNDS` | 409 | Solde disponible insuffisant |
| `MESSAGE_LIMIT` | 409 | 5 messages atteints pour ce rôle |
| `ROLE_LOCKED` | 409 | Rôle non possédé / non débloqué |
| `INVALID_STATE` | 409 | Transition interdite |
| `VERSION_CONFLICT` | 409 | Brief/version périmé |
| `INVALID_OUTPUT` | 422 | Sortie modèle invalide après réparation |
| `INVALID_REQUEST` | 422 | Validation d'entrée |
| `RATE_LIMITED` | 429 | File/concurrence saturée |
| `SESSION_REQUIRED` | 401 | Cookie de session absent ou inconnu |
| `NOT_FOUND` | 404 | Ressource inexistante **ou appartenant à une autre session** (jamais de distinction) |
| `NOT_IMPLEMENTED` | 501 | Route du contrat pas encore implémentée |
| `INTERNAL_ERROR` | 500 | Erreur interne (message générique, sans détail) |
| `LLM_UNAVAILABLE` | 503 | Fournisseur indisponible |
| `LEAD_UNVERIFIED` | à trancher | **[PROPOSÉ]** Lead sans `source_ref` vérifiable : refusé à l'ajout au carnet |
| `MAILBOX_NOT_CONNECTED` | à trancher | **[PROPOSÉ]** Aucune boîte mail connectée (envoi, synchronisation) |
| `SEND_NOT_CONFIRMED` | à trancher | **[PROPOSÉ]** Envoi sans `confirm: true` ou sans version de brouillon existante |
| `RECIPIENT_NOT_ALLOWED` | à trancher | **[PROPOSÉ]** Destinataire autre que l'adresse du prospect de la conversation (stockée par le serveur) |
| `OPTED_OUT` | à trancher | **[PROPOSÉ]** Prospect `ecarte` ou désinscrit : envoi refusé |
| `SEND_LIMIT` | à trancher | **[PROPOSÉ]** Plafond d'envoi atteint (par jour, par heure, ou un envoi par conversation et par 24 h sans réponse) |
| `SEND_FAILED` | à trancher | **[PROPOSÉ]** Échec du fournisseur de messagerie ; le message passe `NON_ENVOYE`, rien n'est présenté comme envoyé, pas de renvoi automatique |

Les 13 premiers codes du tableau sont livrés. Les 7 codes marqués **[PROPOSÉ]** viennent de `PRODUIT-CLIENTS-PUB.md` §7 (6 codes de messagerie) et de `PRODUIT-PROSPECTION.md` §12 (`LEAD_UNVERIFIED`) ; leur statut HTTP n'est écrit dans aucun document (voir « Points à trancher »). Les codes déjà livrés (`INSUFFICIENT_FUNDS`, `MESSAGE_LIMIT`, `ROLE_LOCKED`, `INVALID_STATE`, `VERSION_CONFLICT`, `INVALID_OUTPUT`, `LLM_UNAVAILABLE`) restent valables pour les nouvelles actions.

Enveloppe d'erreur : `{"error": {"code": "...", "message": "...", "details": {...}?}}` (message en français, `details` optionnel et jamais sensible). Ajoutés en BE01 ; contrat version 0.2.

`Idempotency-Key` : unicité **par session** `(session_id, clé)` — une clé d'une autre session ne doit jamais entrer en collision.

## Schéma — sortie du client évaluateur
```json
{
  "submission_id": "sub_001",
  "rubric_version": "m1_v1",
  "out_of_scope": false,
  "criteria": [
    {"id": "price", "rating": 1.0, "evidence": "Formule à 9,90", "comment": "Prix exact"},
    {"id": "hours", "rating": 0.0, "evidence": "", "comment": "Horaires absents"}
  ],
  "client_feedback": "Ajoutez les horaires de la formule.",
  "next_action": "Corriger les informations de disponibilité"
}
```
Contient **tous** les critères de la grille. Rejet/réparation si : id inconnu, `rating` hors [0,1], preuve invalide. Le backend ignore tout champ de récompense et recalcule les contrôles déterministes.

## Schéma — plan du chef d'équipe
```json
{
  "steps": [
    {"role": "researcher", "task": "Comparer les sources", "source_ids": ["doc_1", "doc_2"]},
    {"role": "writer", "task": "Préparer la publication", "depends_on": 0}
  ],
  "summary": "Vérifier puis rédiger"
}
```
Validation serveur : ≤ 2 étapes, rôles possédés, dépendances sans cycle, pièces appartenant à la tentative. Le serveur ajoute le coût et demande confirmation. Aucun code arbitraire exécuté.

## Interface de l'adaptateur LLM
Entrée : `role`, `context`, `allowed_tools`, `expected_schema`, `max_output_tokens`.
Sortie : `content`, `tool_calls` (autorisés seulement), `usage` (si dispo), `duration_ms`, `provider_call_id`, `status`.
Deux implémentations au minimum : `mock` (déterministe, badge visible en démo) et `real` (branché après vérification AI01). Authentification, timeout, limites et statistiques sont isolés ici.

## Évaluation d'une livraison (BE06, contrat v0.3)
- `POST /api/attempts/{id}/submit` fige texte + brief + grille puis **évalue côté serveur** avant de répondre (fournisseur `mock` : instantané). La réponse porte le statut final : `status` `EVALUATED` et `attempt_status` `COMPLETED` | `FAILED` ; ou `EVALUATING` si l'évaluation n'a pas abouti (panne, sortie invalide après une réparation, grille absente). Dans ce dernier cas **aucun score, aucun paiement** : rejouer `submit` (même version) relance l'évaluation (réponse 200, `replayed: true`). Les livraisons restées `EVALUATING` sont aussi reprises au démarrage de l'API.
- Le modèle ne produit que des notes par critère (schéma « sortie du client évaluateur ») : tout champ `reward`/`score`/`payment` est ignoré. Preuve = citation littérale du livrable pour toute note > 0 d'un critère non déterministe. Une seule réparation ; au-delà, `INVALID_OUTPUT` / `LLM_UNAVAILABLE` sont journalisés dans l'`ActionRun` de type `evaluation` (jamais renvoyés au joueur avec le contenu du modèle).
- Score = `compute_score` (contrôles déterministes de la grille figée + notes du modèle), plafond essentiel = `rules.scoring.essential_failure_cap`. Le paiement `floor(gain_max × score / 100)` (différentiel sur reprise) et la clôture de la tentative sont réglés dans **une seule transaction** ; source de paiement unique par livraison.
- Appels : l'évaluation compte dans `attempt.model_calls` (les 2 appels réservés ; une reprise après échec peut consommer le reliquat du plafond de 36).
- **Changement de schéma (additif)** : `EvaluationOut.report` (objet ou `null`) = `{rubric_id, out_of_scope, client_feedback, next_action, raw_score, capped_by_essential, essential_failed[], passed, reasons[], spent, check_errors[], payment{max_reward, target, already_acquired, credited, already_awarded}}`. `criteria` = une entrée par critère (`id, label, weight, essential, kind, model_rating, deterministic_rating, rating, met, override, comment`), `evidence` = `[{id, evidence}]`. Migration Alembic `0003` (colonne `evaluations.report`). `Submission.status` prend la valeur `EVALUATED` une fois l'évaluation réglée.
- Configuration : `RUBIX_AUTO_EVALUATE` (défaut `1`) ; `0` laisse les livraisons en `EVALUATING` (tests du moteur sans évaluateur).
- Le contenu de mission du dépôt (`data/missions/<mission>/<mode>_v<N>.json`) est désormais chargé (brief, `rubric_id`) en plus de la disposition `data/missions/<mission>_<mode>_v<N>.json`.

## Corrections moteur (contrat v0.4, changements additifs)
- **Crédit de correction (M5)** : le message gratuit après un changement de brief est désormais réellement gratuit. À la réservation, si le rôle a un crédit disponible et qu'aucune action en cours ne le détient, le message coûte **0** (`ActionStepOut.free_credit = true`, `cost = 0`) ; le crédit n'est consommé qu'au règlement d'une réponse exploitable (un échec ne le consomme pas) et le message compte toujours dans le quota de 5. Pour un plan du chef, le tarif des délégations est recalculé à chaque (re)confirmation : au plus une délégation gratuite par rôle.
- **Réponses d'agents = versions de livrable** : chaque réponse exploitable d'un rôle (message ou délégation) crée une `ArtifactVersion` `author: "agent"` avec `contributions = [{role, action_id}]`, écrite par le serveur seul (le navigateur ne peut ni choisir l'auteur ni forger des contributions : `ArtifactCreate` reste `extra="forbid"`). `ActionStepOut.artifact_version_id` donne l'id. Le joueur hérite des contributions en **éditant** (`parent_id`) ou en **assemblant** (`kind: "assembly"`) ces versions : c'est ainsi que M6 compte ses ≥ 2 rôles contributeurs. Une réponse d'agent n'est pas « la première proposition » : l'événement `after_first_proposal` se déclenche à la première version du **joueur**.
- **Idempotence de la création et de la reprise** : `POST /api/sessions` avec la même `Idempotency-Key` et la même requête renvoie la **même partie** (200 au lieu de 201, aucune 2e partie, capital versé une fois). Si le cookie manque (réponse perdue), un nouveau jeton est émis : la clé, secrète côté client, prouve que l'appelant est le créateur. Même clé + autre requête : `INVALID_REQUEST`. `POST /api/missions/{id}/retry` et `/start` rejoués avec la même clé renvoient la tentative qu'elle a ouverte (200). Aucune clé n'est stockée en clair (empreintes ; migration Alembic `0004` : `game_sessions.creation_key_hash` unique + `creation_request_hash`, `mission_attempts.open_key_hash`).
- **`GameState.active_actions`** : liste typée (`id, attempt_id, type, status, created_at, updated_at`) des actions non terminées de la partie (`PENDING`, `RESERVED`, `RUNNING`, `AWAITING_CONFIRMATION`, `PARTIAL`), à suivre via `GET /api/actions/{id}`.

## Contrats proposés — cap prospection (v0.5) **[PROPOSÉ, pas encore implémenté]**
> Reportés ici **avant fusion** (règle 10) depuis `PRODUIT-PROSPECTION.md` §10 à §14, `PRODUIT-CLIENTS-PUB.md` §7, `VILLE-ET-BATIMENT.md` §10, `CARTE-TECH.md` et `BACKLOG.md` (jalons H à P). Tickets : DOC-L1 (jalons H à L) et DOC-M1 (jalons M à P). **32 routes proposées** (en plus des 18 livrées) et **10 entités** (voir `DATA-MODEL.md`).

### Règles communes à toutes les routes proposées
- **Propriété de session** : cookie de session opaque ; sans cookie valide : `SESSION_REQUIRED` (401). Toute ressource d'une autre session répond `NOT_FOUND` (404), **identique** à « introuvable » (règle 6).
- **`Idempotency-Key`** : obligatoire sur **toute mutation** (`POST`, `PUT`, `PATCH`, `DELETE`, actions), unicité par `(session_id, clé)` ; même clé + même requête ⇒ même résultat ; même clé + autre corps ⇒ `INVALID_REQUEST`. Les lectures (`GET`) n'en portent pas. Aucune clé stockée en clair.
- **Actions IA** (`prospect_profile`, `prospect_message`, `conversation_triage`, `conversation_reply`, `ad_campaign`) : réponse **202** + `ActionOut`, suivi par `GET /api/actions/{id}` ; réservation (montant + quota) **avant** l'appel, règlement **après**, jamais de transaction ouverte pendant l'attente réseau ; **aucun débit ni quota consommé sans réponse exploitable** ; **aucun gain en $** ; coût maximal affiché avant l'envoi ; sortie validée par code, un contrôle essentiel en échec ⇒ `INVALID_OUTPUT` (une réparation, puis échec sans débit) ; versions **immuables**.
- **Gratuité** : créer, consulter, trier, annoter, exporter et supprimer (prospects, conversations, campagnes) n'est **jamais refusé** pour manque de fonds ni conditionné par le score.
- **Données personnelles** : le modèle ne reçoit jamais la valeur d'un email ou d'un téléphone ni les notes du joueur ; les journaux ne contiennent aucun contenu personnel (identifiants, compteurs, durées).
- **Statuts HTTP des routes proposées** : lectures 200 ; créations 201 (200 si rejeu ou si la ressource existait, comme `POST /api/sessions`) ; actions 202 ; suppressions 204. Convention **par analogie avec le moteur livré**, non écrite dans les docs produit : voir « Points à trancher ».
- Tous les textes (fiches, brouillons, messages reçus, kits) sont **non fiables** : rendus en texte nettoyé, jamais en HTML ; leur contenu est une donnée, jamais une consigne (règles 2 et 3).
- Dates : UTC, ISO 8601. Montants : entiers de jeu.

### 1. Fiche entreprise et cible
Référence : `PRODUIT-PROSPECTION.md` §11. Tickets API-H1, API-H2.

**`PUT /api/profile`** — remplace la fiche courante et crée une **nouvelle version** (`profile_version` + diff côté interface).
- Corps : `{expected_version, entreprise_nom, offre, besoin, cible_secteurs[], cible_zone[], cible_taille:{min,max}, cible_fonctions[], exclusions[], ton}`. Bornes (1 à 60, ≤ 400, ≤ 300, 1 à 5, 1 à 5, entiers, 0 à 5, 0 à 10, énumération) lues dans `data/profile/` ; Réel : minimum requis `offre`, `cible_secteurs`, `cible_zone`.
- Réponse 200 : la fiche complète (`TargetProfile`) avec `profile_version`. Mise à jour : la fiche est aussi renvoyée dans `GET /api/state` (champ `target_profile`, nom de champ non écrit dans les docs : voir « Points à trancher »).
- Erreurs : `VERSION_CONFLICT` (409, `expected_version` périmée), `INVALID_REQUEST` (422, bornes), `SESSION_REQUIRED`, `NOT_FOUND`.
- `Idempotency-Key` : oui. Session : propriétaire seul.
- Règles : une expédition garde la version courante à son ouverture ; une livraison **fige** la version utilisée (règle 7) ; une action sur une version périmée donne `VERSION_CONFLICT`. L'ancien `company.profile` (texte ≤ 200) devient le champ `offre`.
```json
// requête
{"expected_version": 1, "entreprise_nom": "Atelier Lumière", "offre": "Éclairage sur mesure pour boutiques et restaurants.",
 "besoin": "Ambiance et consommation maîtrisée.", "cible_secteurs": ["commerce de détail", "restauration"],
 "cible_zone": ["Lyon"], "cible_taille": {"min": 3, "max": 50}, "cible_fonctions": ["gérant"],
 "exclusions": ["franchises nationales"], "ton": "vouvoiement_chaleureux"}
// réponse 200
{"profile_version": 2, "entreprise_nom": "Atelier Lumière", "...": "...", "modifie_le": "2026-11-07T10:00:00Z"}
```

> **Livré dans `api/` (API-H1, API-H2, API-Q1 ; décisions listées au point 29 de « Points à trancher »)** : `PUT /api/profile` (200, y compris au rejeu), `GET /api/state` gagne `target_profile` (fiche courante + `complete`) et `building`. Le corps utilise `cible_taille: {effectif_min, effectif_max}` (clés de `data/profile/target_profile_v1.json`), pas `{min, max}` comme l'exemple ci-dessus. Minimum requis : champs `required` en Tutoriel (fiche pré-remplie par un exemple), `required_for_real` (`offre`, `cible_secteurs`, `cible_zone`) en Réel.

### 2. Carnet de prospection
Référence : `PRODUIT-PROSPECTION.md` §12 et §14, `RULES.md` §11 et §12. Tickets API-I1 à I4. À ne pas confondre avec le **carnet de prompts** (`/api/notebook`, toujours 501).

**`POST /api/prospects`** — ajoute au carnet des leads d'un rapport.
- Corps : références **seulement** : `{expedition_id, rapport_version_id, positions: [0, 2, 3]}`. Le navigateur ne fournit **jamais** le contenu ; le serveur recopie depuis la version figée du rapport et **revérifie le `source_ref`** contre les enregistrements renvoyés pendant l'expédition.
- Réponse 200/201 : `{added: [Prospect…], already_present: [id…], refused: [{position, code: "LEAD_UNVERIFIED"}]}` (forme du bilan « n ajoutés, m déjà présents, k refusés » de UI-I2 ; la structure exacte n'est pas écrite dans les docs : voir « Points à trancher »).
- Erreurs : `LEAD_UNVERIFIED` (lead sans `source_ref` vérifiable), `NOT_FOUND`, `INVALID_REQUEST`, dépassement de la limite de 500 prospects (**code non nommé** dans les docs).
- `Idempotency-Key` : oui. Dédoublonnage `(source, source_ref)` : ajouter deux fois le même lead renvoie le **même prospect**, sans erreur ; deux ajouts concurrents ⇒ un seul prospect.
```json
// requête
{"expedition_id": "att_01", "rapport_version_id": "art_07", "positions": [0, 1]}
// réponse
{"added": [{"id": "pro_01", "entreprise": "Boulangerie Dupont", "statut": "nouveau", "fiabilite": "verifie", "simule": true}],
 "already_present": [], "refused": [{"position": 1, "code": "LEAD_UNVERIFIED"}]}
```

**`GET /api/prospects`** — liste côté serveur.
- Paramètres (requête) : tri (`pertinence`, `date_ajout`, `entreprise`, `statut`, `fiabilite`, `source` ; départage par `id`), filtres (`statut`, `source`, `fiabilite`, présence de fiche client, présence de brouillon, « à relancer »), recherche texte (entreprise, contact, fonction, notes), `limit`, `cursor`. Noms exacts des paramètres : voir « Points à trancher ».
- Réponse 200 : `{items: [Prospect…], next_cursor, counts: {nouveau, contacte, en_discussion, gagne, perdu, ecarte}}`. Les valeurs de contact sont **visibles du joueur** (pas du modèle).
- Erreurs : `INVALID_REQUEST`, `SESSION_REQUIRED`. `Idempotency-Key` : non (lecture).
```json
{"items": [{"id": "pro_01", "entreprise": "Boulangerie Dupont", "contact_fonction": "gérant", "canal": {"type": "email_generique", "valeur": "contact@exemple.test"},
  "source": "annuaire", "source_ref": "ann_0042", "pertinence": 82, "fiabilite": "simule", "statut": "nouveau", "version": 1,
  "cree_le": "2026-11-07T10:05:00Z"}], "next_cursor": null, "counts": {"nouveau": 1, "contacte": 0, "en_discussion": 0, "gagne": 0, "perdu": 0, "ecarte": 0}}
```

**`GET /api/prospects/{id}`** — détail : le prospect entier, sa provenance (`expedition_id`, `rapport_version_id`, `profile_version`), l'`instantane_source` minimisé, ses **fiches clients** et **brouillons** (versions), l'historique de statut. Erreurs : `NOT_FOUND`. Pas d'`Idempotency-Key`.

**`PATCH /api/prospects/{id}`** — le joueur ne modifie que `statut` et `notes` (≤ 2 000 caractères).
- Corps : `{version, statut?, notes?}`. `contacte_le` posé par le serveur au **premier** passage à `contacte` ; « contacté » est **déclaratif** (rien n'est envoyé). Transitions libres, horodatées.
- Réponse 200 : le prospect à jour (`version` incrémentée). Erreurs : `VERSION_CONFLICT`, `INVALID_REQUEST`, `NOT_FOUND`. `Idempotency-Key` : oui.
```json
{"version": 1, "statut": "contacte", "notes": "Appelé le matin, rappeler jeudi."}
```

**`DELETE /api/prospects/{id}`** — suppression définitive **en cascade** (fiche client, brouillons, instantané, et conversation liée). Idempotente. Réponse 204. Erreurs : `NOT_FOUND` à la première absence pertinente (rejeu avec la même clé ⇒ même résultat). `Idempotency-Key` : oui.

**Suppression de tout le carnet** : décrite dans `PRODUIT-PROSPECTION.md` §12 (« suppression de **tout le carnet** ») **sans route nommée** ; voir « Points à trancher » (non inventée ici).

**`GET /api/prospects/export.csv`** — export CSV produit **par le serveur**.
- Paramètres : mêmes filtres et tri que la liste. Lecture, propriété de session vérifiée, **gratuit, jamais refusé pour manque de fonds**.
- Réponse 200 : `text/csv`, **UTF-8 avec BOM**, séparateur `;`, fin de ligne CRLF, RFC 4180, en-tête français ; `Cache-Control: no-store` ; `Content-Disposition: attachment; filename="prospects-AAAAMMJJ.csv"` (Tutoriel : `prospects-SIMULE-AAAAMMJJ.csv`, colonne `simule` = `oui`).
- Colonnes : `id`, `entreprise`, `contact`, `fonction`, `canal_type`, `canal`, `raison_de_correspondance`, `pertinence`, `fiabilite`, `origine`, `simule`, `statut`, `notes`, `ajoute_le`, `contacte_le`, `source_ref`.
- **Neutralisation des formules** (règle 14) : toute cellule **texte** dont le premier caractère est `=`, `+`, `-`, `@`, tabulation ou retour chariot est préfixée d'une apostrophe `'`, dans **toutes** les colonnes texte (notes du joueur comprises) ; seule `pertinence` (numérique serveur) ne l'est pas. Cette neutralisation vit à un seul endroit (génération du CSV).
- Journal : nombre de lignes et durée seulement. Erreurs : `SESSION_REQUIRED`, `INVALID_REQUEST`. Pas d'`Idempotency-Key`.
```csv
id;entreprise;contact;fonction;canal_type;canal;raison_de_correspondance;pertinence;fiabilite;origine;simule;statut;notes;ajoute_le;contacte_le;source_ref
pro_01;Boulangerie Dupont;;gérant;email_generique;contact@exemple.test;Secteur et zone conformes;82;simule;annuaire;oui;nouveau;'=cmd;2026-11-07T10:05:00Z;;ann_0042
```

### 3. Actions sur un prospect (fiche client, premier message)
Référence : `PRODUIT-PROSPECTION.md` §13, `RULES.md` §11. Tickets API-J1, API-K1. Clé de quota **`(prospect, action)`** : 5, jamais 6.

**`POST /api/prospects/{id}/profile`** — action `prospect_profile` (rôle `replier`, 3 $ par génération, valeur de départ).
**`POST /api/prospects/{id}/message`** — action `prospect_message` (rôle `replier`, 2 $ par génération).
- Corps : `{instruction?}` (consigne facultative ≤ 500 caractères), et pour la cohérence de version `{profile_version?}` (champ **non écrit** dans les docs pour ces routes : voir « Points à trancher »).
- Réponse 202 : `ActionOut` (`type`: `prospect_profile` | `prospect_message`) ; à la fin, une **version** de fiche client (`FicheClient` : `resume` ≤ 600, `pourquoi_ce_prospect` 1 à 5, `points_d_accroche` 1 à 5, `a_verifier` 0 à 8, `sources`) ou de brouillon (`Brouillon` : `canal_cible` (type seulement), `objet` ≤ 90, `corps` ≤ 800, `mentions`) et la liste des **contrôles par code** réussis/échoués.
- Erreurs : `ROLE_LOCKED` (rôle non acheté ; en Réel la condition de score est levée), `INSUFFICIENT_FUNDS`, `MESSAGE_LIMIT` (6e génération par `(prospect, action)`), `VERSION_CONFLICT` (fiche entreprise périmée), `INVALID_OUTPUT` (aucun débit), `LLM_UNAVAILABLE` (aucun débit), `NOT_FOUND`, `INVALID_REQUEST`.
- `Idempotency-Key` : oui. **Aucun gain**. Le modèle reçoit l'instantané minimisé et la fiche entreprise dans un **bloc de données délimité**, jamais la valeur d'un email/téléphone ni les notes. Un brouillon est du **texte que le joueur copie** : aucun envoi, aucun `mailto:`.
- Dépense **hors finale** : ces actions n'entrent pas dans la limite de 30 $ de la finale.
```json
// POST /api/prospects/pro_01/message — requête
{"instruction": "angle : gain de temps"}
// réponse 202
{"id": "act_91", "type": "prospect_message", "status": "RUNNING", "pending_cost": 2, "steps": [], "messages_remaining": {"outreach": 4}}
```

### 4. Données de la partie (portabilité, suppression)
Référence : `PRODUIT-PROSPECTION.md` §14, `RULES.md` §12. Tickets API-L1 à API-L3.

**`GET /api/session/export`** — **JSON complet** des données de la partie (fiche entreprise, prospects, fiches, brouillons, conversations, campagnes). Lecture, **gratuite**, propriété de session vérifiée, `Cache-Control: no-store`, `Content-Disposition: attachment`. Réponse 200 : document JSON (schéma d'export non défini : voir « Points à trancher »). Erreurs : `SESSION_REQUIRED`. Pas d'`Idempotency-Key`. Ne contient jamais jeton de session, clé ni jeton de messagerie.

**`DELETE /api/session`** *(livrée, étendue)* — supprime la partie ; doit désormais **purger en cascade** prospects, fiches, brouillons, instantanés, conversations, boîte mail connectée (jeton révoqué) et campagnes, sans ligne orpheline. 204, `Idempotency-Key` : oui (déjà le cas).

**Rétention** (API-L2) : `derniere_activite_le`, rappel 30 jours avant visible **dans l'état**, action « Conserver », purge à 180 jours (horloge injectable). La **route** de « Conserver » et le **champ** d'état du rappel ne sont pas nommés dans les docs : voir « Points à trancher ».

### 5. Clients : conversations
Référence : `PRODUIT-CLIENTS-PUB.md` §3 et §7, `RULES.md` §13. Tickets API-N1 à N3. Clé de quota **`(conversation, rôle)`** : 5, jamais 6.

| Route | Effet |
|---|---|
| `POST /api/conversations` | Crée (ou renvoie) la conversation d'un prospect |
| `GET /api/conversations` | Liste |
| `GET /api/conversations/{id}` | Détail |
| `POST /api/conversations/{id}/messages` | Tutoriel : envoi **simulé** + réponse du client simulé |
| `POST /api/conversations/{id}/triage` | Action `conversation_triage` (agent `triage`) |
| `POST /api/conversations/{id}/reply` | Action `conversation_reply` (agent `replier`) |
| `PATCH /api/conversations/{id}/drafts/{draft_id}` | Copie éditée d'un brouillon (version enfant) |
| `POST /api/conversations/{id}/send` | Réel : envoi réel confirmé |
| `DELETE /api/conversations/{id}` | Suppression en cascade |

**`POST /api/conversations`** — corps `{prospect_id}`. Une seule conversation ouverte par `(session, prospect)` : rejeu ou existante ⇒ la même, 200. Réponse : `Conversation`. Erreurs : `NOT_FOUND` (prospect), `INVALID_REQUEST`. `Idempotency-Key` : oui.
```json
{"prospect_id": "pro_01"}
// réponse
{"id": "conv_01", "prospect_id": "pro_01", "simule": true, "statut_prospect": "nouveau", "dernier_message_le": null}
```

**`GET /api/conversations`** — tri par dernière activité ; filtres statut et intention ; `limit`, `cursor` ; compteurs (`À traiter`, `En attente`, `À ne plus contacter`, `Clos` côté interface : le calcul exact des bacs n'est pas écrit : voir « Points à trancher »). Réponse `{items: [Conversation…], next_cursor, counts}`. Pas d'`Idempotency-Key`.

**`GET /api/conversations/{id}`** — fil complet (`ConversationMessage[]`), dernière **synthèse** (intention, points, urgence, statut suggéré), brouillons (`ReplyDraft[]`, versions), état d'envoi (`ENVOYE` / `NON_ENVOYE`), résultat de conversation (Tutoriel, calculé par code). L'adresse du prospect n'est jamais dans une réponse destinée au modèle ; elle est affichée au joueur seulement à l'écran de confirmation.

**`POST /api/conversations/{id}/messages`** — **Tutoriel uniquement** : « Envoyer (simulé) » ajoute le message au fil, **rien ne sort**, puis le client simulé répond **à la demande** (persona par graine, plafond de **6 tours**, à la charge de la plateforme).
- Corps : `{text, draft_version_id?}` (`text` seul est documenté ; l'usage de `draft_version_id` ici n'est pas écrit : voir « Points à trancher »).
- Erreurs : `INVALID_STATE` (refusé en Réel : utiliser `send`), `NOT_FOUND`, `INVALID_REQUEST`, `OPTED_OUT` si le prospect est `ecarte`. `Idempotency-Key` : oui.
```json
{"text": "Bonjour, voici notre offre d'éclairage sur mesure…"}
// réponse 200
{"conversation_id": "conv_01", "messages": [{"id": "msg_1", "sens": "envoye", "etat": "ENVOYE", "simule": true}, {"id": "msg_2", "sens": "recu", "simule": true}]}
```

**`POST /api/conversations/{id}/triage`** — action `conversation_triage` (rôle `triage`, 1 $). **`POST /api/conversations/{id}/reply`** — action `conversation_reply` (rôle `replier`, 2 $), crée une **version de brouillon**. Corps `{instruction?}`. Réponse 202 `ActionOut`. Erreurs : `ROLE_LOCKED`, `INSUFFICIENT_FUNDS`, `MESSAGE_LIMIT` (6e par `(conversation, rôle)`), `INVALID_OUTPUT` (fait inventé, mentions d'opposition absentes, longueur ; aucun débit), `LLM_UNAVAILABLE`, `NOT_FOUND`. `Idempotency-Key` : oui. Aucun gain. Le désabonnement est détecté **par code** (mots-clés de `data/clients/optout_keywords.json`) en plus du modèle ; le code l'emporte ⇒ prospect `ecarte`, envoi verrouillé.
```json
// POST /api/conversations/conv_01/reply
{"instruction": "ton plus direct"}
// 202
{"id": "act_92", "type": "conversation_reply", "status": "RUNNING", "pending_cost": 2, "messages_remaining": {"replier": 4}}
```

**`PATCH /api/conversations/{id}/drafts/{draft_id}`** — copie **éditée** par le joueur : crée une **version enfant** (`parent_id`, auteur `joueur`), l'original reste intact. Corps `{text, objet?}`. Réponse 201 : `ReplyDraft`. Erreurs : `NOT_FOUND`, `INVALID_REQUEST`, `VERSION_CONFLICT`. `Idempotency-Key` : oui.

**`POST /api/conversations/{id}/send`** — **envoi réel**, action du joueur uniquement (aucun agent n'a d'outil d'envoi).
- Corps : `{draft_version_id, confirm: true}`. Le serveur envoie le **texte figé** de cette version, à l'**unique adresse du prospect** stockée par lui, sans copie ni copie cachée ; aucun autre destinataire n'est accepté.
- Conditions : mode Réel, boîte connectée, `confirm: true`, version de brouillon existante, prospect ni `ecarte` ni désinscrit, contrôles par code repassés, plafonds `messaging.send_per_day` (20), `messaging.send_per_hour` (5), un envoi par conversation et par 24 h sans réponse du client. **Gratuit** (jamais refusé pour manque de fonds).
- Réponse 200 : `{message_id, etat: "ENVOYE"}`. Erreurs : `INVALID_STATE` (Tutoriel), `MAILBOX_NOT_CONNECTED`, `SEND_NOT_CONFIRMED`, `RECIPIENT_NOT_ALLOWED`, `OPTED_OUT`, `SEND_LIMIT`, `SEND_FAILED` (message `NON_ENVOYE`), `INVALID_OUTPUT` (contrôles de contenu repassés), `NOT_FOUND`.
- `Idempotency-Key` : **obligatoire**, un double clic ⇒ **un seul envoi** ; réservation du créneau avant l'appel fournisseur, règlement après, aucune transaction ouverte pendant l'attente ; journal **sans contenu ni adresse**.
```json
{"draft_version_id": "drf_03", "confirm": true}
// réponse 200
{"message_id": "msg_9", "etat": "ENVOYE"}
// erreur
{"error": {"code": "SEND_LIMIT", "message": "Plafond d'envoi atteint pour aujourd'hui."}}
```

**`DELETE /api/conversations/{id}`** — suppression en cascade (messages, brouillons, synthèses). 204. `Idempotency-Key` : oui. Ne révoque pas la boîte mail.

### 6. Clients : boîte mail (mode Réel)
Référence : `PRODUIT-CLIENTS-PUB.md` §4. Ticket API-O* (**bloqué** par validation juridique et décision n° 31 de `OPEN-QUESTIONS.md`). Réel uniquement : en Tutoriel, `INVALID_STATE`. **Une seule boîte par partie.** Jetons chiffrés au repos, **jamais** renvoyés au navigateur ni journalisés.

| Route | Effet |
|---|---|
| `POST /api/mailbox/connect` | Démarre l'OAuth 2.0 (état + PKCE générés par le serveur) |
| `GET /api/mailbox/callback` | Retour OAuth (échange du code côté serveur) |
| `GET /api/mailbox` | État de connexion, adresse **masquée**, quotas d'envoi du jour |
| `POST /api/mailbox/sync` | Importe les nouveaux messages des prospects du carnet |
| `DELETE /api/mailbox` | Révoque et supprime le jeton (option : supprimer les messages importés) |

- **`POST /api/mailbox/connect`** — corps `{provider}` (liste blanche : Gmail et Microsoft 365/Outlook par défaut). Réponse 200 : `{authorization_url}` (le navigateur y est redirigé). Erreurs : `INVALID_STATE` (Tutoriel, ou boîte déjà connectée : cas non écrit), `INVALID_REQUEST` (fournisseur hors liste). `Idempotency-Key` : oui.
- **`GET /api/mailbox/callback`** — appelé par le fournisseur (`code`, `state`) ; le serveur valide `state`/PKCE et la session, échange le code, stocke le jeton, puis redirige vers l'application. Erreurs : `INVALID_REQUEST` (état inconnu), `SESSION_REQUIRED`. Pas d'`Idempotency-Key` (redirection du fournisseur ; contrôle par `state` à usage unique).
- **`GET /api/mailbox`** — `{connected, provider, address_masked: "j***@…", sent_today, sent_this_hour, limits: {per_day, per_hour}}`. Jamais de jeton. Lecture.
- **`POST /api/mailbox/sync`** — importe **seulement** les messages dont l'expéditeur correspond **exactement** à un prospect du carnet ayant une conversation ; autres messages **ignorés sans stockage** ; texte brut seul, pièces jointes ignorées, ≤ `messaging.inbound_max_chars` (4 000) ; import **idempotent** (identifiant du message du fournisseur). Réponse 200 : `{imported, ignored, opted_out}` (forme non écrite : voir « Points à trancher »). Erreurs : `MAILBOX_NOT_CONNECTED`, `INVALID_STATE` (Tutoriel), `LLM_UNAVAILABLE` n'est pas utilisé (aucun modèle). `Idempotency-Key` : oui. Un message de désinscription ⇒ prospect `ecarte`, bandeau au joueur.
- **`DELETE /api/mailbox`** — corps/paramètre `{delete_imported_messages?: bool}` (option citée, forme non écrite). Révoque chez le fournisseur, supprime le jeton. 204. `Idempotency-Key` : oui.
```json
// GET /api/mailbox
{"connected": true, "provider": "gmail", "address_masked": "j***@exemple.test", "sent_today": 3, "sent_this_hour": 1, "limits": {"per_day": 20, "per_hour": 5}}
```

### 7. Pub : campagnes
Référence : `PRODUIT-CLIENTS-PUB.md` §5 et §7, `RULES.md` §14. Clé de quota **`(campagne, rôle)`** : 5, jamais 6. **Aucune publication, aucune connexion à une plateforme publicitaire, aucune dépense réelle.**

| Route | Effet |
|---|---|
| `POST /api/campaigns` | Crée une campagne |
| `GET /api/campaigns` | Liste |
| `GET /api/campaigns/{id}` | Détail et versions de kit |
| `PATCH /api/campaigns/{id}` | Modifie les champs du joueur |
| `DELETE /api/campaigns/{id}` | Supprime |
| `POST /api/campaigns/{id}/generate` | Action `ad_campaign` (agent `ads`) |
| `PATCH /api/campaigns/{id}/versions/{version_id}` | Copie éditée (version enfant) |
| `GET /api/campaigns/{id}/export.md` | Export Markdown d'une version |

- **`POST /api/campaigns`** — corps `{nom (≤ 80), objectif (notoriete|leads|evenement|offre), plateforme (linkedin|meta|google_search|local|email), audience? (≤ 300), budget_indicatif?, consigne? (≤ 500)}`. L'`audience` est dérivée par le serveur de la fiche cible si absente. Limite `limits.campaigns_max` (20 : erreur de dépassement non nommée). Réponse 201 : `Campaign` (`version` = compteur de concurrence). Erreurs : `INVALID_REQUEST`. `Idempotency-Key` : oui.
- **`GET /api/campaigns`** / **`GET /api/campaigns/{id}`** — lectures ; le détail porte les `CampaignVersion` (kits immuables numérotés). `NOT_FOUND`.
- **`PATCH /api/campaigns/{id}`** — le joueur ne modifie que `nom`, `objectif`, `plateforme`, `audience`, `budget_indicatif`, `consigne`. Corps : ces champs + `version`. Réponse 200. Erreurs : `VERSION_CONFLICT`, `INVALID_REQUEST`, `NOT_FOUND`. `Idempotency-Key` : oui. `budget_indicatif` **ne touche jamais la monnaie du jeu**.
- **`DELETE /api/campaigns/{id}`** — suppression (versions comprises), 204, `Idempotency-Key` : oui.
- **`POST /api/campaigns/{id}/generate`** — action `ad_campaign` (rôle `ads`, 4 $ par génération) : crée une **version de kit** (`positionnement`, `audience_resume`, `accroches` 3 à 5, `textes` par format dans les limites de `data/ads/formats.json`, `brief_visuel`, `plan`, `checklist`, `a_verifier`). Corps `{consigne?}`. Réponse 202 `ActionOut`. Erreurs : `ROLE_LOCKED`, `INSUFFICIENT_FUNDS`, `MESSAGE_LIMIT`, `INVALID_OUTPUT` (fait/chiffre absent de la fiche, limite de caractères dépassée ; aucun débit), `LLM_UNAVAILABLE`, `NOT_FOUND`. `Idempotency-Key` : oui. Aucun gain. Les drones sont **cosmétiques** (jamais le signe d'une publication).
- **`PATCH /api/campaigns/{id}/versions/{version_id}`** — copie **éditée** : nouvelle version enfant (`parent_id`, auteur `joueur`) ; la version d'origine est immuable. Réponse 201. Erreurs : `NOT_FOUND`, `INVALID_REQUEST`, `VERSION_CONFLICT`. `Idempotency-Key` : oui.
- **`GET /api/campaigns/{id}/export.md`** — Markdown d'une version (paramètre de version non nommé : voir « Points à trancher »), `Content-Disposition: attachment`, `Cache-Control: no-store`. Gratuit. Pas d'`Idempotency-Key`.
```json
// POST /api/campaigns
{"nom": "Lancement automne", "objectif": "leads", "plateforme": "linkedin", "budget_indicatif": "500 € (indicatif)"}
// réponse 201
{"id": "cmp_01", "nom": "Lancement automne", "objectif": "leads", "plateforme": "linkedin", "audience": "Commerces de détail à Lyon, 3 à 50 salariés", "versions": [], "version": 1}
```

### 8. `GET /api/state` : champ `building`
Référence : `VILLE-ET-BATIMENT.md` §10. **[PROPOSÉ]**, additif, aucune nouvelle route : `GameState.building = {level, total_earned, next_level_at}`. **Calculé par le serveur** à partir du **total gagné** et des seuils de `rules_v2.building.levels` ; le navigateur ne le choisit jamais (règle 1) ; cosmétique (aucune règle de jeu n'en dépend). `next_level_at` est `null` au niveau maximal (niveaux 1 à 10 ; valeur `null` **supposée**, voir « Points à trancher »).
```json
"building": {"level": 3, "total_earned": 120, "next_level_at": 200}
```
Le même état devra aussi porter la fiche entreprise (§1) et, selon `CARTE-TECH.md`, des compteurs de prospects (`prospects_count`, `prospects_by_status` « si utile ») ; noms exacts à fixer.

### 9. `GET /api/actions/{id}` : champ `trace`
Référence : `CARTE-TECH.md` (protocole événements serveur → animations), ticket API-B1. **[PROPOSÉ]**, additif au schéma `ActionOut` livré. `trace` est une liste **ordonnée** d'événements d'expédition ; `seq` est strictement croissant, rejouer deux fois donne la même animation.
```json
"trace": [
  {"seq": 1, "type": "departed", "agent": "scout", "planet": "linkedin"},
  {"seq": 2, "type": "arrived",  "agent": "scout", "planet": "linkedin"},
  {"seq": 3, "type": "dialogue", "agent": "scout", "planet": "linkedin", "from": "agent",  "text": "…"},
  {"seq": 4, "type": "dialogue", "agent": "scout", "planet": "linkedin", "from": "planet", "text": "…"},
  {"seq": 5, "type": "returned", "agent": "scout", "report_version_id": "art_07", "leads": 7},
  {"seq": 6, "type": "failed",   "agent": "scout", "error": "LLM_UNAVAILABLE"}
]
```
- Types : `departed`, `arrived`, `dialogue`, `returned`, `failed` (`failed` à la place de `returned` en cas d'échec ; un échec technique ne débite rien). Texte de dialogue = **contenu non fiable**, rendu en texte seulement. **Aucun prompt système, clé ni raisonnement interne** dans la trace (règle 6). Inchangée par le passage à la ville (seuls sprites et véhicules changent).
- Portée : documentée pour les **actions d'expédition**. Les autres actions (`prospect_*`, `conversation_*`, `ad_campaign`) n'ont pas d'événements de trace décrits, à l'exception des **drones** qui lisent les actions `ad_campaign` (`VILLE-ET-BATIMENT.md` §10) : voir « Points à trancher ».

### 10. Rôles, actions et quotas (récapitulatif)
**5e décision (2026-11-07)** : le hangar passe à **4 rôles** (`scout`, `triage`, `replier`, `ads`) ; `qualifier`, `profiler`, `outreach` sont supprimés (voir API-R1) ; le chef d'équipe est reporté en P2. L'énumération `Role` du code livré compte encore les 6 rôles du cahier (obsolète) : **migration d'énumération** à prévoir (`RULES.md` §2). Prix et coûts (valeurs de départ de `rules_v2`) : `scout` 0, `triage` 35 (1 $), `replier` 45 (fiche client 3 $, premier message 2 $, réponse 2 $), `ads` 50 (4 $).

| Action (`type`) | Route | Rôle | Clé de quota | Plafond |
|---|---|---|---|---|
| expédition (message) | `POST /api/attempts/{id}/messages` *(livrée)* | `scout` | `(tentative, rôle)` | 5 |
| `prospect_profile` | `POST /api/prospects/{id}/profile` | `replier` | `(prospect, action)` | 5 |
| `prospect_message` | `POST /api/prospects/{id}/message` | `replier` | `(prospect, action)` | 5 |
| `conversation_triage` | `POST /api/conversations/{id}/triage` | `triage` | `(conversation, rôle)` | 5 |
| `conversation_reply` | `POST /api/conversations/{id}/reply` | `replier` | `(conversation, rôle)` | 5 |
| `ad_campaign` | `POST /api/campaigns/{id}/generate` | `ads` | `(campagne, rôle)` | 5 |

Aucune de ces cinq actions nouvelles ne rapporte de gain ; `triage`, `replier` et `ads` **n'entrent pas** dans la dépense de la finale (≤ 30 $). Les tours du client simulé (Tutoriel) sont à la charge de la plateforme (6 par conversation), pas du joueur.

## Points à trancher
> Aucune de ces questions n'est décidée ici. Chacune est un détail manquant ou une contradiction entre documents, relevée pendant DOC-L1 et DOC-M1. À arbitrer avant l'implémentation des tickets concernés.

**Contradictions entre documents**
1. **Seuils de réussite** : `RULES.md` §5 (et le dernier commit `data`) donnent **50** (ordinaire) et **60** (finale) ; `PRODUIT-PROSPECTION.md` §4, §5, §7 donne encore **60** (déblocages, ordinaire) et **70** (finale) ; `CLAUDE.md`/`PRODUIT-CLIENTS-PUB.md` ne tranchent pas. Impacte `ROLE_LOCKED` et les déblocages.
2. **Version des contrats** : l'en-tête de ce fichier portait « 0.1 » alors que le texte décrit les versions 0.2 à 0.4 ; la version proposée ici (0.5) est un choix de numérotation à confirmer.
3. **`GET /api/health`** : ce fichier la disait « à prévoir (BE08) » ; elle est déjà dans `api/openapi.json` (`HealthOut`).
4. **Nombre de rôles** : `CLAUDE.md` et `PRODUIT-PROSPECTION.md` §5 parlent de **4 rôles au MVP** ; `PRODUIT-CLIENTS-PUB.md` §6 (3e décision) en compte **7**. Ce fichier suit la 3e décision (7). `CLAUDE.md` n'est pas dans le périmètre de ce ticket.
5. **Les « trois sections »** : `PRODUIT-PROSPECTION.md` §1 dit « Seule la prospection est traitée » ; le bandeau de tête précise que ce n'est plus vrai du produit entier (3e décision).
6. **`CARTE-TECH.md` non aligné sur la ville** : il cite encore `data/map/layout_v1.json` (remplacé par `city_v1.json`, `VILLE-ET-BATIMENT.md` §10) et vise 30 images/s « sur un téléphone moyen à 390 px » alors que la cible est désormais l'ordinateur (téléphone = mode liste). Hors périmètre de ce ticket.
7. **Fixtures** : la liste de fixtures par écran (bureau, commande, atelier…) reste celle de l'ancien parcours.

**Codes d'erreur et statuts HTTP**
8. Statut HTTP de `LEAD_UNVERIFIED`, `MAILBOX_NOT_CONNECTED`, `SEND_NOT_CONFIRMED`, `RECIPIENT_NOT_ALLOWED`, `OPTED_OUT`, `SEND_LIMIT`, `SEND_FAILED` : non écrit. Par analogie avec les codes livrés, on peut envisager 422 (validation), 409 (état), 429 (plafond) et 502/503 (fournisseur), mais rien n'est décidé.
9. **Code d'erreur** de la limite de **500 prospects** (« erreur stable au-delà », `PRODUIT-PROSPECTION.md` §12) et de **20 campagnes** (`limits.campaigns_max`) : non nommé.
10. Statuts de succès des routes proposées (200/201/202/204) : convention par analogie, non écrite.

**Routes ou champs non nommés dans les docs**
11. **Suppression de tout le carnet** (`PRODUIT-PROSPECTION.md` §12) : aucune route nommée.
12. **« Conserver »** (rétention, API-L2) et **champ d'état du rappel** à 30 jours : route et champ non nommés.
13. **Fiche entreprise dans `GET /api/state`** : nom du champ (`target_profile` ?) et présence des compteurs de prospects non fixés. Toute lecture dédiée `GET /api/profile` n'est pas prévue (la fiche est lue via l'état).
14. **Paramètres de la liste de prospects** (noms, valeurs de tri, filtre « à relancer ») et de `GET /api/conversations` ; contenu exact des **bacs** du courrier (« À traiter », « En attente », « Clos », « À ne plus contacter ») et règle qui range une conversation dans un bac.
15. **Réponses de `POST /api/prospects`** (bilan ajoutés / déjà présents / refusés) et de `POST /api/mailbox/sync` : forme non écrite.
16. **Corps des actions** `profile` / `message` / `triage` / `reply` / `generate` : seule la consigne facultative (≤ 500) est documentée ; pas de champ de version de fiche entreprise nommé alors que `VERSION_CONFLICT` est annoncé pour une version périmée.
17. **`POST /api/conversations/{id}/messages`** : lien avec le brouillon (« Utiliser ce brouillon ») et avec `draft_version_id` non précisé ; le brouillon `replier` (premier message) (stocké sur le prospect) n'a pas de route décrite pour devenir le premier message d'une conversation.
18. **`DELETE /api/mailbox`** : forme de l'option « supprimer aussi les messages importés » (paramètre ou corps).
19. **`POST /api/mailbox/connect`** : comportement si une boîte est déjà connectée ; liste exacte des fournisseurs (Gmail, Microsoft 365/Outlook proposés ; IMAP/SMTP à étudier, `OPEN-QUESTIONS.md`).
20. **Export JSON de la partie** (`GET /api/session/export`) : schéma et contenu exact non définis (la mention des conversations et campagnes vient de `PRODUIT-CLIENTS-PUB.md` §4 et n'est pas reprise pour les campagnes).
21. **Export Markdown d'une campagne** : paramètre de choix de version non nommé.
22. **Stockage de la fiche client et du brouillon `replier` (premier message)**, et de la **synthèse** `triage` : les docs parlent de « versions immuables » sans nommer l'entité ni la table (voir `DATA-MODEL.md`).
23. **`building.next_level_at`** au niveau maximal : valeur non précisée (`null` supposé). Seuils de `rules_v2.building.levels` : valeurs non écrites.
24. **Trace des actions non-expédition** (`prospect_*`, `conversation_*`, `ad_campaign`) : seul le protocole d'expédition est décrit ; les drones lisent `ad_campaign` sans événement défini.
25. **Suppression d'un prospect et conversation** : la cascade vers la conversation est déduite de « suppression en cascade avec le prospect, la conversation et la partie » (`PRODUIT-CLIENTS-PUB.md` §4) ; l'effet sur une conversation déjà envoyée en Réel n'est pas précisé.
26. **Quota partagé ou séparé** : « 5 générations par `(conversation, rôle)` » est clair pour `triage` et `replier` (deux clés) ; on suppose qu'un rôle a sa propre clé par entité, sans autre précision.
27. **Appels fournisseur de messagerie** : `RATE_LIMITED` (429, livré) peut-il couvrir une limite côté fournisseur, ou est-ce `SEND_FAILED` ? Non écrit.
28. **Bloquants juridiques** : l'implémentation des routes `/api/mailbox*` et `/api/conversations/{id}/send` est conditionnée par la validation juridique et `OPEN-QUESTIONS.md` n° 24, 25 et 31 ; ce fichier les décrit sans lever ce blocage.

## Fixtures par écran
Un fichier JSON d'exemple par écran de `UX.md` : accueil, création, bureau, commande, atelier, boutique, livraison, retour client, carnet/fin ; plus les états limites (chargement, quota atteint, fonds insuffisants, agent verrouillé, évaluation en attente, déjà payé). **Livrées (ancien parcours)** : `api/` les exporte (`app.export_fixtures`). **[PROPOSÉ]** à ajouter pour les contrats v0.5 : fiche entreprise, carnet (liste, détail, ajout), fiche client, brouillon, conversation (Tutoriel et Réel), boîte mail, campagne et kit, états `LEAD_UNVERIFIED` / `SEND_LIMIT` / `OPTED_OUT`. Voir aussi le point 7 de « Points à trancher ».

## Versionnage
Rôles dans des fichiers d'instructions, missions/planètes dans des fichiers de données, grilles sous ids stables (`m1_v1`…, puis `prospect_fiche_v1`, `prospect_message_v1`, `conversation_synthese_v1`, `conversation_reponse_v1`). Valeurs chiffrées dans `data/rules/rules_v2.json`. Chaque appel journalise les versions utilisées (rôle, planète, grille, version de la fiche entreprise).

**Décisions prises à l'implémentation de API-H1, API-H2 et API-Q1 (`api/`, à confirmer)**
29. a) **Statut** de `PUT /api/profile` : 200 (création de version comme rejeu), convention du moteur livré ; erreurs 401 `SESSION_REQUIRED`, 409 `VERSION_CONFLICT`, 422 `INVALID_REQUEST` (bornes, clé réutilisée pour une autre requête, champ inconnu). Aucun 404 : la route n'a pas d'identifiant, la partie vient du cookie seul (une autre partie n'est donc pas adressable ; un `session_id` dans le corps est refusé).
b) **Nom du champ d'état** (point 13) : `GameState.target_profile` (= `TargetProfile` : champs de la fiche, `profile_version`, `modifie_le`, `complete`). `complete` est vrai si les champs `required_for_real` sont renseignés. Pas de `GET /api/profile` ni de compteurs de prospects.
c) **`cible_taille`** : `{effectif_min, effectif_max}` ou `null` (bornes de `target_profile_v1.json`, `min <= max`) ; l'exemple de la section 1 (`{min, max}`) est à corriger côté contrat.
d) **Minimum requis** : le fichier de spécification porte `required` (Tutoriel) et `required_for_real` (Réel) ; le serveur applique `required` en Tutoriel et `required_for_real` en Réel (un champ non requis peut rester vide). Bornes toujours contrôlées ; erreurs de validation sans la valeur reçue.
e) **Versions** : une ligne immuable par version (`target_profile_versions`, trigger sans `UPDATE`), version 1 créée avec la partie (Tutoriel : exemple de `data/profile/examples/` choisi par empreinte du nom de l'entreprise, `entreprise_nom` = nom de la partie ; Réel : fiche vide) ; l'ancien `company.profile` devient `offre` (le champ historique `company.profile` de l'état reste inchangé). Parties existantes : migration 0005, version 1 = nom + ancien profil. Un `PUT` identique crée quand même une nouvelle version.
f) **Idempotence** : même `Idempotency-Key` + même corps (y compris `expected_version`) renvoie la version créée par cette clé, sans écriture, même si des versions plus récentes existent ; même clé + autre corps : 422. Concurrence : un seul des écrits ayant la même `expected_version` réussit, les autres reçoivent `VERSION_CONFLICT`.
g) **Agents** (point 16) : le bloc `[FICHE ENTREPRISE ET CIBLE vN]` (Réel : `[FICHE CIBLE (mode Réel) vN]`) est ajouté en tête du contexte des messages d'agents et des délégations du chef ; version figée à l'ouverture de l'expédition (`mission_attempts.profile_version`) ; JSON sur une ligne entre `<<<FICHE nonce=…>>>` et `<<<FIN FICHE nonce=…>>>`, nonce dérivé du contenu, délimiteurs retirés des valeurs. **Aucun champ de version n'est ajouté** aux corps des actions : une action ne produit donc pas de `VERSION_CONFLICT` sur la fiche (la version d'ouverture fait foi). L'évaluateur et le client simulé ne reçoivent pas la fiche.
h) **`building`** (point 23) : `total_earned` = somme des écritures de ledger `reward` (paiements d'expédition, différentiels >= 0) ; exclus : capital de départ, achats, coûts d'actions, écritures d'autres catégories ; `next_level_at` = `null` au niveau 10. Les seuils sont ceux de `rules_v2.building.levels`.
i) **`rules_v2`** est chargé en plus de `rules_v1` (qui reste le moteur) : `app.state.rules_v2`, fichier et fiche de spécification exigés au démarrage (`ConfigError` lisible sinon). `contracts_version` reste inchangée.
