"""Moteur d'actions partagé (BE04, exercé par `prospect_message` / `prospect_profile`) : réserver avant l'appel, régler
après une réponse exploitable, quotas par cible (5, jamais 6), erreurs techniques sans débit, idempotence (T02, T03),
concurrence, isolation entre parties.

Ces garanties étaient testées sur l'ancien envoi de messages d'expédition (retiré, API-R3) ; elles le sont maintenant sur
la fiche client et le premier message du rôle `replier`, qui passent par le même moteur (`call_provider`, ledger,
réservations). Fournisseur simulé uniquement, aucun réseau."""

from __future__ import annotations

import asyncio
import json
from concurrent.futures import ThreadPoolExecutor

import pytest
from sqlalchemy import func, select

from app.llm.base import LLMRequest, LLMResponse
from app.models import ActionRun, LLMCall, Reservation, TargetActionUse
from app.models_drafts import ProspectDraft

from .actions_support import World, rules_copy
from .messaging_support import OPPOSITION, RecMock
from .prospects_support import Expedition, annuaire, lead

MESSAGE_COST, PROFILE_COST = 2, 3  # data/rules/rules_v2.json (prospect_actions)


class TimeoutMock(RecMock):
    """Fournisseur qui ne répond jamais dans le délai (délai d'attente de `call_provider`)."""

    async def generate(self, request: LLMRequest) -> LLMResponse:
        self.requests.append(request)
        await asyncio.sleep(30)
        raise AssertionError("le délai d'attente aurait dû interrompre l'appel")


class SlowMock(RecMock):
    def __init__(self, delay: float):
        super().__init__()
        self.delay = delay

    async def generate(self, request: LLMRequest) -> LLMResponse:
        await asyncio.sleep(self.delay)
        return await super().generate(request)


def make_world(settings, llm=None, *, own: bool = True) -> World:
    w = World(settings, llm or RecMock())
    if own:
        w.own("replier")
    return w


@pytest.fixture
def world(settings):
    w = make_world(settings)
    yield w
    w.close()


def prospect(w: World, i: int = 1) -> str:
    """Un prospect du carnet (recopié depuis un enregistrement de source, comme le fait la recherche du bot)."""
    r = Expedition(w, records=[("annuaire", annuaire(i))], leads=[lead(i)]).add([0])
    assert r.status_code == 201, r.text
    return r.json()["added"][0]["id"]


def gen(w: World, pid: str, kind: str = "message", key: dict | None = None, **body):
    return w.client.post(f"/api/prospects/{pid}/{kind}", json=body or None, headers=key or w.key())


def count(w: World, model, *where) -> int:
    with w.sf() as db:
        return db.scalar(select(func.count()).select_from(model).where(*where))


def good_message() -> dict:
    return {
        "canal_cible": "email_generique", "objet": "Bonjour", "mentions": [],
        "corps": "Bonjour,\nVos coordonnées professionnelles proviennent de annuaire, consultée le 2026-10-01.\n" + OPPOSITION + "\nCordialement.",
    }


def test_success_debits_after_response(world):
    pid = prospect(world)
    r = gen(world, pid)
    assert r.status_code == 202, r.text
    body = r.json()
    assert (body["type"], body["status"], body["debited"]) == ("prospect_message", "SUCCEEDED", MESSAGE_COST)
    assert body["balance"] == {"booked": 30 - MESSAGE_COST, "reserved": 0, "available": 30 - MESSAGE_COST}
    assert body["messages_remaining"] == {"replier": 4}
    assert [x["status"] for x in body["reservations"]] == ["SETTLED"]
    assert "attempt_id" not in body and "messages" not in body  # plus de tentative ni de message d'expédition
    assert world.llm.calls == 1
    got = world.client.get(f"/api/actions/{body['id']}").json()  # GET /api/actions/{id}
    assert got["status"] == "SUCCEEDED" and got["debited"] == MESSAGE_COST


def test_T02_fifth_generation_accepted_sixth_refused(world):
    world.grant(100)
    pid = prospect(world)
    for i in range(5):
        r = gen(world, pid)
        assert r.status_code == 202, (i, r.text)
    assert world.balance()["booked"] == 130 - 5 * MESSAGE_COST
    r = gen(world, pid)
    assert (r.status_code, r.json()["error"]["code"]) == (409, "MESSAGE_LIMIT")
    assert world.balance()["booked"] == 130 - 5 * MESSAGE_COST and world.llm.calls == 5
    assert count(world, ActionRun) == 5  # le 6e refus ne laisse aucune action


