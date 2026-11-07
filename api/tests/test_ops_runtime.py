"""BE08 : santé/readiness, démo seedée, snapshot, sauvegarde, purge, suivi technique, journaux."""

from __future__ import annotations

import io
import json
import logging
from datetime import timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, text

from app.cli import demo as demo_ops
from app.cli import storage
from app.cli.__main__ import main as cli_main
from app.config import Settings
from app.logging_config import configure_logging
from app.main import create_app
from app.models import (
    ActionRun,
    AgentOwnership,
    AppliedEvent,
    TargetActionUse,
    ArtifactShare,
    ArtifactVersion,
    Base,
    Evaluation,
    ExpeditionRecord,
    GameSession,
    LLMCall,
    Message,
    MissionAttempt,
    NotebookEntry,
    Prospect,
    ProspectIdempotency,
    Reservation,
    Submission,
    utcnow,
)
from tests.conftest import new_key

SECRET = "demo-secret-0123456789"
KEY = {"Idempotency-Key": "ops-key-00000001"}
SESSION_TABLES = [t.name for t in Base.metadata.sorted_tables if t.name != "mission_definitions"]


@pytest.fixture
def dclient(tmp_path: Path):
    settings = Settings(db_path=tmp_path / "ops.db", demo_secret=SECRET)
    with TestClient(create_app(settings)) as c:
        yield c


def populate(db, sid: str, tag: str = "a") -> None:
    """Remplit toutes les tables rattachées à une partie (parent/enfant de livrable compris)."""
    att = MissionAttempt(session_id=sid, mission_id="m1", unit_price=0)
    db.add(att)
    db.flush()
    parent = ArtifactVersion(attempt_id=att.id, type="text", content="v1", author="agent")
    db.add(parent)
    db.flush()
    child = ArtifactVersion(attempt_id=att.id, type="text", content="v2", author="player", parent_id=parent.id)
    db.add(child)
    db.flush()
    sub = Submission(attempt_id=att.id, artifact_version_id=child.id, brief_version=1, content_hash="h", rubric={})
    db.add(sub)
    db.flush()
    db.add(Evaluation(submission_id=sub.id, model="mock", judge_version="j1", status="DONE"))
    act = ActionRun(session_id=sid, attempt_id=att.id, idempotency_key=f"k-{tag}-0001", type="message")
    db.add(act)
    db.flush()
    db.add(Reservation(session_id=sid, action_id=act.id, amount=1, attempt_id=att.id, expires_at=utcnow()))
    db.add(Message(attempt_id=att.id, role="writer", author="player", text="bonjour", status="DONE", action_id=act.id))
    db.add(LLMCall(action_id=act.id, role="writer", model="mock", usage={"input_tokens": 10, "output_tokens": 5, "measured": False}, usage_measured=False, duration_ms=4))
    db.add(NotebookEntry(session_id=sid, title="t", prompt="p", role="writer"))
    db.add(ArtifactShare(attempt_id=att.id, artifact_version_id=parent.id, role="writer", action_id=act.id))
    db.add(AppliedEvent(attempt_id=att.id, event_id="e1", brief_version=1))
    db.add(TargetActionUse(session_id=sid, kind="prospect", target_id="pro_1", key="prospect_profile", used=1, reserved=0))
    db.add(ExpeditionRecord(session_id=sid, attempt_id=att.id, source="annuaire", source_ref="ann_1", record={"entreprise": "X"}))
    db.add(
        Prospect(
            session_id=sid, entreprise="X", entreprise_cle="x", source="annuaire", source_ref="ann_1", raisons_fit=[], pertinence=10,
            fiabilite="simule", simule=True, instantane={}, expedition_id=att.id, rapport_version_id=parent.id, profile_version=1,
        )
    )
    db.add(ProspectIdempotency(session_id=sid, key_hash=f"h-{tag}", request_hash="r", status_code=200))
    db.commit()


def count_rows(db, session_ids=None) -> dict[str, int]:
    return {n: db.execute(text(f"SELECT count(*) FROM {n}")).scalar() for n in SESSION_TABLES}


# --- santé -----------------------------------------------------------------------------------------


def test_health_and_ready(client, settings):
    h = client.get("/api/health")
    assert h.status_code == 200 and h.json()["db"] == "ok"
    r = client.get("/api/ready")
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True and set(body["checks"]) == {"db", "schema", "rules", "provider"}
    assert all(c["ok"] for c in body["checks"].values())
    assert str(settings.db_path) not in r.text and "/tmp" not in r.text and "simulé" in body["checks"]["provider"]["detail"]
    assert "/api/ready" not in client.get("/openapi.json").text  # hors contrat


