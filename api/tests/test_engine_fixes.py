"""Corrections moteur issues des revues Standards/Spec : prompt du chef, crédit de correction M5 (message gratuit),
réponses d'agents devenues versions avec contribution (M6), idempotence de la création de partie et de la reprise,
actions en cours dans l'état, routes de livrables documentées. Fournisseur simulé, aucun réseau."""

from __future__ import annotations

import threading
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.config import REPO_DIR
from app.main import create_app
from app.models import ArtifactVersion, GameSession, MissionAttempt
from app.services import campaign as camp
from app.services import events as ev

from ._campaign_support import Player, make_settings
from .actions_support import FakeLLM, World, lead_handler, plan_json, step

CREDIT = {"writer": 1, "credit:writer": 1, "credit_granted:writer": 1}


def parallel(n: int, fn):
    barrier = threading.Barrier(n)

    def run(i):
        barrier.wait()
        return fn(i)

    with ThreadPoolExecutor(n) as pool:
        return list(pool.map(run, range(n)))


@pytest.fixture
def world(settings):
    w = World(settings, FakeLLM())
    yield w
    w.close()


# ------------------------------------------------------------------ (1) prompt du chef


def test_lead_planning_prompt_lists_the_owned_roles(settings):
    w = World(settings, FakeLLM(lead_handler(plan_json(step("writer", "Rédiger")))))
    try:
        w.own("lead", "qa", "researcher")
        att = w.attempt("m5", unit_price=2)
        assert w.send(att, "lead", "Prépare la réponse").status_code == 202
        context = w.llm.requests[0].context
        assert "Rôles possédés : qa, researcher, writer." in context
        assert "{" not in context.split("Rôles possédés")[1].split("Pièces connues")[0]  # plus de gabarit littéral
    finally:
        w.close()


# ------------------------------------------------------------------ (2) crédit de correction M5


def test_correction_credit_makes_one_message_free_then_normal_price(world):
    att = world.attempt("m5", unit_price=2, message_counts=dict(CREDIT))
    first = world.send(att).json()
    assert first["steps"][0]["free_credit"] is True and first["steps"][0]["cost"] == 0
    assert first["debited"] == 0 and world.balance() == {"booked": 30, "reserved": 0, "available": 30}
    counts = world.get_attempt(att).message_counts
    assert counts["writer"] == 2 and counts["credit:writer"] == 0  # compte dans le quota de 5, crédit consommé
    second = world.send(att, text="Autre version").json()
    assert second["steps"][0]["free_credit"] is False and second["debited"] == 2
    assert world.balance()["booked"] == 28


def test_correction_credit_is_not_consumed_by_a_failed_call(settings):
    state = {"fail": True}
    w = World(settings, FakeLLM(lambda req, n: "error" if state["fail"] else "ok"))
    try:
        att = w.attempt("m5", unit_price=2, message_counts=dict(CREDIT))
        r = w.send(att)
        assert r.status_code >= 500 and w.balance()["booked"] == 30
        assert w.get_attempt(att).message_counts == CREDIT  # ni message ni crédit consommés
        state["fail"] = False
        ok = w.send(att).json()
        assert ok["steps"][0]["free_credit"] is True and ok["debited"] == 0
    finally:
        w.close()


def test_correction_credit_cannot_be_used_twice_under_concurrency(settings):
    w = World(settings, FakeLLM(delay=0.3))  # les appels se chevauchent : le crédit est détenu pendant l'appel
    try:
        att = w.attempt("m5", unit_price=2, message_counts=dict(CREDIT))
        res = parallel(4, lambda i: w.send(att, text=f"Version {i}"))
        assert all(r.status_code == 202 for r in res), [r.text for r in res]
        free = [r for r in res if r.json()["steps"][0]["free_credit"]]
        assert len(free) == 1  # un seul message gratuit, jamais deux
        assert w.balance()["booked"] == 30 - 2 * 3 and w.balance()["reserved"] == 0
        counts = w.get_attempt(att).message_counts
        assert counts["writer"] == 5 and counts["credit:writer"] == 0  # 1 déjà envoyé + 4 : jamais 6
    finally:
        w.close()


