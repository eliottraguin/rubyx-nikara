"""BE02 : moteur de campagne (états, passages, déblocages, victoire, secours, reprise)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.models import LedgerEntry
from app.rules import MissionRule
from app.schemas.common import Role

from ._campaign_support import Player, make_settings

W, P, R, A, Q, L = Role.WRITER, Role.PROSPECTOR, Role.RESEARCHER, Role.ANALYST, Role.QA, Role.LEAD


@pytest.fixture
def settings(tmp_path):
    return make_settings(tmp_path)


@pytest.fixture
def app(settings):
    application = create_app(settings)
    with TestClient(application):  # déclenche le lifespan (migrations, moteur)
        yield application


def statuses(p: Player) -> dict[str, str]:
    return {m["id"]: m["status"] for m in p.state()["missions"]}


def unlocked(p: Player) -> set[str]:
    return {a["role"] for a in p.state()["agents"] if a["unlocked"]}


def test_initial_campaign_state(app):
    p = Player(app)
    st = p.state()
    assert statuses(p) == {"m1": "AVAILABLE", "m2": "LOCKED", "m3": "LOCKED", "m4": "LOCKED", "m5": "LOCKED", "m6": "LOCKED", "rescue": "AVAILABLE"}
    assert st["attempts"] == []
    assert st["progress"]["next_action"]["type"] == "start_mission" and st["progress"]["next_action"]["mission_id"] == "m1"
    assert st["progress"]["total_missions"] == 6 and st["progress"]["victory"] is False and st["progress"]["reputation"] is None
    assert unlocked(p) == {"writer"}
    m1 = p.mission("m1")
    assert m1["can_start"] and not m1["can_retry"] and m1["requires"] is None
    assert p.mission("m2")["requires"] == "m1" and not p.mission("m2")["can_start"]


@pytest.mark.parametrize("mode", ["beginner", "expert"])
def test_reload_keeps_campaign_state_per_mode_T01(settings, app, mode):
    p = Player(app, mode, "Ma Société")
    detail = p.start("m1")
    assert detail["mission_title"] == f"Titre m1 {mode}"  # variante de contenu propre au mode
    state = p.state()
    cookie = p.http.cookies.get("rubix_session")
    with TestClient(create_app(settings)) as restarted:
        restarted.cookies.set("rubix_session", cookie)
        assert restarted.get("/api/state").json() == state
        assert restarted.get(f"/api/attempts/{detail['attempt']['id']}").json() == p.http.get(f"/api/attempts/{detail['attempt']['id']}").json()
    assert state["session"]["mode"] == mode and state["balance"]["available"] == 30
    assert state["session"]["company"]["name"] == "Ma Société"


def test_locked_mission_cannot_start_and_unknown_is_404(app):
    p = Player(app)
    r = p.post("/api/missions/m2/start")
    assert r.status_code == 409 and r.json()["error"]["code"] == "INVALID_STATE"
    assert p.post("/api/missions/inconnue/start").status_code == 404
    assert p.post("/api/missions/..%2Fetc/start").status_code == 404
    assert p.http.post("/api/missions/m1/start").status_code == 422  # Idempotency-Key obligatoire
    assert p.http.__class__(app).post("/api/missions/m1/start", headers={"Idempotency-Key": "abcdefgh12"}).status_code == 401


def test_start_freezes_price_and_cap_and_is_replayable(app):
    p = Player(app)
    first = p.start("m1")["attempt"]
    again = p.post("/api/missions/m1/start")
    assert again.status_code == 200 and again.json()["attempt"]["id"] == first["id"]
    assert first["status"] == "ACTIVE" and first["attempt_no"] == 1 and first["brief_version"] == 1
    assert first["unit_price"] == 0 and first["spend_cap"] is None and first["message_counts"] == {}
    assert statuses(p)["m1"] == "ACTIVE"
    assert p.state()["progress"]["next_action"] == {"type": "continue_attempt", "mission_id": "m1", "attempt_id": first["id"], "message": p.state()["progress"]["next_action"]["message"]}
    assert p.post("/api/missions/m1/retry").status_code == 409  # tentative déjà en cours


def test_price_is_frozen_at_attempt_opening(app):
    p = Player(app)
    p.play("m1", 80)
    attempt = p.start("m2")["attempt"]
    assert attempt["unit_price"] == 1
    rules = app.state.rules
    changed = [MissionRule(**{**m.model_dump(), "unit_price": 7}) if m.id == "m2" else m for m in rules.missions]
    app.state.rules = rules.model_copy(update={"missions": changed})
    assert next(a for a in p.state()["attempts"] if a["id"] == attempt["id"])["unit_price"] == 1  # figé
    # la reprise re-fige au tarif courant, l'ancienne tentative est inchangée
    from app.models import MissionAttempt
    with app.state.session_factory() as db:
        a = db.get(MissionAttempt, attempt["id"])
        a.status = "FAILED"
        db.commit()
    assert p.retry("m2")["attempt"]["unit_price"] == 7


def test_ordinary_pass_threshold_and_essential_failure(app):
    p = Player(app)
    _, out = p.play("m1", 59)
    assert not out.passed and out.reasons == ["SCORE_BELOW_THRESHOLD"]
    assert statuses(p)["m1"] == "FAILED" and statuses(p)["m2"] == "LOCKED" and unlocked(p) == {"writer"}
    assert p.state()["progress"]["next_action"]["type"] == "retry_mission"
    assert p.state()["attempts"][0]["failure_reasons"] == ["SCORE_BELOW_THRESHOLD"] and p.state()["attempts"][0]["score"] == 59
    _, out = p.play("m1", 95, essential_failed=True, retry=True)  # échec essentiel : plafonné, jamais réussi
    assert not out.passed and "ESSENTIAL_FAILED" in out.reasons
    _, out = p.play("m1", 60, retry=True)  # 60 pile réussit
    assert out.passed and out.newly_unlocked_roles == [P]
    assert statuses(p)["m1"] == "COMPLETED" and statuses(p)["m2"] == "AVAILABLE" and p.state()["session"]["stage"] == "m2"


def test_published_unlocks_M1_to_M5(app):
    p = Player(app)
    expected = [("m1", {"prospector"}), ("m2", {"researcher", "qa"}), ("m3", {"analyst"}), ("m4", set()), ("m5", {"lead"})]
    have = {"writer"}
    for mission, gain in expected:
        assert unlocked(p) == have
        _, out = p.play(mission, 70)
        assert {r.value for r in out.newly_unlocked_roles} == gain
        have |= gain
        assert unlocked(p) == have
    assert statuses(p)["m6"] == "AVAILABLE"


def test_retry_keeps_history_and_resets_counters(app):
    p = Player(app)
    first_id, _ = p.play("m1", 50)
    with app.state.session_factory() as db:
        from app.models import MissionAttempt

        a = db.get(MissionAttempt, first_id)
        a.message_counts = {"writer": 3}
        a.clarifications_used = 2
        db.commit()
    second = p.retry("m1")["attempt"]
    assert second["attempt_no"] == 2 and second["message_counts"] == {} and second["clarifications_used"] == 0 and second["id"] != first_id
    ids = [a["id"] for a in p.state()["attempts"]]
    assert ids == [first_id, second["id"]]
    old = p.state()["attempts"][0]
    assert old["status"] == "FAILED" and old["score"] == 50 and old["message_counts"] == {"writer": 3}
    # une reprise n'ouvre jamais une livraison figée : l'ancienne tentative reste fermée
    assert p.artifact(first_id).status_code == 409
    assert p.post("/api/missions/m1/retry").status_code == 409  # déjà une tentative ACTIVE
    # une mission jamais tentée ne se « reprend » pas ; une mission tentée ne se « démarre » pas deux fois
    assert p.post("/api/missions/m3/retry").status_code == 409


def test_start_after_attempt_requires_retry(app):
    p = Player(app)
    p.play("m1", 50)
    assert p.post("/api/missions/m1/start").status_code == 409


def test_reputation_is_average_of_best_scores(app):
    p = Player(app)
    p.play("m1", 80)
    p.play("m1", 60, retry=True)  # un meilleur score déjà acquis n'est pas abaissé
    p.play("m2", 70)
    st = p.state()
    assert st["progress"]["reputation"] == 75.0
    assert {m["id"]: m["best_score"] for m in st["missions"] if m["best_score"] is not None} == {"m1": 80, "m2": 70}
    p.play("m3", 60)
    assert p.state()["progress"]["reputation"] == pytest.approx(70.0)


def _reach_m6(p: Player, buy: list[str], scores=(80, 70, 70, 70, 70)):
    for mission, score in zip(["m1", "m2", "m3", "m4", "m5"], scores):
        p.play(mission, score)
        if buy and mission == buy[0].split(":")[0]:
            role = buy.pop(0).split(":")[1]
            r = p.post("/api/agents/purchase", {"role": role})
            assert r.status_code == 201, r.text


def test_final_victory_conditions(app):
    p = Player(app)
    _reach_m6(p, ["m1:prospector"])
    m6 = p.start("m6")
    assert m6["attempt"]["spend_cap"] == 30 and m6["attempt"]["unit_price"] == 3
    attempt_id = m6["attempt"]["id"]
    assert p.http.get(f"/api/attempts/{attempt_id}").status_code == 200
    # échecs successifs, chacun pour sa raison, sans clore la campagne
    from app.models import MissionAttempt
    with app.state.session_factory() as db:
        db.get(MissionAttempt, attempt_id).status = "FAILED"
        db.commit()
    _, out = p.play("m6", 69, roles=(W, P), spend=10, retry=True)
    assert out.reasons == ["SCORE_BELOW_THRESHOLD"]
    _, out = p.play("m6", 90, roles=(W, P), spend=31, retry=True)
    assert out.reasons == ["SPEND_CAP_EXCEEDED"] and not out.victory
    _, out = p.play("m6", 90, roles=(W,), spend=10, retry=True)
    assert out.reasons == ["NOT_ENOUGH_CONTRIBUTING_ROLES"]
    assert statuses(p)["m6"] == "FAILED" and p.state()["progress"]["victory"] is False
    _, out = p.play("m6", 70, roles=(W, P), spend=30, retry=True)
    assert out.passed and out.victory and out.contributing_roles == ["prospector", "writer"]
    st = p.state()
    assert st["progress"]["victory"] and st["progress"]["next_action"]["type"] == "campaign_complete"
    assert st["session"]["state"] == "COMPLETED" and st["session"]["stage"] == "done"
    assert statuses(p)["m6"] == "COMPLETED"


def test_final_requires_evaluated_submission_in_evaluating_state(app):
    p = Player(app)
    detail = p.start("m1")
    from app.models import Evaluation, GameSession, MissionAttempt, Submission
    from app.services import campaign as camp
    with app.state.session_factory() as db:
        game = db.get(GameSession, p.session_id)
        attempt = db.get(MissionAttempt, detail["attempt"]["id"])
        # pas de livraison : impossible de clore
        from app.errors import ApiError
        with pytest.raises(ApiError):
            camp.settle_attempt(db, app.state.rules, game, attempt, Evaluation(submission_id="x", model="m", judge_version="j", score=90, status="DONE"))


@pytest.mark.parametrize("chosen,mode", [("prospector", "beginner"), ("qa", "expert")])
def test_two_different_paths_reach_victory_without_buying_everyone_T12(app, chosen, mode):
    """Deux parcours (prospecteur ; qualité) atteignent M6 et la victoire sans acheter tous les agents."""
    p = Player(app, mode)
    buys = {"prospector": ("m1", 20), "qa": ("m2", 30)}
    for mission in ["m1", "m2", "m3", "m4", "m5"]:
        p.play(mission, 70)
        if buys[chosen][0] == mission:
            assert p.post("/api/agents/purchase", {"role": chosen}).status_code == 201
    _, out = p.play("m6", 75, roles=(W, Role(chosen)), spend=12)
    assert out.victory
    st = p.state()
    owned = {a["role"] for a in st["agents"] if a["owned"]}
    assert owned == {"writer", chosen}
    assert st["balance"]["booked"] == 30 - buys[chosen][1]
    assert st["progress"]["victory"] and st["progress"]["completed_missions"] == ["m1", "m2", "m3", "m4", "m5", "m6"]


def test_rescue_is_accessible_without_money_and_replayable_T11(app):
    p = Player(app)
    with app.state.session_factory() as db:
        db.add(LedgerEntry(session_id=p.session_id, amount=-30, category="test", source_action="test:drain"))
        db.commit()
    assert p.state()["balance"]["available"] == 0
    assert p.mission("rescue")["can_start"] and p.mission("rescue")["unit_price"] == 0
    r = p.post("/api/missions/rescue/start")
    assert r.status_code == 201 and r.json()["attempt"]["unit_price"] == 0 and r.json()["attempt"]["spend_cap"] is None
    first = r.json()["attempt"]["id"]
    from app.models import MissionAttempt
    with app.state.session_factory() as db:
        db.get(MissionAttempt, first).status = "COMPLETED"
        db.commit()
    again = p.post("/api/missions/rescue/start")  # rejouable avec un nouvel id de commande
    assert again.status_code == 201 and again.json()["attempt"]["id"] != first and again.json()["attempt"]["attempt_no"] == 2
    assert p.state()["balance"]["available"] == 0  # aucun achat, aucun débit


def test_next_action_suggests_rescue_when_next_mission_unaffordable(app):
    p = Player(app)
    p.play("m1", 70)
    with app.state.session_factory() as db:
        db.add(LedgerEntry(session_id=p.session_id, amount=-30, category="test", source_action="test:drain"))
        db.commit()
    na = p.state()["progress"]["next_action"]
    assert na["type"] == "start_rescue" and na["mission_id"] == "rescue"
    assert statuses(p)["rescue"] == "AVAILABLE" and statuses(p)["m2"] == "AVAILABLE"


def test_final_event_injected_before_first_action(app):
    p = Player(app)
    _reach_m6(p, [])
    d = p.start("m6")
    assert d["attempt"]["brief_version"] == 2
    assert [c["event_id"] for c in d["brief"]["changes"]] == ["evt_m6_context"]
    assert d["brief"]["content"]["summary"] == "Budget réduit"
    assert d["brief"]["changes"][0]["diff"] == [{"field": "summary", "before": "Budget confortable", "after": "Budget réduit"}]


def test_missing_content_is_tolerated(tmp_path):
    settings = make_settings(tmp_path, content=False)
    with TestClient(create_app(settings)) as client:
        p = Player(client.app)
        d = p.start("m1")
        assert d["content_available"] is False and d["brief"]["content"] is None and d["documents"] == []
        assert p.state()["missions"][0]["status"] == "ACTIVE"


def test_invalid_content_gives_clear_error(tmp_path):
    settings = make_settings(tmp_path)
    (settings.data_dir / "missions" / "m1_beginner_v1.json").write_text("{pas du json", encoding="utf-8")
    with TestClient(create_app(settings)) as client:
        p = Player(client.app)
        r = p.post("/api/missions/m1/start")
        assert r.status_code == 500 and "m1_beginner_v1.json" in r.json()["error"]["message"] and "pas du json" not in r.text


def test_public_brief_hides_private_content(app):
    p = Player(app)
    d = p.start("m1")
    blob = str(d)
    for secret in ("SECRET-CLIENT", "SOLUTION-SECRETE", "PRIVE", "missing_on_purpose", "canal"):
        assert secret not in blob
    assert [x["id"] for x in d["documents"]] == ["doc_a"]
