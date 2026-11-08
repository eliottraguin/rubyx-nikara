# Revue de sécurité — authentification (GR3-26)

Date : 2026-11-08 · Périmètre : commits `71c5757`..`d1b9e39` (ADR 0001, `api/app/{routes,services}/auth.py`, `deps.py`, `sessions`, `qa_seed`, `src/lib/api/auth.ts`, `LoginScreen`). Tests `test_auth.py` + `test_qa_seed.py` : 18 verts. Revue statique, pas de test d'intrusion.

## Verdict
**Conforme sur les 4 points de la portée, avec 2 points bloquants pour la mise en service (B1, B2) et 4 améliorations.**

## 1. Mot de passe — OK
- argon2id (défaut `argon2-cffi`), rehash automatique (`check_needs_rehash`), longueur 12–128, plafond max (anti-DoS de hachage).
- Login sur email inconnu : vérification contre un hash factice (timing homogène), message unique `INVALID_CREDENTIALS`.
- Aucune valeur reçue renvoyée : le handler 422 ne renvoie que `loc` + message ; `Credentials.password` en `repr=False` ; le journal d'accès n'enregistre ni corps ni query ; `_SENSITIVE` filtre `password`.
- QA seed : mots de passe aléatoires, fichier 0600 dans `api/var/` (ignoré par git).

## 2. Limitation de tentatives — partiellement OK
Échecs comptés par empreinte d'email (10 / 15 min) et d'IP (30 / 15 min), table `auth_attempts` purgée.
- **B1 (bloquant) — IP derrière un proxy.** `request.client.host` vaut l'IP du reverse proxy en déploiement : tous les joueurs partagent le même budget de 30 échecs → un seul attaquant verrouille la connexion de tout le monde ; ou, si le proxy est ignoré, la limite par IP est inopérante. À faire : uvicorn `--proxy-headers --forwarded-allow-ips=<proxy>` (jamais `*`) et documenter ; test avec `X-Forwarded-For`.
- A1 — Verrou par email = déni de service ciblé (10 mauvais essais sur l'email de la victime bloquent la victime 15 min). Acceptable en démo ; à garder en tête (alternative : clé `(email, ip)` + délai progressif).
- A2 — Seuls les **échecs** sont comptés : l'inscription réussie n'est jamais limitée → création de comptes en masse (et d'argon2 coûteux) sans plafond. Ajouter un compteur par IP sur les inscriptions réussies.
- A3 — Compte-puis-ajoute non atomique : des requêtes parallèles peuvent dépasser le seuil de quelques unités (impact faible, argon2 limite le débit).

## 3. Cookies / sessions — OK sauf B2
- Deux cookies opaques (`token_urlsafe(32)`, 256 bits), stockés **hachés** (SHA-256) ; `HttpOnly`, `SameSite=Lax`, `path=/`. Aucun jeton, email ou id de partie dans le JS/`localStorage` : le front n'appelle que `fetch(..., credentials: "include")`.
- Anti-fixation : jeton de partie et de compte renouvelés à chaque login/signup ; logout révoque les deux côté serveur ; seule la partie **du cookie** est rattachée à l'inscription (jamais un identifiant client), et seulement si elle n'a pas déjà de `user_id`.
- CSRF : `SameSite=Lax` + contrôle `Origin` sur signup/login/logout + `Idempotency-Key` obligatoire + CORS à origines explicites (`*` refusé). Limite : un `Origin` absent est accepté (requête non-navigateur, sans cookie ambiant exploitable).
- **B2 (bloquant) — `Secure` désactivé par défaut** (`RUBIX_COOKIE_SECURE=0`). En production sans HTTPS strict, les cookies de compte circulent en clair. À faire : refuser le démarrage si l'environnement de prod est déclaré sans `RUBIX_COOKIE_SECURE=1` (ou inverser le défaut), et l'ajouter à la checklist de déploiement (BE08).
- A4 — Pas de durée de vie : cookie de session navigateur côté client mais **jeton serveur sans expiration**, et un seul jeton de compte par utilisateur (une connexion révoque l'autre appareil). Ajouter `expires_at` (ex. 30 j) ; envisager le préfixe `__Host-` (impose Secure, path=/, pas de Domain) une fois HTTPS acquis.
- Mélange de comptes (faible) : connecté en B alors que le navigateur garde le cookie de partie anonyme/de A, et que B n'a pas de partie : le cookie de A n'est pas remplacé et reste valide (c'est un jeton de partie indépendant, pas une élévation). À corriger en supprimant le cookie de partie au login quand aucune partie n'est rouvrée.

## 4. Règle n°6 (propriété de session) — OK
Toutes les routes métier passent par `SessionId`/`CurrentSession` (cookie de partie hashé) ; aucun identifiant de partie/compte n'est accepté du client. `/api/auth/me` ne lit que le cookie de compte. L'ajout de comptes **n'ouvre aucune route** : `user_id` n'est jamais utilisé comme autorisation d'accès à une partie. Routes `ops` toujours derrière `X-Demo-Secret` (comparaison constante, 404 sinon). Front : redirection post-login vers deux chemins fixes (`/carte`, `/creer`), pas de paramètre `next` → pas de redirection ouverte.

## 5. Divers
- Énumération d'emails : signup renvoie un message distinct sur doublon (« Inscription impossible ») mais plafonné par le compteur d'échecs ; acceptable.
- `qa_seed` : domaine réservé `qa.rubix.test`, mais la commande n'est pas bloquée en production ; la désactiver si `RUBIX_ENV=prod` ou exiger un drapeau explicite (déjà hors route HTTP, donc accès shell requis).
- Hors périmètre / non fait : réinitialisation de mot de passe, vérification d'email, 2FA (absents, à décider avant ouverture publique).

## Actions
| # | Priorité | Action | Porteur |
|---|---|---|---|
| B1 | Bloquant | IP client derrière proxy (`--proxy-headers` + liste blanche) + test | Backend / déploiement |
| B2 | Bloquant | `Secure` obligatoire en prod (garde de config) | Backend |
| A1–A4 | Avant ouverture publique | Compteur d'inscriptions, expiration des jetons, verrou (email, IP), cookie de partie résiduel | Backend |

## Mise à jour (suite à la demande de correction)
**Corrigé sur la branche** : A2 (plafond de 5 inscriptions réussies par IP et par 15 min, test ajouté) ; cookie de compte avec `max_age` 30 j ; `docs/CONTRACTS.md` complété (règle 10) ; README : consigne proxy (B1, côté déploiement) et `Secure` (B2).
**Correction à la revue** : `qa-seed` est déjà refusé quand `RUBIX_COOKIE_SECURE=1` (`--allow-prod` pour forcer) ; le risque restant est un déploiement HTTPS sans ce drapeau, donc B2.
**Reste ouvert** : B1 (réglage uvicorn/proxy, pas de code), B2 (garde de config en prod : pas de notion d'environnement dans `Settings`), A1, expiration serveur des jetons (migration `expires_at`), cookie de partie résiduel.
**Avis sur un seul jeton de compte par utilisateur** : acceptable pour la démo (rotation simple, vol de cookie limité par la connexion suivante), mais mauvaise UX (2e appareil déconnecte le 1er) et pas de « déconnecter partout ». Cible : table `user_sessions` (un jeton haché par appareil, `expires_at`, révocation individuelle) avant ouverture publique.
