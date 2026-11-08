# Assistant personnel (chef d'équipe) — cadrage

**Décisions du 2026-11-07 (Noah)** : l'assistant personnel est l'agent **en lien avec le client** ; c'est lui qui **lance les autres agents spécialisés**. Cela **lève le report en P2 du chef d'équipe** (`RULES.md` §« Délégation », `BACKLOG.md`). Statut de ce document : **PROPOSÉ**, à valider avant code (règle 10). Le branchement au fournisseur réel (relais AXIS) vient **après** : tout est d'abord développé et testé avec le fournisseur `mock`.

## 1. Rôle
Les assistants sont **trois rôles du hangar** (`assistant_prospection`, `assistant_clients`, `assistant_pub`, en plus de `scout`, `triage`, `replier`, `ads`). Il **ne produit aucun livrable métier** : il lit la demande du joueur, **propose un plan de délégation**, et, **après confirmation du joueur**, le serveur exécute chaque étape en appelant les actions existantes des agents spécialisés. Le joueur parle à un seul interlocuteur ; les autres rôles restent achetables et visibles.

## 2. Ce que l'assistant peut déléguer (liste blanche, `data/roles/assistant.json`)
| Type d'étape | Agent | Cible | Existe déjà |
|---|---|---|---|
| `ad_campaign` | `ads` | `campaign_id` | oui |
| `conversation_triage` | `triage` | `conversation_id` | oui |
| `conversation_reply` | `replier` | `conversation_id` | oui |
| `prospect_profile`, `prospect_message` | `replier` | `prospect_id` | **non** (jalon J/K) : ajoutés à la liste blanche à la livraison |
| `scout_search` (ex-expédition) | `scout` | lieu (`planet_id`) | **à adapter** au parcours sans atelier (`PARCOURS-BOT.md` §5) |

Tout autre type est **rejeté**. **Aucun outil d'envoi, de publication ni de dépense** (règles 13 et 15) : une étape ne produit jamais plus qu'un brouillon ou un kit.

## 3. Flux
1. `POST /api/assistant/plans` `{message}` : action `assistant_plan` (agent `assistant`). Le modèle reçoit un **contexte minimisé** : résumé de la fiche entreprise, **liste des cibles possédées** (id + libellé court, jamais d'email ni de téléphone), rôles possédés, quotas restants, message du joueur (donnée, pas consigne).
2. Le modèle répond avec un **plan** (schéma §4). Le serveur le **valide par code** : ≤ 3 étapes, types en liste blanche, rôles **possédés**, cibles **appartenant à la session**, quota `(cible, action)` restant, pas de doublon `(type, cible)`. Hors contrat : une réparation, puis `INVALID_OUTPUT`, **sans débit**.
3. Le serveur **ajoute le coût** de chaque étape (lu dans `rules_v2`) et renvoie le plan en statut `PROPOSED`. **Rien n'est exécuté.**
4. `POST /api/assistant/plans/{id}/confirm` : le joueur confirme ; le serveur exécute les étapes **dans l'ordre**, chacune par le service existant (mêmes quotas, mêmes réservations, mêmes `ActionRun`), avec une **clé d'idempotence dérivée** `(plan, index)`. Une étape en échec n'annule ni les précédentes **ni les suivantes** (les tâches sont indépendantes) : le plan passe en `PARTIAL`. Rejouer `confirm` avec **la même clé** ne relance rien (200) ; avec **une autre clé**, il retente les seules tâches en échec (clé dérivée `(plan, tâche, essai)`).
5. `POST /api/assistant/plans/{id}/reject` : abandon, aucun débit.
6. Le joueur lit chaque résultat dans sa section (Clients, Pub) ; le plan ne contient que des **références** (`action_id`, `artifact_version_id`).

## 4. Schéma du plan
```json
{
  "summary": "Trier la conversation Dupont puis préparer une réponse",
  "steps": [
    {"type": "conversation_triage", "target_id": "conv_…", "instruction": "Résume en 3 lignes"},
    {"type": "conversation_reply",  "target_id": "conv_…", "instruction": "Propose un rendez-vous jeudi"}
  ]
}
```
`instruction` (≤ 300 caractères, texte nettoyé) devient la consigne de l'agent ; elle compte comme **une des 5 instructions** de sa clé de quota. Tout champ de coût, de score ou de gain fourni par le modèle est **ignoré**.

## 5. Règles serveur
- **Seul le backend** choisit prix, quotas et droits (règle 1) : le coût du plan = somme des coûts des étapes + coût propre de `assistant_plan` (valeur dans `rules_v2`, **proposée à 0**, voir Q1).
- Quota : **5 plans par partie et par jour de jeu**… à trancher (Q2) ; jamais 6, **sans gain**.
- Réservation avant appel, règlement après, jamais de transaction ouverte pendant l'attente réseau (règle 4). L'`assistant_plan` suit la même machine que les autres actions.
- Les messages du joueur et tout texte client lu par l'assistant sont des **données** (règles 3 et 15). Journaux sans contenu.
- Consulter, rejeter et supprimer ses plans : **jamais conditionné** par l'argent ni le score.
- Pas de récursion : l'assistant **ne peut pas se déléguer à lui-même**.

## 6. Données (additif, migration `0010_assistant_plans`, implémenté)
Une table `assistant_plans(id, session_id, assistant, message, summary, status[PROPOSED|RUNNING|DONE|PARTIAL|REJECTED], total_cost, steps JSON, action_id, created_at)`, supprimée avec la partie. Chaque tâche du JSON porte : type, cible, libellés lisibles, instruction, coût et raison de blocage (calculés par le serveur), statut (`READY|BLOCKED|RUNNING|DONE|FAILED`), `action_id`, phrase de résultat et nombre d'essais. Un plan **annulé** ne compte plus dans la limite de 5 demandes. Au démarrage, un plan resté `RUNNING` redevient `PARTIAL` (tâches interrompues en échec, réessayables).

## 6 bis. Routes (implémentées : ASSIST-3 et ASSIST-4)
`POST /api/assistant/plans` · `GET /api/assistant/plans` · `GET /api/assistant/plans/{id}` · `POST /api/assistant/plans/{id}/confirm` (202) · `POST /api/assistant/plans/{id}/reject`. Toutes les mutations portent une `Idempotency-Key`. Tâches branchées (les six) : `ad_campaign`, `conversation_triage`, `conversation_reply`, `prospect_profile`, `prospect_message`, `scout_search`. Chacune appelle le service existant (`ad_actions`, `conversation_actions`, `prospect_actions.submit/execute/load_out`, `search_actions.run`) avec une clé dérivée `{plan}:{tâche}:{essai}` : mêmes quotas, prix et idempotence que si le joueur la lançait lui-même, un échec est une phrase lisible sans débit. `scout_search` : la cible est un lieu (`planet_id`), l'instruction du plan devient la `precision` (300 caractères au plus), la recherche est gratuite et le résultat dit « La recherche est terminée : N prospects ajoutés à votre carnet. ». Le plan ne propose que les lieux réellement ouverts de la partie (`planets_view`, un lieu verrouillé n'est jamais listé). Les phrases de résultat sont dans `data/assistant/texts.json` (`results`). « Pas encore disponible » ne sert plus qu'à un type réellement non branché (moteur indisponible).

