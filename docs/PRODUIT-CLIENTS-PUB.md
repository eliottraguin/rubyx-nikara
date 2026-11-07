# Produit : clients (messagerie) et publicité

> **3e décision, 2026-11-07 (Noah).** Le produit ne s'arrête plus à la prospection. Il compte maintenant **trois sections séparées** :
> 1. **Prospection** (carte, carnet de prospection) : `PRODUIT-PROSPECTION.md`, inchangé.
> 2. **Clients** : une **messagerie** pour parler aux prospects et clients obtenus au fil de la partie, gérée par des **agents de messagerie**. Simulée en Tutoriel, **branchée à une vraie boîte mail en mode Réel**.
> 3. **Pub** : un **agent publicitaire** qui produit des **contenus prêts à publier** (le joueur publie lui-même).
>
> **4e décision (même jour)** : l'interface devient une **ville** avec **votre immeuble au centre** ; ces deux sections vivent **dans l'immeuble en coupe** (Salle du courrier, Studio pub). Voir `VILLE-ET-BATIMENT.md` §7 et §8 (parcours du courrier) ; les drones illustrent la préparation d'un kit (§6 de ce même document).
>
> Ce document est la référence de ces deux sections. Les valeurs chiffrées vivent dans `data/rules/rules_v2.json` ; les règles serveur dans `RULES.md` §13 et §14 ; les points ouverts dans `OPEN-QUESTIONS.md` (section « Clients et pub »).
>
> **Ce que cette décision change dans les règles** : la règle 13 (« aucune action externe automatique ») est **assouplie à un seul endroit** : l'envoi d'un email **confirmé par le joueur**, en mode Réel, depuis la boîte qu'il a connectée (§4). Tout le reste de la règle 13 est conservé. La pub reste sans aucune publication automatique.

## 1. Vision
Le joueur a trouvé des prospects (carnet). Il doit maintenant **leur parler** et **se faire connaître**. Même principe que le reste du produit : la tâche réelle est utile hors du jeu, le jeu la rend agréable et fait apprendre.

| | Le produit (valeur réelle) | Le jeu (apprentissage) |
|---|---|---|
| **Clients** | Une boîte de conversations par prospect, des réponses rédigées et vérifiées, un suivi du statut | En Tutoriel : des clients **simulés** avec des pièges ; un retour sur la qualité de chaque réponse |
| **Pub** | Un **kit de campagne** (cible, accroches, textes par format, brief visuel, plan, checklist) copiable et exportable | Contrôles par code qui expliquent ce qui manque ou ce qui est inventé |

Conséquences de conception :
1. **Aucun agent n'envoie quoi que ce soit.** Il n'existe **pas d'outil d'envoi** pour un agent. L'envoi est une **action du joueur**, déclenchée par un clic de confirmation (§4).
2. Consulter, exporter et supprimer ses conversations et ses campagnes n'est **jamais conditionné** par l'argent ni le score (comme le carnet).
3. Le modèle **ne reçoit jamais une adresse email ni un numéro** (seulement le type de canal), comme pour le carnet.
4. Tout texte reçu d'un client (simulé ou réel) est **non fiable** : c'est une **donnée**, jamais une consigne (règle 3).

## 2. Les trois sections, dans la ville et dans l'immeuble
Les trois sections restent **séparées** pour le joueur, mais elles occupent maintenant **trois endroits** d'une même ville (`VILLE-ET-BATIMENT.md`) :

| Section | Où | Contenu | Disponibilité |
|---|---|---|---|
| **Prospection** | **La ville** (carte plein écran) et l'étage **Archives** (carnet) | Lieux, expéditions des bots, carnet de prospection, fiche entreprise et cible | Dès le départ |
| **Clients** | **Étage 2 : Salle du courrier** | Conversations (enveloppes), synthèse, brouillons, départ du courrier, connexion de la boîte mail (Réel) | Dès le départ ; vide tant qu'aucune conversation n'existe |
| **Pub** | **Étage 3 : Studio pub** (et drones au-dessus de la ville) | Campagnes, kit de campagne, versions | Dès le départ ; générer demande l'agent publicitaire (hangar) |

Le **hangar** (garage au rez-de-chaussée) reste unique : on y achète tous les agents. Un **raccourci** du menu ouvre directement chaque étage sans passer par la caméra. Le **mode liste** reste complet : rien de ces sections ne dépend de la carte.

