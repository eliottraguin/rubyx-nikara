# Contrats API et schémas

> Source : cahier §14, §15, puis cap prospection (2026-11-07 : `PRODUIT-PROSPECTION.md`, `PRODUIT-CLIENTS-PUB.md` §7, `VILLE-ET-BATIMENT.md` §10, `CARTE-TECH.md`). Tout changement de schéma est écrit ici **avant** fusion et signalé immédiatement à toute l'équipe. P2 publie l'OpenAPI et les fixtures JSON.
>
> **État au 2026-11-08.** La source de vérité des routes est le code (`api/app/routes/*.py`) puis `api/openapi.json`. L'`openapi.json` du dépôt est **périmé pendant le retrait de l'ancien moteur** (il décrit encore `/api/attempts/*` et `/api/missions/*`) : il sera régénéré à la fin d'API-R2. Chaque section ci-dessous porte son statut : **IMPLÉMENTÉ** (route présente dans le code), **NON LIVRÉ** (décrit, pas de route) ou **RETIRÉ** (6e décision).
>
> **6e décision (2026-11-08, `PARCOURS-BOT.md`).** Pas d'atelier : le joueur remplit sa fiche, un bot `scout` cherche, les prospects arrivent au carnet, « Contacter » ouvre une conversation. **RETIRÉS du contrat** (code **en cours de retrait**, ticket API-R2, migration 0015) : `POST /api/attempts/{id}/clarifications`, `/submit`, `/messages`, `/artifacts`, `/shares`, `GET /api/attempts/{id}`, le brief et ses changements, le crédit de correction, le schéma « sortie du client évaluateur », `POST /api/missions/{id}/start` et `/retry`, `POST /api/demo/events`, `/api/notebook`, `POST /api/prospects` (ajout depuis un rapport), `POST /api/actions/{id}/confirm` (plan du chef d'équipe). **En remplacement (IMPLÉMENTÉ)** : `POST /api/searches`, tri de pertinence par prospect, `POST /api/prospects/{id}/contact`, assistants (section 12).
>
> **Vocabulaire** : lieu = ex-planète (identifiants techniques `planet`, `planet_id` conservés) ; recherche = ce que lance le joueur sur un lieu ; génération = un appel d'agent sur une cible (prospect, conversation, campagne). Les mots mission, tentative, expédition, livrable désignent l'ancien moteur (en cours de retrait).

## Conventions
- Réponses = objets validés (Pydantic côté API ; types TS générés/alignés côté web).
- Session : **cookie serveur opaque**. Le navigateur ne choisit jamais solde, score ni droits.
- Toute mutation exige `Idempotency-Key`. Même clé ⇒ même résultat.
- Actions longues : réponse `202 Accepted` + id d'action, le navigateur interroge `GET /api/actions/{id}`.
- Messages d'erreur en français ; jamais de clé, de prompt système privé ni de données d'une autre partie.

## Routes livrées (état du code au 2026-11-08)
| Route | Effet | Section |
|---|---|---|
| `POST /api/sessions` | Crée une partie ; retourne l'état initial + cookie. Rejouable par `Idempotency-Key` | Conventions |
| `GET /api/state` | État complet utile à l'UI (solde, hangar, lieux, `target_profile`, `building`, `clients_obtained`, actions en cours) | 8 |
| `DELETE /api/session` | Supprime la partie et ses contenus personnels | 4 |
| `GET /api/health` | Santé (`HealthOut`) ; `GET /api/ready` hors schéma | |
| `GET /api/actions/{id}` | Statut, résultat, débit confirmé, réservations d'une action | 10 |
| `POST /api/agents/purchase` | Achète un rôle débloqué après contrôle du solde | 8 |
| `PUT /api/profile` | Nouvelle version de la fiche entreprise et cible | 1 |
| `POST /api/searches`, `GET /api/searches`, `GET /api/searches/{id}` | Recherche du bot `scout` (gratuite) | 11 |
| `GET /api/prospects`, `GET /api/prospects/{id}`, `PATCH /api/prospects/{id}`, `DELETE /api/prospects/{id}`, `DELETE /api/prospects` (vider le carnet), `GET /api/prospects/export.csv` | Carnet de prospection | 2 |
| `POST /api/prospects/{id}/contact` | Ouvre la conversation du prospect | 11 |
| `POST /api/prospects/{id}/profile`, `POST /api/prospects/{id}/message`, `GET /api/prospects/{id}/drafts`, `PATCH /api/prospects/{id}/drafts/{draft_id}` | Fiche client et premier message (`replier`) | 3 |
| `POST/GET /api/conversations`, `GET/DELETE /api/conversations/{id}`, `POST .../messages`, `POST .../triage`, `POST .../reply`, `PATCH .../drafts/{draft_id}` | Messagerie simulée | 5 |
| `POST /api/conversations/{id}/send` | **501 `NOT_IMPLEMENTED`** : envoi réel non livré | 5 |
| `POST/GET /api/campaigns`, `GET/PATCH/DELETE /api/campaigns/{id}`, `POST .../generate`, `PATCH .../versions/{version_id}`, `GET .../export.md` | Pub | 7 |
| `POST/GET /api/assistant/plans`, `GET /api/assistant/plans/{id}`, `POST .../confirm` (202), `POST .../reject` | Assistants | 12 |
| `POST /api/demo/reset`, `GET /api/ops/usage` | Outils d'exploitation (accès protégé, hors contrat joueur) | |

**NON LIVRÉS** (décrits plus bas) : `GET /api/session/export`, rétention (« Conserver »), toutes les routes `/api/mailbox*`, `trace` des actions.

