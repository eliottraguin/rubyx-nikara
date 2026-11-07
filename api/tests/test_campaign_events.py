"""BE02 : événements versionnés (T10), crédit de correction, mode démo protégé."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.models import MissionAttempt
from app.services import events as ev
from app.services.missions import EventDef

from ._campaign_support import Player, make_settings

SECRET = "secret-de-demo-pour-les-tests"


@pytest.fixture
def app(tmp_path):
    application = create_app(make_settings(tmp_path, demo_secret=SECRET))
    with TestClient(application):
        yield application


def to_m5(p: Player) -> dict:
    for mission in ["m1", "m2", "m3", "m4"]:
        p.play(mission, 70)
    return p.start("m5")


def set_counts(app, attempt_id: str, counts: dict) -> None:
    with app.state.session_factory() as db:
        db.get(MissionAttempt, attempt_id).message_counts = counts
        db.commit()


def attempt_of(app, attempt_id: str) -> MissionAttempt:
    with app.state.session_factory() as db:
        return db.get(MissionAttempt, attempt_id)


def test_new_brief_version_is_explicit_with_diff_and_credit_once_per_role_T10(app):
    p = Player(app)
    d = to_m5(p)
    aid = d["attempt"]["id"]
    assert d["attempt"]["brief_version"] == 1 and d["brief"]["changes"] == []
    # writer a 1 message, prospector 4, qa est à 5/5 (plus rien de restant), lead n'a jamais été sollicité
    set_counts(app, aid, {"writer": 1, "prospector": 4, "qa": 5})
    r = p.artifact(aid, "Première proposition")  # la 1re proposition déclenche « changement de cible »
    assert r.status_code == 201
    detail = p.http.get(f"/api/attempts/{aid}").json()
    assert detail["attempt"]["brief_version"] == 2
    change = detail["brief"]["changes"][0]
    assert change["version"] == 2 and change["event_id"] == "evt_target_change"
    assert change["diff"] == [{"field": "objective", "before": "Cibler les étudiants", "after": "Cibler les actifs"}]
    assert detail["brief"]["content"]["objective"] == "Cibler les actifs" and detail["brief"]["content"]["version"] == 2
    # au plus un crédit par rôle concerné ; le quota reste 5, jamais 6
    assert sorted(detail["attempt"]["free_credit_roles"]) == ["prospector", "writer"]
    counts = detail["attempt"]["message_counts"]
    assert counts == {"writer": 1, "prospector": 4, "qa": 5}
    # une seconde proposition ne redéclenche rien
    p.artifact(aid, "Autre version")
    assert p.http.get(f"/api/attempts/{aid}").json()["attempt"]["brief_version"] == 2
    # consommer le crédit : une seule fois, et le compteur de messages n'est pas modifié (pas de 6e message)
    with app.state.session_factory() as db:
        a = db.get(MissionAttempt, aid)
        assert ev.has_correction_credit(a, "writer") and not ev.has_correction_credit(a, "qa") and not ev.has_correction_credit(a, "lead")
        assert ev.consume_correction_credit(a, "writer") is True
        assert ev.consume_correction_credit(a, "writer") is False
        assert a.message_counts["writer"] == 1
        db.commit()
    # un rôle qui a consommé son crédit n'en reçoit pas un second, même via un autre événement à crédit
    with app.state.session_factory() as db:
        a = db.get(MissionAttempt, aid)
        second = EventDef(id="evt_second_credit", correction_credit={})
        assert ev._grant_credits(app.state.rules, a, second) == []
        assert a.message_counts["writer"] == 1 and a.message_counts["prospector"] == 4


def test_stale_brief_version_on_submit_is_a_conflict(app):
    p = Player(app)
    aid = to_m5(p)["attempt"]["id"]
    art = p.artifact(aid, "Proposition").json()["id"]  # brief passe en version 2
    stale = p.submit(aid, art, brief_version=1)
    assert stale.status_code == 409 and stale.json()["error"]["code"] == "VERSION_CONFLICT"
    ok = p.submit(aid, art, brief_version=2)
    assert ok.status_code == 201 and ok.json()["brief_version"] == 2
    assert ok.json()["rubric"]["brief"]["version"] == 2  # le brief vu est figé dans la livraison


def test_added_document_visible_only_after_event(app):
    p = Player(app)
    aid = to_m5(p)["attempt"]["id"]
    assert [d["id"] for d in p.http.get(f"/api/attempts/{aid}").json()["documents"]] == ["doc_a"]
    p.artifact(aid, "Proposition")
    assert [d["id"] for d in p.http.get(f"/api/attempts/{aid}").json()["documents"]] == ["doc_a", "doc_late"]


def test_event_requires_active_attempt_and_is_applied_once(app):
    p = Player(app)
    aid = to_m5(p)["attempt"]["id"]
    art = p.artifact(aid, "Proposition").json()["id"]
    r = p.post("/api/demo/events", {"attempt_id": aid, "event_id": "evt_target_change"}, headers={"X-Demo-Secret": SECRET})
    assert r.status_code == 409 and r.json()["error"]["code"] == "INVALID_STATE"  # déjà appliqué
    p.submit(aid, art)
    r = p.post("/api/demo/events", {"attempt_id": aid, "event_id": "evt_demo_sources"}, headers={"X-Demo-Secret": SECRET})
    assert r.status_code == 409  # livraison figée : plus d'événement


class TestDemo:
    def test_disabled_by_default(self, tmp_path):
        with TestClient(create_app(make_settings(tmp_path, name="nodemo.db"))) as c:
            p = Player(c.app)
            aid = to_m5(p)["attempt"]["id"]
            for headers in ({}, {"X-Demo-Secret": SECRET}, {"X-Demo-Secret": ""}):
                r = p.post("/api/demo/events", {"attempt_id": aid, "event_id": "evt_demo_sources"}, headers=headers)
                assert r.status_code == 404 and r.json()["error"]["code"] == "NOT_FOUND"
            assert p.http.get(f"/api/attempts/{aid}").json()["attempt"]["brief_version"] == 1

    def test_refused_without_or_with_wrong_secret(self, app):
        p = Player(app)
        aid = to_m5(p)["attempt"]["id"]
        for headers in ({}, {"X-Demo-Secret": "faux"}, {"X-Demo-Secret": SECRET + "x"}):
            r = p.post("/api/demo/events", {"attempt_id": aid, "event_id": "evt_demo_sources"}, headers=headers)
            assert r.status_code == 404
        assert p.http.get(f"/api/attempts/{aid}").json()["attempt"]["brief_version"] == 1
        assert SECRET not in p.http.get("/api/state").text

    def test_injects_admissible_event_without_touching_score_or_balance(self, app):
        p = Player(app)
        aid = to_m5(p)["attempt"]["id"]
        before = p.state()
        r = p.post("/api/demo/events", {"attempt_id": aid, "event_id": "evt_demo_sources"}, headers={"X-Demo-Secret": SECRET})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["demo"] is True and body["event"]["brief_version"] == 2 and body["attempt"]["brief_version"] == 2
        assert body["event"]["diff"] == [{"field": "summary", "before": "A", "after": "B"}]
        after = p.state()
        assert after["balance"] == before["balance"] and after["progress"]["reputation"] == before["progress"]["reputation"]
        # même événement deux fois : refusé
        again = p.post("/api/demo/events", {"attempt_id": aid, "event_id": "evt_demo_sources"}, headers={"X-Demo-Secret": SECRET})
        assert again.status_code == 409

    def test_only_admissible_events(self, app):
        p = Player(app)
        for mission in ["m1", "m2", "m3", "m4", "m5"]:
            p.play(mission, 70)
        m6 = p.start("m6")["attempt"]["id"]  # l'événement M6 n'est pas sélectionnable en démo
        h = {"X-Demo-Secret": SECRET}
        assert p.post("/api/demo/events", {"attempt_id": m6, "event_id": "evt_m6_context"}, headers=h).status_code == 422
        assert p.post("/api/demo/events", {"attempt_id": m6, "event_id": "evt_inconnu"}, headers=h).status_code == 422
        assert p.post("/api/demo/events", {"attempt_id": m6}, headers=h).status_code == 422

    def test_cannot_touch_another_sessions_attempt(self, app):
        a, b = Player(app, name="A"), Player(app, name="B")
        aid = to_m5(a)["attempt"]["id"]
        r = b.post("/api/demo/events", {"attempt_id": aid, "event_id": "evt_demo_sources"}, headers={"X-Demo-Secret": SECRET})
        assert r.status_code == 404
        assert attempt_of(app, aid).brief_version == 1
