"""BE03 : ledger, réservations, achats. Le paiement par livraison (T04, T05) est retiré (API-R2)."""

from __future__ import annotations

from datetime import timedelta

import pytest
from sqlalchemy import select

from app.errors import ApiError
from app.models import LedgerEntry, Reservation, utcnow
from app.services import ledger

from .actions_support import World


@pytest.fixture
def world(settings):
    w = World(settings)
    yield w
    w.close()


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
    action_id = world.action()
    with world.sf() as db:
        rsv = ledger.reserve(db, session_id=world.sid, action_id=action_id, amount=10, role="scout", ttl_seconds=60)
        db.commit()
        b = ledger.balance(db, world.sid)
        assert (b.booked, b.reserved, b.available) == (30, 10, 20)
        with pytest.raises(ApiError):  # 21 > 20 disponible
            ledger.reserve(db, session_id=world.sid, action_id=action_id, amount=21, role="scout", ttl_seconds=60)
        db.rollback()
        ledger.release(db.get(Reservation, rsv.id))
        db.commit()
        assert ledger.balance(db, world.sid).available == 30


def test_expired_reservations_are_released(world):
    action_id = world.action()
    with world.sf() as db:
        ledger.reserve(db, session_id=world.sid, action_id=action_id, amount=10, role="scout", ttl_seconds=60)
        old = ledger.reserve(db, session_id=world.sid, action_id=action_id, amount=5, role="scout", ttl_seconds=60)
        old.expires_at = utcnow() - timedelta(seconds=1)
        db.commit()
        assert ledger.reserved(db, world.sid) == 15
        assert ledger.release_expired(db, world.sid) == 1
        db.commit()
        assert ledger.reserved(db, world.sid) == 10


def test_every_balance_change_is_explained_by_the_ledger(settings):
    w = World(settings, mode="expert")  # en Réel la condition de score du déblocage est levée : seul le prix compte
    try:
        w.grant(100, "bonus")
        assert w.buy("triage").status_code == 201
        with w.sf() as db:
            rows = list(db.scalars(select(LedgerEntry).where(LedgerEntry.session_id == w.sid)))
            assert sum(r.amount for r in rows) == w.balance()["booked"] == 30 + 100 - 35
            assert {r.category for r in rows} == {"initial_capital", "test", "purchase"}
    finally:
        w.close()


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