def test_correction_credit_applies_once_to_a_delegation(settings):
    w = World(settings, FakeLLM(lead_handler(plan_json(step("writer", "Rédiger"), step("writer", "Relire")))))
    try:
        w.own("lead")
        att = w.attempt("m5", unit_price=2, message_counts=dict(CREDIT))
        plan = w.send(att, "lead", "Prépare la réponse").json()
        assert plan["debited"] == 2 and plan["status"] == "AWAITING_CONFIRMATION"
        body = w.confirm(plan["id"]).json()
        deleg = [s for s in body["steps"] if s["kind"] == "delegation"]
        assert [s["free_credit"] for s in deleg] == [True, False]  # une seule délégation gratuite pour ce rôle
        assert [s["cost"] for s in deleg] == [0, 2] and body["debited"] == 2 + 0 + 2
        assert w.balance()["booked"] == 30 - 4
        assert w.get_attempt(att).message_counts["credit:writer"] == 0
    finally:
        w.close()


def test_free_credit_roles_are_exposed_then_cleared(world):
    att = world.attempt("m5", unit_price=2, message_counts=dict(CREDIT))
    state = world.client.get("/api/state").json()
    assert next(a for a in state["attempts"] if a["id"] == att)["free_credit_roles"] == ["writer"]
    world.send(att)
    state = world.client.get("/api/state").json()
    assert next(a for a in state["attempts"] if a["id"] == att)["free_credit_roles"] == []


# ------------------------------------------------------------------ (3) réponses d'agents -> versions avec contribution (M6)


def test_agent_replies_become_versions_with_server_side_contributions(world):
    world.own("qa")
    att = world.attempt("m6", unit_price=3, spend_cap=30)
    a = world.send(att, "writer", "Rédige").json()
    b = world.send(att, "qa", "Relis").json()
    va, vb = a["steps"][0]["artifact_version_id"], b["steps"][0]["artifact_version_id"]
    assert va and vb and va != vb
    with world.sf() as db:
        rows = {v.id: v for v in db.scalars(select(ArtifactVersion).where(ArtifactVersion.attempt_id == att))}
        assert rows[va].author == "agent" and rows[va].contributions == [{"role": "writer", "action_id": a["id"]}]
        assert rows[vb].contributions == [{"role": "qa", "action_id": b["id"]}]
        assert rows[va].content == next(m["text"] for m in a["messages"] if m["author"] == "agent")


def test_m6_is_winnable_through_the_real_api_with_two_contributing_roles(world):
    world.own("qa")
    att = world.attempt("m6", unit_price=3, spend_cap=30)
    va = world.send(att, "writer", "Rédige").json()["steps"][0]["artifact_version_id"]
    vb = world.send(att, "qa", "Relis").json()["steps"][0]["artifact_version_id"]
    one = world.client.post(f"/api/attempts/{att}/artifacts", json={"kind": "assembly", "part_ids": [va]}, headers=world.key())
    both = world.client.post(f"/api/attempts/{att}/artifacts", json={"kind": "assembly", "part_ids": [va, vb]}, headers=world.key())
    assert one.status_code == 201 and both.status_code == 201
    assert sorted(c["role"] for c in both.json()["contributions"]) == ["qa", "writer"]
    rules = world.app.state.rules
    with world.sf() as db:
        attempt = db.get(MissionAttempt, att)
        ok, reasons = camp.judge(db, rules, attempt, 90, False, 6, both.json()["id"])
        assert ok and reasons == []
        ok1, reasons1 = camp.judge(db, rules, attempt, 90, False, 6, one.json()["id"])
        assert not ok1 and "NOT_ENOUGH_CONTRIBUTING_ROLES" in reasons1