def test_quota_is_per_target_and_per_action(world):
    world.grant(100)
    a, b = prospect(world, 1), prospect(world, 2)
    for _ in range(5):
        assert gen(world, a).status_code == 202
    assert gen(world, a, "profile").status_code == 202  # une autre action de la même cible a son quota
    assert gen(world, b).status_code == 202  # une autre cible aussi


def test_T02_provider_error_releases_cost_and_quota(settings):
    w = make_world(settings, RecMock(lambda req, n: "error"))
    try:
        pid = prospect(w)
        r = gen(w, pid)
        assert (r.status_code, r.json()["error"]["code"]) == (503, "LLM_UNAVAILABLE")
        assert w.balance() == {"booked": 30, "reserved": 0, "available": 30}
        with w.sf() as db:
            assert [x.status for x in db.scalars(select(Reservation))] == ["RELEASED"]
            action = db.scalar(select(ActionRun))
            assert action.status == "FAILED" and action.error["code"] == "LLM_UNAVAILABLE"
            row = db.scalar(select(TargetActionUse))
            assert (row.used, row.reserved) == (0, 0)
        assert w.llm.calls == 2  # 1 appel + 1 nouvelle tentative technique
        w.llm.override = None  # le quota est intact : 5 générations réussissent ensuite
        w.grant(100)
        for _ in range(5):
            assert gen(w, pid).status_code == 202
        assert gen(w, pid).json()["error"]["code"] == "MESSAGE_LIMIT"
    finally:
        w.close()


def test_exception_from_provider_is_technical_and_does_not_leak(settings):
    w = make_world(settings, RecMock(lambda req, n: "raise"))
    try:
        r = gen(w, prospect(w))
        assert r.status_code == 503
        assert "panne fournisseur" not in r.text
        assert w.balance()["booked"] == 30
    finally:
        w.close()


def test_technical_retry_succeeds_on_second_call(settings):
    w = make_world(settings, RecMock(lambda req, n: "error" if n == 1 else None))
    try:
        r = gen(w, prospect(w))
        assert r.status_code == 202 and r.json()["debited"] == MESSAGE_COST  # une seule facturation malgré 2 appels
        assert w.llm.calls == 2
        assert count(w, LLMCall) == 1
    finally:
        w.close()


def test_timeout_then_one_retry_then_failure_without_debit(data_copy):
    llm = TimeoutMock()
    w = World(rules_copy(data_copy, call_timeout_seconds=1), llm)
    try:
        w.own("replier")
        r = gen(w, prospect(w))
        assert (r.status_code, r.json()["error"]["code"]) == (503, "LLM_UNAVAILABLE")
        assert llm.calls == 2
        assert w.balance()["booked"] == 30 and w.balance()["reserved"] == 0
    finally:
        w.close()


def test_invalid_output_is_repaired_once_and_not_charged(settings):
    w = make_world(settings, RecMock(lambda req, n: "invalid"))
    try:
        r = gen(w, prospect(w))
        assert (r.status_code, r.json()["error"]["code"]) == (422, "INVALID_OUTPUT")
        assert w.llm.calls == 2 and w.balance()["booked"] == 30  # l'appel + UNE réparation, jamais plus
    finally:
        w.close()


def test_usable_answer_is_charged_even_if_unremarkable(settings):
    w = make_world(settings, RecMock(lambda req, n: json.dumps(good_message())))
    try:
        r = gen(w, prospect(w))
        assert r.status_code == 202 and r.json()["debited"] == MESSAGE_COST
    finally:
        w.close()


def test_T03_same_key_twice_one_call_one_debit(world):
    pid = prospect(world)
    key = world.key()
    r1, r2 = gen(world, pid, key=key), gen(world, pid, key=key)
    assert r1.status_code == r2.status_code == 202
    assert r1.json()["id"] == r2.json()["id"]
    assert world.llm.calls == 1
    assert world.balance()["booked"] == 30 - MESSAGE_COST
    assert count(world, ProspectDraft) == 1 and count(world, LLMCall) == 1


def test_T03_failed_action_replay_returns_same_error_without_new_call(settings):
    w = make_world(settings, RecMock(lambda req, n: "error"))
    try:
        pid = prospect(w)
        key = w.key()
        r1 = gen(w, pid, key=key)
        calls = w.llm.calls
        r2 = gen(w, pid, key=key)
        assert r1.status_code == r2.status_code == 503
        assert w.llm.calls == calls
        w.llm.override = None
        assert gen(w, pid, key=key).status_code == 503  # même clé : même résultat ; une nouvelle clé retente
        assert gen(w, pid).status_code == 202
    finally:
        w.close()


