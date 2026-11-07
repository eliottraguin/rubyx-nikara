"""BE03 : ledger, réservations, paiement (T04, T05), différentiel de reprise."""

from __future__ import annotations

from datetime import timedelta

import pytest
from sqlalchemy import func, select

from app.errors import ApiError
from app.models import LedgerEntry, Reservation, new_id, utcnow
from app.services import ledger
from app.services.ledger_payments import award_submission, differential, paid_for_mission, target_payment

from .actions_support import World


@pytest.fixture
def world(settings):
    w = World(settings)
    yield w
    w.close()


@pytest.mark.parametrize("max_reward,score,expected", [(20, 0, 0), (20, 65, 13), (20, 100, 20), (30, 99, 29), (90, 70, 63)])
def test_target_payment_floor(max_reward, score, expected):
    assert target_payment(max_reward, score) == expected


@pytest.mark.parametrize("score", [-1, 101])
def test_target_payment_rejects_out_of_range_score(score):
    with pytest.raises(ValueError):
        target_payment(20, score)


def test_differential():
    assert differential(17, 13) == 4
    assert differential(10, 13) == 0
    assert differential(13, 13) == 0


def _award(world: World, mission: str, submission: str, score: int):
    with world.sf() as db:
        res = award_submission(db, world.app.state.rules, world.sid, mission, submission, score)
        db.commit()
        return res


def test_T04_payment_floor_and_replay_pays_nothing(world):
    before = world.balance()["booked"]
    res = _award(world, "m1", "sub_a", 65)  # max 20 : floor(20 × 65 / 100) = 13
    assert (res.amount, res.target, res.created) == (13, 13, True)
    assert world.balance()["booked"] == before + 13
    again = _award(world, "m1", "sub_a", 65)  # rejouer l'id de livraison ne rapporte rien
    assert (again.amount, again.created) == (0, False)
    assert world.balance()["booked"] == before + 13
    # un rejeu avec un autre score ne change rien non plus : la source est unique
    assert _award(world, "m1", "sub_a", 100).amount == 0
    assert world.balance()["booked"] == before + 13


def test_T05_retry_pays_only_the_differential(world):
    before = world.balance()["booked"]
    assert _award(world, "m1", "sub_1", 65).amount == 13
    res = _award(world, "m1", "sub_2", 85)  # cible 17, déjà acquis 13 : crédite 4
    assert (res.amount, res.target, res.previously_paid) == (4, 17, 13)
    assert _award(world, "m1", "sub_3", 50).amount == 0  # cible 10 < meilleur acquis 17
    assert _award(world, "m1", "sub_4", 85).amount == 0  # même cible : rien de plus
    assert world.balance()["booked"] == before + 17
    with world.sf() as db:
        assert paid_for_mission(db, world.sid, "m1") == 17
        assert paid_for_mission(db, world.sid, "m2") == 0  # missions indépendantes


def test_payment_ignores_unknown_mission_and_never_trusts_caller_amount(world):
    with world.sf() as db, pytest.raises(ApiError) as e:
        award_submission(db, world.app.state.rules, world.sid, "m99", "sub_x", 100)
    assert e.value.code.value == "NOT_FOUND"
    # le montant maximal vient des règles serveur (data/rules), pas de l'appelant
    assert _award(world, "m6", "sub_big", 100).amount == 150


def test_ledger_source_is_unique_and_idempotent(world):
    with world.sf() as db:
        e1, created1 = ledger.post_entry(db, world.sid, 5, "test", "src:1")
        e2, created2 = ledger.post_entry(db, world.sid, 5, "test", "src:1")
        db.commit()
        assert created1 and not created2 and e1.id == e2.id


def test_debit_cannot_make_balance_negative(world):
    with world.sf() as db:
        with pytest.raises(ApiError) as e:
            ledger.post_entry(db, world.sid, -31, "test", "src:big")
        assert e.value.code.value == "INSUFFICIENT_FUNDS"
        db.rollback()
        ledger.post_entry(db, world.sid, -30, "test", "src:ok")
        db.commit()
        assert ledger.balance(db, world.sid).available == 0


def test_available_is_booked_minus_active_reservations(world):
    attempt_id = world.attempt()
    res = world.send(attempt_id)
    assert res.status_code == 202
    with world.sf() as db:
        action_id = res.json()["id"]
        rsv = ledger.reserve(db, session_id=world.sid, action_id=action_id, amount=10, role="writer", attempt_id=attempt_id, quota=0, ttl_seconds=60)
        db.commit()
        b = ledger.balance(db, world.sid)
        assert (b.booked, b.reserved, b.available) == (29, 10, 19)
        with pytest.raises(ApiError):  # 20 > 19 disponible
            ledger.reserve(db, session_id=world.sid, action_id=action_id, amount=20, role="writer", attempt_id=attempt_id, quota=0, ttl_seconds=60)
        db.rollback()
        ledger.release(db.get(Reservation, rsv.id))
        db.commit()
        assert ledger.balance(db, world.sid).available == 29


def test_expired_reservations_are_released(world):
    attempt_id = world.attempt()
    action_id = world.send(attempt_id).json()["id"]
    with world.sf() as db:
        ledger.reserve(db, session_id=world.sid, action_id=action_id, amount=10, role="writer", attempt_id=attempt_id, quota=0, ttl_seconds=60)
        old = ledger.reserve(db, session_id=world.sid, action_id=action_id, amount=5, role="writer", attempt_id=attempt_id, quota=0, ttl_seconds=60)
        old.expires_at = utcnow() - timedelta(seconds=1)
        db.commit()
        assert ledger.reserved(db, world.sid) == 15
        assert ledger.release_expired(db, world.sid) == 1
        db.commit()
        assert ledger.reserved(db, world.sid) == 10


def test_every_balance_change_is_explained_by_the_ledger(world):
    world.grant(100, "bonus")
    world.complete("m1")
    assert world.buy("prospector").status_code == 201
    with world.sf() as db:
        rows = list(db.scalars(select(LedgerEntry).where(LedgerEntry.session_id == world.sid)))
        assert sum(r.amount for r in rows) == world.balance()["booked"] == 30 + 100 - 20
        assert {r.category for r in rows} == {"initial_capital", "test", "purchase"}


def test_ledger_rows_of_other_session_are_never_reused(world, settings):
    other = World(settings.__class__(db_path=settings.db_path))  # même base, autre partie
    try:
        with world.sf() as db:
            ledger.post_entry(db, world.sid, 1, "test", "shared:src")
            db.commit()
        with other.sf() as db, pytest.raises(ApiError):
            ledger.post_entry(db, other.sid, 1, "test", "shared:src")
    finally:
        other.close()


def test_unit_price_comes_from_the_frozen_attempt_not_current_rules(world):
    attempt_id = world.attempt("m2", unit_price=2)  # tarif figé à l'ouverture : 2 (les règles disent 1)
    r = world.send(attempt_id)
    assert r.status_code == 202, r.text
    assert r.json()["debited"] == 2
    assert world.balance()["booked"] == 28