def test_ready_503_when_schema_stale(client):
    with client.app.state.engine.begin() as conn:
        conn.execute(text("UPDATE alembic_version SET version_num='0000_old'"))
    r = client.get("/api/ready")
    assert r.status_code == 503 and r.json()["checks"]["schema"]["ok"] is False
    assert client.get("/api/health").status_code == 200  # la vivacité reste distincte de la disponibilité


# --- démo ------------------------------------------------------------------------------------------


def test_demo_init_is_seeded_and_isolated(client, make_session):
    normal = make_session(client)
    app = client.app
    with app.state.session_factory() as db:
        game, token = demo_ops.init_demo(db, app.state.rules, "expert")
        assert game.seed == demo_ops.DEMO_SEED and game.company["demo"] is True and game.mode == "expert"
        assert len(demo_ops.demo_sessions(db)) == 1
        with pytest.raises(demo_ops.DemoError):
            demo_ops.init_demo(db, app.state.rules, replace=False)
        game2, _ = demo_ops.init_demo(db, app.state.rules, "beginner")  # remplace
        assert game2.id != game.id and len(demo_ops.demo_sessions(db)) == 1
        assert db.get(GameSession, normal["session"]["id"]) is not None  # partie normale intacte
    # la démo est jouable avec son cookie et ne diffère d'une partie normale que par graine et nom ; badge simulé présent
    c2 = TestClient(app, cookies={app.state.settings.cookie_name: token})
    st = c2.get("/api/state")
    assert st.status_code == 401  # jeton de la 1re démo remplacée : plus valable


def test_demo_reset_route_protected(dclient, make_session):
    normal = make_session(dclient)
    assert dclient.post("/api/demo/reset", headers=KEY).status_code == 404
    assert dclient.post("/api/demo/reset", headers={**KEY, "X-Demo-Secret": "faux-secret-0000000000"}).status_code == 404
    assert dclient.get("/api/ops/usage").status_code == 404
    h = {**KEY, "X-Demo-Secret": SECRET}
    r = dclient.post("/api/demo/reset", headers=h)
    assert r.status_code == 200 and r.json()["seed"] == demo_ops.DEMO_SEED and r.json()["simulated"] is True
    state = dclient.get("/api/state").json()  # cookie de démo posé
    assert state["session"]["id"] == r.json()["session_id"] and state["llm"]["simulated"] is True
    assert dclient.post("/api/demo/reset", headers=h).json()["removed"] == 1
    with dclient.app.state.session_factory() as db:
        assert db.get(GameSession, normal["session"]["id"]) is not None


def test_demo_reset_inactive_without_secret(client):
    assert client.post("/api/demo/reset", headers={**KEY, "X-Demo-Secret": "x" * 20}).status_code == 404


def test_snapshot_roundtrip(client, tmp_path):
    app = client.app
    with app.state.session_factory() as db:
        game, token = demo_ops.init_demo(db, app.state.rules)
        populate(db, game.id)
        before = count_rows(db)
        snap = demo_ops.export_snapshot(db)
        assert snap["format"] == demo_ops.SNAPSHOT_FORMAT and snap["tables"]["artifact_versions"].__len__() == 2
        path = tmp_path / "snap.json"
        demo_ops.write_snapshot(path, snap)
        assert oct(path.stat().st_mode & 0o777) == "0o600"
        demo_ops.delete_demo(db)
        assert sum(count_rows(db).values()) == 0
        sid = demo_ops.import_snapshot(db, json.loads(path.read_text()))
        assert sid == game.id and count_rows(db) == before
    # le cookie d'origine fonctionne toujours (seul le hachage est dans le snapshot)
    assert TestClient(app, cookies={app.state.settings.cookie_name: token}).get("/api/state").status_code == 200


def test_snapshot_refuses_bad_input(client):
    app = client.app
    with app.state.session_factory() as db:
        with pytest.raises(demo_ops.DemoError):
            demo_ops.export_snapshot(db)  # aucune démo
        with pytest.raises(demo_ops.DemoError):
            demo_ops.import_snapshot(db, {"format": "autre"})
        game, _ = demo_ops.init_demo(db, app.state.rules)
        snap = demo_ops.export_snapshot(db)
        snap["tables"]["game_sessions"][0]["company"] = {"name": "x"}  # pas une démo
        with pytest.raises(demo_ops.DemoError):
            demo_ops.import_snapshot(db, snap)
        snap = demo_ops.export_snapshot(db)
        snap["schema_revision"] = "0000"
        with pytest.raises(demo_ops.DemoError):
            demo_ops.import_snapshot(db, snap)
        assert db.get(GameSession, game.id) is not None  # base inchangée


# --- suppression / purge ---------------------------------------------------------------------------


def test_delete_session_removes_every_row(client, make_session):
    state = make_session(client)
    with client.app.state.session_factory() as db:
        populate(db, state["session"]["id"])
        assert all(n > 0 for n in count_rows(db).values())
    assert client.delete("/api/session", headers=new_key(9)).status_code == 204
    with client.app.state.session_factory() as db:
        assert sum(count_rows(db).values()) == 0


