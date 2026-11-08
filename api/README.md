# API (FastAPI + Pydantic + SQLite)

Ticket BE01 : socle lançable, schémas partagés, sessions, migrations. Les routes du moteur (missions, actions, économie, livrables, IA) sont des **stubs 501** (`NOT_IMPLEMENTED`) jusqu'à BE02–BE06.

## Choix techniques
- **Gestionnaire de paquets : `uv`** (dépendances dans `pyproject.toml`, versions exactes verrouillées dans `uv.lock`, Python 3.12 via `.python-version`). Environnement virtuel local `api/.venv/` (ignoré par git).
- **Base : SQLite** via SQLAlchemy 2, fichier `api/var/rubix.db` (ignoré par git ; `RUBIX_DB_PATH` pour changer).
- **Migrations : Alembic** (`api/migrations/`). Elles sont aussi appliquées automatiquement au démarrage de l'API (idempotent).
- **Règles** chargées depuis `data/rules/rules_v1.json` (moteur : prix, gains, capital initial, quotas, limites) et `data/rules/rules_v2.json` (cap prospection : `app/rules_v2.py`, niveaux de l'immeuble, prix des 7 rôles, actions sur prospect, rétention). Fiche entreprise et cible : bornes lues dans `data/profile/` (`app/profile_spec.py`). Aucune de ces valeurs n'est en dur dans le code.
- **LLM** : interface `app/llm/base.py` ; implémentations `mock` (déterministe, sans réseau, défaut), `real` et `codex` (relais AXIS, protocole Messages d'Anthropic, GR3-61). L'état renvoyé contient `llm.simulated = true` (badge obligatoire) tant que `mock` est actif.

## Commandes (depuis `api/`)
```bash
uv sync                                              # installer
uv run uvicorn app.main:app --reload --port 8000     # lancer (Swagger : http://localhost:8000/docs)
uv run pytest                                        # tester (mock, aucun réseau)
uv run python -m app.export_openapi                  # exporter api/openapi.json
uv run python -m app.export_fixtures                 # régénérer data/fixtures/
uv run alembic upgrade head                          # migrer à la main (facultatif)
uv run alembic revision --autogenerate -m "message"  # nouvelle migration (relire le résultat)
curl localhost:8000/api/health                       # vérifier l'état
```
Les tests échouent si `api/openapi.json` ou `data/fixtures/` sont périmés : relancer les deux exports ci-dessus après un changement de schéma, et signaler le changement (docs/CONTRACTS.md).

## Configuration (variables d'environnement, toutes facultatives)
| Variable | Défaut |
|---|---|
| `RUBIX_DB_PATH` | `api/var/rubix.db` |
| `RUBIX_DATA_DIR` | `data/` à la racine du dépôt |
| `RUBIX_RULES_VERSION` | `rules_v1` |
| `RUBIX_LLM_PROVIDER` | `mock` (défaut) ; `real` ou `codex` exigent `RUBIX_LLM_API_KEY`/`RUBIX_LLM_BASE_URL` (ou `AXIS_GATEWAY_KEY`/`AXIS_GATEWAY_URL`) |
| `RUBIX_COOKIE_SECURE` | `0` (mettre `1` derrière HTTPS) |
| `RUBIX_CORS_ORIGINS` | vide (liste séparée par des virgules, ex. `http://localhost:3000`) |
| `RUBIX_DEMO_SECRET` | vide = routes d'exploitation `/api/demo/*` **inactives** (404). Sinon secret attendu dans l'en-tête `X-Demo-Secret` |

## Arborescence
```
api/app/main.py          création de l'app, routes, handlers
api/app/config.py        paramètres (env)
api/app/rules.py         chargement/validation de data/rules/
api/app/errors.py        codes stables, statuts HTTP, messages français
api/app/deps.py          base, propriété de session (cookie), Idempotency-Key
api/app/models.py        tables SQLAlchemy ; api/migrations/ schéma réel
api/app/schemas/         Pydantic : entités, état, erreurs
api/app/llm/             interface adaptateur + mock
api/app/routes/          health, sessions, agents, messages, prospects, conversations, campagnes, profil
api/app/services/        création de partie, état, solde, immeuble (building), fiche entreprise (profile)
api/tests/               pytest
data/rules/ data/fixtures/
```

## Comportements à connaître
- **Session** : cookie `rubix_session` opaque (HttpOnly, SameSite=Lax), seul le hachage SHA-256 est stocké. La partie est déduite du cookie uniquement ; l'id public `ses_…` n'est jamais un jeton. Sans cookie valide : `401 SESSION_REQUIRED`.
- **Comptes et proxy (déploiement)** : l'anti-bruteforce compte par IP cliente. Derrière un reverse proxy, lancer uvicorn avec `--proxy-headers --forwarded-allow-ips=<IP du proxy>` (jamais `*`), sinon tous les joueurs partagent une seule IP. Toujours `RUBIX_COOKIE_SECURE=1` en HTTPS. `qa-seed` est refusé quand `RUBIX_COOKIE_SECURE=1`. Voir `docs/SECURITE-AUTH.md`.
- **Front sur un autre port** : cookie partagé entre ports de `localhost`, mais le navigateur exige CORS pour `fetch` avec `credentials: "include"` : soit un proxy Next (`rewrites` vers l'API, recommandé), soit `RUBIX_CORS_ORIGINS=http://localhost:3000`.
- **Idempotency-Key** : obligatoire (8–128 car. `A-Za-z0-9_.:-`) sur `POST`/`DELETE` ; BE01 ne valide que la présence et le format. La rejouabilité (même clé => même résultat) est livrée par BE04. Aujourd'hui deux `POST /api/sessions` avec la même clé créent deux parties.
- **Erreurs** : `{"error": {"code", "message", "details?"}}`, messages en français ; la validation ne renvoie jamais la valeur reçue ; les erreurs internes sont génériques. Exemples : `data/fixtures/errors/`.
- **Suppression** : `DELETE /api/session` supprime la partie et toutes ses lignes (cascade) et efface le cookie.
- **Intégrité en base** : unicités `(session, rôle)`, `Evaluation.submission_id`, `LedgerEntry.source_action`, `ActionRun.idempotency_key` ; triggers refusant tout `UPDATE` d'une version de livrable et des champs figés d'une livraison.

## Comptes de test QA (dev / démo uniquement)

`uv run python -m app.cli qa-seed` crée ou réinitialise 3 comptes `@qa.rubix.test` : `qa-vierge` (sans entreprise), `qa-debutant` et `qa-expert` (entreprise déjà créée). Les identifiants sont écrits **uniquement** dans `api/var/qa-accounts.json` (0600, ignoré par git) ; ils ne sont ni affichés ni journalisés. `RUBIX_QA_PASSWORD` impose un mot de passe commun (sinon un mot de passe aléatoire par compte). La commande est idempotente (mots de passe renouvelés, parties QA recréées) et refuse de s'exécuter si `RUBIX_COOKIE_SECURE=1` (sauf `--allow-prod`).
