# Prospect Tycoon

Jeu web de simulation d'entreprise : le joueur dirige une petite société de services et envoie des **agents IA** explorer un « Web » simulé pour trouver des clients.

> Projet de hackathon (48 h). Voir `CLAUDE.md` et `docs/` pour le contexte et les décisions d'architecture.

## Prérequis

- Node.js ≥ 20.9 (voir `.nvmrc`)
- [pnpm](https://pnpm.io/) (`npm i -g pnpm`)

## Démarrage

```bash
pnpm install
cp .env.example .env   # puis renseigner les variables
pnpm dev
```

Lancez également l'API dans un second terminal :

```bash
cd api
uv sync
uv run uvicorn app.main:app --port 8000
```

L'application est disponible sur <http://localhost:3000>. L'interface utilise l'API par défaut ; le fournisseur IA peut rester simulé. Le mode `NEXT_PUBLIC_API_MODE=mock` est une maquette distincte qui ne prend pas en charge les étages Archives, Courrier et Pub.

L'API migre sa base au démarrage. Avant de démarrer une nouvelle version sur une base existante, vérifiez les migrations et sauvegardez vos données. Pour utiliser une nouvelle base sans toucher à l'ancienne, indiquez par exemple `RUBIX_DB_PATH=$PWD/var/rubix-current.db` depuis `api/`.

## Scripts

| Commande         | Description                     |
| ---------------- | ------------------------------- |
| `pnpm dev`       | Serveur de développement        |
| `pnpm build`     | Build de production             |
| `pnpm start`     | Lance le build de production    |
| `pnpm typecheck` | Vérification TypeScript         |
| `pnpm lint`      | ESLint                          |

## Variables d'environnement

| Variable            | Rôle                                      |
| ------------------- | ----------------------------------------- |
| `ANTHROPIC_API_KEY` | Clé API Anthropic                         |
| `AGENT_MODEL_FAST`  | Modèle des agents rapides (scout, qualifier) |
| `AGENT_MODEL_SMART` | Modèle des agents avancés (closer, chief) |
| `TOKEN_CAP`         | Plafond dur de tokens du ledger           |

## Contribuer

Voir [CONTRIBUTING.md](CONTRIBUTING.md). Pour signaler une faille : [SECURITY.md](SECURITY.md).

## Licence

[MIT](LICENSE)
