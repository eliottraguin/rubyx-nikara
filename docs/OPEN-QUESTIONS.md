# Points ouverts et décisions à confirmer

Chaque point a une valeur par défaut pour que l'équipe avance.

## À confirmer au démarrage (H0–H2)
| Sujet | Défaut retenu | À vérifier |
|---|---|---|
| Fournisseur LLM | Adaptateur neutre + fournisseur **simulé** d'abord | Le cahier cite « SuperFlix » (nom à confirmer). Le dépôt contient un essai `@axis/sdk` (Node, `index.mjs`) alors que l'API est Python : le SDK n'est pas utilisable tel quel. Option à évaluer : passerelle HTTP (`AXIS_GATEWAY_URL`) si son protocole est compatible — **non présumé**. Vérifier URL, modèles, clés serveur, formats de messages, sorties structurées, limites de débit, remontée des tokens. |
| Orchestrateur de Noah | Exécuteur interne du cahier | Adoption possible seulement s'il respecte contrats, traces, plafonds ; décision au 1er jalon |
| Budget tokens | Réserve 60 M, ≤ 240 M | Conditions réelles du hackathon |
| Rétention des données | 7 jours ou fin du hackathon | Politique effective du fournisseur |
| Quotas de concurrence | 5 appels simultanés | Limites réelles de débit |
| Plafonds de sortie | 800 / 1 200 tokens | Calibrage après mesures |

## Écarts avec l'existant à résoudre
- Le `CLAUDE.md` initial venu du scaffold décrivait « Prospect Tycoon » (TypeScript seul, sans BDD, 48 h, SDK Anthropic). Le cahier fait foi : `CLAUDE.md` est réaligné.
- Le scaffold Next.js (`src/app/`, pnpm, `README.md`, `AGENTS.md`, `CONTRIBUTING.md`) reflète encore l'ancien cadrage ; à aligner avec son auteur (Matthieu) avant de les modifier.
- Emplacement du front (`web/` vs racine) : à trancher en BE01.
- Gestion de paquets côté Python (uv/pip/poetry) : à fixer en BE01.
- Le `.docx` du cahier est à la racine, non versionné ; décider s'il est commité ou déplacé dans `docs/`.

## Cohérences relevées dans le cahier
- Exemple de parcours §7 vérifié : 80/70/70/70/70 ⇒ 170 de gains ; 30+170−35−80−30 = 55. Cohérent.
- Le plan du chef utilise `researcher` ; l'interface affiche « chargé de veille ». Convention retenue : id `researcher`, libellé « chargé de veille ».
- Tarif M5 « hors crédit exceptionnel » : le crédit rend un message gratuit, il n'ajoute jamais de message (quota 5 strict).
- M4 ne débloque aucun agent ; seul M5 débloque le chef.

## Hors périmètre première livraison
Comptes synchronisés, multijoueur, recruteur, salaires, génération libre de missions, navigation web ouverte, scraper externe (P2) ; second secteur Expert, animations enrichies, export du bilan (P1 après recette P0).
