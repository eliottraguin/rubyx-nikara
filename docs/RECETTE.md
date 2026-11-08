# Recette et critères d'acceptation

> Réécrite le 2026-11-08 pour le parcours de la 6e décision (`docs/PARCOURS-BOT.md`) : **fiche → recherche du bot → carnet → Contacter → premier message → réponse → client → +20 $ → déblocages → assistants**. L'ancienne recette (M1–M6, client évaluateur, score et paiement par expédition) est supprimée avec l'ancien moteur (ticket API-R2). Les valeurs citées viennent de `data/rules/rules_v2.json` ; les codes d'erreur de `docs/CONTRACTS.md`. Aucun objectif chiffré n'est présenté comme un résultat avant mesure.

## Ce qui est automatisé et ce qui reste manuel
- **Automatisé** : les suites de `api/tests/` (fournisseur `mock`, aucun appel réseau) et de `src/` (vitest). Le fichier **`api/tests/test_full_journey.py`** joue le parcours complet sur l'API réelle (Tutoriel, une partie neuve, seul le solde de test est inséré en base) et vérifie qu'aucun email ni téléphone n'apparaît hors du carnet. Les cas limites ci-dessous qui ont leur propre fichier de test : `test_searches.py`, `test_relevance.py`, `test_contact.py`, `test_clients_economy.py`, `test_prospect_drafts.py`, `test_messaging.py`, `test_assistant_plan.py`, `test_assistant_actions.py`, `test_pub.py`, `test_prospects_csv.py`, `test_economy_purchases.py`.
- **Manuel** : tout ce qui se joue dans un navigateur. **Cette recette manuelle n'a pas encore été exécutée** : aucune case n'est cochée.

## 1. Parcours nominal (Tutoriel)
Partie neuve, mode Tutoriel (badge « simulé » visible partout).

- [ ] **Création** : nom de l'entreprise + mode Tutoriel ; la fiche d'exemple est pré-remplie, on arrive sans rien saisir. *Attendu* : solde **30 $**, `Clients 0`, immeuble niveau 1.
- [ ] **Fiche** (`/fiche`) : modifier l'offre, enregistrer. *Attendu* : nouvelle version (`profile_version` + 1), l'ancienne reste consultable ; un `PUT` avec une version périmée est refusé (`VERSION_CONFLICT`).
- [ ] **Recherche sur l'Annuaire** : « Chercher des clients » sur « Bibliothèque publique », précision facultative vide. *Attendu* : le bot part (trajet visible ou, en mode liste, état « en cours » puis « terminée »), résultat avec nombre trouvé / retenus / écartés ; **solde inchangé (0 $ débité)** ; chaque prospect retenu apparaît au carnet avec sa source, sa date et une étiquette `correspond` / `à vérifier` / `hors cible` (les deux premières accompagnées d'une citation de la source quand elle est vérifiée).
- [ ] **Bulles d'aide Tutoriel** : une bulle à chaque étape (cible, résultat, « contactez-en un »).
- [ ] **Carnet** : trier par étiquette, filtrer, ouvrir une fiche prospect, ajouter une note, marquer « contacté ». *Attendu* : « contacté » ne déclenche aucun envoi.
- [ ] **Contacter** : sur un prospect, bouton « Contacter ». *Attendu* : une conversation s'ouvre dans la Salle du courrier ; **aucun message créé, aucun débit** ; recliquer ouvre la même conversation.
- [ ] **Premier message** : `replier` doit être acheté (voir 1 client) ; avant, le bouton explique pourquoi. Une fois acheté : « Préparer le premier message ». *Attendu* : brouillon (objet ≤ 90, corps ≤ 800 caractères) avec mentions d'origine et d'opposition, **2 $ débités**, quota affiché 4 restants ; contrôles par code visibles.
- [ ] **Envoi simulé** : relire, éventuellement éditer, « Envoyer (simulé) ». *Attendu* : message ajouté au fil avec le badge simulé, **rien ne sort**, le client simulé répond à la demande.
- [ ] **Devenir client** : sur un prospect qui a répondu, passer le statut à « gagné ». *Attendu* : **+20 $** une seule fois, `Clients 1`, agent `triage` débloquable (1 client), immeuble niveau 2.
- [ ] **Déblocages** : 2 clients → `replier`, 3 clients → `ads` ; immeuble niveau 3 à 2 clients, niveau 4 à 4 clients. Un achat avec le solde suffisant débite le prix (35 $, 45 $, 50 $) une seule fois.
- [ ] **Registre** : se débloque quand l'Annuaire a rapporté **3 prospects `correspond`** ; avant, la raison est écrite en français sur le lieu.
- [ ] **Assistants** : voir section 5.
- [ ] **Export CSV** : fichier `prospects-SIMULE-AAAAMMJJ.csv`, UTF-8 avec BOM, séparateur `;`, colonne `simule` = `oui`.
- [ ] **Rechargement** : recharger la page conserve fiche, carnet, conversations, solde et clients.

