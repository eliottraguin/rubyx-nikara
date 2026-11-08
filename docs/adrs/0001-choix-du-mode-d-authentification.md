---
status: draft
date: 2026-11-08
decision-makers: [architecte, Noah]
consulted: []
informed: []
---

# Adopter un compte maison (table `User`, mot de passe haché) plutôt qu'un provider tiers

## Context and Problem Statement

Aujourd'hui **aucune authentification** n'existe : le joueur reçoit un cookie opaque de partie anonyme (`rubix_session`, HttpOnly, SameSite=Lax) ; le serveur stocke son sha256 dans `GameSession.token_hash` et retrouve la partie par `get_current_session` (`api/app/deps.py`), jamais par un identifiant fourni par le client. Perdre le cookie = perdre la partie et le carnet (`OPEN-QUESTIONS.md` n°14 : comptes à remonter en P1 dès que le mode Réel stocke de vrais prospects ; aussi prérequis de la boîte mail OAuth du mode Réel, une boîte par partie).

Il faut choisir comment identifier un joueur durablement, **sans casser la règle n°1** du `CLAUDE.md` : le backend FastAPI reste seul maître de l'argent, des prix, des quotas, des déblocages et des droits ; le navigateur ne les choisit jamais.

Contexte de code consulté : `api/app/models.py` (`GameSession`), `api/app/deps.py`, `api/app/routes/sessions.py`, `api/app/config.py`, `docs/ARCHITECTURE.md`, `docs/OPEN-QUESTIONS.md`. `docs/adrs/` n'existait pas (ceci est l'ADR 0001). Le skill `clerk-nextjs-patterns` est présent dans `.claude/skills/` mais **non branché** (aucune dépendance Clerk dans `package.json`).

## Decision Drivers