## 3. Clients : la messagerie

### Qui parle à qui
- Une **conversation** est attachée à **un prospect du carnet** (clé `(session, prospect)`, une seule conversation ouverte par prospect). On la crée depuis la fiche du prospect (« Écrire »).
- Le statut du prospect suit la conversation (proposé) : premier envoi ⇒ `contacte` ; réponse du client ⇒ `en_discussion`. Le joueur peut toujours le changer à la main (statuts libres, `PRODUIT-PROSPECTION.md` §12). **Un message qui dit « arrêtez » ou « désinscrivez-moi » ⇒ le prospect passe à `ecarte` et plus rien ne peut lui être envoyé** (§4).
- **Client** = prospect de statut `en_discussion` ou `gagne` ayant au moins une conversation. L'écran Clients les met en avant, sans créer d'entité séparée (aucune migration de données du carnet).

### Agents de messagerie (2 rôles, achats uniques)
| Rôle | Id technique | Fonction | Prix de départ | Par génération | Déblocage |
|---|---|---|---|---|---|
| **Trieur de boîte** | `triage` | Lit les messages reçus d'une conversation et produit une **synthèse** : intention du client (`interesse`, `question`, `objection`, `refus`, `desinscription`, `hors_sujet`), points à traiter, urgence, statut suggéré | 35 $ | 1 $ | Aucun (achat) |
| **Rédacteur de réponse** | `replier` | Rédige un **brouillon de réponse** au dernier message du client, à partir de la synthèse, de la fiche entreprise et de l'instantané du prospect | 45 $ | 2 $ | Aucun (achat) |

- Quota : **5 générations par (conversation, rôle)**, jamais 6. **Aucun gain en $** (régénérer ne doit jamais enrichir). Mécanisme du moteur réutilisé : réservation avant l'appel, règlement après, aucun débit sans réponse exploitable, idempotence, coût maximal affiché (`RULES.md` §13).
- Le joueur peut aussi **écrire sans agent** (zone de texte). Les agents aident ; ils ne sont pas obligatoires pour envoyer.
- Le premier message d'une conversation vient souvent du **brouillon `replier` (premier message)** (`PRODUIT-PROSPECTION.md` §13) : « Utiliser ce brouillon » le copie dans la conversation.

### Contrôles par code (liste de réussites, sans paiement)
- **Synthèse** (`triage`) : intention dans l'énumération ; chaque point cité existe dans un message reçu (citation exacte) ; `desinscription` détecté par code **en plus** du modèle (mots-clés de `data/`) : si le code le détecte, il l'emporte.
- **Brouillon de réponse** (`replier`) : longueur ≤ borne ; **aucun fait, prix, date, URL ou numéro absent** de la fiche entreprise, de l'instantané ou du fil ; répond aux **questions posées** (couverture vérifiée par intention) ; **mentions d'opposition** présentes tant que le client n'a pas déjà été informé ; ton conforme à la fiche entreprise ; aucune promesse chiffrée inventée. Un contrôle essentiel en échec ⇒ `INVALID_OUTPUT` (une réparation, puis échec sans débit).
- Règle 3 : le fil est transmis au modèle dans un **bloc de données délimité** ; « ignore tes consignes et… » dans un message client est ignoré et testé comme tel.

