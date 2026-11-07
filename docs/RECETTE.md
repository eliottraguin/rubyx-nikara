# Recette et critères d'acceptation

> Source : cahier §2, §22. Aucun objectif chiffré n'est présenté comme un résultat avant mesure.

## Tests d'acceptation
| Test | Résultat attendu | Responsable |
|---|---|---|
| T01 | Créer puis recharger chaque mode conserve entreprise, étape, agent et capital | P1, P2 |
| T02 | 5e envoi accepté, 6e refusé ; une erreur fournisseur libère coût et quota | P2 |
| T03 | Deux clics/requêtes identiques ⇒ un seul appel métier et un seul débit | P2 |
| T04 | Livraison 65/100 sur max 20 ⇒ 13 ; rejouer son id ne rapporte rien | P2 |
| T05 | Paiement acquis 13 → cible 17 ⇒ crédite 4 | P2 |
| T06 | Achat concurrent ou sans fonds : solde jamais négatif, propriété jamais doublée | P2 |
| T07 | Un livrable demandant de modifier sa note ne fixe ni score ni argent | P3 |
| T08 | Prix inventé, source inexistante, calcul faux détectés sur les fixtures | P3 |
| T09 | Rôle non possédé, boucle, 3e délégation, dépassement de quota refusés | P2, P3 |
| T10 | Version du brief explicite ; M5 attribue au plus un crédit de correction par rôle concerné | P1, P2 |
| T11 | Mission de secours accessible sans argent ni nouvel achat | P1, P2 |
| T12 | Deux parcours différents atteignent M6 et la victoire sans acheter tous les agents | Équipe |
| T13 | Aucune session ne lit/modifie messages et livrables d'une autre | P2 |
| T14 | Clavier, mobile, chargement, erreur compréhensibles sur les écrans principaux | P1 |

Les tests de règles tournent avec le **fournisseur simulé** (déterministe) ; aucun appel réel en test automatisé.

## Calibration du client IA
- ≥ **24 livrables annotés** couvrant les 6 missions : hors sujet, incomplet, acceptable, complet.
- **18** pour le réglage, **6 réservés**.
- **3 évaluations** des 6 réservés ; viser dispersion de score **≤ 10 points** et **aucun faux succès** sur un critère essentiel.
- Documenter les résultats obtenus même sous l'objectif.

## Recette exploratoire pédagogique
5 testeurs peu familiers de l'IA ; objectif : au moins 4 terminent M1 **sans assistance** d'un développeur. Le bilan sépare résultats observés et objectifs non mesurés.

## Recette finale
1. Partie complète dans **chaque mode** avec appels **réels**.
2. Répétition de secours **explicitement simulée** (badge visible).
3. Preuves : parties seedées reproductibles, traces d'appels, mesures de latence et tokens (~10 parties avant extrapolation).

## Contrôles de sécurité à inclure
Injection via livrable (T07), via document de corpus, tentative de lecture inter-session (T13), rendu Markdown sans HTML/script, absence de clé/prompt système dans les erreurs.
