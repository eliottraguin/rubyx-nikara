# AI07 — Aides, bilan fondé sur les traces, suivi des tokens

Fichiers : indices dans chaque variante (`hints`, `hint_forbidden_terms`), `data/missions/_shared/coach_and_debrief.json` (schéma `coach_debrief.schema.json`), rôle `data/roles/system/coach.json`.

## Indices (2 niveaux par mission et par variante)
Niveau 1 : attire l'attention sur une information (brief, pièce, grille publique). Niveau 2 : suggère une question à se poser. Jamais un prompt complet à recopier. Contrôle automatique : aucun indice ne contient une valeur listée dans `hint_forbidden_terms` (prix, horaires, ids attendus…), et la longueur est bornée (240 caractères). Indices gratuits ; leur usage est enregistré (signaux `hint_used_l1/l2`), jamais pénalisé.

## Coach après évaluation
Le coach relie un écart à l'instruction envoyée ou à la vérification non faite, avec une preuve prise dans la tentative (message, version, trace). Il ne connaît pas les réponses privées du client. Règles dans `coach_rules`.

## Bilan fondé sur les traces
Chaque compétence exige des **signaux observables** (13 signaux dans le fichier : clarification posée, partage de pièce, édition manuelle, vérification, correction utile, adaptation à un nouveau brief, sources citées, ≥ 2 rôles contributeurs, indices, reprise améliorée…). Règles :
1. Une compétence n'apparaît « démontrée » que si au moins `min_observations` signaux requis existent, avec la mission et l'action citées.
2. Sinon : « non démontrée » (jamais d'extrapolation).
3. Aucune mention de diplôme, certification, niveau, comparaison entre joueurs (`forbidden_claims`).
4. Le bilan sépare résultats observés et objectifs non mesurés.
5. Mesures à enregistrer (cahier §10) : corrections utiles, critères respectés, indices utilisés, vérifications effectuées.
**Non livré** : la comparaison « tâche initiale vs tâche finale de difficulté comparable » demande une paire de tâches courtes équivalentes (non écrite ; la mission de secours n'a qu'un contenu). À décider (voir `10`).

## Suivi des tokens (spécification)
Par appel journalisé : `input_tokens`, `output_tokens`, `cache_tokens` (si fournis), `failed_calls`, `estimated`, `mission_id`, `attempt_id`, `role`, `call_kind` (agent | evaluation | repair | coach), versions de rôle/mission/grille. Agrégats : par tentative, par partie, global. Seuils : valeurs serveur (RULES §8, plafond de partie, global, réserve) ; **aucune valeur chiffrée n'est fixée ici**. Seuil atteint : pause explicite, sauvegarde, jamais de faux résultat ; la livraison reste possible. Estimation signalée lorsque le fournisseur ne remonte pas les compteurs. Tableau technique réservé à l'équipe ; le joueur ne voit que son budget de jeu.