## Erreurs
| Code stable | HTTP | Cas |
|---|---|---|
| `INSUFFICIENT_FUNDS` | 409 | Solde disponible insuffisant |
| `MESSAGE_LIMIT` | 409 | 5 générations atteintes pour cette cible et cette action |
| `ROLE_LOCKED` | 409 | Rôle non possédé / non débloqué |
| `INVALID_STATE` | 409 | Transition interdite |
| `VERSION_CONFLICT` | 409 | Version périmée (fiche entreprise, brouillon, prospect, campagne) |
| `INVALID_OUTPUT` | 422 | Sortie modèle invalide après réparation |
| `INVALID_REQUEST` | 422 | Validation d'entrée |
| `RATE_LIMITED` | 429 | File/concurrence saturée |
| `SESSION_REQUIRED` | 401 | Cookie de session absent ou inconnu |
| `NOT_FOUND` | 404 | Ressource inexistante **ou appartenant à une autre session** (jamais de distinction) |
| `NOT_IMPLEMENTED` | 501 | Route du contrat pas encore implémentée |
| `INTERNAL_ERROR` | 500 | Erreur interne (message générique, sans détail) |
| `LLM_UNAVAILABLE` | 503 | Fournisseur indisponible |
| `LEAD_UNVERIFIED` | 422 | Lead sans `source_ref` vérifiable : refusé à l'ajout au carnet (dans une recherche : écarté, code `UNVERIFIED`) |
| `PROFILE_INCOMPLETE` | 409 | Recherche refusée : `offre`, `cible_secteurs` ou `cible_zone` vide |
| `PLANET_LOCKED` | 409 | Recherche sur un lieu pas encore débloqué (la raison est donnée en français) |
| `MAILBOX_NOT_CONNECTED` | à trancher | **[PROPOSÉ]** Aucune boîte mail connectée (envoi, synchronisation) |
| `SEND_NOT_CONFIRMED` | à trancher | **[PROPOSÉ]** Envoi sans `confirm: true` ou sans version de brouillon existante |
| `RECIPIENT_NOT_ALLOWED` | à trancher | **[PROPOSÉ]** Destinataire autre que l'adresse du prospect de la conversation (stockée par le serveur) |
| `OPTED_OUT` | 409 | Prospect `ecarte` ou désinscrit : envoi refusé |
| `SEND_LIMIT` | à trancher | **[PROPOSÉ]** Plafond d'envoi atteint (par jour, par heure, ou un envoi par conversation et par 24 h sans réponse) |
| `SEND_FAILED` | à trancher | **[PROPOSÉ]** Échec du fournisseur de messagerie ; le message passe `NON_ENVOYE`, rien n'est présenté comme envoyé, pas de renvoi automatique |

Les codes sans mention **[PROPOSÉ]** existent dans `api/app/errors.py`. Les codes **[PROPOSÉ]** restants (`MAILBOX_NOT_CONNECTED`, `SEND_NOT_CONFIRMED`, `RECIPIENT_NOT_ALLOWED`, `SEND_LIMIT`, `SEND_FAILED`) viennent de `PRODUIT-CLIENTS-PUB.md` §7 et ne seront livrés qu'avec l'envoi réel ; leur statut HTTP n'est écrit dans aucun document (voir « Points à trancher »). Les codes déjà livrés (`INSUFFICIENT_FUNDS`, `MESSAGE_LIMIT`, `ROLE_LOCKED`, `INVALID_STATE`, `VERSION_CONFLICT`, `INVALID_OUTPUT`, `LLM_UNAVAILABLE`) restent valables pour les nouvelles actions.

Enveloppe d'erreur : `{"error": {"code": "...", "message": "...", "details": {...}?}}` (message en français, `details` optionnel et jamais sensible). Ajoutés en BE01 ; contrat version 0.2.

`Idempotency-Key` : unicité **par session** `(session_id, clé)` — une clé d'une autre session ne doit jamais entrer en collision.

## Schéma — sortie du client évaluateur **[RETIRÉ (6e décision)]**
Remplacé par le verdict de pertinence par prospect (section 11). Le code correspondant est en cours de retrait (API-R2).

## Schéma — plan du chef d'équipe **[RETIRÉ (6e décision)]**
Remplacé par le **plan d'assistant** (section 12 et `ASSISTANT.md` §4).

## Interface de l'adaptateur LLM
Entrée : `role`, `context`, `allowed_tools`, `expected_schema`, `max_output_tokens`.
Sortie : `content`, `tool_calls` (autorisés seulement), `usage` (si dispo), `duration_ms`, `provider_call_id`, `status`.
Deux implémentations au minimum : `mock` (déterministe, badge visible en démo) et `real` (branché après vérification AI01). Authentification, timeout, limites et statistiques sont isolés ici.

## Évaluation d'une livraison (BE06) **[RETIRÉ (6e décision)]**
`POST /api/attempts/{id}/submit`, `EvaluationOut.report`, le score `compute_score`, le paiement `floor(gain_max × score / 100)`, `RUBIX_AUTO_EVALUATE` et les migrations `0003` associées décrivent l'ancien moteur : **en cours de retrait (API-R2, migration 0015)**. Plus de score ni de paiement par expédition ; l'argent entre par les clients obtenus (section 8).

## Corrections moteur (contrat v0.4, changements additifs)
- **GARDÉ** : **idempotence de la création de partie** : `POST /api/sessions` avec la même `Idempotency-Key` et la même requête renvoie la **même partie** (200 au lieu de 201, aucune 2e partie, capital versé une fois). Si le cookie manque (réponse perdue), un nouveau jeton est émis : la clé, secrète côté client, prouve que l'appelant est le créateur. Même clé + autre requête : `INVALID_REQUEST`. Aucune clé n'est stockée en clair (empreintes).
- **GARDÉ** : `GameState.active_actions` : liste typée des actions non terminées de la partie, à suivre via `GET /api/actions/{id}` (à relire à la fin d'API-R2 : le champ `attempt_id` appartient à l'ancien moteur).
- **RETIRÉ (6e décision)** : crédit de correction (M5), réponses d'agents comme `ArtifactVersion` de tentative, contributions, reprise (`retry`), idempotence de `retry` et `start`. Code **en cours de retrait** (API-R2).

