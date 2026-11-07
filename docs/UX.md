# Écrans et expérience utilisateur

> Source : cahier §3, §10, §11. Langue : **français**, solo, navigateur. Bureau = interface 2D cliquable (illustrations simples ou cartes) ; aucune animation complexe ne doit retarder le parcours complet.

## Écrans
| Écran | Contenu et actions principales |
|---|---|
| Accueil | Promesse en une phrase, démarrer, reprendre, explication des deux modes |
| Création | Nom de l'entreprise, mode, contexte de départ, validation |
| Bureau | Agents cliquables, commandes disponibles, trésorerie, étape, prochaine action |
| Commande | Brief, documents datés, critères visibles, récompense max, questions au client |
| Atelier | Conversation avec l'agent choisi, pièces partagées, compteur, coût, livrable côte à côte |
| Boutique | Agents, prix, rôle pédagogique, condition de déblocage, confirmation |
| Livraison | Choix de version, récap du brief applicable, confirmation, statut |
| Retour client | Score, réussites, écarts précis, paiement, dépenses, prochain objectif |
| Carnet et fin | Instructions sauvegardées, compétences, bilan, nouvelle partie |

Écran additionnel : validation du **plan du chef** (rôles + montant maximal).

## Disposition
- **Bureau (≥ ordinateur)** : atelier en 3 zones — brief et pièces (gauche), conversation (centre), livrable (droite). Trésorerie, messages restants et coût de l'action **toujours visibles**.
- **Mobile (390 px)** : onglets « Mission », « Agent », « Livrable ». Bouton de livraison avec confirmation montrant clairement la version envoyée.
- Commandes indisponibles : **explication textuelle**.
- M1 atteignable en **≤ 3 actions** après création.

## Atelier
Distinguer **texte généré** et **modification manuelle** ; version sélectionnée visible ; empêcher les envois impossibles **sans masquer les causes** ; afficher le coût maximal avant confirmation.

## États à concevoir dès la maquette
- Chargement avec action en cours · réponse longue · connexion perdue · tentative récupérable
- 5 messages utilisés · fonds insuffisants · agent verrouillé · aucun document partagé
- Évaluation en attente · échec de validation · récompense déjà attribuée · mission terminée

## Accessibilité
Tous les éléments interactifs utilisables **au clavier**, focus visible, nom accessible. Statuts en **texte** en plus des couleurs. Animations facultatives et désactivables. Ne pas déclarer la conformité complète sur la seule absence d'erreur automatisée.

## Pédagogie
- Tutoriel Débutant : **une action à la fois** (lire le client → choisir l'agent → formuler → inspecter). Définitions courtes au clic pour « prompt », « agent », « source » ; accessibles aussi en Expert, sans parcours imposé.
- Indices à 2 niveaux, carnet de prompts, bilan final fondé sur actions observées.
- Réponse d'agent : sources utilisées affichées ; distinction fait connu / proposition.
- Aucune évaluation de l'orthographe.

## Cohérence
Pages et composants partagent mêmes statuts, formats monétaires et messages d'erreur (codes stables de `CONTRACTS.md`). L'interface ne permet jamais de modifier les règles économiques.
