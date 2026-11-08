"""Migration 0002 : unicité des clés d'idempotence par session, données conservées."""

from __future__ import annotations

import sqlite3

import pytest
from alembic import command
from sqlalchemy.exc import IntegrityError

from app.db import alembic_config, make_engine, make_session_factory
from app.models import ActionRun, GameSession


def _game(db, token: str) -> GameSession:
    g = GameSession(token_hash=token, mode="beginner", company={"name": "x"}, seed=1, rules_version="rules_v1")
    db.add(g)
    db.commit()
    return g


def test_0002_keeps_existing_rows_and_scopes_keys_per_session(settings):
    cfg = alembic_config(settings.database_url)
    command.upgrade(cfg, "0001")
    with sqlite3.connect(settings.db_path) as c:
        c.execute("insert into game_sessions values ('ses_a','h1','beginner','{}','ACTIVE','m1',1,'rules_v1','2026-01-01','2026-01-01')")
        c.execute("insert into action_runs (id, session_id, idempotency_key, type, status, steps, created_at, updated_at) values ('act_old','ses_a','old-key-0001','message','SUCCEEDED','[]','2026-01-01','2026-01-01')")
        c.execute("insert into ledger_entries values ('led_1','ses_a',5,'t','src','POSTED','2026-01-01')")
    command.upgrade(cfg, "head")
    engine = make_engine(settings)
    with make_session_factory(engine)() as db:
        old = db.get(ActionRun, "act_old")
        assert old.confirm_keys == [] and old.request_hash is None  # données conservées, colonnes ajoutées
        a, b = _game(db, "h2"), _game(db, "h3")
        db.add(ActionRun(session_id=a.id, idempotency_key="shared-key-0001", type="message"))
        db.add(ActionRun(session_id=b.id, idempotency_key="shared-key-0001", type="message"))
        db.commit()  # même clé dans deux sessions : accepté
        db.add(ActionRun(session_id=a.id, idempotency_key="shared-key-0001", type="message"))
        with pytest.raises(IntegrityError):  # même clé dans la même session : refusé
            db.commit()
    engine.dispose()
    with sqlite3.connect(settings.db_path) as c:  # les clés étrangères enfants ont survécu à la recréation de table
        assert c.execute("select count(*) from ledger_entries").fetchone()[0] == 1
        fks = {r[2] for r in c.execute("pragma foreign_key_list(reservations)")}
        assert "action_runs" in fks


def test_0002_downgrade_restores_global_uniqueness(settings):
    cfg = alembic_config(settings.database_url)
    command.upgrade(cfg, "head")
    command.downgrade(cfg, "0001")
    with sqlite3.connect(settings.db_path) as c:
        cols = {r[1] for r in c.execute("pragma table_info(action_runs)")}
        assert "request_hash" not in cols and "confirm_keys" not in cols
