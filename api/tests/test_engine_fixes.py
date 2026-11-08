"""Corrections moteur issues des revues Standards/Spec : idempotence de la création de partie, actions en cours dans
l'état. Les versions de livrable, l'ouverture de mission et les routes de tentative sont retirées (API-R3).
Fournisseur simulé, aucun réseau."""

from __future__ import annotations

import threading
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.models import GameSession

from .actions_support import FakeLLM, World
from .test_actions_engine import SlowMock, gen, prospect


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


# ------------------------------------------------------------------ actions en cours


def _watch_active(w: World, seen: list) -> threading.Thread:
    def watch():
        for _ in range(40):
            active = w.client.get("/api/state").json()["active_actions"]
            if active:
                seen.extend(active)
                return
            threading.Event().wait(0.05)

    t = threading.Thread(target=watch)
    t.start()
    return t


def test_active_actions_lists_unfinished_actions_of_the_session_only(settings):
    w = World(settings, SlowMock(0.6))
    try:
        w.own("replier")
        pid = prospect(w)
        assert w.client.get("/api/state").json()["active_actions"] == []
        seen: list = []
        t = _watch_active(w, seen)
        other = TestClient(w.app)  # une autre partie ne voit rien
        other.post("/api/sessions", json={"company_name": "Autre", "mode": "beginner"}, headers={"Idempotency-Key": "create-other-0001"})
        assert gen(w, pid).status_code == 202
        t.join()
        assert seen and seen[0]["type"] == "prospect_message" and "attempt_id" not in seen[0]
        assert seen[0]["status"] in {"RESERVED", "RUNNING"}
        assert other.get("/api/state").json()["active_actions"] == []
        assert w.client.get("/api/state").json()["active_actions"] == []
    finally:
        w.close()
