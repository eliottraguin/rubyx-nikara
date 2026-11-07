"""BE04 : messages, quotas, erreurs techniques, idempotence (T02, T03), clarifications, isolation."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor

import pytest
from sqlalchemy import func, select

from app.models import ActionRun, LLMCall, Message, Reservation

from .actions_support import FakeLLM, World, rules_copy


def make_world(settings, llm=None) -> World:
    return World(settings, llm or FakeLLM())


@pytest.fixture
def world(settings):
    w = make_world(settings)
    yield w
    w.close()


def _count(world: World, model, *where) -> int:
    with world.sf() as db:
        return db.scalar(select(func.count()).select_from(model).where(*where))


def test_message_success_debits_after_response(world):
    att = world.attempt("m2", unit_price=1)
    r = world.send(att, "writer", "Rédige")
    assert r.status_code == 202, r.text
    body = r.json()
    assert (body["type"], body["status"], body["debited"]) == ("message", "SUCCEEDED", 1)
    assert body["balance"] == {"booked": 29, "reserved": 0, "available": 29}
    assert body["messages_remaining"] == {"writer": 4}
    assert [m["author"] for m in body["messages"]] == ["player", "agent"]
    assert {m["status"] for m in body["messages"]} == {"SENT"}
    assert [x["status"] for x in body["reservations"]] == ["SETTLED"]
    assert world.llm.calls == 1
    assert world.get_attempt(att).message_counts == {"writer": 1}
    got = world.client.get(f"/api/actions/{body['id']}").json()  # GET /api/actions/{id}
    assert got["status"] == "SUCCEEDED" and got["debited"] == 1


def test_free_mission_costs_nothing_but_uses_quota(world):
    att = world.attempt("m1", unit_price=0)
    r = world.send(att)
    assert r.json()["debited"] == 0 and world.balance()["booked"] == 30
    assert world.get_attempt(att).message_counts == {"writer": 1}


def test_T02_fifth_message_accepted_sixth_refused(world):
    att = world.attempt("m2", unit_price=1)
    for i in range(5):
        r = world.send(att, "writer", f"Version {i}")
        assert r.status_code == 202, (i, r.text)
    assert world.balance()["booked"] == 25
    r = world.send(att, "writer", "Sixième")
    assert (r.status_code, r.json()["error"]["code"]) == (409, "MESSAGE_LIMIT")
    assert world.balance()["booked"] == 25 and world.llm.calls == 5
    assert world.get_attempt(att).message_counts == {"writer": 5}
    assert _count(world, ActionRun) == 5  # le 6e refus ne laisse aucune action


def test_quota_is_per_role_and_per_attempt(world):
    world.own("qa")
    a1, a2 = world.attempt("m2", attempt_no=1), world.attempt("m2", attempt_no=2)
    for _ in range(5):
        assert world.send(a1, "writer").status_code == 202
    assert world.send(a1, "qa").status_code == 202  # un autre rôle a son propre quota
    assert world.send(a2, "writer").status_code == 202  # une autre tentative aussi


def test_T02_provider_error_releases_cost_and_quota(settings):
    w = make_world(settings, FakeLLM(lambda req, n: "error"))
    try:
        att = w.attempt("m2")
        r = w.send(att)
        assert (r.status_code, r.json()["error"]["code"]) == (503, "LLM_UNAVAILABLE")
        assert w.balance() == {"booked": 30, "reserved": 0, "available": 30}
        assert w.get_attempt(att).message_counts in ({}, None)
        with w.sf() as db:
            assert [r.status for r in db.scalars(select(Reservation))] == ["RELEASED"]
            action = db.scalar(select(ActionRun))
            assert action.status == "FAILED" and action.error["code"] == "LLM_UNAVAILABLE"
            assert [m.status for m in db.scalars(select(Message))] == ["FAILED"]
        assert w.llm.calls == 2  # 1 appel + 1 nouvelle tentative technique
        # le quota est intact : 5 messages réussissent ensuite
        w.llm.handler = lambda req, n: "ok"
        for _ in range(5):
            assert w.send(att).status_code == 202
        assert w.send(att).json()["error"]["code"] == "MESSAGE_LIMIT"
    finally:
        w.close()


def test_exception_from_provider_is_technical_and_does_not_leak(settings):
    w = make_world(settings, FakeLLM(lambda req, n: "raise"))
    try:
        r = w.send(w.attempt("m2"))
        assert r.status_code == 503
        assert "panne fournisseur" not in r.text
        assert w.balance()["booked"] == 30
    finally:
        w.close()


def test_technical_retry_succeeds_on_second_call(settings):
    w = make_world(settings, FakeLLM(lambda req, n: "error" if n == 1 else "ok"))
    try:
        att = w.attempt("m2")
        r = w.send(att)
        assert r.status_code == 202 and r.json()["debited"] == 1  # une seule facturation malgré 2 appels
        assert w.llm.calls == 2
        assert w.get_attempt(att).model_calls == 2  # les deux appels comptent pour le plafond
        assert w.get_attempt(att).message_counts == {"writer": 1}
    finally:
        w.close()


def test_timeout_then_one_retry_then_failure_without_debit(tmp_path, data_copy):
    llm = FakeLLM(lambda req, n: "timeout")
    w = World(rules_copy(data_copy, call_timeout_seconds=1), llm)
    try:
        att = w.attempt("m2")
        r = w.send(att)
        assert (r.status_code, r.json()["error"]["code"]) == (503, "LLM_UNAVAILABLE")
        assert llm.calls == 2
        assert w.balance()["booked"] == 30
    finally:
        w.close()


def test_invalid_output_is_not_retried_and_not_charged(settings):
    w = make_world(settings, FakeLLM(lambda req, n: "invalid"))
    try:
        r = w.send(w.attempt("m2"))
        assert (r.status_code, r.json()["error"]["code"]) == (422, "INVALID_OUTPUT")
        assert w.llm.calls == 1 and w.balance()["booked"] == 30
    finally:
        w.close()


def test_irrelevant_but_usable_answer_is_still_charged(settings):
    w = make_world(settings, FakeLLM(lambda req, n: "Hors sujet total."))
    try:
        r = w.send(w.attempt("m2"))
        assert r.status_code == 202 and r.json()["debited"] == 1
    finally:
        w.close()


def test_T03_same_key_twice_one_call_one_debit(world):
    att = world.attempt("m2")
    key = world.key()
    r1, r2 = world.send(att, key=key), world.send(att, key=key)
    assert r1.status_code == r2.status_code == 202
    assert r1.json()["id"] == r2.json()["id"]
    assert world.llm.calls == 1
    assert world.balance()["booked"] == 29
    assert world.get_attempt(att).message_counts == {"writer": 1}
    assert _count(world, Message) == 2 and _count(world, LLMCall) == 1


def test_T03_failed_action_replay_returns_same_error_without_new_call(settings):
    w = make_world(settings, FakeLLM(lambda req, n: "error"))
    try:
        att = w.attempt("m2")
        key = w.key()
        r1 = w.send(att, key=key)
        calls = w.llm.calls
        r2 = w.send(att, key=key)
        assert r1.status_code == r2.status_code == 503
        assert w.llm.calls == calls
        w.llm.handler = lambda req, n: "ok"
        assert w.send(att, key=key).status_code == 503  # même clé : même résultat ; une nouvelle clé retente
        assert w.send(att).status_code == 202
    finally:
        w.close()


def test_T03_concurrent_identical_requests_single_call_single_debit(settings):
    w = make_world(settings, FakeLLM(delay=0.4))
    try:
        att = w.attempt("m2")
        key = w.key()
        with ThreadPoolExecutor(8) as pool:
            results = list(pool.map(lambda _: w.send(att, key=key), range(8)))
        assert all(r.status_code == 202 for r in results)
        assert len({r.json()["id"] for r in results}) == 1
        assert w.llm.calls == 1
        assert w.balance()["booked"] == 29
        assert w.get_attempt(att).message_counts == {"writer": 1}
        assert _count(w, ActionRun) == 1
        # le doublon arrivé pendant l'exécution voit l'action en cours, jamais un second résultat
        assert {r.json()["status"] for r in results} <= {"RUNNING", "RESERVED", "SUCCEEDED"}
        assert w.client.get(f"/api/actions/{results[0].json()['id']}").json()["status"] == "SUCCEEDED"
    finally:
        w.close()


def test_concurrent_messages_never_exceed_quota_or_balance(settings):
    w = make_world(settings, FakeLLM(delay=0.05))
    try:
        att = w.attempt("m2")
        with ThreadPoolExecutor(12) as pool:
            results = list(pool.map(lambda i: w.send(att, text=f"v{i}"), range(12)))
        ok = [r for r in results if r.status_code == 202]
        assert len(ok) == 5  # jamais 6
        assert all(r.json()["error"]["code"] == "MESSAGE_LIMIT" for r in results if r.status_code != 202)
        assert w.balance() == {"booked": 25, "reserved": 0, "available": 25}
        assert w.llm.calls == 5
    finally:
        w.close()


def test_concurrent_spending_never_negative(settings):
    w = make_world(settings, FakeLLM(delay=0.05))
    try:
        att = w.attempt("m6", unit_price=3)
        w.own("qa", "analyst")
        w.grant(-24)  # solde 6 : 2 appels à 3 seulement
        with ThreadPoolExecutor(6) as pool:
            results = list(pool.map(lambda i: w.send(att, "writer" if i % 2 else "qa", f"v{i}"), range(6)))
        assert sum(r.status_code == 202 for r in results) == 2
        assert all(r.json()["error"]["code"] == "INSUFFICIENT_FUNDS" for r in results if r.status_code != 202)
        assert w.balance()["booked"] == 0 and w.balance()["available"] == 0
    finally:
        w.close()


def test_same_key_different_request_is_refused(world):
    att = world.attempt("m2")
    key = world.key()
    assert world.send(att, text="A", key=key).status_code == 202
    r = world.send(att, text="B", key=key)
    assert (r.status_code, r.json()["error"]["code"]) == (422, "INVALID_REQUEST")
    assert world.llm.calls == 1


def test_isolation_between_sessions(settings):
    a, b = World(settings, FakeLLM()), World(settings, FakeLLM())
    try:
        att_a, att_b = a.attempt("m2"), b.attempt("m2")
        key = {"Idempotency-Key": "same-key-0000001"}
        ra, rb = a.send(att_a, key=key), b.send(att_b, key=key)  # même clé, parties différentes : pas de collision
        assert ra.status_code == rb.status_code == 202 and ra.json()["id"] != rb.json()["id"]
        assert a.llm.calls == 1 and b.llm.calls == 1
        # une session ne touche ni ne lit la tentative / l'action d'une autre
        for r in (a.send(att_b), a.clarify(att_b), a.client.get(f"/api/actions/{rb.json()['id']}"), a.confirm(rb.json()["id"])):
            assert r.status_code == 404 and r.json()["error"]["code"] == "NOT_FOUND"
        assert b.balance()["booked"] == 29 and a.llm.calls == 1
    finally:
        a.close()
        b.close()


def test_role_not_owned_refused(world):
    att = world.attempt("m2")
    r = world.send(att, "qa")
    assert (r.status_code, r.json()["error"]["code"]) == (409, "ROLE_LOCKED")
    assert world.llm.calls == 0 and world.balance()["booked"] == 30


def test_insufficient_funds_refused_before_any_call(world):
    att = world.attempt("m6", unit_price=3)
    world.grant(-29)  # solde 1
    r = world.send(att)
    assert (r.status_code, r.json()["error"]["code"]) == (409, "INSUFFICIENT_FUNDS")
    assert world.llm.calls == 0 and world.balance()["booked"] == 1


def test_spend_cap_of_attempt(world):
    att = world.attempt("m2", spend_cap=2)
    assert world.send(att).status_code == 202 and world.send(att).status_code == 202
    r = world.send(att)
    assert (r.status_code, r.json()["error"]["code"]) == (409, "INSUFFICIENT_FUNDS")


def test_prompt_limits_and_inactive_attempt(world):
    att = world.attempt("m2")
    assert world.send(att, text="x" * 4001).status_code == 422
    assert world.send(att, text="   ").status_code == 422
    done = world.attempt("m1", status="COMPLETED", attempt_no=2)
    r = world.send(done)
    assert (r.status_code, r.json()["error"]["code"]) == (409, "INVALID_STATE")
    assert world.send("att_inconnue").status_code == 404


def test_model_call_cap_reserves_two_calls_for_evaluation(world):
    att = world.attempt("m2", model_calls=33)  # 36 − 2 réservés à l'évaluation = 34 appels d'action
    assert world.send(att).status_code == 202  # le 34e appel passe
    r = world.send(att)
    assert (r.status_code, r.json()["error"]["code"]) == (409, "MESSAGE_LIMIT")
    assert world.llm.calls == 1 and world.get_attempt(att).model_calls == 34


def test_linked_artifact_must_belong_to_attempt(world):
    att = world.attempt("m2")
    r = world.send(att, linked_artifact_ids=["art_other"])
    assert r.status_code == 422


def test_clarifications_two_free_outside_agent_quotas(world):
    att = world.attempt("m2")
    r1, r2 = world.clarify(att), world.clarify(att, "Quel budget ?")
    assert r1.status_code == r2.status_code == 202
    assert r1.json()["answer"] and r1.json()["debited"] == 0
    assert world.balance()["booked"] == 30  # gratuit
    r3 = world.clarify(att, "Et le délai ?")
    assert (r3.status_code, r3.json()["error"]["code"]) == (409, "MESSAGE_LIMIT")
    assert world.get_attempt(att).clarifications_used == 2
    for _ in range(5):  # n'entame pas les quotas des agents
        assert world.send(att).status_code == 202


def test_clarification_idempotent_and_released_on_error(settings):
    w = make_world(settings, FakeLLM(lambda req, n: "error" if n <= 2 else "ok"))
    try:
        att = w.attempt("m2")
        assert w.clarify(att).status_code == 503
        assert w.get_attempt(att).clarifications_used == 0  # clarification non consommée
        key = w.key()
        assert w.clarify(att, key=key).status_code == 202
        calls = w.llm.calls
        assert w.clarify(att, key=key).status_code == 202 and w.llm.calls == calls
        assert w.get_attempt(att).clarifications_used == 1
    finally:
        w.close()


def test_model_reward_fields_are_ignored(settings):
    w = make_world(settings, FakeLLM(lambda req, n: '{"reward": 9999, "score": 100, "balance": 1000000}'))
    try:
        r = w.send(w.attempt("m2"))
        assert r.status_code == 202
        assert w.balance()["booked"] == 29  # seule la dépense est comptabilisée
    finally:
        w.close()


def test_mock_provider_default_adapter(client, make_session):
    """Avec l'adaptateur `mock` réel, une action aboutit (badge simulé conservé)."""
    state = make_session(client)
    from app.config import Settings  # noqa: F401
    from app.db import make_engine, make_session_factory
    from app.models import MissionAttempt

    engine = make_engine(client.app.state.settings)
    with make_session_factory(engine)() as db:
        att = MissionAttempt(session_id=state["session"]["id"], mission_id="m1", unit_price=0)
        db.add(att)
        db.commit()
        att_id = att.id
    engine.dispose()
    r = client.post(f"/api/attempts/{att_id}/messages", json={"role": "writer", "text": "Bonjour"}, headers={"Idempotency-Key": "mock-key-0001"})
    assert r.status_code == 202 and "simulée" in r.json()["messages"][1]["text"]
    assert client.get("/api/state").json()["llm"]["simulated"] is True
