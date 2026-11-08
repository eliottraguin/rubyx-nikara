> **OBSOLÈTE (6e décision, 2026-11-08)** : ce document décrit l'ancien contenu (M1–M6, client évaluateur, score et paiement par expédition). Voir `docs/PARCOURS-BOT.md`. Ne pas s'y fier ; retrait des données associées : ticket API-R2.

# AI05 — Chef d'équipe : plans bornés, délégations, restitution

Fichiers : `data/roles/lead.json`, `data/schemas/lead_plan.schema.json`, fixtures `data/fixtures/model_outputs/lead/`.

## Spécification
- Sortie du chef en mode `plan` = JSON `lead_plan` strict (`steps` 1–2, `summary`). Schéma : rôles possibles = les 5 rôles non chef ; `depends_on` entier ≥ 0 ; champs inconnus interdits.
- Validation serveur (ordre) : (1) schéma ; (2) ≤ 2 étapes (valeur `quotas.max_plan_steps`) ; (3) aucun rôle `lead` (pas de récursion) ni `client` ; (4) rôles possédés ; (5) `depends_on` < index de l'étape (graphe sans cycle) ; (6) `source_ids` appartiennent à la tentative. Échec ⇒ une réparation, puis `INVALID_OUTPUT` 422, ni débit ni message consommé.
- Coût : une instruction au chef consomme 1 de ses 5 messages et paie la préparation du plan. Le serveur calcule le coût maximal du plan (tarif × appels) et demande la confirmation séparée (`POST /api/actions/{id}/confirm`), **sans nouvel appel de planification**.
- Chaque délégation consomme 1 message du destinataire et son tarif ; 3e délégation, chef→chef, appel au client refusés (T09).
- Résultat partiel : étapes réussies conservées, réservations inutilisées libérées, reprise sans rejouer les étapes terminées.
- Partage de contexte : le chef ne voit que la liste des rôles possédés et les ids de pièces de la tentative ; chaque étape reçoit uniquement les pièces de `source_ids` (partages journalisés).

## Restitution
Proposition : synthèse **assemblée par le serveur** à partir des résultats d'étapes (identifiants, statut, texte), sans appel modèle supplémentaire, pour ne pas ajouter de coût ni de message non prévus. Le rôle `lead` prévoit tout de même un mode `synthesis` si P2 préfère une synthèse rédigée (alors : appel compté dans le plafond de 36, non facturé en plus, à décider). **Question ouverte pour P2** (voir `10`).

## Exemples (fixtures)
| Fixture | Verdict attendu |
|---|---|
| `lead/success` | valide : veille (offres v1/v2) puis rédacteur, `depends_on: 0` |
| `lead/missing_info` | valide : plan prudent à 1 étape, limite signalée dans `summary` |
| `lead/failure` | panne : ni débit ni message consommé |
| `lead/invalid_three_steps` | rejeté (3 étapes) |
| `lead/invalid_recursion` | rejeté (étape `lead`) |
| `lead/invalid_cycle` | rejeté (dépendance vers une étape postérieure) |
| `lead/invalid_unowned_role` | rejeté (prospecteur non possédé) |
| `lead/invalid_foreign_source` | rejeté (pièce hors tentative) |
| `lead/invalid_client_call` | rejeté (appel au client) |
`validate_content.py` rejoue ces verdicts avec une implémentation de référence (`plan_errors`).
