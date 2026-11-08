"""Comptes joueurs (ADR 0001) : inscription, connexion, déconnexion, rotation du jeton, propriété, plafonds."""

from __future__ import annotations

import uuid

from fastapi.testclient import TestClient

from app.models import GameSession, User
from sqlalchemy import select


PW = "correct horse battery"


def k() -> dict[str, str]:
    return {"Idempotency-Key": f"auth-{uuid.uuid4().hex}"}


def signup(c, email="Joueur@Example.com", pw=PW):
    return c.post("/api/auth/signup", json={"email": email, "password": pw}, headers=k())


def login(c, email="joueur@example.com", pw=PW):
    return c.post("/api/auth/login", json={"email": email, "password": pw}, headers=k())


def test_signup_attaches_anonymous_game_and_rotates_token(client, make_session):
    make_session(client)
    old = client.cookies.get("rubix_session")
    r = signup(client)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["email"] == "joueur@example.com" and body["has_game"] is True
    assert "password" not in r.text
    assert client.cookies.get("rubix_session") != old
    assert client.get("/api/state").status_code == 200
    with client.app.state.session_factory() as db:
        u = db.scalar(select(User))
        assert u.password_hash.startswith("$argon2id$") and PW not in u.password_hash
        assert db.scalar(select(GameSession)).user_id == u.id


def test_signup_without_game_then_login_without_game(client):
    r = signup(client)
    assert r.status_code == 201 and r.json()["has_game"] is False
    assert "rubix_session" not in client.cookies
    assert login(client).json()["has_game"] is False


def test_login_reopens_game_revokes_previous_cookie_and_logout_revokes(client, make_session, settings):
    make_session(client)
    signup(client)
    leaked = client.cookies.get("rubix_session")
    assert client.post("/api/auth/logout", headers=k()).status_code == 204
    assert client.get("/api/state").status_code == 401
    r = login(client)
    assert r.status_code == 200 and r.json()["has_game"] is True
    fresh = client.cookies.get("rubix_session")
    assert fresh != leaked
    with TestClient(client.app) as other:
        other.cookies.set("rubix_session", leaked)
        assert other.get("/api/state").status_code == 401  # l'ancien jeton est révoqué
    assert client.get("/api/state").status_code == 200


def test_login_errors_are_uniform(client):
    signup(client)
    unknown = login(client, "nobody@example.com")
    wrong = login(client, pw="wrong password here")
    malformed = login(client, "not-an-email")
    for r in (unknown, wrong, malformed):
        assert r.status_code == 401 and r.json()["error"]["code"] == "INVALID_CREDENTIALS"
    assert unknown.json() == wrong.json() == malformed.json()


def test_signup_validation_and_duplicate(client):
    assert signup(client, pw="short").status_code == 422
    assert signup(client, email="bad").status_code == 422
    assert signup(client).status_code == 201
    dup = signup(client, email="JOUEUR@example.com")
    assert dup.status_code == 422 and "joueur@example.com" not in dup.text.lower()


def test_mutations_require_idempotency_key(client):
    r = client.post("/api/auth/login", json={"email": "a@b.co", "password": PW})
    assert r.status_code == 422


def test_cross_origin_rejected(client):
    r = client.post("/api/auth/login", json={"email": "a@b.co", "password": PW}, headers={**k(), "Origin": "https://evil.example"})
    assert r.status_code == 422


def test_bruteforce_is_rate_limited(client):
    signup(client)
    for _ in range(10):
        assert login(client, pw="wrong password here").status_code == 401
    r = login(client)  # même le bon mot de passe est refusé pendant la fenêtre
    assert r.status_code == 429 and r.json()["error"]["code"] == "RATE_LIMITED"


def test_other_users_game_not_attachable_or_readable(client, make_session):
    make_session(client)
    signup(client)
    with TestClient(client.app) as b:
        b.cookies.set("rubix_session", client.cookies.get("rubix_session"))
        # B n'a que le cookie de A : s'inscrire ne lui donne pas la partie de A (déjà rattachée)
        r = signup(b, email="b@example.com")
        assert r.status_code == 201 and r.json()["has_game"] is False
    with TestClient(client.app) as c2:
        assert login(c2, "b@example.com").json()["has_game"] is False
        assert c2.get("/api/state").status_code == 401


def test_game_created_after_login_is_attached_and_reopened(client, make_session):
    assert signup(client).json()["has_game"] is False
    assert client.get("/api/auth/me").json()["has_game"] is False
    make_session(client)  # créée après connexion : rattachée via le cookie de compte
    with client.app.state.session_factory() as db:
        assert db.scalar(select(GameSession)).user_id == db.scalar(select(User)).id
    assert client.get("/api/auth/me").json()["has_game"] is True
    assert client.post("/api/auth/logout", headers=k()).status_code == 204
    assert client.get("/api/auth/me").status_code == 401
    with TestClient(client.app) as c2:  # reconnexion depuis un autre navigateur : retrouve son entreprise
        assert login(c2).json()["has_game"] is True
        assert c2.get("/api/state").json()["session"]["company"]["name"] == "Atelier Test"


def test_anonymous_creation_stays_anonymous_and_logout_without_game(client, make_session):
    make_session(client)
    with client.app.state.session_factory() as db:
        assert db.scalar(select(GameSession)).user_id is None
    signup(client, email="solo@example.com")
    with TestClient(client.app) as c2:
        signup(c2, email="nogame@example.com")
        assert c2.post("/api/auth/logout", headers=k()).status_code == 204  # sans partie : déconnexion possible
        assert c2.get("/api/auth/me").status_code == 401


def test_forged_or_revoked_account_cookie_does_not_attach(client, make_session):
    signup(client)
    leaked = client.cookies.get("rubix_session_user")
    client.post("/api/auth/logout", headers=k())
    with TestClient(client.app) as other:
        other.cookies.set("rubix_session_user", leaked)
        assert other.get("/api/auth/me").status_code == 401
        make_session(other)
        other.cookies.set("rubix_session_user", "forged")
        make_session(other)
    with client.app.state.session_factory() as db:
        assert all(g.user_id is None for g in db.scalars(select(GameSession)))


def test_signup_is_rate_limited_per_ip_even_on_success(client):
    from app.services.auth import MAX_SIGNUPS_IP

    codes = []
    for i in range(MAX_SIGNUPS_IP + 1):
        r = client.post("/api/auth/signup", json={"email": f"rl{i}@example.com", "password": "correct horse battery"}, headers={"Idempotency-Key": f"signup-rl-{i}-xxxx"})
        codes.append(r.status_code)
    assert codes[:MAX_SIGNUPS_IP] == [201] * MAX_SIGNUPS_IP
    assert codes[-1] == 429
