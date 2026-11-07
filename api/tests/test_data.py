from __future__ import annotations

import json
import sqlite3

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError

from app import export_fixtures, export_openapi
from app.config import REPO_DIR, Settings
from app.db import alembic_config, make_engine, make_session_factory, run_migrations
from app.main import create_app
from app.models import (
    ActionRun,
    AgentOwnership,
    ArtifactVersion,
    Base,
    Evaluation,
    GameSession,
    LedgerEntry,
    MissionAttempt,
    Submission,
)

from .conftest import new_key

TABLES = {
    "game_sessions", "agent_ownerships", "mission_definitions", "mission_attempts", "messages",
    "artifact_versions", "submissions", "evaluations", "ledger_entries", "action_runs", "llm_calls",
    "notebook_entries", "reservations", "artifact_shares", "applied_events",
}


@pytest.fixture
def db(settings: Settings):
    run_migrations(settings)
    engine = make_engine(settings)
    with make_session_factory(engine)() as s:
        yield s
    engine.dispose()


def _session(db) -> GameSession:
    g = GameSession(token_hash=f"h{db.scalar(text('select random()'))}", mode="beginner", company={"name": "x"}, stage="m1", seed=1, rules_version="rules_v1")
    db.add(g)
    db.commit()
    return g


def test_migrations_create_all_tables_and_are_idempotent(settings):
    run_migrations(settings)
    run_migrations(settings)
    with sqlite3.connect(settings.db_path) as c:
        names = {r[0] for r in c.execute("select name from sqlite_master where type='table'")}
    assert TABLES <= names
    assert set(Base.metadata.tables) <= names


def test_migration_downgrade(settings):
    from alembic import command

    run_migrations(settings)
    command.downgrade(alembic_config(settings.database_url), "base")
    with sqlite3.connect(settings.db_path) as c:
        names = {r[0] for r in c.execute("select name from sqlite_master where type in ('table','trigger')")}
    assert names <= {"alembic_version"}


def test_unique_agent_ownership(db):
    g = _session(db)
    db.add(AgentOwnership(session_id=g.id, role="qa", price_paid=30))
    db.commit()
    db.add(AgentOwnership(session_id=g.id, role="qa", price_paid=30))
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


def test_unique_evaluation_per_submission_and_immutability(db):
    g = _session(db)
    att = MissionAttempt(session_id=g.id, mission_id="m1", unit_price=0)
    db.add(att)
    db.flush()
    art = ArtifactVersion(attempt_id=att.id, type="text", content="v1", author="agent")
    db.add(art)
    db.flush()
    sub = Submission(attempt_id=att.id, artifact_version_id=art.id, brief_version=1, content_hash="h", rubric={})
    db.add(sub)
    db.flush()
    db.add(Evaluation(submission_id=sub.id, model="mock", judge_version="j1", status="DONE"))
    db.commit()
    db.add(Evaluation(submission_id=sub.id, model="mock", judge_version="j1", status="DONE"))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()
    # versions de livrable immuables, livraison figée (triggers)
    with pytest.raises(Exception, match="immuable"):
        db.execute(text("update artifact_versions set content='modifié'"))
    db.rollback()
    with pytest.raises(Exception, match="figée"):
        db.execute(text("update submissions set content_hash='autre'"))
    db.rollback()
    db.execute(text("update submissions set status='DONE'"))  # le statut reste modifiable
    db.commit()


def test_rules_come_from_data_files(settings, data_copy):
    path = data_copy / "rules" / "rules_v1.json"
    rules = json.loads(path.read_text())
    rules["initial_capital"] = 77
    next(a for a in rules["agents"] if a["id"] == "qa")["price"] = 31
    path.write_text(json.dumps(rules))
    custom = Settings(db_path=settings.db_path, data_dir=data_copy)
    with TestClient(create_app(custom)) as c:
        st = c.post("/api/sessions", json={"company_name": "X", "mode": "beginner"}, headers=new_key(1)).json()
    assert st["balance"]["available"] == 77
    assert next(a for a in st["agents"] if a["role"] == "qa")["price"] == 31


def test_reference_rules_values():
    """Les données livrées reflètent docs/RULES.md."""
    s = Settings()
    from app.rules import load_rules

    r = load_rules(s.data_dir, s.rules_version)
    assert r.initial_capital == 30
    assert {a.id.value: a.price for a in r.agents} == {"writer": 0, "prospector": 20, "researcher": 35, "qa": 30, "analyst": 45, "lead": 80}
    assert {m.id: (m.max_reward, m.unit_price) for m in r.missions} == {
        "m1": (20, 0), "m2": (30, 1), "m3": (40, 1), "m4": (60, 2), "m5": (90, 2), "m6": (150, 3), "rescue": (10, 0),
    }
    assert r.quotas.messages_per_agent_per_attempt == 5


def test_fixtures_and_openapi_are_up_to_date(tmp_path):
    files = export_fixtures.build_all(Settings(db_path=tmp_path / "f.db"))
    for path, content in files.items():
        assert json.loads(path.read_text()) == content, f"{path.name} périmée : relancer app.export_fixtures"
    assert export_openapi.OPENAPI_PATH.read_text() == export_openapi.render(), "openapi.json périmé : relancer app.export_openapi"
