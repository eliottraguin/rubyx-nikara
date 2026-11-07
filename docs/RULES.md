# Règles de jeu (source de vérité serveur)

> Source : cahier des charges v1.1, §5, §6, §7, §10, §16. Toute valeur ci-dessous vit dans des **données versionnées** (`data/rules/`), jamais en dur dans le code. Le navigateur ne choisit jamais un solde, un score ou un droit.

## 1. Monnaie et départ
- Monnaie : « dollars de jeu » (entiers). Aucun lien avec les tokens réels.
- Capital initial : **30**, plus le **rédacteur** (gratuit), dans les deux modes. Aucun salaire périodique (MVP).
- Solde disponible = solde comptabilisé − réservations actives.

## 2. Agents (achats uniques)
| Rôle | Id technique | Prix | Déblocage |
|---|---|---|---|
| Rédacteur | `writer` | 0 | Au lancement |
| Prospecteur | `prospector` | 20 | Réussite M1 |
| Chargé de veille | `researcher` | 35 | Réussite M2 |
| Responsable qualité | `qa` | 30 | Réussite M2 |
| Analyste | `analyst` | 45 | Réussite M3 |
| Chef d'équipe | `lead` | 80 | Réussite M5 |

Le nom affiché est « chargé de veille » ; l'id technique `researcher` est utilisé dans les schémas (ex. plan du chef). Unicité `(session, rôle)` : un double achat concurrent ne débite et ne crée qu'une fois (F07, T06).

## 3. Missions : gains et tarifs
| Mission | Gain max | Prix par appel de rôle | Débloque |
|---|---|---|---|
| M1 | 20 | 0 | Prospecteur |
| M2 | 30 | 1 | Veille, Qualité |
| M3 | 40 | 1 | Analyste |
| M4 | 60 | 2 | (progression vers M5) |
| M5 | 90 | 2 (hors crédit exceptionnel) | Chef d'équipe |
| M6 | 150 | 3 | Fin de campagne |
| Secours | 10 | 0 (5 messages gratuits, rédacteur) | Rien (financement seulement) |

Le tarif est **figé à l'ouverture de la tentative** (`POST /api/missions/{id}/start`) même si la campagne progresse ensuite.

## 4. Quotas et coût d'une action
- **Cinq instructions maximum par agent et par tentative.** Le 1er prompt et chaque correction comptent ; réponses et consultation d'historique ne comptent pas.
- Coût = tarif de l'étape × nombre d'appels de rôles prévus. Le **maximum est affiché avant confirmation**.
- 5e message : l'agent répond ; la saisie se désactive ; édition manuelle et livraison restent possibles.
- **Erreur technique** : aucun débit, aucun message consommé si aucune réponse exploitable n'est enregistrée ; la réservation est libérée. Une réponse exploitable mais peu pertinente reste facturée.
- **Idempotence** : même `Idempotency-Key` ⇒ même `ActionRun`, aucun nouvel appel ni débit (double clic, reprise réseau).
- **Clarifications au client** : 2 gratuites par tentative, hors quotas agents, réponses factuelles uniquement.
- Indices et carnet : gratuits. Réutiliser un prompt du carnet dans un envoi normal consomme un message.
- Édition manuelle : gratuite, crée une version enfant avec son auteur.
- Plafond global : **36 appels modèle par tentative**, réparations comprises, dont **2 réservés** à l'évaluation client et sa réparation.

### Délégation du chef d'équipe
1. Une instruction au chef consomme 1 de ses 5 messages et paie la préparation du plan.
2. Le plan contient **≤ 2 étapes**, des rôles possédés, des dépendances sans cycle, des pièces appartenant à la tentative.
3. Le joueur confirme séparément le plan et son surcoût (`POST /api/actions/{id}/confirm`), **sans nouvel appel de planification**.
4. Chaque délégation consomme un message du destinataire et son tarif.
5. Interdits : appel récursif chef→chef, appel vers le client, 3e délégation.
6. Résultat partiel : étapes réussies conservées, réservations inutilisées libérées, la reprise ne rejoue pas les étapes terminées.

