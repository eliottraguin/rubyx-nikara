"""BE04 : délégations du chef d'équipe (T09), résultat partiel, reprise, réconciliation."""

from __future__ import annotations

import pytest
from sqlalchemy import func, select

from app.models import ActionRun, LLMCall, Message, Reservation
from app.services.actions import ActionEngine
from app.services.actions_reconcile import reconcile

from .actions_support import FakeLLM, World, lead_handler, plan_json, step


def lead_world(settings, plan: str | None = None, handler=None) -> World:
    llm = FakeLLM(handler or lead_handler(plan or plan_json(step("writer", "Rédiger"))))
    w = World(settings, llm)
    w.own("lead", "qa", "researcher")
    return w


@pytest.fixture
def world(settings):
    w = lead_world(settings)
    yield w
    w.close()


def _plan(world: World, att: str, text: str = "Prépare la réponse") -> dict:
    r = world.send(att, "lead", text)
    assert r.status_code == 202, r.text
    return r.json()


def test_lead_instruction_pays_planning_and_waits_for_confirmation(world):
    att = world.attempt("m5", unit_price=2)
    body = _plan(world, att)
    assert body["type"] == "lead_plan" and body["status"] == "AWAITING_CONFIRMATION"
    assert body["debited"] == 2  # la préparation du plan est payée
    assert body["pending_cost"] == 2  # surcoût maximal affiché avant confirmation
    assert [s["kind"] for s in body["steps"]] == ["plan", "delegation"]
    assert world.get_attempt(att).message_counts == {"lead": 1}  # 1 message du chef, aucun du rédacteur
    assert world.llm.calls == 1 and world.balance()["booked"] == 28


def test_confirm_runs_delegations_without_new_planning_call(world):
    att = world.attempt("m5", unit_price=2)
    action = _plan(world, att)
    r = world.confirm(action["id"])
    assert r.status_code == 202, r.text
    body = r.json()
    assert body["status"] == "SUCCEEDED" and body["debited"] == 4 and body["pending_cost"] == 0
    assert [s["status"] for s in body["steps"]] == ["DONE", "DONE"]
    assert world.llm.calls == 2  # 1 planification + 1 délégation : jamais de replanification
    assert world.llm.requests[1].role.value == "writer"
    assert world.get_attempt(att).message_counts == {"lead": 1, "writer": 1}  # la délégation consomme un message du destinataire
    assert world.balance() == {"booked": 26, "reserved": 0, "available": 26}
    assert all(x["status"] == "SETTLED" for x in body["reservations"])


def test_confirm_replay_same_key_no_new_call_or_debit(world):
    att = world.attempt("m5", unit_price=2)
    action = _plan(world, att)
    key = world.key()
    r1, r2 = world.confirm(action["id"], key), world.confirm(action["id"], key)
    assert r1.status_code == r2.status_code == 202 and r1.json()["debited"] == r2.json()["debited"] == 4
    assert world.llm.calls == 2 and world.balance()["booked"] == 26
    r = world.confirm(action["id"])  # nouvelle clé : plus rien à confirmer
    assert (r.status_code, r.json()["error"]["code"]) == (409, "INVALID_STATE")
    assert world.llm.calls == 2


def test_confirm_key_cannot_reuse_another_action_key(world):
    att = world.attempt("m5", unit_price=2)
    key = world.key()
    action = world.send(att, "lead", "Plan", key=key).json()
    r = world.confirm(action["id"], key)  # clé déjà utilisée pour une autre requête
    assert (r.status_code, r.json()["error"]["code"]) == (422, "INVALID_REQUEST")


def test_two_step_plan_with_dependency_passes_previous_result(settings):
    plan = plan_json(step("researcher", "Comparer"), step("writer", "Rédiger", depends_on=0))
    w = lead_world(settings, plan)
    try:
        att = w.attempt("m5", unit_price=2)
        action = _plan(w, att)
        assert action["pending_cost"] == 4
        body = w.confirm(action["id"]).json()
        assert body["status"] == "SUCCEEDED" and body["debited"] == 6
        assert "Résultat de l'étape précédente" in w.llm.requests[-1].context
    finally:
        w.close()


@pytest.mark.parametrize(
    "plan,reason",
    [
        (plan_json(step("lead", "Boucle")), "plan_schema"),  # appel récursif chef -> chef
        (plan_json(step("writer"), step("qa"), step("researcher")), "plan_schema"),  # 3e délégation
        (plan_json(step("analyst", "Analyser")), "role_not_owned"),  # rôle non possédé
        (plan_json(step("writer", depends_on=0)), "plan_schema"),  # dépendance cyclique / sur soi-même
        (plan_json(step("writer", depends_on=1), step("qa")), "plan_schema"),  # dépendance vers l'avant
        (plan_json(step("writer", source_ids=["doc_fantome"])), "unknown_source"),  # pièce hors tentative
        (plan_json(step("client", "Appeler le client")), "plan_schema"),  # appel vers le client
        ("pas du json", "plan_schema"),
    ],
)
def test_T09_invalid_plans_are_refused_without_debit(settings, plan, reason):
    w = lead_world(settings, plan)
    try:
        att = w.attempt("m5", unit_price=2)
        r = w.send(att, "lead", "Plan")
        assert (r.status_code, r.json()["error"]["code"]) == (422, "INVALID_OUTPUT")
        assert w.balance() == {"booked": 30, "reserved": 0, "available": 30}
        assert w.get_attempt(att).message_counts in ({}, None)  # aucun message du chef consommé
        with w.sf() as db:
            action = db.scalar(select(ActionRun))
            assert action.status == "FAILED" and action.error["reason"] == reason
            assert [x.status for x in db.scalars(select(Reservation))] == ["RELEASED"]
    finally:
        w.close()


