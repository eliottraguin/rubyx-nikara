# Hypothèses, inventions, incohérences et questions ouvertes (P3)

## Inventions (absentes du cahier et de `docs/`)
- **Noms et lieux fictifs** : restaurant « Le Petit Comptoir », 12 rue des Tilleuls, 99000 Exemple-sur-Loire (M1) ; composition de la formule (« plat du jour + boisson incluse ») ; « Librairie Page 42 », 8 place du Marché, autrice « Claire Vasseur », roman « Les Lueurs de Marée », date jeudi 21 mai 2026 à 18 h 30, entrée libre (M3) ; boutique « Fil & Lune » (M4) ; « Boulangerie Les Épis Dorés », 3 rue du Moulin, formule « Petit-déj du quartier » à 4,50 €, créneaux, budget 150 €, absence de réservation (M5) ; « Coopérative Verger Bleu », tarif 18,50 €, budget 600 €, retrait au marché le samedi 9 h–12 h (M6) ; « Café La Bobine », fermeture le 25 mai 2026 (secours).
- **Catalogue M2** : 8 fiches P01–P08 (4 dans l'offre, 4 hors offre) et offre de l'entreprise (publications/annonces/emails pour commerces de proximité).
- **M4** : offre « Pack Visibilité » v1 120 € (2025-09-01) / v2 150 € (2026-02-02) ; tableau (email 1 800/90/360 ; réseau social 6 400/128/960 ; affichage 1 200/12/480) ⇒ 5,00 %/4,00 € ; 2,00 %/7,50 € ; 1,00 %/40,00 € ; tolérance 0,05.
- **M6** : tableau du pilote (newsletter 800/40/200 ; marché 1 500/30/450) ⇒ 5,00 %/5,00 € ; 2,00 %/15,00 € ; projection 600/5 = 120 abonnements ; sondage 75/120 ; flyer 2025-11-12 à 16,00 € ajouté par l'événement.
- Limites de mots (M2 120, M3 90, M4 170, M5 120/60, M6 100, secours 40), seuils de tolérance, noms d'ids de pièces, graines des parties.
Seuls M1 (9,90, 12 h–14 h lun–ven, ≤ 80 mots, boisson incluse), les nombres de gains/tarifs/seuils et la structure des événements viennent des documents.

## Hypothèses de conception à valider
1. Formule de score : somme pondérée, arrondi demi-supérieur, plafond 40, 0 si hors sujet ; « essentiel rempli » = note ≥ 0,5 (0,99 pour les essentiels déterministes, 0,8 pour le calcul de M6). **Non écrit dans RULES.md.**
2. Format `agent_response` structuré (le contrat ne fixait que `content`).
3. Une seule grille par mission pour les deux variantes ; la différenciation passe par le brief, l'aide et `variant_guidance`.
4. Les contrôles de M5 et M6 s'appliquent à la dernière version du brief.
5. M3 : critère essentiel sur la gestion de l'incertitude, jamais sur le canal ; noté sémantiquement avec la trace en donnée (un contrôle regex trop strict risquerait un faux échec essentiel).
6. Restitution du chef assemblée par le serveur (voir `05`).
7. `status: ok` dans les fixtures quand le fournisseur répond, même si la validation serveur échoue.

## Incohérences et ambiguïtés relevées dans `docs/` et le cahier
- **« Budget réduit »** (RULES §6 / cahier §10) : « le budget restant change avant la confirmation d'une nouvelle action » ne dit pas s'il s'agit du budget client ou d'un plafond de jeu ; l'événement n'est pas instancié.
- **M6 et événement** : le cahier dit que l'injection avant la 1re action évite un crédit exceptionnel, sans nommer le type d'événement ; « sources contradictoires » a été retenu (cohérent avec « justification sourcée »).
- **Restitution du chef** : ni son coût ni son statut (message du chef ?) ne sont précisés.
- **Définition d'un « message »** pour l'évaluation et le coach : hors quota agent, mais comptés dans le plafond de 36 appels (évaluation) ; coach non précisé.
- **M2** : « La prospection ne paie pas deux fois » mais le prospecteur « ne crée pas directement de revenus » : cohérent, mais le lien « propositions retenues → M3 » n'a pas de règle machine (le contenu fixe M3 sur la fiche P03).
- **« 18 réglage / 6 réservés »** : dans ce lot, 24 livrables au total (6 missions × 4 niveaux) ; aucune mission de secours annotée.
- **Plafond de dépense de M6** (30) est en dollars de jeu ; le budget de 600 € de la fiche est fictif (risque de confusion UI : à libeller clairement).
- Le cahier mentionne une tâche initiale/finale comparable pour le bilan : aucune paire de tâches n'est définie dans les documents.

## Questions pour P2 / P1
- P2 : confirmer formule de score/arrondi/seuil d'essentiel ; statut de la synthèse du chef ; implémentation des contrôles (même sémantique que `validate_content.py`) ; règle serveur du crédit M5 (prochain message gratuit) ; chargement des `corpus.json` avec `visibility`.
- P1 : afficher le diff du brief (champ `brief_diff`) et les 3 niveaux de versions de brief de M3 (v1 → v2 → v3) ; libeller « budget fictif du client » vs « plafond de dépense de jeu ».

## Éléments « prêts à exécuter mais non exécutés »
AI01 réel (fournisseur), AI06 (calibration), AI08 (recette réelle, parties seedées, mesures de latence/tokens). Voir `01`, `07`, `09`. Aucun chiffre de calibration ou de latence n'est fourni.