## Contrats du cap prospection (v0.5) **[majoritairement IMPLÉMENTÉ ; statut par section]**
> Statuts au 2026-11-08 : §1 fiche **IMPLÉMENTÉ** ; §2 carnet **IMPLÉMENTÉ** (sauf l'ajout depuis un rapport, RETIRÉ) ; §3 brouillons **IMPLÉMENTÉ** ; §4 export JSON et rétention **NON LIVRÉS** (`DELETE /api/session` livrée) ; §5 conversations **IMPLÉMENTÉ** sauf `send` (501) ; §6 boîte mail **NON LIVRÉ** ; §7 pub **IMPLÉMENTÉ** ; §8 état **IMPLÉMENTÉ** ; §9 `trace` **NON LIVRÉ** ; §10 récapitulatif ; §11 recherches **IMPLÉMENTÉ** ; §12 assistants **IMPLÉMENTÉ**. Les corps et exemples ci-dessous restent ceux écrits avant l'implémentation : en cas d'écart, le code fait foi.
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
Référence : `PRODUIT-PROSPECTION.md` §12 et §14, `RULES.md` §11 et §12. Tickets API-I1 à I4. `/api/notebook` (carnet de prompts) est retiré avec l'ancien moteur.

**`POST /api/prospects`** — **RETIRÉ (6e décision), route absente du code, remplacé par la section 11** : l'ajout au carnet est fait **par le serveur à la fin d'une recherche** ; plus de rapport livré ni de références d'expédition/version de rapport. Ancien contrat, conservé comme trace (code livré en API-I) : ajoute au carnet des leads d'un rapport.
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

**`PATCH /api/prospects/{id}`** — le joueur ne modifie que `statut` et `notes` (≤ 2 000 caractères). **Passage à `gagne` (API-S4)** : refusé `409 INVALID_STATE` tant que la conversation du prospect n'a reçu aucun message du prospect ; sinon il écrit le gain unique `client_reward` (voir `GET /api/state`, champ `building`).
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

### 3. Actions sur un prospect (fiche client, premier message) **[IMPLÉMENTÉ, API-J1 et API-K1, migration `0014_prospect_drafts`]**
Référence : `PRODUIT-PROSPECTION.md` §13, `RULES.md` §11. Clé de quota **`(prospect, action)`** : 5, jamais 6 (compteur `target_action_uses`, `kind = prospect`, `key` = l'action, réservé sous `BEGIN IMMEDIATE` avec l'argent).

**`POST /api/prospects/{id}/profile`** — action `prospect_profile` (rôle `replier`, 3 $ par génération, lu dans `rules_v2.prospect_actions`).
**`POST /api/prospects/{id}/message`** — action `prospect_message` (rôle `replier`, 2 $ par génération).
- Corps facultatif `DraftActionIn` (`extra="forbid"`) : `{instruction?: string ≤ limits.player_instruction_max_chars (500, sinon INVALID_REQUEST 422), profile_version?: int}`. `profile_version` périmée (≠ version courante de la fiche entreprise) : `VERSION_CONFLICT` 409, rien n'est réservé. La consigne est une **donnée** (délimiteurs retirés, adresses et numéros masqués) ; elle ne constitue pas une source de faits pour les contrôles.
- Réponse **202** `ProspectActionOut` = `ActionOut` + `prospect_id`, `version: ProspectDraftOut | null` (la version créée, aussi dans `steps[0].artifact_version_id`), `pending_cost` (`null` si terminée) ; `messages_remaining = {"replier": générations restantes pour CETTE action sur ce prospect}`. `type` : `prospect_profile` | `prospect_message`. L'action est exécutée avant la réponse (comme `reply`) : `status` vaut `SUCCEEDED` ; un échec relance l'erreur stockée (même clé ⇒ même erreur).
- Erreurs : `ROLE_LOCKED` 409 (rôle non acheté ; vérifié avant le quota et l'argent), `MESSAGE_LIMIT` 409 (6e génération), `INSUFFICIENT_FUNDS` 409 (le quota réservé est annulé avec la transaction), `VERSION_CONFLICT` 409, `INVALID_OUTPUT` 422 (contrôle essentiel en échec **après une réparation**, aucun débit, génération rendue), `LLM_UNAVAILABLE` 503 (aucun débit), `NOT_FOUND` 404 (prospect inconnu ou d'une autre partie), `INVALID_REQUEST` 422, `SESSION_REQUIRED` 401. `Idempotency-Key` : oui (rejeu : même action, aucun second appel ni débit ; même clé et autre corps : `INVALID_REQUEST`). **Aucun gain** ; le ledger porte `action_cost:prospect:{prospect_id}:{action_id}` (jamais de contenu).
- Mécanique : quota + argent réservés et commit **avant** l'appel ; appel hors transaction (`allowed_tools = []`, aucun outil d'envoi) ; une seule réparation (`purpose` `prospect_*_repair`) ; règlement atomique (débit, quota consommé, version). Prospect supprimé pendant l'appel : `INVALID_STATE`, rien n'est débité. Interruption du serveur : la génération réservée est rendue au démarrage (`reconcile_prospect_actions`).
- Le modèle reçoit : le bloc **fiche entreprise** (`[FICHE …]`), le bloc **prospect** délimité (`entreprise`, `fonction`, `canal_type`, `source`, `source_ref`, `collecte_le`, `signal`, `raisons_fit`, instantané minimisé), pour le message les **mentions standard** (`data/clients/mentions_v1.json`) et le ton de la fiche. **Jamais** la valeur d'un email ou d'un téléphone (masquée par `[contact masqué]`, `[adresse masquée]`, `[numéro masqué]`), **ni le nom du contact, ni les notes du joueur**. Schémas fournis : titres `ProspectFiche` et `ProspectMessage`.
- `ProspectDraftOut` : `{id, prospect_id, kind: "fiche"|"message", numero (par prospect et par kind, à partir de 1), parent_id, auteur: "agent"|"joueur", fiche: FicheClient|null, message: Brouillon|null, controles: Controle[], consigne, profile_version, simule, action_id, created_at}`. `Controle` = `{id, label, essentiel, reussi, detail?}` (identifiants de la grille).
  - `FicheClient` : `{resume (≤ 600), pourquoi_ce_prospect: [{texte, critere, champ}] (1 à 5 ; `critere` = champ de la fiche entreprise et cible, `champ` = champ du prospect ou de son instantané), points_d_accroche: string[] (attendus 1 à 5 ; tronqué à 5), a_verifier: string[] (0 à 8 ; tronqué à 8), sources: string[] (⊂ `source_ref` du prospect)}`.
  - `Brouillon` : `{canal_cible: email_generique|formulaire|adresse|telephone_standard|reseau_pro (type seulement), objet (≤ 90, tronqué), corps (≤ limits.draft_max_chars 800), mentions: ("origine"|"opposition")[] (détectées par le code)}`. Un `canal_cible` absent de la sortie prend le type de canal du prospect.