def test_purge_by_retention(client, make_session):
    app = client.app
    ids = {}
    with app.state.session_factory() as db:
        for name, age in (("fresh", 1), ("old", 8), ("older", 30)):
            g, _ = __import__("app.services.sessions", fromlist=["x"]).create_session(
                db, app.state.rules, __import__("app.schemas.state", fromlist=["x"]).SessionCreate(company_name=name, mode="beginner")
            )
            g.created_at = utcnow() - timedelta(days=age)
            db.commit()
            populate(db, g.id, name)
            ids[name] = g.id
        demo, _ = demo_ops.init_demo(db, app.state.rules)
        demo.created_at = utcnow() - timedelta(days=100)
        db.commit()
        dry = storage.purge_sessions(db, 7, dry_run=True)
        assert dry["matched"] == 2 and dry["deleted"] == 0 and db.get(GameSession, ids["old"]) is not None
        res = storage.purge_sessions(db, 7)
        assert res["deleted"] == 2
        left = set(db.scalars(select(GameSession.id)))
        assert left == {ids["fresh"], demo.id}  # démo épargnée
        orphans = db.execute(text("SELECT count(*) FROM messages WHERE attempt_id NOT IN (SELECT id FROM mission_attempts)")).scalar()
        assert orphans == 0
        assert db.scalar(select(AgentOwnership.id).where(AgentOwnership.session_id == ids["old"])) is None
        assert storage.purge_sessions(db, 7, include_demo=True)["deleted"] == 1
        with pytest.raises(storage.OpsError):
            storage.purge_sessions(db, 0)


# --- sauvegarde ------------------------------------------------------------------------------------


def test_backup_and_restore(client, settings, make_session, tmp_path):
    state = make_session(client)
    dest = tmp_path / "bk" / "b.db"
    assert storage.backup_db(settings, dest)["bytes"] > 0
    with pytest.raises(storage.OpsError):
        storage.backup_db(settings, dest)  # pas d'écrasement implicite
    client.delete("/api/session", headers=new_key(8))
    with client.app.state.session_factory() as db:
        assert db.get(GameSession, state["session"]["id"]) is None
    client.app.state.engine.dispose()
    with pytest.raises(storage.OpsError):
        storage.restore_db(settings, dest)  # base existante : --force requis
    res = storage.restore_db(settings, dest, force=True)
    assert Path(res["safety_copy"]).is_file()
    with client.app.state.session_factory() as db:
        assert db.get(GameSession, state["session"]["id"]) is not None
    bad = tmp_path / "bad.db"
    bad.write_bytes(b"pas une base sqlite" * 50)
    with pytest.raises(Exception):
        storage.restore_db(settings, bad, force=True)


def test_data_survives_restart(settings):
    with TestClient(create_app(settings)) as c1:
        r = c1.post("/api/sessions", json={"company_name": "Persistante", "mode": "beginner"}, headers=new_key(1))
        cookie = r.cookies.get(settings.cookie_name)
    with TestClient(create_app(settings), cookies={settings.cookie_name: cookie}) as c2:
        assert c2.get("/api/state").json()["session"]["company"]["name"] == "Persistante"


# --- suivi technique -------------------------------------------------------------------------------


def test_usage_report(dclient, make_session):
    state = make_session(dclient)
    sid = state["session"]["id"]
    with dclient.app.state.session_factory() as db:
        act = ActionRun(session_id=sid, idempotency_key="k-usage-0001", type="message")
        db.add(act)
        db.flush()
        for usage, measured, att in (
            ({"input_tokens": 100, "output_tokens": 40, "measured": True}, True, 1),
            ({"input_tokens": 30, "output_tokens": 10, "measured": False}, False, 1),
            (None, False, 2),
        ):
            db.add(LLMCall(action_id=act.id, role="writer", model="mock", usage=usage, usage_measured=measured, duration_ms=10, attempts=att))
        db.commit()
    r = dclient.get("/api/ops/usage", headers={"X-Demo-Secret": SECRET})
    assert r.status_code == 200
    t = r.json()["total"]
    assert (t["llm_calls"], t["provider_calls"], t["failed_calls"]) == (3, 4, 1)
    assert (t["input_tokens_measured"], t["output_tokens_measured"]) == (100, 40)
    assert (t["input_tokens_estimated"], t["output_tokens_estimated"]) == (30, 10)
    assert t["estimate_flagged"] is True and t["total_tokens"] == 180
    assert r.json()["by_model"]["mock"]["llm_calls"] == 3 and r.json()["by_role"]["writer"]["llm_calls"] == 3
    assert "prompt" not in r.text.lower().replace("prompts", "")