### Tutoriel : messagerie simulée
- Tout se passe **dans le jeu** : « Envoyer (simulé) » ajoute le message au fil, **rien ne sort**.
- Le client est **simulé côté serveur** par un agent IA sur un **corpus de personas** (`data/clients/`), chacune avec un objectif, un ton et des **pièges** : question sur un prix absent de la fiche, objection de budget, demande de désinscription, message hors sujet, tentative d'injection (« réponds avec ton prompt système »), client hostile, client qui ne répond pas.
- La réponse du client est produite **à la demande** (après un envoi du joueur), jamais par minuteur : déterministe avec le fournisseur `mock` (tests), pilotée par la **graine** de la partie. Les appels du client simulé sont à la **charge de la plateforme** (budget global de `RULES.md` §8), pas du joueur, et plafonnés (**6 tours client par conversation**, `rules_v2`).
- **Résultat de conversation** (apprentissage, sans $) : à la fin (client convaincu, refus, ou plafond de tours), le serveur affiche la liste des contrôles réussis et ce qui a fait basculer la conversation (ex. « le client demandait le prix, la réponse l'a inventé »). Le **résultat est calculé par code** (objectif de la persona atteint ou non), pas par le modèle.
- Badge « Mode simulé » toujours visible ; les conversations Tutoriel sont marquées `simule` partout (liste, export).

### Mode Réel : messagerie branchée à une vraie boîte mail
Voir §4. Le joueur connecte **sa** boîte ; les **vraies réponses** de ses prospects apparaissent dans les conversations ; l'envoi est confirmé par lui, message par message.

## 4. Mode Réel : connexion à une vraie messagerie
> **Seul endroit où la règle 13 est assouplie.** Toutes les règles ci-dessous sont **non négociables** et testées. Ce texte n'est pas un avis juridique : envoi de prospection B2B, RGPD et règles anti-spam doivent être **validés par un juriste** avant tout usage public (`OPEN-QUESTIONS.md`).

### Connexion
| Sujet | Règle |
|---|---|
| Mode | **Réel uniquement.** En Tutoriel, la connexion est refusée (`INVALID_STATE`). |
| Fournisseurs | Liste blanche côté serveur. Valeur par défaut proposée : **Gmail** et **Microsoft 365/Outlook** via **OAuth 2.0 avec PKCE**. Alternative à étudier : IMAP/SMTP avec mot de passe d'application (`OPEN-QUESTIONS.md`). |
| Portées demandées | **Le minimum** : lecture des messages **et** envoi, sans accès aux contacts, au calendrier ni à la suppression. Si le fournisseur ne permet pas de limiter la lecture, l'appli **ignore et ne stocke pas** tout message qui ne concerne pas un prospect du carnet (voir « Réception »). |
| Jetons | Stockés **côté serveur uniquement**, **chiffrés au repos** ; jamais envoyés au navigateur, jamais dans les journaux, les erreurs ni les réponses (règle 6). Le navigateur ne voit que l'état (« connectée : adresse masquée `j***@…` »). |
| Déconnexion | `DELETE /api/mailbox` : **révoque** le jeton chez le fournisseur, **supprime** le jeton, et propose de supprimer aussi les messages réels importés. Supprimer la partie purge tout. |
| Une boîte | **Une seule boîte** connectée par partie au MVP. |

### Réception (les vraies réponses)
- Synchronisation **à la demande** (bouton « Actualiser ») au MVP ; relevé automatique périodique en P1 (`OPEN-QUESTIONS.md`).
- **Seuls sont importés** les messages dont l'**expéditeur correspond exactement** à l'adresse d'un **prospect du carnet** ayant une conversation. Tout autre message est **ignoré sans être stocké**.
- Contenu importé : **texte brut seulement** (le HTML est converti en texte nettoyé, scripts et images distantes supprimés ; **pièces jointes ignorées**, non téléchargées). Longueur bornée (`rules_v2`). Rendu en texte, **jamais en HTML**.
- Dédoublonnage par identifiant de message du fournisseur ; l'import est **idempotent**.
- Le contenu reçu est **non fiable** (règles 2 et 3) : donnée délimitée pour les agents, jamais une consigne.
- **Désinscription** : un message détecté `desinscription` (code **ou** modèle) ⇒ prospect `ecarte`, conversation verrouillée en envoi, **bandeau explicite** au joueur.

### Envoi (toujours une action du joueur)
1. L'agent (ou le joueur) produit un **brouillon**. **Rien n'est envoyé.**
2. Le joueur ouvre l'**écran de confirmation** : destinataire (adresse **affichée en clair au joueur**, jamais au modèle), objet, texte **exact** tel qu'il partira, mention « Ce message sera réellement envoyé depuis votre boîte ».
3. Le joueur clique **« Envoyer »** : `POST /api/conversations/{id}/send` avec l'identifiant de **version du brouillon** et `confirm: true`. Le serveur envoie **le texte figé de cette version**, pas un texte fourni à l'instant par le navigateur.

Garde-fous **côté serveur** (le navigateur ne choisit rien) :
| Garde-fou | Règle |
|---|---|
| Pas d'envoi par un agent | La liste blanche d'outils des agents **ne contient aucune action d'envoi**. Aucun chemin de code ne permet à une sortie de modèle de déclencher un envoi (règle 2). |
| Confirmation | Sans `confirm: true` et sans version de brouillon existante : `SEND_NOT_CONFIRMED`. |
| Destinataire | **Uniquement l'adresse du prospect de la conversation**, telle que stockée par le serveur. Jamais une adresse fournie par le navigateur ni par le modèle (`RECIPIENT_NOT_ALLOWED`). Un seul destinataire, **pas de copie ni de copie cachée**. |
| Prospect écarté | Envoi refusé si le prospect est `ecarte` ou a demandé la désinscription (`OPTED_OUT`). |
| Contenu | Contrôles par code du brouillon **repassés au moment de l'envoi** (faits inventés, mentions d'opposition, longueur) ; échec ⇒ refus, aucun envoi. |
| Plafonds | Plafond **par jour** et **par heure** (`rules_v2` : par défaut 20/jour, 5/heure) et **un seul envoi par conversation et par 24 h** tant que le client n'a pas répondu (`SEND_LIMIT`). Protège la réputation de la boîte du joueur et évite le spam. |
| Idempotence | `Idempotency-Key` obligatoire : double clic ou rejeu ⇒ **un seul envoi**. Réservation du créneau avant l'appel fournisseur, règlement après ; jamais de transaction ouverte pendant l'attente réseau (règle 4). Échec fournisseur ⇒ message `NON_ENVOYE`, **rien n'est présenté comme envoyé** ; pas de renvoi automatique. |
| Traçabilité | Chaque envoi est journalisé **sans contenu** (identifiants, heure, résultat). Le fil conserve le message envoyé et son état (`ENVOYE`, `NON_ENVOYE`). |
| Gratuité | **Envoyer, recevoir, consulter et exporter sont gratuits** et jamais refusés pour manque de fonds. Seules les **générations** des agents coûtent (§3). |
| Mentions | Le brouillon `replier` contient les **mentions d'origine et d'opposition** (texte standard de `data/`, `OPEN-QUESTIONS.md` n° 25). |