def test_the_browser_cannot_forge_contributions(world):
    att = world.attempt("m6", unit_price=3, spend_cap=30)
    r = world.client.post(
        f"/api/attempts/{att}/artifacts",
        json={"content": "Faux", "contributions": [{"role": "qa"}], "author": "agent"}, headers=world.key(),
    )
    assert r.status_code == 422
    r = world.client.post(f"/api/attempts/{att}/artifacts", json={"content": "Mon texte"}, headers=world.key())
    assert r.status_code == 201 and r.json()["author"] == "player" and r.json()["contributions"] == []


def test_agent_replies_do_not_trigger_the_first_proposal_event(world):
    att = world.attempt("m5", unit_price=2)
    world.send(att, "writer", "Propose")
    assert world.get_attempt(att).brief_version == 1  # une réponse d'agent n'est pas « la première proposition »
    r = world.client.post(f"/api/attempts/{att}/artifacts", json={"content": "Ma proposition"}, headers=world.key())
    assert r.status_code == 201 and world.get_attempt(att).brief_version == 2


# ------------------------------------------------------------------ (4) idempotence : création de partie et reprise


def new_session(c: TestClient, key: str, name: str = "Atelier", mode: str = "beginner"):
    return c.post("/api/sessions", json={"company_name": name, "mode": mode}, headers={"Idempotency-Key": key})


def games(app) -> int:
    with app.state.session_factory() as db:
        return db.scalar(select(func.count()).select_from(GameSession))


def test_session_creation_replay_does_not_create_a_second_game(client):
    first = new_session(client, "create-key-0001")
    assert first.status_code == 201
    again = new_session(client, "create-key-0001")
    assert again.status_code == 200 and again.json()["session"]["id"] == first.json()["session"]["id"]
    assert "set-cookie" not in again.headers  # le cookie courant est déjà le bon
    assert games(client.app) == 1 and again.json()["balance"]["booked"] == 30  # capital initial versé une seule fois


def test_session_creation_replay_after_a_lost_response_issues_a_working_cookie(client):
    first = new_session(client, "create-key-0002")
    sid = first.json()["session"]["id"]
    fresh = TestClient(client.app)  # le navigateur n'a jamais reçu le cookie
    again = new_session(fresh, "create-key-0002")
    assert again.status_code == 200 and again.json()["session"]["id"] == sid
    assert fresh.get("/api/state").json()["session"]["id"] == sid
    assert games(client.app) == 1


def test_session_creation_key_reused_for_another_request_is_refused(client):
    assert new_session(client, "create-key-0003", "Alpha").status_code == 201
    other = new_session(TestClient(client.app), "create-key-0003", "Beta")
    assert other.status_code == 422 and other.json()["error"]["code"] == "INVALID_REQUEST"
    assert games(client.app) == 1


def test_concurrent_session_creations_with_one_key_make_one_game(client):
    res = parallel(6, lambda i: new_session(TestClient(client.app), "create-key-race"))
    assert {r.status_code for r in res} <= {200, 201}, [r.text for r in res]
    assert len({r.json()["session"]["id"] for r in res}) == 1 and games(client.app) == 1


def test_session_creation_key_is_never_stored_in_clear(client):
    new_session(client, "create-key-secret-0001")
    with client.app.state.session_factory() as db:
        stored = db.scalar(select(GameSession.creation_key_hash))
    assert stored and "create-key-secret-0001" not in stored


@pytest.fixture
def app(tmp_path):
    application = create_app(make_settings(tmp_path))
    with TestClient(application):
        yield application


def test_retry_replay_returns_the_same_attempt(app):
    p = Player(app)
    p.play("m1", 10)  # échec : la reprise est ouverte
    key = {"Idempotency-Key": "retry-key-0001"}
    first = p.http.post("/api/missions/m1/retry", headers=key)
    assert first.status_code == 201
    again = p.http.post("/api/missions/m1/retry", headers=key)
    assert again.status_code == 200 and again.json()["attempt"]["id"] == first.json()["attempt"]["id"]
    assert [a["attempt_no"] for a in p.state()["attempts"] if a["mission_id"] == "m1"] == [1, 2]
    # un autre envoi (autre clé) alors qu'une tentative est ouverte reste refusé
    other = p.http.post("/api/missions/m1/retry", headers={"Idempotency-Key": "retry-key-0002"})
    assert other.status_code == 409 and other.json()["error"]["code"] == "INVALID_STATE"


