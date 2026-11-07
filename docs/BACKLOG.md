# Backlog et jalons

> Source : cahier §3, §18–§21. Les ids sont repris tels quels comme tickets GitHub. Charge cible : ~20 h effectives par personne sur 24 h calendaires (4 h de pauses réparties). Estimations à suivre à chaque jalon.

## Périmètre
- **P0** (indispensable) : F01–F14. **P1** (après recette P0) : F15 (second secteur Expert, animations, export du bilan). **P2** (hors hackathon) : F16 (comptes, multijoueur, recruteur, salaires, génération libre, navigation web ouverte).

| ID | Exigence P0 |
|---|---|
| F01 | Créer une partie (nom, mode, profil) ; état identique après rechargement |
| F02 | Bureau, trésorerie, progression, agents, prochaine action |
| F03 | Accepter une commande ; brief, documents, critères, récompense max |
| F04 | Échanger avec un agent possédé ; compteur 5 messages et coût |
| F05 | Afficher un livrable, choisir une version, éditer manuellement |
| F06 | Livrer une version figée ; avis client argumenté ; paiement serveur |
| F07 | Acheter un agent débloqué ; jamais de double débit |
| F08 | Six missions + secours ; déblocages publiés |
| F09 | Demander une précision au client ; événement sur brief versionné |
| F10 | Carnet de prompts ; indices ; bilan pédagogique |
| F11 | Déléguer via le chef dans des limites visibles |
| F12 | Sauvegarde après chaque action ; reprise complète |
| F13 | Finale, fin avec résultats et compétences, rejouer |
| F14 | Réinitialisation de démo protégée ; suivi des appels IA |

## Jalons
| Période | Effort/pers. | Jalon vérifiable |
|---|---|---|
| H0–H2 | 2 h | Contrats et scénarios figés ; accès fournisseur testé ; maquette du parcours ; **fixtures par écran livrées** |
| H2–H6 | 3 h | **M1 jouable de bout en bout** (prompt, version, livraison, évaluation, paiement) |
| H6–H12 | 5 h | Deux modes, sauvegarde, boutique, M2–M4, quotas branchés ; **décision de périmètre à H12** |
| H12–H16 | 3 h | Campagne retenue, délégation du chef, événement, fin jouables ; **gel des fonctions à H16** |
| H16–H21 | 4,5 h | Intégration finale, recette, calibration, défauts bloquants |
| H21–H24 | 2,5 h | Déploiement, sauvegarde de démo, documentation, répétition |

## Personne 1 — Interface, bureau, conversations, pédagogie
| Ticket | Charge | Travail et critère de fin |
|---|---|---|
| UI01 | 2 h | Accueil et création : mode, nom, reprise de session |
| UI02 | 3 h | Bureau et commandes : trésorerie, agents, étapes, documents ; M1 en ≤ 3 actions |
| UI03 | 4 h | Conversation et livrable : réponses, versions, compteur, coûts ; envois impossibles bloqués sans masquer les causes |
| UI04 | 1 h | Boutique : prix/prérequis, achat confirmé, propriété depuis l'état serveur |
| UI05 | 2 h | Livraison et retour client : figer, attendre, critères, paiement, correction |
| UI06 | 2 h | Aides, carnet, événement : indice progressif, prompts, nouvelle version du brief |
| UI07 | 3 h | Mobile et accessibilité : clavier, focus, tailles, erreurs, largeur 390 px |
| UI08 | 3 h | Intégration et démo : données réelles, reprise, bilan, parcours complet |
Dépendances : UI01–02 utilisent le schéma d'état de P2 (H2) ; UI03 les schémas d'actions et sorties d'agents de P3. Livrables : statuts/formats/erreurs partagés, atelier avec source du livrable, écran de validation du plan du chef, tous les états vides/limites. P1 joue une partie complète avec une personne extérieure.

## Personne 2 — API, données, moteur, transactions, déploiement
| Ticket | Charge | Travail et critère de fin |
|---|---|---|
| BE01 | 2 h | Dépôt, contrats, base : API lançable, schémas partagés, sessions, migrations ; **débloque P1 et P3** |
| BE02 | 3 h | Moteur de campagne : modes, 6 missions, états, passages, victoire côté serveur |
| BE03 | 3 h | Économie : ledger, réservations, achats, coûts, différentiel de reprise |
| BE04 | 3 h | Actions et quotas : 5 messages, délégations, idempotence, timeout, reprise sans double débit |
| BE05 | 2 h | API de livrables : versions immuables, livraison figée, partage de pièces, sauvegarde |
| BE06 | 3 h | Branchement IA : adapter l'interface de P3, stocker appels/évaluations, valider, calculer le score |
| BE07 | 2 h | Tests critiques : paiement unique, concurrence, fonds, accès inter-session, événements versionnés |
| BE08 | 2 h | Déploiement : variables serveur, stockage persistant, santé, sauvegarde de démo |
Livrables : OpenAPI, fixtures JSON, erreurs stables ; règles issues de données versionnées ; commandes lancer/tester/initialiser la démo/vérifier l'état ; journal permettant d'expliquer chaque variation de solde. BE03+BE04 **précèdent** l'activation du chef. BE06 ne fait jamais confiance à une récompense renvoyée par l'agent client.

## Personne 3 — Agents, missions, évaluateur, calibration
| Ticket | Charge | Travail et critère de fin |
|---|---|---|
| AI01 | 2 h | Fournisseur : confirmer l'accès, 1 appel, limites, adaptateur minimal (+ mock) |
| AI02 | 2 h | Rôles métier : 6 rôles, outils autorisés, formats, clarifications |
| AI03 | 3 h | Client évaluateur : grilles, schéma, preuves, seuils, exemples, résistance aux instructions du livrable |
| AI04 | 4 h | Campagne : 6 missions, variantes Débutant/Expert, corpus, secours, solutions de référence |
| AI05 | 3 h | Chef d'équipe : plans bornés, partage de contexte, délégations, restitution |
| AI06 | 2 h | Calibration : lots hors sujet/partiels/complets, comparaison au jugement humain |
| AI07 | 2 h | Aides et consommation : indices, bilan fondé sur les traces, suivi des tokens |
| AI08 | 2 h | Recette et démo : 2 modes, partie seedée, limites observées |
P2 relit schémas et attribution des scores ; P1 relit les retours client (compréhensibles par un novice).

## Collaboration
Dépôt commun, **branches courtes**, revue par une autre personne, branche principale toujours lançable. Deux points de synchronisation par jour ; changement de schéma signalé immédiatement ; fixtures versionnées ; le dernier tiers du temps = intégration, recette, démo. Un changement de règle partagé est **écrit avant fusion**.

**En cas de retard** : simplifier le bureau, réduire les variantes Expert et les animations **avant** de supprimer une règle de fiabilité. Un périmètre de secours à **3 agents** doit être annoncé explicitement s'il est activé.
