from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.main import create_app

from .conftest import new_key

ROLES = ["writer", "prospector", "researcher", "qa", "analyst", "lead"]


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok" and body["db"] == "ok"
    assert body["llm_provider"] == "mock" and body["rules_version"] == "rules_v1"


@pytest.mark.parametrize("mode", ["beginner", "expert"])
def test_create_session_initial_state(client, make_session, mode):
    r = client.post("/api/sessions", json={"company_name": "  Ma Boîte ", "mode": mode, "profile": "Café"}, headers=new_key(2))
    assert r.status_code == 201
    state = r.json()
    assert state["session"]["mode"] == mode
    assert state["session"]["company"] == {"name": "Ma Boîte", "profile": "Café"}
    assert state["balance"] == {"booked": 30, "reserved": 0, "available": 30}
    owned = [a["role"] for a in state["agents"] if a["owned"]]
    assert owned == ["writer"]
    assert [a["role"] for a in state["agents"]] == ROLES
    assert state["llm"] == {"provider": "mock", "simulated": True}
    assert state["session"]["stage"] == "m1"
    # cookie opaque, HttpOnly, jamais exposé dans le corps
    set_cookie = r.headers["set-cookie"]
    assert "rubix_session=" in set_cookie and "HttpOnly" in set_cookie and "SameSite=lax" in set_cookie
    token = r.cookies["rubix_session"]
    assert token not in r.text and "token" not in r.text


def test_reload_keeps_state_T01(client, settings, make_session):
    created = make_session(client, "expert")
    again = client.get("/api/state")
    assert again.status_code == 200 and again.json() == created
    # nouveau « navigateur » avec le même cookie, et redémarrage complet de l'API
    cookie = client.cookies.get("rubix_session")
    with TestClient(create_app(settings)) as restarted:
        restarted.cookies.set("rubix_session", cookie)
        assert restarted.get("/api/state").json() == created


def test_isolation_between_sessions_T13(client, make_session):
    a_state = make_session(client, "beginner", "Alpha")
    b_client = TestClient(client.app)
    b_state = make_session(b_client, "expert", "Beta")
    assert a_state["session"]["id"] != b_state["session"]["id"]
    assert client.get("/api/state").json()["session"]["company"]["name"] == "Alpha"
    assert b_client.get("/api/state").json()["session"]["company"]["name"] == "Beta"
    # un identifiant fourni par le client n'est jamais utilisé
    r = b_client.get("/api/state", params={"session_id": a_state["session"]["id"]}, headers={"X-Session-Id": a_state["session"]["id"]})
    assert r.json()["session"]["id"] == b_state["session"]["id"]
    # l'id public n'est pas un jeton
    forged = TestClient(client.app)
    forged.cookies.set("rubix_session", a_state["session"]["id"])
    assert forged.get("/api/state").status_code == 401
    # B ne peut supprimer que sa propre partie
    assert b_client.delete("/api/session", headers=new_key(3)).status_code == 204
    assert client.get("/api/state").json()["session"]["id"] == a_state["session"]["id"]


def test_state_requires_session(client):
    r = client.get("/api/state")
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "SESSION_REQUIRED"


def test_delete_session_removes_content(client, settings, make_session):
    state = make_session(client)
    sid = state["session"]["id"]
    engine = client.app.state.engine
    from app.models import AgentOwnership, GameSession, LedgerEntry

    r = client.delete("/api/session", headers=new_key(4))
    assert r.status_code == 204
    assert client.get("/api/state").status_code == 401
    with client.app.state.session_factory() as db:
        assert db.scalar(select(GameSession).where(GameSession.id == sid)) is None
        assert db.scalars(select(LedgerEntry).where(LedgerEntry.session_id == sid)).all() == []
        assert db.scalars(select(AgentOwnership).where(AgentOwnership.session_id == sid)).all() == []
    assert engine is not None


def test_delete_cascades_deep_content(client, make_session):
    """Une partie avec tentative, livrable, livraison et évaluation se supprime sans erreur de FK."""
    from app.models import (
        ActionRun,
        ArtifactVersion,
        Evaluation,
        GameSession,
        MissionAttempt,
        Reservation,
        Submission,
        utcnow,
    )

    state = make_session(client)
    sid = state["session"]["id"]
    with client.app.state.session_factory() as db:
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
        act = ActionRun(session_id=sid, attempt_id=att.id, idempotency_key="k-delete-0001", type="message")
        db.add(act)
        db.flush()
        db.add(Reservation(session_id=sid, action_id=act.id, amount=1, attempt_id=att.id, expires_at=utcnow()))
        db.commit()
    assert client.delete("/api/session", headers=new_key(5)).status_code == 204
    with client.app.state.session_factory() as db:
        assert db.scalar(select(GameSession).where(GameSession.id == sid)) is None
        assert db.scalars(select(ArtifactVersion)).all() == []
        assert db.scalars(select(Evaluation)).all() == []