- **Contrôles par code** (grilles `data/rubrics/prospect_fiche_v1.json` et `prospect_message_v1.json`, ids repris tels quels ; `essentiel` comme dans la grille). Essentiels bloquants : sections présentes, longueurs, nombre de raisons (fiche) ; sources existantes ; **aucun fait absent** (montant, pourcentage, délai, mois, affirmation « gratuit/garanti/label… », **nombre** et **nom propre** absents de l'enregistrement du prospect et de la fiche entreprise) ; aucune URL absente (fiche : de l'enregistrement ; message : et aucun nombre absent) ; **mentions d'origine et d'opposition** (message) ; aucune promesse chiffrée ; aucune adresse ni aucun numéro ; texte brut (ni balise, ni lien Markdown, ni `mailto:`) ; `canal_cible` connu. Non essentiels (signalés, non bloquants) : raisons reliées à un critère et à un champ, nombre d'accroches, `a_verifier` borné et non vide si une donnée manque ou est plus ancienne que `retention_days`, objet ≤ 90, ton conforme (vouvoiement/tutoiement).
- **Éditer** : `PATCH /api/prospects/{id}/drafts/{draft_id}` (`DraftEditIn`, `extra="forbid"` : fiche → `resume`, `points_d_accroche`, `a_verifier` ; message → `corps`, `objet`), `Idempotency-Key` oui, gratuit. 201 `ProspectDraftOut` : version enfant (`parent_id`, `auteur: "joueur"`, `action_id: null`, `numero` suivant), contrôles repassés **à titre d'information** (ils ne bloquent pas le joueur). Erreurs : `NOT_FOUND`, `VERSION_CONFLICT` (la version a déjà un enfant : éditer la plus récente), `INVALID_REQUEST` (champ d'un autre type, corps vide, texte trop long). L'original reste intact (trigger SQLite : aucun UPDATE).
- **Lire** : `GET /api/prospects/{id}/drafts` → `{fiches: ProspectDraftOut[], messages: ProspectDraftOut[], quota_restant: {prospect_profile: n, prospect_message: n}, couts: {prospect_profile: n, prospect_message: n}}` (par numéro croissant) ; `GET /api/prospects/{id}` remplit `fiches` et `brouillons` (mêmes objets) ; `GET /api/prospects?avec_fiche=` et `avec_brouillon=` filtrent (true : au moins une version ; false : aucune).
- **Suppression** : un prospect supprimé (`DELETE /api/prospects/{id}`, purge du carnet, suppression de la partie) emporte ses versions et ses compteurs de quota.
- **Premier message dans la conversation (point 17)** : `POST /api/conversations/{id}/messages` accepte `draft_version_id` = l'`id` d'une version `kind: "message"` du **même prospect** que la conversation (en plus des brouillons de réponse de cette conversation). Corps : `{text, draft_version_id}` ; `text` (relu et éventuellement édité par le joueur, ≤ `messaging.reply_max_chars`) est le texte envoyé, la version n'est que la référence (`ConversationMessageOut.draft_version_id`). Tutoriel : envoi simulé, rien ne sort, gratuit. Une fiche, la version d'un autre prospect ou un id inconnu : `INVALID_REQUEST` 422. Aucune règle d'envoi ni de plafond ne change ; l'envoi réel (`/send`) reste non livré.
```json
// POST /api/prospects/pro_01/message — requête
{"instruction": "angle : gain de temps"}
// réponse 202 (extrait)
{"id": "act_91", "type": "prospect_message", "status": "SUCCEEDED", "prospect_id": "pro_01", "debited": 2, "messages_remaining": {"replier": 4},
 "version": {"id": "pdr_…", "kind": "message", "numero": 1, "auteur": "agent", "message": {"canal_cible": "email_generique", "objet": "…", "corps": "…", "mentions": ["origine", "opposition"]}, "controles": [{"id": "body_len", "label": "Corps borné", "essentiel": true, "reussi": true}]}}
```
Pour l'assistant personnel : appeler comme `conversation_actions` — `aid, prep = prospect_actions.submit(messaging, session_id, prospect_id, key, "profile"|"message", instruction)` ; `if prep: prospect_actions.execute(messaging, prep)` ; `prospect_actions.load_out(messaging, session_id, aid, raise_failed=True)` (`messaging` = `cv.Messaging`).

### 4. Données de la partie (portabilité, suppression) **[`export` et rétention : NON LIVRÉS]**
Référence : `PRODUIT-PROSPECTION.md` §14, `RULES.md` §12. Tickets API-L1 à API-L3.