def test_T03_concurrent_identical_requests_single_call_single_debit(settings):
    w = make_world(settings, SlowMock(0.4))
    try:
        pid = prospect(w)
        key = w.key()
        with ThreadPoolExecutor(8) as pool:
            results = list(pool.map(lambda _: gen(w, pid, key=key), range(8)))
        assert all(r.status_code == 202 for r in results)
        assert len({r.json()["id"] for r in results}) == 1
        assert w.llm.calls == 1
        assert w.balance()["booked"] == 30 - MESSAGE_COST
        assert count(w, ActionRun) == 1
        assert w.client.get(f"/api/actions/{results[0].json()['id']}").json()["status"] == "SUCCEEDED"
    finally:
        w.close()


def test_concurrent_generations_never_exceed_quota_or_balance(settings):
    w = make_world(settings, SlowMock(0.05))
    try:
        w.grant(100)
        pid = prospect(w)
        with ThreadPoolExecutor(12) as pool:
            results = list(pool.map(lambda _: gen(w, pid), range(12)))
        ok = [r for r in results if r.status_code == 202]
        assert len(ok) == 5  # jamais 6
        assert all(r.json()["error"]["code"] == "MESSAGE_LIMIT" for r in results if r.status_code != 202)
        assert w.balance() == {"booked": 130 - 5 * MESSAGE_COST, "reserved": 0, "available": 130 - 5 * MESSAGE_COST}
        assert w.llm.calls == 5
    finally:
        w.close()


def test_concurrent_spending_never_negative(settings):
    w = make_world(settings, SlowMock(0.05))
    try:
        pid = prospect(w)
        w.grant(-24)  # solde 6 : 2 fiches à 3 seulement
        with ThreadPoolExecutor(6) as pool:
            results = list(pool.map(lambda _: gen(w, pid, "profile"), range(6)))
        assert sum(r.status_code == 202 for r in results) == 2
        assert all(r.json()["error"]["code"] == "INSUFFICIENT_FUNDS" for r in results if r.status_code != 202)
        assert w.balance()["booked"] == 0 and w.balance()["available"] == 0
        with w.sf() as db:  # un refus faute de fonds ne consomme pas de quota
            row = db.scalar(select(TargetActionUse))
            assert (row.used, row.reserved) == (2, 0)
    finally:
        w.close()


def test_same_key_different_request_is_refused(world):
    pid = prospect(world)
    key = world.key()
    assert gen(world, pid, key=key, instruction="A").status_code == 202
    r = gen(world, pid, key=key, instruction="B")
    assert (r.status_code, r.json()["error"]["code"]) == (422, "INVALID_REQUEST")
    assert world.llm.calls == 1


def test_isolation_between_sessions(settings):
    a, b = make_world(settings), make_world(settings)
    try:
        pa, pb = prospect(a), prospect(b)
        key = {"Idempotency-Key": "same-key-0000001"}
        ra, rb = gen(a, pa, key=key), gen(b, pb, key=key)  # même clé, parties différentes : pas de collision
        assert ra.status_code == rb.status_code == 202 and ra.json()["id"] != rb.json()["id"]
        assert a.llm.calls == 1 and b.llm.calls == 1
        # une session ne touche ni ne lit le prospect / l'action d'une autre
        for r in (gen(a, pb), a.client.get(f"/api/actions/{rb.json()['id']}")):
            assert r.status_code == 404 and r.json()["error"]["code"] == "NOT_FOUND"
        assert b.balance()["booked"] == 30 - MESSAGE_COST and a.llm.calls == 1
    finally:
        a.close()
        b.close()


def test_role_not_owned_refused(settings):
    w = make_world(settings, own=False)
    try:
        pid = prospect(w)
        r = gen(w, pid)
        assert (r.status_code, r.json()["error"]["code"]) == (409, "ROLE_LOCKED")
        assert w.llm.calls == 0 and w.balance()["booked"] == 30
    finally:
        w.close()


def test_insufficient_funds_refused_before_any_call(world):
    pid = prospect(world)
    world.grant(-29)  # solde 1
    r = gen(world, pid)
    assert (r.status_code, r.json()["error"]["code"]) == (409, "INSUFFICIENT_FUNDS")
    assert world.llm.calls == 0 and world.balance()["booked"] == 1


def test_model_reward_fields_are_ignored(settings):
    w = make_world(settings, RecMock(lambda req, n: json.dumps({**good_message(), "reward": 9999, "score": 100, "balance": 1000000})))
    try:
        r = gen(w, prospect(w))
        assert r.status_code == 202
        assert w.balance()["booked"] == 30 - MESSAGE_COST  # seule la dépense est comptabilisée
    finally:
        w.close()


def test_mock_provider_default_adapter(client, make_session):
    """Avec l'adaptateur `mock` réel, l'état annonce toujours le badge « simulé »."""
    make_session(client)
    assert client.get("/api/state").json()["llm"]["simulated"] is True