* Règle n°1 : l'autorisation est décidée et vérifiée **côté FastAPI**, à chaque lecture/mutation ; propriété de session conservée.
* Sécurité : pas de secret côté client, stockage sûr des mots de passe, protection du vol de session et de la fixation, limitation des tentatives.
* Coût de maintenance pour une petite équipe (reset de mot de passe, vérification d'email, anti-abus).
* Dépendance externe et souveraineté des données (prospects réels, RGPD ; hébergement de l'identité).
* Compatibilité avec la pile actuelle : Next.js (rewrite `/api` vers le port 8000, même origine), FastAPI, SQLite, idempotence des mutations.
* Réversibilité et migration des parties anonymes existantes.
* [INVESTIGATE: confirmer avec Noah le volume d'utilisateurs visé et si connexion sociale (Google) est exigée]

## Considered Options

1. **Compte maison** : table `User` (email + hash `argon2id`) dans FastAPI/SQLite, session serveur par cookie opaque (réutilise le mécanisme `GameSession`/`token_hash`).
2. **Provider tiers (Clerk)** : Clerk gère inscription, mots de passe, OAuth, MFA ; le front obtient un JWT, **FastAPI le vérifie** (JWKS, `iss`, `aud`, `exp`) et mappe `sub` vers un `User` local.
3. **Statu quo** : rester sur la partie anonyme par cookie + export CSV/JSON (rejeté comme cible, gardé comme repli).

## Decision Outcome

Chosen option : **1. Compte maison**, parce qu'elle garde l'autorité d'identité et d'autorisation dans le seul backend avec le moins de pièces mobiles, réutilise le cookie opaque déjà audité, évite une dépendance externe payante sur le chemin critique et garde les données personnelles sur notre base. Option 2 reste la voie de repli si MFA/OAuth social deviennent des exigences.

Cadrage (à détailler dans le ticket d'implémentation) :

* Table `users` (`id`, `email` normalisé unique, `password_hash`, `created_at`, `email_verified_at` nullable) ; `GameSession.user_id` nullable (FK) ; une partie reste possible en anonyme, puis est **rattachée** à l'inscription (l'identité vient du cookie existant, jamais d'un `session_id` fourni par le client).
* Mot de passe : `argon2id` (paramètres en configuration), jamais journalisé, longueur min 12, comparaison à temps constant, message d'erreur unique (pas d'énumération d'emails).
* Session : cookie opaque HttpOnly, `Secure` en HTTPS, SameSite=Lax, **rotation du jeton à la connexion** (anti-fixation), hash seul en base, expiration absolue + inactivité, révocation à la déconnexion/changement de mot de passe.
* CSRF : SameSite=Lax + `Idempotency-Key` obligatoire sur toute mutation + contrôle d'`Origin` sur les routes d'auth ; CORS en origines explicites (déjà imposé par `config.py`).
* Anti-abus : plafonds de tentatives par email et par IP sur login/inscription/reset, côté serveur.
* Le front (Next.js) ne décide aucun droit : il ne fait qu'afficher ; tout contrôle passe par une dépendance FastAPI (`CurrentUser` puis propriété de la partie), comme `CurrentSession` aujourd'hui.
* [INVESTIGATE: choix du canal d'envoi d'email (reset/vérification) et du fournisseur SMTP, absent aujourd'hui]

### Comment le choix respecte la règle n°1

L'identité est établie uniquement par un jeton opaque que seul le serveur sait résoudre ; droits, quotas, déblocages et économie restent calculés par FastAPI à partir de `GameSession`/`User`. Aucune claim ni rôle fournis par le client n'est cru. Avec l'option Clerk, la règle serait aussi respectable, mais seulement si FastAPI vérifie chaque JWT lui-même ; un contrôle fait uniquement dans le middleware Next.js violerait la règle.

## Consequences

### Good

* Une seule source d'autorité (FastAPI) ; pas de nouvelle surface réseau ni de secret tiers.
* Pas de coût récurrent ni de verrouillage fournisseur ; données d'identité sur notre base.
* Migration simple : `user_id` nullable, parties anonymes conservées et rattachables.
* Résout le risque « cookie perdu = carnet perdu » (n°14) et prépare la boîte mail du mode Réel.

### Bad

* Nous portons la sécurité de l'identité : hachage, reset de mot de passe, vérification d'email, anti-bruteforce, RGPD (suppression, export).
* Pas de MFA ni de connexion sociale au départ ; chaque ajout est un coût de développement.
* Besoin d'un envoi d'email transactionnel qui n'existe pas encore.
* SQLite mono-instance : verrous d'écriture sur le login ; à revoir avec PostgreSQL.

### Neutral

* Le skill `clerk-nextjs-patterns` reste non utilisé ; à retirer ou conserver selon décision finale.
* Les tests API devront couvrir : rotation de jeton, accès à la partie d'un autre utilisateur (403/404), rattachement d'une partie anonyme, plafonds de tentatives.

## Pros and Cons of the Options

### 1. Compte maison

* Good : autorité unique, pas de dépendance externe, coût nul, cohérent avec le cookie opaque actuel.
* Bad : maintenance sécurité à notre charge ; pas de MFA/social gratuits.

### 2. Provider tiers (Clerk)

* Good : MFA, OAuth social, reset, détection d'abus fournis ; moins de code d'auth.
* Bad : dépendance externe sur le chemin critique (panne ou changement de tarif bloque la connexion) ; coût par utilisateur actif ; identités hébergées chez un tiers (RGPD, sous-traitant) ; deux sources de vérité (`sub` Clerk et `User` local) à synchroniser ; FastAPI doit vérifier JWKS/JWT, sinon la règle n°1 est contournable ; cookies du provider sur un autre domaine = CORS/CSRF supplémentaires ; en dev/CI, besoin de clés ou de mocks.
* [INVESTIGATE: grille tarifaire Clerk à l'échelle visée et hébergement des données (UE)]

### 3. Statu quo anonyme

* Good : aucun travail, aucune donnée personnelle.
* Bad : perte du carnet avec le cookie ; pas de reprise multi-appareil ; incompatible avec des prospects réels durables.

## More Information

* Règles liées : `CLAUDE.md` règles 1, 4 ; `docs/ARCHITECTURE.md` (session anonyme par cookie) ; `docs/OPEN-QUESTIONS.md` n°14 et n°31.
* Suites : ADR/ticket d'implémentation (migration `users`, routes `/api/auth/*`, dépendance `CurrentUser`), puis revue sécurité avant PR.
* [INVESTIGATE: revue juridique RGPD (base légale, durée de conservation, droit à l'effacement)]