def test_retry_replay_still_works_after_the_new_attempt_is_submitted(app):
    p = Player(app)
    p.play("m1", 10)
    key = {"Idempotency-Key": "retry-key-0003"}
    first = p.http.post("/api/missions/m1/retry", headers=key).json()["attempt"]["id"]
    v = p.artifact(first).json()["id"]
    assert p.submit(first, v).status_code == 201
    again = p.http.post("/api/missions/m1/retry", headers=key)
    assert again.status_code == 200 and again.json()["attempt"]["id"] == first  # plus de 409 « déjà en cours »


def test_start_replay_and_key_reuse_across_missions(app):
    p = Player(app)
    key = {"Idempotency-Key": "start-key-0001"}
    first = p.http.post("/api/missions/m1/start", headers=key)
    assert first.status_code == 201
    v = p.artifact(first.json()["attempt"]["id"]).json()["id"]
    assert p.submit(first.json()["attempt"]["id"], v).status_code == 201
    again = p.http.post("/api/missions/m1/start", headers=key)
    assert again.status_code == 200 and again.json()["attempt"]["id"] == first.json()["attempt"]["id"]
    wrong = p.http.post("/api/missions/m2/start", headers=key)
    assert wrong.status_code == 422 and wrong.json()["error"]["code"] == "INVALID_REQUEST"


# ------------------------------------------------------------------ (5) actions en cours


def test_active_actions_lists_unfinished_actions_of_the_session_only(settings):
    w = World(settings, FakeLLM(lead_handler(plan_json(step("writer", "Rédiger")))))
    try:
        w.own("lead")
        att = w.attempt("m5", unit_price=2)
        assert w.client.get("/api/state").json()["active_actions"] == []
        plan = w.send(att, "lead", "Prépare").json()
        active = w.client.get("/api/state").json()["active_actions"]
        assert [(a["id"], a["type"], a["status"], a["attempt_id"]) for a in active] == [(plan["id"], "lead_plan", "AWAITING_CONFIRMATION", att)]
        other = TestClient(w.app)  # une autre partie ne voit rien
        other.post("/api/sessions", json={"company_name": "Autre", "mode": "beginner"}, headers={"Idempotency-Key": "create-other-0001"})
        assert other.get("/api/state").json()["active_actions"] == []
        assert w.confirm(plan["id"]).json()["status"] == "SUCCEEDED"
        assert w.client.get("/api/state").json()["active_actions"] == []
    finally:
        w.close()


def test_active_actions_shows_a_running_message(settings):
    w = World(settings, FakeLLM(delay=0.6))
    try:
        att = w.attempt("m2", unit_price=1)
        seen: list = []

        def watch():
            for _ in range(20):
                active = w.client.get("/api/state").json()["active_actions"]
                if active:
                    seen.extend(active)
                    return
                threading.Event().wait(0.05)

        t = threading.Thread(target=watch)
        t.start()
        assert w.send(att).status_code == 202
        t.join()
        assert seen and seen[0]["status"] in {"RESERVED", "RUNNING"} and seen[0]["type"] == "message"
        assert w.client.get("/api/state").json()["active_actions"] == []
    finally:
        w.close()


# ------------------------------------------------------------------ (6) contrat documenté


def test_contract_documents_the_attempt_and_share_routes():
    text = (REPO_DIR / "docs" / "CONTRACTS.md").read_text(encoding="utf-8")
    assert "`GET /api/attempts/{id}`" in text and "`POST /api/attempts/{id}/shares`" in text


def test_credit_helpers_in_flight_guard(world):
    att = world.attempt("m5", unit_price=2, message_counts=dict(CREDIT))
    with world.sf() as db:
        attempt = db.get(MissionAttempt, att)
        assert ev.free_message_applies(db, attempt, "writer") and not ev.free_message_applies(db, attempt, "qa")