def test_T09_lead_requires_ownership(settings):
    w = World(settings, FakeLLM(lead_handler(plan_json(step()))))
    try:
        r = w.send(w.attempt("m5"), "lead", "Plan")
        assert (r.status_code, r.json()["error"]["code"]) == (409, "ROLE_LOCKED")
    finally:
        w.close()


def test_T09_confirm_refused_when_recipient_quota_exhausted(world):
    att = world.attempt("m5", unit_price=2, message_counts={"writer": 5})
    action = _plan(world, att)
    r = world.confirm(action["id"])
    assert (r.status_code, r.json()["error"]["code"]) == (409, "MESSAGE_LIMIT")
    assert world.llm.calls == 1 and world.balance()["booked"] == 28
    with world.sf() as db:
        assert db.scalar(select(func.count()).select_from(Reservation).where(Reservation.status == "ACTIVE")) == 0


def test_T09_confirm_refused_when_funds_insufficient(world):
    att = world.attempt("m5", unit_price=2)
    action = _plan(world, att)
    world.grant(-27)  # solde 1 < 2
    r = world.confirm(action["id"])
    assert (r.status_code, r.json()["error"]["code"]) == (409, "INSUFFICIENT_FUNDS")
    assert world.llm.calls == 1 and world.balance()["booked"] == 1


def test_lead_own_quota_is_five_messages(world):
    att = world.attempt("m2", unit_price=1)
    for _ in range(5):
        assert world.send(att, "lead", "Plan").status_code == 202
    assert world.send(att, "lead", "Plan").json()["error"]["code"] == "MESSAGE_LIMIT"


def test_confirm_on_non_plan_action_or_unknown(world):
    att = world.attempt("m2")
    plain = world.send(att, "writer").json()
    r = world.confirm(plain["id"])
    assert (r.status_code, r.json()["error"]["code"]) == (409, "INVALID_STATE")
    assert world.confirm("act_inconnue").status_code == 404


def _two_step_world(settings, fail_from: int):
    """Plan à 2 étapes ; le fournisseur échoue pour les appels de rôle writer n° >= fail_from."""
    plan = plan_json(step("researcher", "Étape 1"), step("writer", "Étape 2"))
    state = {"writer": 0}

    def handler(req, n):
        if (req.expected_schema or {}).get("title") == "LeadPlan":
            return plan
        if req.role.value == "writer":
            state["writer"] += 1
            return "error" if state["writer"] >= fail_from else "ok"
        return "ok"

    return lead_world(settings, handler=handler), state


def test_partial_result_kept_and_resume_does_not_replay_finished_steps(settings):
    w, state = _two_step_world(settings, fail_from=1)
    try:
        att = w.attempt("m5", unit_price=2)
        action = _plan(w, att)
        body = w.confirm(action["id"]).json()
        assert body["status"] == "PARTIAL"
        assert [s["status"] for s in body["steps"]] == ["DONE", "DONE", "FAILED"]
        assert body["debited"] == 4  # plan + étape 1 ; l'étape échouée n'est pas facturée
        assert body["pending_cost"] == 2
        assert {x["status"] for x in body["reservations"]} == {"SETTLED", "RELEASED"}
        assert w.balance() == {"booked": 26, "reserved": 0, "available": 26}  # réservations inutilisées libérées
        assert w.get_attempt(att).message_counts == {"lead": 1, "researcher": 1}
        calls_before = w.llm.calls
        state["writer"] = -100  # le fournisseur est rétabli
        resumed = w.confirm(action["id"])
        assert resumed.status_code == 202 and resumed.json()["status"] == "SUCCEEDED"
        roles_called = [r.role.value for r in w.llm.requests[calls_before:]]
        assert roles_called == ["writer"]  # seule l'étape manquante est rejouée
        assert resumed.json()["debited"] == 6 and w.balance()["booked"] == 24
        assert w.get_attempt(att).message_counts == {"lead": 1, "researcher": 1, "writer": 1}
        with w.sf() as db:  # pas de doublon de message pour l'étape terminée
            assert db.scalar(select(func.count()).select_from(Message).where(Message.role == "researcher", Message.author == "agent")) == 1
    finally:
        w.close()


