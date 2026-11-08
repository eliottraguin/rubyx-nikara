from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.main import create_app

from .conftest import new_key


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
    assert "progress" not in state  # progression de campagne retirée (API-R2)
    assert state["agents"] == []  # instances d'agent (docs/CONTRACTS-V2.md §2) : aucune au départ
    assert [h["role"] for h in state["hangar"] if h["owned"]] == ["scout", "assistant_prospection", "assistant_clients", "assistant_pub"]
    assert state["llm"] == {"provider": "mock", "simulated": True}
    assert "stage" not in state["session"]  # étape de campagne retirée (API-R3)
    assert not {"missions", "attempts", "quotas"} & set(state)  # moteur d'expédition retiré (API-R3)
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
    """Une partie avec action, réservation, appel, prospect, brouillon, conversation et recherche se supprime sans erreur de FK."""
    from app.models import (
        ActionRun,
        Conversation,
        GameSession,
        LLMCall,
        Prospect,
        Reservation,
        utcnow,
    )
    from app.models_drafts import ProspectDraft
    from app.models_search import Search

    state = make_session(client)
    sid = state["session"]["id"]
    with client.app.state.session_factory() as db:
        search = Search(session_id=sid, planet_id="annuaire", status="DONE", profile_version=1)
        act = ActionRun(session_id=sid, idempotency_key="k-delete-0001", type="prospect_profile")
        db.add_all([search, act])
        db.flush()
        db.add(Reservation(session_id=sid, action_id=act.id, amount=1, expires_at=utcnow()))
        db.add(LLMCall(action_id=act.id, role="replier", model="mock"))
        pro = Prospect(
            session_id=sid, entreprise="X", entreprise_cle="x", source="annuaire", source_ref="ann_1", raisons_fit=[], pertinence=50,
            fiabilite="simule", simule=True, instantane={}, search_id=search.id, profile_version=1,
        )
        db.add(pro)
        db.flush()
        db.add(ProspectDraft(session_id=sid, prospect_id=pro.id, kind="fiche", numero=1, auteur="agent", contenu={}, controles=[], profile_version=1, simule=True))
        db.add(Conversation(session_id=sid, prospect_id=pro.id))
        db.commit()
    assert client.delete("/api/session", headers=new_key(5)).status_code == 204
    with client.app.state.session_factory() as db:
        assert db.scalar(select(GameSession).where(GameSession.id == sid)) is None
        for model in (Search, ActionRun, Reservation, LLMCall, Prospect, ProspectDraft, Conversation):
            assert db.scalars(select(model)).all() == [], model


def test_retired_expedition_routes_are_gone(client, make_session):
    """Missions, tentatives, livrables, partages et messages d'expédition n'existent plus (API-R3)."""
    make_session(client)
    for method, path in (
        ("POST", "/api/missions/m1/start"),
        ("GET", "/api/attempts/att_x0000000000"),
        ("POST", "/api/attempts/att_x0000000000/messages"),
        ("POST", "/api/attempts/att_x0000000000/artifacts"),
        ("POST", "/api/attempts/att_x0000000000/shares"),
    ):
        r = client.request(method, path, json={}, headers=new_key(9))
        assert r.status_code in (404, 422) and r.json()["error"]["code"] in ("NOT_FOUND", "INVALID_REQUEST"), (path, r.text)
        assert client.request(method, path, json={}, headers=new_key(9)).status_code != 202
    names = {r.path for r in client.app.routes if hasattr(r, "path")}
    assert not any("/missions" in n or "/attempts" in n for n in names)