## 7. Décisions prises (2026-11-07)
- **Départ** : le joueur commence avec **un assistant par section** (Prospection, Clients, Pub), fournis avec la partie. Rôles `assistant_prospection`, `assistant_clients`, `assistant_pub` ; chacun ne propose que des étapes **de sa section**. Le plan est gratuit ; seules les étapes coûtent.
- **Achat (a)** : on peut **acheter des exemplaires supplémentaires** d'un même agent. Proposition technique : `AgentOwnership` garde une ligne par `(session, rôle)` et gagne une colonne `copies` (≥ 1, plafond dans `rules_v2`) ; un exemplaire de plus = **une tâche de plus en même temps** pour ce rôle (le plan peut lancer deux étapes du même rôle en parallèle). Quotas par cible **inchangés** (5, jamais 6). Migration Alembic `0010`. **À confirmer** : effet exact d'un exemplaire de plus, prix croissant ?
- **Quota** : **5 plans par partie** au départ (valeur dans `rules_v2`).
- **Expéditions `scout`** : lancées par l'assistant Prospection dès la v1 (le serveur ouvre la tentative sur un lieu débloqué).
- **Interface** : bulle de chat dans l'Accueil de l'immeuble.
- **Confirmation conservée**, et **lisible par une personne qui ne connaît pas l'IA** (§9).

## 9. Lisibilité du plan pour le joueur (exigence)
Le plan s'affiche comme une **liste de tâches en français courant**, sans mot technique (pas de « agent », « quota », « tokens », « plan de délégation »).
- Titre : « **Voici ce que je propose de faire** ». Chaque étape = une phrase d'action + **qui s'en occupe** (« Julie, votre rédactrice ») + **ce que ça coûte** en $ + **ce que vous obtiendrez** (« un brouillon de réponse que vous relisez »).
- Bandeau fixe : « **Rien n'est envoyé ni publié sans vous.** Vous recevez des brouillons à relire. »
- Total en $ et solde restant **avant** de confirmer ; boutons **« Oui, lancer »** et **« Non, annuler »**.
- Si une étape est impossible (pas assez d'argent, limite atteinte), elle est **grisée avec la raison en une phrase** ; on peut confirmer le reste.
- Pendant l'exécution : état simple par étape (« en attente », « en cours », « terminé », « n'a pas pu se faire »). Aucun message d'erreur technique.
- Les libellés viennent d'un **fichier de données** (`data/roles/assistant_texts.json`), pas du code ni du modèle : le modèle ne choisit que le type, la cible et la consigne.

## 8. Tickets proposés
1. `ASSIST-1` : rôles `assistant_*` dans `HangarRole`, `rules_v2` (fournis au départ) et `data/roles/`.
1b. `ASSIST-1b` : exemplaires multiples (`copies`, migration `0010`, achat répété).
2. `ASSIST-2` : validateur de plan **pur** (code) + tests (listes blanches, propriété, quotas, cycles, doublons).
3. `ASSIST-3` : action `assistant_plan` avec le `mock` (plans déterministes, cas invalides).
4. `ASSIST-4` : routes `plans`, `confirm`, `reject`, exécution des étapes par les services existants, idempotence.
5. `ASSIST-5` : interface (Accueil), mode liste d'abord.
6. `AI-REAL` (après) : adaptateur `real` sur la relais AXIS (protocole Messages, `/v1/messages`), modèles par rôle dans les données.
