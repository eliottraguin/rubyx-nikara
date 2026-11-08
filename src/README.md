# Interface (P1) — lancer et brancher l'API

## Lancer
```
pnpm install
pnpm dev          # http://localhost:3000, API requise
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

## Mode mock ou http
`NEXT_PUBLIC_API_MODE=mock|http` (défaut `http`). Variable publique lue à la compilation : relancer `pnpm dev`/`pnpm build` après changement. Les parties mock et HTTP sont distinctes.

- `mock` : `src/mocks/` simule un état minimal, gardé en mémoire et dans `localStorage` (clé `rubix-mock-server-v2`). Les étages Archives, Courrier et Pub ne sont pas disponibles dans cette maquette.
- `http` : `src/lib/api/http.ts` appelle `/api/...` (cookies inclus, `Idempotency-Key` sur chaque mutation). `next.config.ts` réécrit ces appels vers FastAPI (`RUBIX_API_URL`, par défaut `http://localhost:8000`).

## Points d'entrée
- `src/lib/api/types.ts` : types du contrat (état, actions, évaluateur, plan du chef, erreurs stables).
- `src/lib/api/index.ts` : `loadApi()` choisit mock/http. Tout l'accès réseau passe par là.
- `src/lib/game-context.tsx` : état relu via `GET /api/state` au chargement (reprise après rechargement), interrogation de `GET /api/actions/{id}` tant qu'une action est en cours, détection de connexion perdue.
- `src/lib/send-rules.ts` : explications textuelles d'un envoi bloqué (quota, fonds, rôle verrouillé) à partir des données serveur ; le serveur reste maître.
- `src/lib/markdown.tsx` : rendu sûr du contenu généré (aucun HTML brut, aucun lien, pas de `dangerouslySetInnerHTML`).

## Hypothèses sur le contrat (à confirmer, voir rapport P1)
Forme de `GET /api/state` (`GameState`), réponse des mutations `{ state, action? }`, `POST /api/attempts/{id}/hints` (absent de CONTRACTS.md), absence de session = 401/404 sur `GET /api/state`, reprise d'une évaluation en attente = nouvel appel de `submit`, événements démo `target_change | preview_lead_plan | evaluation_outage`.
