from __future__ import annotations

import pytest

from app.create_test_user import main as create_test_user

PW = "correct-horse-battery"


@pytest.fixture(autouse=True)
def _jwt_secret(monkeypatch):
    monkeypatch.setenv("JWT_SECRET_KEY", "test-only-secret-0123456789abcdef0123456789")


def reg(client, email="Alice@Example.com", pw=PW):
    return client.post("/api/auth/register", json={"email": email, "password": pw})


def test_register_login_me_logout(client):
    r = reg(client)
    assert r.status_code == 201
    assert r.json()["email"] == "alice@example.com"
    assert "token" not in r.json()
    cookie = r.headers["set-cookie"].lower()
    assert "httponly" in cookie and "max-age" in cookie
    assert client.get("/api/auth/me").json()["email"] == "alice@example.com"
    assert client.post("/api/auth/logout").status_code == 204
    client.cookies.clear()
    assert client.get("/api/auth/me").status_code == 401
    ok = client.post("/api/auth/login", json={"email": "ALICE@example.com", "password": PW})
    assert ok.status_code == 200
    assert client.get("/api/auth/me").status_code == 200


def test_duplicate_email_conflict(client):
    assert reg(client).status_code == 201
    assert reg(client, email="alice@example.com").status_code == 409


def test_bad_credentials_same_message(client):
    reg(client)
    wrong = client.post("/api/auth/login", json={"email": "alice@example.com", "password": "nope-nope-nope"})
    unknown = client.post("/api/auth/login", json={"email": "bob@example.com", "password": "nope-nope-nope"})
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()


def test_password_validation(client):
    assert reg(client, pw="short").status_code == 422
    assert reg(client, pw="x" * 73).status_code == 422


def test_password_is_hashed(client, settings):
    reg(client)
    from sqlalchemy import create_engine, text

    with create_engine(settings.database_url).connect() as c:
        h = c.execute(text("select password_hash from auth_users")).scalar()
    assert h.startswith("$2") and PW not in h


def test_tampered_token_rejected(client):
    reg(client)
    client.cookies.set("auth_token", "garbage.token.value")
    assert client.get("/api/auth/me").status_code == 401


def test_missing_secret_rejected(client, monkeypatch):
    monkeypatch.delenv("JWT_SECRET_KEY")
    with pytest.raises(RuntimeError):
        client.post("/api/auth/register", json={"email": "c@example.com", "password": PW})


def test_create_test_user_script(settings, monkeypatch, capsys):
    monkeypatch.setenv("RUBIX_DB_PATH", str(settings.db_path))
    assert create_test_user(["x", "dev@example.com"]) == 0
    assert "Mot de passe" in capsys.readouterr().out
    assert create_test_user(["x", "dev@example.com"]) == 1
