"""Comptes de test QA : connexion réelle, idempotence, isolation, fichier d'identifiants."""

from __future__ import annotations

import json
import stat
import uuid

import pytest
from sqlalchemy import select

from app.cli import __main__ as cli
from app.cli import qa_seed
from app.models import GameSession, User


def _login(c, email, pw):
    return c.post("/api/auth/login", json={"email": email, "password": pw}, headers={"Idempotency-Key": f"qa-{uuid.uuid4().hex}"})


def _seed(client, password=None):
    with client.app.state.session_factory() as db:
        return qa_seed.seed_accounts(db, client.app.state.rules, password)


def test_seed_creates_three_accounts_that_can_log_in(client):
    accounts = _seed(client)
    assert [a["email"] for a in accounts] == [f"{a.local}@{qa_seed.QA_DOMAIN}" for a in qa_seed.QA_ACCOUNTS]
    assert len({a["password"] for a in accounts}) == 3
    for a, expected_game in zip(accounts, (False, True, True)):
        r = _login(client, a["email"], a["password"])
        assert r.status_code == 200, r.text
        assert r.json()["has_game"] is expected_game
    assert client.get("/api/state").status_code == 200  # dernier compte : partie expert déjà prête


def test_seed_is_idempotent_and_rotates_passwords(client):
    first = _seed(client)
    second = _seed(client)
    with client.app.state.session_factory() as db:
        assert len(db.scalars(select(User)).all()) == 3
        assert len(db.scalars(select(GameSession)).all()) == 2
    assert _login(client, first[1]["email"], first[1]["password"]).status_code == 401
    assert _login(client, second[1]["email"], second[1]["password"]).status_code == 200


def test_seed_leaves_other_accounts_and_games_untouched(client, make_session):
    make_session(client, name="Partie normale")
    _seed(client)
    with client.app.state.session_factory() as db:
        normal = [g for g in db.scalars(select(GameSession)) if not (g.company or {}).get("qa")]
        assert len(normal) == 1 and normal[0].user_id is None


def test_shared_password_from_env_is_policy_checked():
    assert qa_seed.resolve_password({}) is None
    assert qa_seed.resolve_password({qa_seed.PASSWORD_ENV: "x" * 14}) == "x" * 14
    with pytest.raises(qa_seed.QaSeedError):
        qa_seed.resolve_password({qa_seed.PASSWORD_ENV: "court"})


def test_cli_writes_private_file_and_never_prints_passwords(tmp_path, monkeypatch, capsys):
    monkeypatch.setenv("RUBIX_DB_PATH", str(tmp_path / "qa.db"))
    monkeypatch.delenv("RUBIX_COOKIE_SECURE", raising=False)
    monkeypatch.delenv(qa_seed.PASSWORD_ENV, raising=False)
    out = tmp_path / "qa-accounts.json"
    assert cli.main(["qa-seed", "--file", str(out)]) == 0
    data = json.loads(out.read_text(encoding="utf-8"))
    assert stat.S_IMODE(out.stat().st_mode) == 0o600 and len(data["accounts"]) == 3
    printed = capsys.readouterr().out
    assert all(a["password"] not in printed for a in data["accounts"])


def test_cli_refuses_on_secure_deployment(tmp_path, monkeypatch, capsys):
    monkeypatch.setenv("RUBIX_DB_PATH", str(tmp_path / "qa.db"))
    monkeypatch.setenv("RUBIX_COOKIE_SECURE", "1")
    assert cli.main(["qa-seed", "--file", str(tmp_path / "x.json")]) == 1
    assert not (tmp_path / "x.json").exists()