## 2. Cas limites
Pour chacun : message en français, code stable, **aucun débit** sauf mention contraire.

- [ ] **Aucun résultat** : fiche dont rien ne correspond (zone sans entreprise). *Attendu* : recherche `DONE` avec 0 prospect retenu et un message honnête « rien ne correspond » ; rien d'inventé ; elle compte dans le plafond du jour.
- [ ] **Prospect qui ne répond jamais** (persona silencieuse) : aucun message reçu. *Attendu* : passer le prospect à « gagné » est refusé (`INVALID_STATE`, « n'a pas encore répondu »), aucun gain ; l'interface propose d'essayer un autre prospect.
- [ ] **Désinscription** : un prospect répond « retirez-moi de votre liste ». *Attendu* : détecté par code, prospect `écarté`, nouvel envoi refusé (`OPTED_OUT`), pas de gain même si le statut est forcé à « gagné » (`INVALID_STATE`).
- [ ] **Fiche incomplète** (Réel : `offre`, `cible_secteurs` ou `cible_zone` vide) : lancer une recherche est refusé (`PROFILE_INCOMPLETE`) avec une phrase qui dit quel champ manque et un lien vers la fiche.
- [ ] **Lieu verrouillé** : recherche sur le Registre avant 3 `correspond` à l'Annuaire. *Attendu* : `PLANET_LOCKED` avec la raison, aucune recherche créée.
- [ ] **Plafond de recherches** : la 11e recherche du jour (UTC) est refusée (`RATE_LIMITED`, 429) ; les recherches en échec ne comptent pas ; le plafond restant est affiché.
- [ ] **Quota de 5** : 5 premiers messages (ou fiches) pour un même prospect acceptés, la 6e refusée (`MESSAGE_LIMIT`), compteur à 0 restant, rien de débité à la 6e. Même règle par conversation (`triage`, `reply`) et par campagne (`generate`).
- [ ] **Solde insuffisant** : générer avec un solde inférieur au coût. *Attendu* : `INSUFFICIENT_FUNDS`, **quota non consommé**, solde jamais négatif. Consulter, trier, exporter et supprimer ses prospects reste possible à 0 $.
- [ ] **Agent verrouillé** : action d'un rôle non acheté. *Attendu* : `ROLE_LOCKED`, avant tout contrôle d'argent ou de quota.
- [ ] **Plan d'assistant partiel** : un plan à plusieurs étapes dont une est impossible (solde ou quota). *Attendu* : l'étape est grisée avec sa raison ; on confirme le reste ; en cas d'échec en cours, le plan passe `PARTIAL`, les autres étapes sont faites, et reconfirmer avec une nouvelle clé ne retente que les étapes en échec.
- [ ] **Annulation** : « Non, annuler » sur un plan, `reject`. *Attendu* : plan `REJECTED`, aucun débit, il ne compte plus dans la limite de 5 demandes.
- [ ] **Sortie du modèle invalide** (cas de test simulé) : `INVALID_OUTPUT` après une réparation, aucun débit, génération rendue.
- [ ] **Double clic** : deux requêtes identiques (même `Idempotency-Key`) ⇒ une seule action, un seul débit, un seul gain de 20 $.
- [ ] **Suppression** : supprimer un prospect supprime sa conversation, ses brouillons et ses compteurs ; supprimer la partie purge tout.

## 3. Tutoriel et Réel
- [ ] **Tutoriel** : tout ce qui précède, avec badge « simulé » ; aucune donnée réelle, aucun envoi.
- [ ] **Réel, recherche** : lancer une recherche. *Attendu* : **la source réelle n'est pas branchée** ; réponse `LLM_UNAVAILABLE` (503) « La source réelle n'est pas encore branchée… », aucune trace, aucun débit, aucun prospect. Ce n'est pas un échec de la recette tant que les sources réelles ne sont pas livrées.
- [ ] **Réel, fiche** : 3 champs minimum requis (`offre`, `cible_secteurs`, `cible_zone`) ; pas d'exemple pré-rempli.
- [ ] **Réel, envoi d'email** : `POST /api/conversations/{id}/send` répond **501** (non livré). Aucun test manuel d'envoi réel avant la validation juridique.
- [ ] **Déblocages en Réel** : les agents ne demandent pas de clients obtenus (`real_mode_waives_clients_unlock`).

## 4. Mode liste et accessibilité clavier
- [ ] **Mode liste** (sans carte, ou téléphone) : on peut faire tout le parcours de la section 1 sans la carte (liste des lieux, lancer une recherche, résultat, carnet, Contacter, achats, assistants).
- [ ] **Clavier** : Tab atteint les lieux, l'immeuble, chaque étage, chaque bouton d'action dans un ordre logique ; Entrée active ; `Échap` ferme un panneau et revient à la ville ; focus visible ; focus rendu au bouton d'origine à la fermeture.
- [ ] **Lecteur d'écran** : chaque lieu, bot et étage a un nom lisible ; les résultats de recherche, les erreurs et les changements de solde sont annoncés ; rien ne dépend de la couleur seule (étiquettes de pertinence en texte).
- [ ] **Animations** : `prefers-reduced-motion` réduit ou supprime les trajets ; « Passer l'animation » ne change pas le résultat (le résultat n'attend jamais l'animation).
- [ ] **États** : chargement, erreur réseau, quota atteint, fonds insuffisants, agent verrouillé, lieu verrouillé sont tous compréhensibles sans mot technique.

## 5. Assistants
- [ ] Trois assistants présents au départ (Prospection, Clients, Pub) dans l'Accueil de l'immeuble ; chacun ne propose que des étapes de sa section.
- [ ] Demande « lance une recherche sur l'annuaire » : le plan affiche, **avant toute exécution**, qui s'en occupe, le coût en $ de chaque étape, le total et le solde restant, le bandeau « Rien n'est envoyé ni publié sans vous » ; **rien n'est exécuté** tant que « Oui, lancer » n'est pas cliqué.
- [ ] Après confirmation, chaque étape passe par « en attente », « en cours », « terminé » ou « n'a pas pu se faire », avec une phrase de résultat (par exemple le nombre de prospects ajoutés).
- [ ] 5 plans demandés au plus par partie (les plans annulés ne comptent pas) ; 3 étapes au plus par plan.
- [ ] Un texte d'instruction qui ressemble à une consigne système (« ignore les règles ») n'a aucun effet : coûts, quotas et droits restent ceux du serveur.

## 6. Sécurité et fiabilité (contrôles de non-régression)
- Aucune session ne lit ni ne modifie les prospects, conversations, campagnes et plans d'une autre (`NOT_FOUND`, identique à « introuvable »).
- Un `source_ref` inventé n'entre jamais au carnet (`UNVERIFIED`) ; le navigateur ne peut pas fournir de contenu de prospect.
- Le modèle ne reçoit jamais la valeur d'un email ou d'un téléphone ; les journaux n'en contiennent pas.
- Une injection de prompt dans le corpus d'un lieu, dans un message de client ou dans la précision n'a aucun effet sur le solde, le statut, les quotas ni les gains.
- Rendu texte et Markdown nettoyés, sans HTML ni script ; aucune clé ni prompt système dans les erreurs.
- L'export CSV neutralise les formules (cellule commençant par `=`, `+`, `-`, `@`, tabulation ou retour chariot, y compris les notes du joueur).
- Aucun appel réseau réel en test automatisé.

## 7. Recette exploratoire (à faire)
5 personnes peu familières de l'IA ; objectif : au moins 4 obtiennent un premier client **sans aide** en Tutoriel. Le bilan sépare résultats observés et objectifs non mesurés. **Non réalisée.**

## 8. Recette finale (à faire, bloquée par les sources et le fournisseur réels)
Partie complète en mode Réel avec modèle et sources réels (non branchés aujourd'hui) ; sinon répétition de secours **explicitement simulée** (badge visible). Preuves : parties seedées reproductibles, mesures de latence et de tokens.