### Réservation / règlement
Réserver montant + quota **atomiquement avant** l'appel ; débiter **uniquement** les réponses réussies, atomiquement après. Aucune transaction de base ouverte pendant l'attente réseau.

## 5. Score et paiement
Pondération de référence (versionnée par mission) :

| Critère | Poids |
|---|---|
| Exactitude et informations utiles | 40 |
| Contraintes de livraison | 20 |
| Adéquation au besoin | 20 |
| Clarté et utilisabilité | 10 |
| Sources et cohérence | 10 |

- Les formats et calculs sont vérifiés **par du code** ; le client IA ne juge que le sémantique et explique les écarts.
- Le serveur valide types et bornes (`rating ∈ [0,1]`, ids connus, preuve valide) puis calcule le **score /100**. Tout champ de récompense suggéré par le modèle est **ignoré**.
- Hors sujet ⇒ **0**. Critère essentiel non rempli ⇒ score **plafonné à 40**.
- Réussite : mission ordinaire **≥ 60** sans échec essentiel ; **finale ≥ 70** avec tous les essentiels.
- Paiement cible = `floor(gain_max × score / 100)` (ex. max 20 : 0→0, 65→13, 100→20).
- Une livraison fige texte + brief + grille ; son id et son empreinte empêchent les paiements répétés (T04).
- **Reprise** : nouvelle tentative avec ses compteurs ; paiement supplémentaire = `max(0, cible − meilleur paiement déjà acquis)` (13 → 17 crédite 4, T05).
- JSON d'évaluation invalide ou panne : **une seule** réparation ; sinon livraison `EVALUATING` récupérable, sans récompense inventée.
- Réputation = moyenne des meilleurs scores des missions terminées ; informative, aucun seuil caché.

## 6. Événements
Tout événement a un id, un point de déclenchement et crée une **nouvelle version du brief** avec diff affiché.

| Événement | Règle de justice |
|---|---|
| Changement de cible (M5) | Un seul message restant devient gratuit, **une fois par rôle concerné** ; le quota reste 5 (jamais 6). Déclenché assez tôt pour corriger. |
| Sources contradictoires (M4) | Dates et autorité des documents permettent de trancher ou de signaler l'incertitude. |
| Budget réduit | Aucune dépense déjà confirmée n'est révoquée ; la nouvelle limite reste réalisable. |
| Contexte incomplet (M3) | Le joueur peut partager la pièce ou demander une clarification. |

- M6 : l'événement est injecté **avant la première action**.
- Le hasard ne détermine ni prix, ni récompenses, ni critères. Une **graine** enregistrée rend les variantes reproductibles.
- Mode Démo : le présentateur choisit un événement admissible avant livraison, sans changer note ni solde ; badge visible ; commandes cachées jamais actives en partie normale.

## 7. Fin de campagne
- M6 : victoire = score ≥ 70, essentiels exacts, **dépense ≤ 30**, ≥ **2 rôles** ayant produit une contribution liée au livrable. Le chef est facultatif.
- M1–M5 réalisables avec le seul rédacteur ; la fin est atteignable sans acheter tous les agents (T12).
- Mission de secours : rejouable (nouveaux ids de commande), accessible sans argent (T11).

## 8. Limites techniques (configurables côté serveur)
| Sujet | Valeur initiale |
|---|---|
| Prompt joueur | 4 000 caractères |
| Sortie agent métier / chef-client | 800 / 1 200 tokens |
| Timeout appel | 45 s, 1 nouvelle tentative technique max |
| Concurrence fournisseur | 5 appels simultanés |
| Budget tokens | Plafond partie + global ; seuil atteint ⇒ pause + sauvegarde, jamais de faux résultat ; réserve 60 M sur 300 M |

## 9. Vérification
Ces règles sont couvertes par les tests T02–T06, T09–T12 (voir `RECETTE.md`). Calcul de contrôle du parcours type : scores 80/70/70/70/70 ⇒ 16+21+28+42+63 = **170** ; 30 + 170 − 35 − 80 − 30 (frais illustratifs) = **55**.
