# Architecture

> Source : cahier §12, §16, §17. Stack de référence : **Next.js + TypeScript** (interface) · **FastAPI + Python + Pydantic** (API) · **SQLite** (démo) · adaptateur unique vers le fournisseur de modèles. PostgreSQL = évolution multi-instances. Versions verrouillées au démarrage.

## Composants
| Composant | Responsabilité |
|---|---|
| Interface (`web/`) | Affiche l'état renvoyé par l'API, déclenche les actions, présente réponses et versions. Ne calcule ni solde, ni score, ni droits. |
| Moteur de jeu (`api/`) | Missions, achats, quotas, coûts, événements, score, victoire. Données de règles versionnées. |
| Service agents | Construit le contexte autorisé, exécute les outils de la liste blanche, valide les sorties (Pydantic). |
| Évaluateur client | Produit appréciation + résultats de critères depuis une livraison figée. |
| Stockage | Actions, versions, évaluations, transactions, mesures de consommation. |
| Adaptateur LLM | Isole auth, format d'appel, limites, timeout, statistiques. Implémentations `mock` et `real`. |

## Arborescence cible
```
web/                 front Next.js (le scaffold actuel src/ y sera déplacé ou conservé en racine, à trancher en BE01)
api/                 FastAPI : routes, moteur, agents, évaluateur, adaptateur LLM, migrations
data/
  rules/             prix, plafonds, prérequis (versionnés)
  roles/             instructions des 6 rôles
  missions/          missions + corpus + variantes beginner/expert
  rubrics/           grilles à ids stables (m1_v1…)
  fixtures/          JSON d'exemple par écran + sorties de référence modèle
tests/               règles (mock), sécurité, calibration
docs/
```
> Le dépôt contient aujourd'hui uniquement `src/app/` (Next.js, pnpm). Le choix `web/` vs racine est une décision de BE01 ; ne pas déplacer sans accord de l'auteur du scaffold.

## Orchestration bornée
- File d'actions avec **ids persistés** ; le navigateur interroge le statut (`GET /api/actions/{id}`).
- Aucune transaction de base ouverte pendant l'attente réseau.
- Réservation argent+quota **atomique avant** l'appel ; règlement **atomique après**.
- `RUNNING` interrompu réconcilié au redémarrage ; réservations avec échéance.
- Concurrence : 5 appels fournisseur max (file visible au-delà). Timeout 45 s, 1 reprise technique.
- L'orchestrateur de Noah peut remplacer l'exécuteur **uniquement** s'il respecte mêmes contrats, traces et plafonds ; décision au premier jalon.

## Sécurité et confiance
- Sorties IA = **contenu non fiable** : texte/Markdown nettoyé, HTML et scripts désactivés.
- Outils en liste blanche ; calculs via opérations définies, jamais d'interpréteur libre.
- Sources limitées au corpus ; identifiant cité inconnu ⇒ signalé.
- Prix, achats, messages restants, paiements : **backend exclusivement**.
- Évaluateur : séparation explicite instructions de jugement / texte soumis (T07).
- Session anonyme par cookie sécurisé ; propriété vérifiée à chaque lecture/mutation ; aucune clé ni règle privée côté client.
- Avant le 1er échange : afficher ce qui est transmis au fournisseur ; suppression de partie ; rétention de référence 7 jours ou fin du hackathon (configurable) ; ne pas promettre une suppression non maîtrisée chez le fournisseur.
- Traces de démo : plan de tâches + résultats d'outils, pas de raisonnement interne détaillé.

## Pannes et modes dégradés
Afficher l'état réel, préserver la version en cours, proposer une reprise sûre. Crédits engagés seulement après réponse exploitable. Seuil de tokens atteint ⇒ pause explicite + sauvegarde, la livraison reste possible. **Mode simulé** pour tests et démo de secours, toujours avec mention visible.

## Budget de tokens
300 M disponibles = plafond, pas objectif : réserve 60 M, ≤ 240 M pour expérimentation et démo. Tableau de bord technique (équipe seulement) : entrée, sortie, cache si dispo, appels échoués, estimation signalée. Ordre de grandeur : 100 parties × 6 missions × 6 appels × 3 000 tokens ≈ 10,8 M avant reprises ; mesurer ~10 parties avant d'extrapoler.

## Qualité de service
État local < 2 s ; 1re réponse agent visée < 15 s (à mesurer) ; prompt ≤ 4 000 caractères ; sorties 800/1 200 tokens ; 36 appels modèle max par tentative (dont 2 réservés à l'évaluation).
