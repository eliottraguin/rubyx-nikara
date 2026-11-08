from __future__ import annotations

import json
import sqlite3

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app import export_fixtures, export_openapi
from app.config import Settings
from app.db import alembic_config, make_engine, make_session_factory, run_migrations
from app.main import create_app
from app.models import ActionRun, AgentOwnership, Base, GameSession, LedgerEntry

from .conftest import new_key

TABLES = {"game_sessions", "agent_ownerships", "ledger_entries", "action_runs", "llm_calls", "reservations"}
RETIRED_TABLES = {  # ancien moteur d'expédition et d'évaluation (migration 0015)
    "mission_definitions", "mission_attempts", "messages", "artifact_versions", "artifact_shares", "submissions", "evaluations",
    "expedition_records", "notebook_entries", "applied_events",
}


@pytest.fixture
def db(settings: Settings):
    run_migrations(settings)
    engine = make_engine(settings)
    with make_session_factory(engine)() as s:
        yield s
    engine.dispose()


def _session(db) -> GameSession:
    g = GameSession(token_hash=f"h{db.scalar(text('select random()'))}", mode="beginner", company={"name": "x"}, seed=1, rules_version="rules_v1")
    db.add(g)
    db.commit()
    return g


def test_migrations_create_all_tables_and_are_idempotent(settings):
    run_migrations(settings)
    run_migrations(settings)
    with sqlite3.connect(settings.db_path) as c:
        names = {r[0] for r in c.execute("select name from sqlite_master where type='table'")}
    assert TABLES <= names
    assert RETIRED_TABLES.isdisjoint(names)
    assert set(Base.metadata.tables) <= names


def test_migration_downgrade(settings):
    from alembic import command

    run_migrations(settings)
    command.downgrade(alembic_config(settings.database_url), "base")
    with sqlite3.connect(settings.db_path) as c:
        names = {r[0] for r in c.execute("select name from sqlite_master where type in ('table','trigger')")}
    assert names <= {"alembic_version"}


def test_migration_0011_drops_old_journey_tables_and_downgrades(settings):
    """API-R2 : `notebook_entries` et `applied_events` disparaissent sur une base existante (parties conservées) ;
    `submissions`/`evaluations` et `mission_attempts` sont retirées plus tard par la migration 0015 ; le retour arrière recrée les deux tables."""
    from alembic import command

    cfg = alembic_config(settings.database_url)
    command.upgrade(cfg, "0010_assistant_plans")
    with sqlite3.connect(settings.db_path) as c:
        c.execute("insert into game_sessions (id, token_hash, mode, company, state, stage, seed, rules_version, created_at, updated_at) "
                  "values ('ses_x','h','beginner','{}','ACTIVE','m1',1,'rules_v1','2026-01-01','2026-01-01')")
        c.execute("insert into notebook_entries (id, session_id, title, prompt, role, created_at) values ('nbk_1','ses_x','t','p','writer','2026-01-01')")
    command.upgrade(cfg, "head")
    with sqlite3.connect(settings.db_path) as c:
        names = {r[0] for r in c.execute("select name from sqlite_master where type='table'")}
        assert {"notebook_entries", "applied_events"}.isdisjoint(names)
        assert "game_sessions" in names and RETIRED_TABLES.isdisjoint(names)
        assert c.execute("select count(*) from game_sessions").fetchone()[0] == 1
    command.downgrade(cfg, "0010_assistant_plans")
    with sqlite3.connect(settings.db_path) as c:
        names = {r[0] for r in c.execute("select name from sqlite_master where type='table'")}
        assert {"notebook_entries", "applied_events"} <= names
    command.upgrade(cfg, "head")  # rejouable
    assert set(Base.metadata.tables) <= {r[0] for r in sqlite3.connect(settings.db_path).execute("select name from sqlite_master where type='table'")}


def test_unique_agent_ownership(db):
    g = _session(db)
    db.add(AgentOwnership(session_id=g.id, role="triage", price_paid=35))
    db.commit()
    db.add(AgentOwnership(session_id=g.id, role="triage", price_paid=35))
    with pytest.raises(IntegrityError):
        db.commit()


def test_unique_ledger_source(db):
    g = _session(db)
    db.add(LedgerEntry(session_id=g.id, amount=13, category="reward", source_action="sub_1"))
    db.commit()
    db.add(LedgerEntry(session_id=g.id, amount=13, category="reward", source_action="sub_1"))
    with pytest.raises(IntegrityError):
        db.commit()


def test_unique_idempotency_key(db):
    g = _session(db)
    db.add(ActionRun(session_id=g.id, idempotency_key="key-0000001", type="message"))
    db.commit()
    db.add(ActionRun(session_id=g.id, idempotency_key="key-0000001", type="message"))
    with pytest.raises(IntegrityError):
        db.commit()


def test_rules_come_from_data_files(settings, data_copy):
    path = data_copy / "rules" / "rules_v1.json"
    rules = json.loads(path.read_text())
    rules["initial_capital"] = 77
    path.write_text(json.dumps(rules))
    custom = Settings(db_path=settings.db_path, data_dir=data_copy)
    with TestClient(create_app(custom)) as c:
        st = c.post("/api/sessions", json={"company_name": "X", "mode": "beginner"}, headers=new_key(1)).json()
    assert st["balance"]["available"] == 77


def test_reference_rules_values():
    """Les données livrées reflètent docs/RULES.md ; `rules_v1` est réduit aux limites techniques (API-R3)."""
    s = Settings()
    from app.rules import load_rules

    r = load_rules(s.data_dir, s.rules_version)
    assert r.initial_capital == 30 and [a.value for a in r.initial_agents] == ["scout"]
    assert set(r.limits.model_dump()) == {"call_timeout_seconds", "technical_retries", "provider_concurrency", "reservation_ttl_seconds"}
    raw = json.loads((s.data_dir / "rules" / "rules_v1.json").read_text())
    assert not {"missions", "quotas", "initial_stage"} & set(raw)  # plus de moteur d'expédition


def test_fixtures_and_openapi_are_up_to_date(tmp_path):
    files = export_fixtures.build_all(Settings(db_path=tmp_path / "f.db"))
    for path, content in files.items():
        assert json.loads(path.read_text()) == content, f"{path.name} périmée : relancer app.export_fixtures"
    assert export_openapi.OPENAPI_PATH.read_text() == export_openapi.render(), "openapi.json périmé : relancer app.export_openapi"