**`GET /api/session/export`** — **JSON complet** des données de la partie (fiche entreprise, prospects, fiches, brouillons, conversations, campagnes). Lecture, **gratuite**, propriété de session vérifiée, `Cache-Control: no-store`, `Content-Disposition: attachment`. Réponse 200 : document JSON (schéma d'export non défini : voir « Points à trancher »). Erreurs : `SESSION_REQUIRED`. Pas d'`Idempotency-Key`. Ne contient jamais jeton de session, clé ni jeton de messagerie.

**`DELETE /api/session`** *(livrée, étendue)* — supprime la partie ; doit désormais **purger en cascade** prospects, fiches, brouillons, instantanés, conversations, boîte mail connectée (jeton révoqué) et campagnes, sans ligne orpheline. 204, `Idempotency-Key` : oui (déjà le cas).

**Rétention** (API-L2) : `derniere_activite_le`, rappel 30 jours avant visible **dans l'état**, action « Conserver », purge à 180 jours (horloge injectable). La **route** de « Conserver » et le **champ** d'état du rappel ne sont pas nommés dans les docs : voir « Points à trancher ».

### 5. Clients : conversations **[IMPLÉMENTÉ, sauf `send` : 501]**
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

### 6. Clients : boîte mail (mode Réel) **[NON LIVRÉ]**
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

### 7. Pub : campagnes **[IMPLÉMENTÉ]**
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
Référence : `VILLE-ET-BATIMENT.md` §10. **[IMPLÉMENTÉ, API-S4]**, additif, aucune nouvelle route. `GameState` porte :
- `clients_obtained: int` : prospects distincts devenus clients et **payés** (source : ledger, écritures `client_reward` ; ne baisse jamais) ;
- `building = {level, clients_obtained, next_level_at}` : niveau 1 à 10 calculé par le serveur depuis `clients_obtained` et `rules_v2.building.levels[].min_clients` (0, 1, 2, 4, 7, 11, 16, 22, 30, 40) ; `next_level_at` = nombre de clients du niveau suivant, `null` au niveau 10. Ne dépend ni du solde ni du total gagné (`total_earned` supprimé) ; cosmétique ;
- `hangar[]` : `{role, label, section, price, owned, unlock_clients (int|null), unlock_condition (phrase|null), clients_condition_waived, unlocked}` (remplace `unlock_planet`, `unlock_min_score`, `score_condition_waived`).

**Gain d'un client** : `PATCH /api/prospects/{id}` avec `statut: "gagne"` écrit, une seule fois par prospect, `+rules_v2.client_reward` ($, 20) au ledger (catégorie `client_reward`, source `client:<session>:<prospect>`). Refus `409 INVALID_STATE` si la conversation du prospect n'a aucun message reçu. Aucune migration (le ledger fait foi).
```json
"clients_obtained": 4,
"building": {"level": 4, "clients_obtained": 4, "next_level_at": 7}
```
Le même état devra aussi porter la fiche entreprise (§1) et, selon `CARTE-TECH.md`, des compteurs de prospects (`prospects_count`, `prospects_by_status` « si utile ») ; noms exacts à fixer.

### 9. `GET /api/actions/{id}` : champ `trace` **[NON LIVRÉ]**
Référence : `CARTE-TECH.md` (protocole événements serveur → animations), ticket API-B1. **[PROPOSÉ, non implémenté]**, additif au schéma `ActionOut`. `trace` est une liste **ordonnée** d'événements d'expédition (6e décision : d'une **recherche** `scout_search` ; `report_version_id` de l'événement `returned` devient `search_id` + `prospects_added`) ; `seq` est strictement croissant, rejouer deux fois donne la même animation.
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
**5e décision (2026-11-07)** : le hangar passe à **4 rôles** (`scout`, `triage`, `replier`, `ads`) ; `qualifier`, `profiler`, `outreach` sont supprimés (voir API-R1) ; le chef d'équipe est remplacé par les trois assistants (section 12). `rules_v2` ne liste que ces 4 rôles et les 3 assistants ; l'énumération `Role` du code peut garder les anciens rôles tant qu'API-R2 n'est pas finie (à relire ensuite). Prix et coûts (valeurs de départ de `rules_v2`) : `scout` 0, `triage` 35 (1 $), `replier` 45 (fiche client 3 $, premier message 2 $, réponse 2 $), `ads` 50 (4 $).

| Action (`type`) | Route | Rôle | Clé de quota | Plafond |
|---|---|---|---|---|
| ~~expédition (message)~~ | ~~`POST /api/attempts/{id}/messages`~~ *(**RETIRÉ**, 6e décision ; code en cours de retrait, API-R2)* | `scout` | `(tentative, rôle)` | 5 |
| **`scout_search`** (IMPLÉMENTÉ) | `POST /api/searches` | `scout` | aucune (recherche **gratuite**) | 10 par jour et par partie (`limits.searches_per_day`) |
| `prospect_profile` | `POST /api/prospects/{id}/profile` | `replier` | `(prospect, action)` | 5 |
| `prospect_message` | `POST /api/prospects/{id}/message` | `replier` | `(prospect, action)` | 5 |
| `conversation_triage` | `POST /api/conversations/{id}/triage` | `triage` | `(conversation, rôle)` | 5 |
| `conversation_reply` | `POST /api/conversations/{id}/reply` | `replier` | `(conversation, rôle)` | 5 |
| `ad_campaign` | `POST /api/campaigns/{id}/generate` | `ads` | `(campagne, rôle)` | 5 |

Aucune de ces actions nouvelles ne rapporte de gain (la finale « dépense ≤ 30 $ » est supprimée, 6e décision). Les tours du client simulé (Tutoriel) sont à la charge de la plateforme (6 par conversation), pas du joueur.

### 11. Recherches et contact (6e décision) **[`searches` : IMPLÉMENTÉ (API-S1) ; tri de pertinence : IMPLÉMENTÉ (API-S2) ; contact : IMPLÉMENTÉ (API-S3)]**
Référence : `PARCOURS-BOT.md` §1 et §6, `PRODUIT-PROSPECTION.md` §2, §6, §7. Tickets API-S1 (fait), API-S2 (fait), API-S3. Remplace expédition, livraison et évaluation. Entité `Search` : voir `DATA-MODEL.md`.

**`POST /api/searches`** **[IMPLÉMENTÉ]** : lance une recherche du bot `scout` sur un lieu.
- Corps : `{planet_id, precision?}` (`extra: forbid`) ; `planet_id` = lieu de `rules_v2.planets` (données `data/planets/`) ; `precision` facultative, **≤ 300 caractères** (`limits.search_precision_max_chars`), texte brut traité comme **donnée** (règle 3). Le navigateur ne fournit **jamais** de prospect ni de coût.
- Réponse **202** : l'objet **`SearchOut`** ci-dessous (la recherche est exécutée dans la requête, `status: "DONE"` au retour ; ce n'est pas un `ActionOut`). **Rejeu** (même `Idempotency-Key`, même requête) : **200**, même objet, aucun nouvel appel ; même clé avec un autre corps : 422 `INVALID_REQUEST`. `GET /api/actions/{id}` n'est pas le suivi de cette action (utiliser `GET /api/searches/{id}`).
- **Gratuite** : aucun débit, **aucun gain**. Plafond technique : `limits.searches_per_day` (**10** par jour UTC et par partie, les échecs ne comptent pas) ; dépassement : **429 `RATE_LIMITED`**, compté sous `BEGIN IMMEDIATE` (la concurrence ne le dépasse pas).
- Le bot ne reçoit que la **fiche entreprise et cible** (version courante, mémorisée dans `Search.profile_version`), la précision (bloc de **données** délimité avec nonce) et les enregistrements du lieu **minimisés** ; jamais la valeur d'un email ou d'un téléphone (seulement `canaux_disponibles`).
- Lieux : `annuaire` ouvert d'emblée ; `registre` après **3 prospects de l'annuaire d'étiquette `correspond`** (`planet.json` `deblocage` ; raison : « Trouvez d'abord 3 prospects qui correspondent à « Bibliothèque publique ». »). Mode **Réel** : pas d'adaptateur, **503 `LLM_UNAVAILABLE`** « La source réelle n'est pas encore branchée… », sans trace ni débit.
- Résultat : le **serveur ajoute au carnet** les leads recevables, recopiés depuis les enregistrements renvoyés par le lieu **pendant cette recherche** (un `source_ref` inconnu est écarté, `UNVERIFIED`). Contrôles par code : doublon (même `(source, source_ref)` ou même nom d'entreprise rapproché, au carnet ou dans le rapport), fermé/radié, donnée périmée (`limits.search_data_max_age_days`, 365), hors zone, hors secteur, hors taille, exclusions, carnet plein. Une recherche **vide** est valide (`DONE`, `kept: 0`) ; rien n'est inventé.
- Erreurs : `PROFILE_INCOMPLETE` (409 : `offre`, `cible_secteurs` ou `cible_zone` vide), `PLANET_LOCKED` (409, avec la raison en français), lieu inconnu `NOT_FOUND` (404), `RATE_LIMITED` (429), `LLM_UNAVAILABLE` (503, aucun effet), `INVALID_OUTPUT` (422 : rapport inexploitable après **une** réparation ; recherche `FAILED`, rien ajouté), `INVALID_REQUEST` (422), `SESSION_REQUIRED` (401). `ROLE_LOCKED` n'existe pas ici.
- **`GET /api/searches/{id}`** et **`GET /api/searches`** (du plus récent au plus ancien, plus `searches_left_today`) : propriété de session vérifiée (autre partie : 404). Pas de transcript d'événements pour l'instant (trace `departed`/`arrived`… non implémentée).
- **Tri de pertinence** (API-S2) **[IMPLÉMENTÉ, migration `0013_pertinence_labels`]** : après l'insertion, **un second appel** (rôle `scout`, schéma `RelevanceTriage`, `purpose` `scout_relevance`) rend `{tri:[{source_ref, etiquette, citation}]}` pour les prospects ajoutés par cette recherche. Le modèle reçoit la fiche et les enregistrements minimisés (blocs de données délimités, jamais un email ou un téléphone). **Le code vérifie** : le `source_ref` appartient aux prospects de cette recherche (sinon ignoré) ; la `citation` est une sous-chaîne exacte (espaces normalisés, ≤ 200 caractères) d'un champ texte de l'enregistrement tel que vu par le modèle ; `correspond` et `hors_cible` sans citation vérifiée, étiquette inconnue ou prospect non cité deviennent `a_verifier` sans citation. Sortie illisible : **une** réparation (`scout_relevance_repair`), puis `a_verifier` pour tous. **Le tri ne fait jamais échouer la recherche** (déjà `DONE`) et un appel en échec laisse `a_verifier`. **Aide, pas une note** : aucun point, aucun gain, aucun débit ; un prospect `hors_cible` reste au carnet. L'entier `pertinence` (0 à 100) de l'ancien carnet est inchangé.
  - `ProspectOut` / `ProspectDetailOut` : `pertinence_etiquette` (`correspond` | `a_verifier` | `hors_cible` ; jamais trié = `a_verifier`), `pertinence_citation` (`string | null`). Colonne interne `pertinence_champ` non exposée.
  - `GET /api/prospects` et `export.csv` : filtre `etiquette=` (`a_verifier` inclut les prospects jamais triés ; autre valeur : 422), tri `tri=etiquette` (`correspond`, `a_verifier`, `hors_cible` en ordre croissant ; départage par `id`). Export : colonnes `etiquette_pertinence`, `citation_pertinence` en fin de ligne (formules neutralisées).
  - `SearchOut` : `added[]` gagne `etiquette` et `citation` ; compteurs `matching`, `to_check`, `off_target` (somme = `kept`).
  - Tutoriel : les fiches d'exemple de `data/planets/*/examples/` (annuaire : caisse pour commerces, emballages pour restauration) s'ajoutent à `data/profile/examples/` dans le choix de la fiche pré-remplie (choix déterministe par nom d'entreprise).
```json
// POST /api/searches — requête
{"planet_id": "annuaire", "precision": "plutôt des commerces du centre"}
// réponse 202 (SearchOut)
{"id": "src_ab12cd34", "planet_id": "annuaire", "planet_label": "Bibliothèque publique", "precision": "plutôt des commerces du centre",
 "status": "DONE", "found": 10, "kept": 6, "discarded": 4, "examined": 10, "profile_version": 3, "simule": true, "action_id": "act_120",
 "added": [{"prospect_id": "pro_9f3a", "entreprise": "Boulangerie Les Fournils du Rhône", "source_ref": "ann_001"}],
 "discarded_items": [{"source_ref": "ann_019", "entreprise": "Boulangerie Le Fournil de Gerland", "code": "CLOSED", "raison": "Entreprise fermée ou radiée."}],
 "error": null, "created_at": "2026-11-08T10:00:00Z", "finished_at": "2026-11-08T10:00:01Z"}
```
`SearchOut.status` : `PENDING` | `RUNNING` | `DONE` | `FAILED` (une recherche `FAILED` n'est lisible que par `GET`, le `POST` répond par l'erreur). `discarded_items[].code` : `UNVERIFIED`, `DUPLICATE`, `CLOSED`, `STALE`, `OUT_OF_ZONE`, `OUT_OF_SECTOR`, `OUT_OF_SIZE`, `EXCLUDED`, `CARNET_FULL`, `INCOMPLETE` ; `found = kept + discarded`.

**`GET /api/state.planets`** **[IMPLÉMENTÉ]** : liste `[{id, label, status: "AVAILABLE"|"LOCKED", reason: string|null}]` (`reason` en français courant si verrouillé, ex. « Trouvez d'abord 3 prospects dans le lieu « Bibliothèque publique ». ») ; l'ancienne mission de secours n'y figure pas.

**`POST /api/prospects/{id}/contact`** **[IMPLÉMENTÉ, API-S3]** : ouvre la **conversation** du prospect ; c'est exactement la logique de `POST /api/conversations` (même fonction, même doublon unique `(session, prospect)`, persona choisie par la graine de la partie).
- Corps : `{}` (facultatif ; tout autre champ : 422). `Idempotency-Key` **obligatoire** (absente : 422). Réponse **201** à la création ; **200** si la conversation existait ou en cas de rejeu (même clé ou autre clé) : le même objet `Conversation` que la section 5 (`id` `cnv_…`, `prospect_id`, `simule`, …). Même clé avec un autre prospect : 422 `INVALID_REQUEST`.
- **N'envoie rien** (aucun message créé), **ne coûte rien**, **ne change pas le statut** du prospect (« contacté » reste déclaratif, ou posé par l'envoi simulé de la messagerie) ; aucune action de modèle n'est lancée.
- Erreurs : `NOT_FOUND` (404, identique pour un prospect inconnu et pour celui d'une autre partie), `SESSION_REQUIRED` (401), `INVALID_REQUEST` (422). Un prospect `ecarte` : le fil s'ouvre (règle actuelle de la création), mais l'envoi reste refusé par `OPTED_OUT` (409) sur `/messages`.
- Le brouillon de premier message n'est pas lié à la conversation par cette route : voir point 17 de « Points à trancher ».

### 12. Assistants **[IMPLÉMENTÉ]**
Référence : `ASSISTANT.md` (§3, §4, §6 bis). Pas de nouvelle règle ici.
- **`POST /api/assistant/plans`** `{assistant, message}` (`assistant` = `assistant_prospection` | `assistant_clients` | `assistant_pub` ; `message` de 1 à 500 caractères) : action `assistant_plan`, le serveur valide le plan par code (≤ 3 étapes, types de la liste blanche `rules_v2.assistant.step_types`, rôles possédés, cibles de la session, quotas) et le renvoie en `PROPOSED` avec le coût de chaque tâche ; **rien n'est exécuté**. Limite `assistant.plans_max` (5) demandes par partie, les plans annulés ne comptent pas. Hors contrat après une réparation : `INVALID_OUTPUT`, sans débit.
- **`GET /api/assistant/plans`**, **`GET /api/assistant/plans/{id}`** : lecture, propriété de session.
- **`POST /api/assistant/plans/{id}/confirm`** (202) : exécute les tâches dans l'ordre par les services existants, clé dérivée `{plan}:{tâche}:{essai}` ; statuts de plan `PROPOSED | RUNNING | DONE | PARTIAL | REJECTED`, de tâche `READY | BLOCKED | RUNNING | DONE | FAILED`. Rejeu avec la même clé : rien ne se relance ; autre clé : seules les tâches en échec sont retentées.
- **`POST /api/assistant/plans/{id}/reject`** : abandon, aucun débit.
- `Idempotency-Key` obligatoire sur les mutations. Types d'étapes : `scout_search`, `prospect_profile`, `prospect_message`, `conversation_triage`, `conversation_reply`, `ad_campaign`. Aucun outil d'envoi, de publication ni de dépense.

**Progression** : un lieu se débloque quand le précédent a rapporté **≥ 3 prospects retenus** (`rules_v2`) ; agents et immeuble progressent avec le **nombre de clients obtenus** (prospects `gagne`) ; seuils dans les données. Calculés par le serveur.

## Points à trancher
> **Mise à jour 2026-11-08** : les points 1, 4, 7, 13, 15 (ajout depuis un rapport), 17 et 23 sont **résolus ou caducs** (voir la mention en tête de chaque point) ; 3 est résolu. Les autres restent ouverts. Aucune de ces questions n'est décidée ici. Chacune est un détail manquant ou une contradiction entre documents, relevée pendant DOC-L1 et DOC-M1. À arbitrer avant l'implémentation des tickets concernés.

**Contradictions entre documents**
1. ~~**Seuils de réussite**~~ (OBSOLÈTE, 6e décision : plus de score ; déblocages par prospects retenus ≥ 3 et par clients obtenus) : `RULES.md` §5 (et le dernier commit `data`) donnent **50** (ordinaire) et **60** (finale) ; `PRODUIT-PROSPECTION.md` §4, §5, §7 donne encore **60** (déblocages, ordinaire) et **70** (finale) ; `CLAUDE.md`/`PRODUIT-CLIENTS-PUB.md` ne tranchent pas. Impacte `ROLE_LOCKED` et les déblocages.
2. **Version des contrats** : l'en-tête de ce fichier portait « 0.1 » alors que le texte décrit les versions 0.2 à 0.4 ; la version proposée ici (0.5) est un choix de numérotation à confirmer.
3. ~~**`GET /api/health`**~~ *(résolu)* : ce fichier la disait « à prévoir (BE08) » ; elle est déjà dans `api/openapi.json` (`HealthOut`).
4. ~~**Nombre de rôles**~~ *(caduc : le hangar a 4 rôles et 3 assistants, `rules_v2`)* : `CLAUDE.md` et `PRODUIT-PROSPECTION.md` §5 parlent de **4 rôles au MVP** ; `PRODUIT-CLIENTS-PUB.md` §6 (3e décision) en compte **7**. Ce fichier suit la 3e décision (7). `CLAUDE.md` n'est pas dans le périmètre de ce ticket.
5. **Les « trois sections »** : `PRODUIT-PROSPECTION.md` §1 dit « Seule la prospection est traitée » ; le bandeau de tête précise que ce n'est plus vrai du produit entier (3e décision).
6. **`CARTE-TECH.md` non aligné sur la ville** : il cite encore `data/map/layout_v1.json` (remplacé par `city_v1.json`, `VILLE-ET-BATIMENT.md` §10) et vise 30 images/s « sur un téléphone moyen à 390 px » alors que la cible est désormais l'ordinateur (téléphone = mode liste). Hors périmètre de ce ticket.
7. ~~**Fixtures**~~ *(à refaire à la régénération, API-R2)* : les fixtures exportées par `app.export_fixtures` étaient celles de l'ancien parcours (bureau, commande, atelier…).

**Codes d'erreur et statuts HTTP**
8. Statut HTTP de `LEAD_UNVERIFIED`, `MAILBOX_NOT_CONNECTED`, `SEND_NOT_CONFIRMED`, `RECIPIENT_NOT_ALLOWED`, `OPTED_OUT`, `SEND_LIMIT`, `SEND_FAILED` : non écrit. Par analogie avec les codes livrés, on peut envisager 422 (validation), 409 (état), 429 (plafond) et 502/503 (fournisseur), mais rien n'est décidé.
9. **Code d'erreur** de la limite de **500 prospects** (« erreur stable au-delà », `PRODUIT-PROSPECTION.md` §12) et de **20 campagnes** (`limits.campaigns_max`) : non nommé.
10. Statuts de succès des routes proposées (200/201/202/204) : convention par analogie, non écrite.

**Routes ou champs non nommés dans les docs**
11. **Suppression de tout le carnet** (`PRODUIT-PROSPECTION.md` §12) : aucune route nommée.
12. **« Conserver »** (rétention, API-L2) et **champ d'état du rappel** à 30 jours : route et champ non nommés.
13. ~~**Fiche entreprise dans `GET /api/state`**~~ *(tranché : `target_profile`, point 29b)* : nom du champ (`target_profile` ?) et présence des compteurs de prospects non fixés. Toute lecture dédiée `GET /api/profile` n'est pas prévue (la fiche est lue via l'état).
14. **Paramètres de la liste de prospects** (noms, valeurs de tri, filtre « à relancer ») et de `GET /api/conversations` ; contenu exact des **bacs** du courrier (« À traiter », « En attente », « Clos », « À ne plus contacter ») et règle qui range une conversation dans un bac.
15. ~~**Réponses de `POST /api/prospects`**~~ *(route retirée)* ; réponse de `POST /api/mailbox/sync` : forme non écrite.
16. **Corps des actions** `profile` / `message` / `triage` / `reply` / `generate` : seule la consigne facultative (≤ 500) est documentée. **Tranché pour `profile` et `message`** : champ facultatif `profile_version` (voir §3) ; `triage`, `reply`, `generate` : inchangés.
17. **`POST /api/conversations/{id}/messages`** : **tranché (implémenté)** : `draft_version_id` accepte un brouillon de réponse de la conversation OU une version `prospect_message` du même prospect ; le texte envoyé est `text` (voir §3). Reste à décider : « Utiliser ce brouillon » côté interface.
18. **`DELETE /api/mailbox`** : forme de l'option « supprimer aussi les messages importés » (paramètre ou corps).
19. **`POST /api/mailbox/connect`** : comportement si une boîte est déjà connectée ; liste exacte des fournisseurs (Gmail, Microsoft 365/Outlook proposés ; IMAP/SMTP à étudier, `OPEN-QUESTIONS.md`).
20. **Export JSON de la partie** (`GET /api/session/export`) : schéma et contenu exact non définis (la mention des conversations et campagnes vient de `PRODUIT-CLIENTS-PUB.md` §4 et n'est pas reprise pour les campagnes).
21. **Export Markdown d'une campagne** : paramètre de choix de version non nommé.
22. **Stockage de la fiche client et du brouillon `replier` (premier message)** : **tranché** (table `prospect_drafts`, `ProspectDraft`, voir `DATA-MODEL.md`). Reste non nommé : le stockage de la **synthèse** `triage` : les docs parlent de « versions immuables » sans nommer l'entité ni la table (voir `DATA-MODEL.md`).
23. ~~**`building.next_level_at`**~~ *(tranché, point 29h : `null` au niveau 10, seuils dans `rules_v2`)* au niveau maximal : valeur non précisée (`null` supposé). Seuils de `rules_v2.building.levels` : valeurs non écrites.
24. **Trace des actions non-expédition** (`prospect_*`, `conversation_*`, `ad_campaign`) : seul le protocole d'expédition est décrit ; les drones lisent `ad_campaign` sans événement défini.
25. **Suppression d'un prospect et conversation** : la cascade vers la conversation est déduite de « suppression en cascade avec le prospect, la conversation et la partie » (`PRODUIT-CLIENTS-PUB.md` §4) ; l'effet sur une conversation déjà envoyée en Réel n'est pas précisé.
26. **Quota partagé ou séparé** : « 5 générations par `(conversation, rôle)` » est clair pour `triage` et `replier` (deux clés) ; on suppose qu'un rôle a sa propre clé par entité, sans autre précision.
27. **Appels fournisseur de messagerie** : `RATE_LIMITED` (429, livré) peut-il couvrir une limite côté fournisseur, ou est-ce `SEND_FAILED` ? Non écrit.
28. **Bloquants juridiques** : l'implémentation des routes `/api/mailbox*` et `/api/conversations/{id}/send` est conditionnée par la validation juridique et `OPEN-QUESTIONS.md` n° 24, 25 et 31 ; ce fichier les décrit sans lever ce blocage.

## Fixtures
La source de vérité des exemples est la sortie de `app.export_fixtures` (dossier `data/fixtures/`, régénérée par l'autre chantier à la fin d'API-R2) et les réponses réelles de l'API. **Cas à couvrir pour le parcours actuel** : état initial (Tutoriel et Réel), fiche, résultat de recherche (avec prospects retenus et écartés), recherche vide, carnet (liste, détail), brouillon de fiche client et de premier message, conversation avec réponse du client, conversation désinscrite, kit de campagne, plan d'assistant (`PROPOSED`, `PARTIAL`, `DONE`), et les erreurs `PROFILE_INCOMPLETE`, `PLANET_LOCKED`, `RATE_LIMITED`, `MESSAGE_LIMIT`, `INSUFFICIENT_FUNDS`, `ROLE_LOCKED`, `OPTED_OUT`. Les fixtures de l'ancien parcours (bureau, commande, atelier, livraison, retour client, évaluation en attente) sont **RETIRÉES** avec lui.

## Versionnage
Rôles dans des fichiers d'instructions (`data/roles/`), lieux dans `data/planets/`, grilles sous ids stables (`prospect_fiche_v1`, `prospect_message_v1`, `conversation_synthese_v1`, `conversation_reponse_v1`). Valeurs chiffrées dans `data/rules/rules_v2.json`. Chaque appel journalise les versions utilisées (rôle, planète, grille, version de la fiche entreprise).

**Décisions prises à l'implémentation de API-H1, API-H2 et API-Q1 (`api/`, à confirmer)**
29. a) **Statut** de `PUT /api/profile` : 200 (création de version comme rejeu), convention du moteur livré ; erreurs 401 `SESSION_REQUIRED`, 409 `VERSION_CONFLICT`, 422 `INVALID_REQUEST` (bornes, clé réutilisée pour une autre requête, champ inconnu). Aucun 404 : la route n'a pas d'identifiant, la partie vient du cookie seul (une autre partie n'est donc pas adressable ; un `session_id` dans le corps est refusé).
b) **Nom du champ d'état** (point 13) : `GameState.target_profile` (= `TargetProfile` : champs de la fiche, `profile_version`, `modifie_le`, `complete`). `complete` est vrai si les champs `required_for_real` sont renseignés. Pas de `GET /api/profile` ni de compteurs de prospects.
c) **`cible_taille`** : `{effectif_min, effectif_max}` ou `null` (bornes de `target_profile_v1.json`, `min <= max`) ; l'exemple de la section 1 (`{min, max}`) est à corriger côté contrat.
d) **Minimum requis** : le fichier de spécification porte `required` (Tutoriel) et `required_for_real` (Réel) ; le serveur applique `required` en Tutoriel et `required_for_real` en Réel (un champ non requis peut rester vide). Bornes toujours contrôlées ; erreurs de validation sans la valeur reçue.
e) **Versions** : une ligne immuable par version (`target_profile_versions`, trigger sans `UPDATE`), version 1 créée avec la partie (Tutoriel : exemple de `data/profile/examples/` choisi par empreinte du nom de l'entreprise, `entreprise_nom` = nom de la partie ; Réel : fiche vide) ; l'ancien `company.profile` devient `offre` (le champ historique `company.profile` de l'état reste inchangé). Parties existantes : migration 0005, version 1 = nom + ancien profil. Un `PUT` identique crée quand même une nouvelle version.
f) **Idempotence** : même `Idempotency-Key` + même corps (y compris `expected_version`) renvoie la version créée par cette clé, sans écriture, même si des versions plus récentes existent ; même clé + autre corps : 422. Concurrence : un seul des écrits ayant la même `expected_version` réussit, les autres reçoivent `VERSION_CONFLICT`.
g) **Agents** (point 16) : le bloc `[FICHE ENTREPRISE ET CIBLE vN]` (Réel : `[FICHE CIBLE (mode Réel) vN]`) est ajouté en tête du contexte des messages d'agents et des délégations du chef ; version figée à l'ouverture de l'expédition (`mission_attempts.profile_version`) ; JSON sur une ligne entre `<<<FICHE nonce=…>>>` et `<<<FIN FICHE nonce=…>>>`, nonce dérivé du contenu, délimiteurs retirés des valeurs. **Aucun champ de version n'est ajouté** aux corps des actions : une action ne produit donc pas de `VERSION_CONFLICT` sur la fiche (la version d'ouverture fait foi). L'évaluateur et le client simulé ne reçoivent pas la fiche.
h) **`building`** (point 23) : *remplacé par API-S4* : `clients_obtained` = écritures de ledger `client_reward` (une par prospect payé) ; `next_level_at` = `null` au niveau 10 ; seuils = `rules_v2.building.levels[].min_clients`.
i) **`rules_v2`** est chargé en plus de `rules_v1` (qui reste le moteur) : `app.state.rules_v2`, fichier et fiche de spécification exigés au démarrage (`ConfigError` lisible sinon). `contracts_version` reste inchangée.