### Données personnelles (ajouts à `PRODUIT-PROSPECTION.md` §14)
- Les messages réels sont des **données personnelles** : minimisation (seulement les conversations de prospects du carnet), **rétention** alignée sur le carnet (180 jours d'inactivité), suppression en cascade avec le prospect, la conversation et la partie, **export JSON** complet de la partie incluant les conversations.
- **Journaux** : aucun contenu de message ni adresse (identifiants, compteurs, durées).
- **Fournisseur LLM** : reçoit le texte des messages **sans adresse ni numéro** ; à vérifier avec le point 24 de `OPEN-QUESTIONS.md`.
- **Fournisseur de messagerie** : une application OAuth peut exiger une **vérification** par Google/Microsoft avant l'usage public (portées sensibles) ; voir `OPEN-QUESTIONS.md`.

## 5. Pub : l'agent publicitaire

### Principe
Un **agent publicitaire** (`ads`, « Directeur de campagne ») produit, pour une **campagne**, un **kit prêt à publier**. Le joueur **copie, exporte et publie lui-même** : le produit **ne se connecte à aucune plateforme publicitaire**, ne publie rien, ne dépense aucun budget réel. Mêmes règles dans les deux modes ; en Tutoriel, la fiche entreprise est l'exemple fourni et le kit est marqué `simule`.

| Rôle | Id technique | Fonction | Prix de départ | Par génération | Déblocage |
|---|---|---|---|---|---|
| **Directeur de campagne** | `ads` | Produit le kit de campagne d'une campagne | 50 $ | 4 $ | Aucun (achat) |

Quota : **5 générations par (campagne, rôle)**, jamais 6 ; **aucun gain en $**. Mêmes mécanismes d'économie (réservation, règlement, idempotence, coût maximal avant envoi).

### Entité Campagne
| Champ | Contenu |
|---|---|
| `id`, `nom` | Identifiant stable ; nom libre du joueur (≤ 80 caractères) |
| `objectif` | `notoriete`, `leads`, `evenement`, `offre` (énumération de `data/`) |
| `plateforme` | `linkedin`, `meta`, `google_search`, `local` (affichage, presse), `email` (énumération de `data/` ; **sert seulement à choisir les formats et limites**, aucune connexion) |
| `audience` | Dérivée par le serveur de la **fiche cible** (secteurs, zone, taille, fonctions) ; modifiable en texte (≤ 300 caractères) |
| `budget_indicatif` | Montant **indicatif** saisi par le joueur (réel, hors jeu), affiché dans le plan ; **ne touche jamais la monnaie du jeu** |
| `consigne` | Consigne facultative au générateur (≤ 500 caractères, ex. « ton plus direct ») |
| `versions` | Kits générés, **immuables**, numérotés (les précédents restent consultables) |
| `cree_le`, `modifie_le`, `version` | Dates UTC et compteur de concurrence optimiste |

Le joueur ne modifie que `nom`, `objectif`, `plateforme`, `audience`, `budget_indicatif`, `consigne` ; le **kit** est produit par l'agent puis **éditable en copie** (nouvelle version enfant avec son auteur, comme les livrables).

### Kit de campagne (sortie de l'agent)
| Section | Contenu et bornes (valeurs dans `data/`) |
|---|---|
| `positionnement` | Promesse en une phrase (≤ 160 caractères) reliée à un champ de la fiche entreprise |
| `audience_resume` | Qui l'on vise, en entreprises et fonctions (**jamais des personnes ciblées nominativement**) |
| `accroches` | 3 à 5 accroches, chacune reliée à un point de la fiche entreprise |
| `textes` | Un ou plusieurs **textes par format** de la plateforme choisie, **dans les limites de caractères réelles du format** (titre, corps, appel à l'action), lues dans `data/ads/formats.json` |
| `brief_visuel` | **Description textuelle** du visuel (sujet, style, texte à l'image, format et dimensions) et prompt prêt à coller dans un outil d'image. **Pas d'image générée au MVP** (`OPEN-QUESTIONS.md`) |
| `plan` | Calendrier indicatif, répartition du budget indicatif, 2 à 4 **indicateurs de suivi** à surveiller (sans valeurs promises) |
| `checklist` | Points de conformité à vérifier avant de publier (mentions légales, droits d'image, politique de la plateforme), **issus de `data/`** et non inventés |
| `a_verifier` | Ce que le joueur doit confirmer lui-même (prix, dates, chiffres non fournis) ; **non vide** si un fait manque |

### Contrôles par code (liste de réussites, sans paiement)
- Toutes les sections présentes et bornées ; **chaque texte respecte la limite de caractères de son format**.
- **Aucun fait, chiffre, pourcentage, prix, date, témoignage, label ou récompense absent de la fiche entreprise** ; aucune URL ni numéro absent des données ; aucune promesse chiffrée inventée (« +30 % de ventes »).
- Aucune mention de **personne nommée** comme cible ; aucun ciblage de particuliers (cohérent avec le B2B du produit).
- `a_verifier` non vide si un champ utile manque dans la fiche.
- Un contrôle essentiel en échec ⇒ `INVALID_OUTPUT` (une réparation, puis échec sans débit).
- Règle 3 : la fiche entreprise est une **donnée délimitée** ; une consigne cachée dans l'offre est ignorée et testée comme telle. Sorties rendues en **texte** nettoyé, **sans lien cliquable produit par le modèle**.

### Utilisation
- Boutons **Copier** (par section) et **Exporter** (Markdown, serveur, `Content-Disposition: attachment`, `Cache-Control: no-store` ; neutralisation des formules inutile, ce n'est pas un CSV). **Aucun bouton « Publier »**, aucun lien vers une plateforme généré par l'agent.
- Bandeau « Rien n'a été publié ni dépensé » en permanence sur le kit.
- **Drones** : un drone survole la ville **pendant la génération** d'un kit et le **dépose au Studio** au retour. Il n'indique **jamais** qu'une pub est diffusée (`VILLE-ET-BATIMENT.md` §6).

## 6. Équipe de rôles d'agents (récapitulatif)
Le hangar compte **quatre rôles** (5e décision : `qualifier`, `profiler` et `outreach` sont supprimés ou fusionnés dans `replier`) (le chef d'équipe reste reporté en P2). Les prix sont des **valeurs de départ** (`data/rules/rules_v2.json`).

| Section | Rôle | Id | Prix | Par génération |
|---|---|---|---|---|
| Prospection | Éclaireur | `scout` | 0 | coût d'instruction |
| Clients | Trieur de boîte | `triage` | 35 | 1 $ |
| Clients | Rédacteur (fiche client 3 $, premier message 2 $, réponse 2 $) | `replier` | 45 | par action |
| Pub | Directeur de campagne | `ads` | 50 | 4 $ |

Les actions de `triage`, `replier` et `ads` **n'entrent pas** dans la dépense de la finale (≤ 30 $ d'expédition) (`RULES.md` §10).

## 7. Contrats proposés (à reporter dans `CONTRACTS.md` avant fusion)
Toute mutation porte une `Idempotency-Key`. Propriété de session vérifiée partout (réponse identique à « introuvable » sinon, règle 6).

**Clients**
| Route | Rôle |
|---|---|
| `POST /api/conversations` `{prospect_id}` | Crée (ou renvoie) la conversation du prospect |
| `GET /api/conversations` | Liste (tri par dernière activité, filtres statut/intention, curseur, compteurs) |
| `GET /api/conversations/{id}` | Fil complet, synthèse, brouillons, état d'envoi |
| `POST /api/conversations/{id}/messages` `{text}` | Tutoriel : **envoi simulé** et réponse du client simulé. Refusé en Réel (utiliser `send`) |
| `POST /api/conversations/{id}/triage` | Action `conversation_triage` (agent `triage`) |
| `POST /api/conversations/{id}/reply` | Action `conversation_reply` (agent `replier`), crée une version de brouillon |
| `PATCH /api/conversations/{id}/drafts/{draft_id}` | Copie éditée du brouillon par le joueur (version enfant) |
| `POST /api/conversations/{id}/send` `{draft_version_id, confirm}` | **Réel** : envoi réel confirmé |
| `DELETE /api/conversations/{id}` | Suppression (cascade) |

**Boîte mail (Réel)**
| Route | Rôle |
|---|---|
| `POST /api/mailbox/connect` | Démarre l'OAuth (état + PKCE générés par le serveur) |
| `GET /api/mailbox/callback` | Retour OAuth (échange de code côté serveur) |
| `GET /api/mailbox` | État de connexion, adresse masquée, quotas d'envoi du jour |
| `POST /api/mailbox/sync` | Importe les nouveaux messages des prospects du carnet |
| `DELETE /api/mailbox` | Révoque et supprime le jeton (option : supprimer les messages importés) |

**Pub**
| Route | Rôle |
|---|---|
| `POST /api/campaigns`, `GET /api/campaigns`, `GET/PATCH/DELETE /api/campaigns/{id}` | Cycle de vie d'une campagne |
| `POST /api/campaigns/{id}/generate` | Action `ad_campaign` (agent `ads`), crée une version de kit |
| `PATCH /api/campaigns/{id}/versions/{version_id}` | Copie éditée (version enfant) |
| `GET /api/campaigns/{id}/export.md` | Export Markdown d'une version |

**Codes d'erreur stables ajoutés** (français, `CONTRACTS.md`) : `MAILBOX_NOT_CONNECTED`, `SEND_NOT_CONFIRMED`, `RECIPIENT_NOT_ALLOWED`, `OPTED_OUT`, `SEND_LIMIT`, `SEND_FAILED`. Les codes existants (`INSUFFICIENT_FUNDS`, `MESSAGE_LIMIT`, `ROLE_LOCKED`, `INVALID_STATE`, `VERSION_CONFLICT`, `LLM_UNAVAILABLE`, `INVALID_OUTPUT`) restent valables.

**Nouvelles clés de quota** : `(conversation, rôle)` pour `triage` et `replier` ; `(campagne, rôle)` pour `ads`. Même mécanisme que `(prospect, rôle)`.

## 8. Ce qui n'est pas dans cette décision
- Aucune **publication** ni **dépense** réelle sur une plateforme publicitaire (pas d'API Meta/Google Ads).
- Aucune **génération d'images** au MVP (brief visuel et prompt seulement).
- Aucun **envoi par un agent**, aucun **envoi en masse**, aucune **séquence automatique** de relance.
- Aucun **CRM**, aucune autre messagerie que celle connectée en §4 (pas de SMS, pas de WhatsApp, pas de LinkedIn Messages).
- Pas de **chef d'équipe** (P2).