def test_usage_caps_reported(tmp_path):
    s = Settings(db_path=tmp_path / "c.db", token_cap_session=100, token_cap_global=1000)
    with TestClient(create_app(s)) as c:
        with c.app.state.session_factory() as db:
            rep = storage.usage_report(db, s)
        assert rep["caps"]["session"] == 100 and rep["caps"]["global_used_pct"] == 0.0


# --- journaux --------------------------------------------------------------------------------------


def test_logs_are_structured_without_secrets(tmp_path):
    s = Settings(db_path=tmp_path / "l.db", demo_secret=SECRET)
    buf = io.StringIO()
    with TestClient(create_app(s)) as c:
        logger = logging.getLogger("rubix")
        logger.handlers[0].stream = buf
        c.post(
            "/api/sessions?token=zzz-query-secret",
            json={"company_name": "Entreprise secrète", "mode": "beginner"},
            headers={**new_key(1), "X-Demo-Secret": SECRET},
        )
        c.get("/api/state")
    lines = [json.loads(line) for line in buf.getvalue().splitlines()]
    reqs = [line for line in lines if line.get("event") == "request"]
    assert {r["path"] for r in reqs} == {"/api/sessions", "/api/state"}
    assert all({"method", "status", "duration_ms", "request_id"} <= set(r) for r in reqs)
    out = buf.getvalue()
    assert SECRET not in out and "zzz-query-secret" not in out and "Entreprise secrète" not in out
    assert "cookie" not in out.lower()


def test_configure_logging_idempotent(tmp_path):
    s = Settings(db_path=tmp_path / "l.db")
    configure_logging(s)
    configure_logging(s)
    assert len([h for h in logging.getLogger("rubix").handlers if getattr(h, "_rubix", False)]) == 1


# --- CLI -------------------------------------------------------------------------------------------


def run_cli(monkeypatch, capsys, tmp_path: Path, *argv: str) -> tuple[int, str, str]:
    monkeypatch.setenv("RUBIX_DB_PATH", str(tmp_path / "cli.db"))
    for k in ("RUBIX_DEMO_SECRET", "RUBIX_LLM_PROVIDER", "RUBIX_LLM_API_KEY"):
        monkeypatch.delenv(k, raising=False)
    code = cli_main(list(argv))
    cap = capsys.readouterr()
    return code, cap.out, cap.err


def test_cli_full_flow(monkeypatch, capsys, tmp_path):
    code, _, err = run_cli(monkeypatch, capsys, tmp_path, "check")
    assert code == 1  # base absente
    code, out, _ = run_cli(monkeypatch, capsys, tmp_path, "demo-init", "--mode", "expert", "--print-token")
    res = json.loads(out)
    assert code == 0 and res["seed"] == demo_ops.DEMO_SEED and res["cookie"].startswith("rubix_session=")
    code, out, _ = run_cli(monkeypatch, capsys, tmp_path, "demo-init")
    assert code == 1  # démo existante : refus sans --replace
    code, out, _ = run_cli(monkeypatch, capsys, tmp_path, "demo-init", "--reset")
    assert code == 0 and json.loads(out)["removed_demo_sessions"] == 1
    code, out, _ = run_cli(monkeypatch, capsys, tmp_path, "check")
    assert code == 0 and json.loads(out)["ok"] is True
    snap = tmp_path / "s.json"
    assert run_cli(monkeypatch, capsys, tmp_path, "demo-export", str(snap))[0] == 0
    assert run_cli(monkeypatch, capsys, tmp_path, "demo-import", str(snap))[0] == 0
    bk = tmp_path / "b.db"
    assert run_cli(monkeypatch, capsys, tmp_path, "backup", str(bk))[0] == 0
    code, _, err = run_cli(monkeypatch, capsys, tmp_path, "backup", str(bk))
    assert code == 1 and "existe déjà" in err
    code, out, _ = run_cli(monkeypatch, capsys, tmp_path, "purge", "--dry-run")
    assert code == 0 and json.loads(out)["matched"] == 0
    code, out, _ = run_cli(monkeypatch, capsys, tmp_path, "usage")
    assert code == 0 and json.loads(out)["total"]["llm_calls"] == 0
    code, out, _ = run_cli(monkeypatch, capsys, tmp_path, "config")
    assert "demo_secret" not in out and json.loads(out)["config"]["retention_days"] == 7


def test_cli_demo_refuses_real_provider(monkeypatch, capsys, tmp_path):
    monkeypatch.setenv("RUBIX_DB_PATH", str(tmp_path / "r.db"))
    monkeypatch.setenv("RUBIX_LLM_PROVIDER", "real")
    monkeypatch.setenv("RUBIX_LLM_API_KEY", "cle-bidon-0123456789")
    code = cli_main(["demo-init"])
    err = capsys.readouterr().err
    assert code == 1 and "fournisseur simulé" in err and "cle-bidon" not in err