def test_failed_first_step_skips_dependents_and_releases_everything(settings):
    plan = plan_json(step("writer", "A"), step("qa", "B", depends_on=0))
    w = lead_world(settings, handler=lambda req, n: plan if (req.expected_schema or {}).get("title") == "LeadPlan" else "error")
    try:
        att = w.attempt("m5", unit_price=2)
        action = _plan(w, att)
        r = w.confirm(action["id"])
        assert (r.status_code, r.json()["error"]["code"]) == (503, "LLM_UNAVAILABLE")
        got = w.client.get(f"/api/actions/{action['id']}").json()
        assert got["status"] == "FAILED" and [s["status"] for s in got["steps"]] == ["DONE", "FAILED", "SKIPPED"]
        assert w.balance() == {"booked": 28, "reserved": 0, "available": 28}  # seule la planification est payée
        assert got["pending_cost"] == 4
    finally:
        w.close()


# --- réconciliation ---------------------------------------------------------------------------------


def _engine(w: World) -> ActionEngine:
    return ActionEngine(w.sf, w.app.state.rules, w.llm)


def test_reconcile_interrupted_running_action(world):
    from app.services import actions as svc

    att = world.attempt("m2", unit_price=1)
    action_id, prepared = svc.submit_message(_engine(world), world.sid, att, "crash-key-000001", "writer", "Rédige", [])
    with world.sf() as db:  # simule un processus tué pendant l'appel : RUNNING, réservation active
        a = db.get(ActionRun, action_id)
        a.status = "RUNNING"
        db.commit()
    assert world.balance() == {"booked": 30, "reserved": 1, "available": 29}
    result = reconcile(_engine(world))
    assert result["interrupted"] == 1
    got = world.client.get(f"/api/actions/{action_id}").json()
    assert got["status"] == "FAILED" and got["error"]["reason"] == "interrupted"
    assert world.balance() == {"booked": 30, "reserved": 0, "available": 30}  # rien débité, réservation libérée
    assert world.get_attempt(att).message_counts in ({}, None)
    assert {m["status"] for m in got["messages"]} == {"FAILED"}
    # même clé : même résultat (échec), aucun nouvel appel ; une nouvelle clé réessaie
    r = world.send(att, text="Rédige", key={"Idempotency-Key": "crash-key-000001"})
    assert r.status_code == 503 and world.llm.calls == 0
    assert world.send(att).status_code == 202


def test_reconcile_releases_expired_reservations_only(world):
    from datetime import timedelta

    from app.models import utcnow
    from app.services import ledger

    att = world.attempt("m2")
    action_id = world.send(att).json()["id"]
    with world.sf() as db:
        old = ledger.reserve(db, session_id=world.sid, action_id=action_id, amount=7, role=None, attempt_id=att, quota=0, ttl_seconds=60)
        ledger.reserve(db, session_id=world.sid, action_id=action_id, amount=3, role=None, attempt_id=att, quota=0, ttl_seconds=600)
        old.expires_at = utcnow() - timedelta(seconds=5)
        db.commit()
    assert reconcile(_engine(world))["expired_reservations"] == 1
    assert world.balance()["reserved"] == 3


def test_reconcile_interrupted_confirmation_keeps_plan_resumable(world):
    att = world.attempt("m5", unit_price=2)
    action = _plan(world, att)
    with world.sf() as db:  # confirmation interrompue : action RUNNING, réservation de l'étape active
        from app.services import ledger

        a = db.get(ActionRun, action["id"])
        rsv = ledger.reserve(db, session_id=world.sid, action_id=a.id, amount=2, role="writer", attempt_id=att, quota=1, ttl_seconds=60)
        steps = [dict(s) for s in a.steps]
        steps[1].update(status="RUNNING", reservation_id=rsv.id)
        a.steps, a.status = steps, "RUNNING"
        db.commit()
    reconcile(_engine(world))
    got = world.client.get(f"/api/actions/{action['id']}").json()
    assert got["status"] == "AWAITING_CONFIRMATION" and got["steps"][1]["status"] == "PENDING"
    assert world.balance() == {"booked": 28, "reserved": 0, "available": 28}
    assert world.confirm(got["id"]).json()["status"] == "SUCCEEDED"  # reprise sans replanification


def test_reconcile_runs_at_startup(settings):
    first = World(settings, FakeLLM())
    att = first.attempt("m2")
    from app.services import actions as svc

    action_id, _ = svc.submit_message(_engine(first), first.sid, att, "boot-key-0000001", "writer", "Rédige", [])
    with first.sf() as db:
        db.get(ActionRun, action_id).status = "RUNNING"
        db.commit()
    first.close()
    second = World(settings, FakeLLM())  # un nouveau démarrage de l'application réconcilie la base
    try:
        with second.sf() as db:
            assert db.get(ActionRun, action_id).status == "FAILED"
            assert db.scalar(select(func.count()).select_from(Reservation).where(Reservation.status == "ACTIVE")) == 0
    finally:
        second.close()


def test_every_call_is_logged_with_rules_version(world):
    att = world.attempt("m5", unit_price=2)
    world.confirm(_plan(world, att)["id"])
    with world.sf() as db:
        calls = list(db.scalars(select(LLMCall)))
        assert len(calls) == 2 and all(c.versions["rules"] == "rules_v1" and c.model == "fake" for c in calls)
