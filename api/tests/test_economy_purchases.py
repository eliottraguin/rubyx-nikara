"""BE03 : achats d'agents (T06), déblocage, idempotence, concurrence, isolation entre sessions."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor

import pytest
from sqlalchemy import func, select

from app.models import ActionRun, AgentOwnership, LedgerEntry

from .actions_support import World, rules_copy


@pytest.fixture
def world(settings):
    w = World(settings)
    yield w
    w.close()


def _owned(world: World, role: str) -> int:
    with world.sf() as db:
        return db.scalar(select(func.count()).select_from(AgentOwnership).where(AgentOwnership.session_id == world.sid, AgentOwnership.role == role))


def test_purchase_success_debits_the_rules_price(world):
    world.grant(20)
    world.win_clients(1)
    r = world.buy("triage")
    assert r.status_code == 201, r.text
    body = r.json()
    assert (body["role"], body["price_paid"], body["balance"]["available"]) == ("triage", 35, 15)
    assert world.balance() == {"booked": 15, "reserved": 0, "available": 15}
    hangar = {a["role"]: a for a in world.client.get("/api/state").json()["hangar"]}
    assert hangar["triage"]["owned"] is True


def test_purchase_requires_unlock_by_clients_obtained(world):
    world.grant(200)
    r = world.buy("triage")  # aucun client obtenu
    assert (r.status_code, r.json()["error"]["code"]) == (409, "ROLE_LOCKED")
    assert world.buy("triage").json()["error"]["code"] == "ROLE_LOCKED"  # aucun client obtenu : toujours verrouillé
    assert _owned(world, "triage") == 0 and world.balance()["booked"] == 230
    world.win_clients(1)
    assert world.buy("triage").status_code == 201


def test_purchase_insufficient_funds(world):
    world.win_clients(3)
    r = world.buy("ads")  # 50 > 30
    assert (r.status_code, r.json()["error"]["code"]) == (409, "INSUFFICIENT_FUNDS")
    assert _owned(world, "ads") == 0 and world.balance()["booked"] == 30


def test_purchase_already_owned_and_unknown_role(world):
    r = world.buy("scout")
    assert (r.status_code, r.json()["error"]["code"]) == (409, "INVALID_STATE")
    r = world.client.post("/api/agents/purchase", json={"role": "wizard"}, headers=world.key())
    assert r.status_code == 422 and r.json()["error"]["code"] == "INVALID_REQUEST"
    r = world.client.post("/api/agents/purchase", json={"role": "writer"}, headers=world.key())  # rôle de l'ancien parcours : retiré
    assert r.status_code == 422 and r.json()["error"]["code"] == "INVALID_REQUEST"


def test_client_cannot_choose_the_price(world):
    world.win_clients(1)
    r = world.client.post("/api/agents/purchase", json={"role": "triage", "price": 0}, headers=world.key())
    assert r.status_code == 422
    assert world.balance()["booked"] == 30


def test_purchase_replay_same_key_single_debit(world):
    world.grant(20)
    world.win_clients(2)
    key = world.key()
    first = world.buy("triage", key)
    again = world.buy("triage", key)
    assert (first.status_code, again.status_code) == (201, 200)
    assert first.json()["action_id"] == again.json()["action_id"]
    assert world.balance()["booked"] == 15
    other = world.buy("triage", key)  # même clé, même requête : toujours rejouée
    assert other.status_code == 200
    # même clé pour une AUTRE requête : refusée
    r = world.buy("replier", key)
    assert r.status_code == 422 and r.json()["error"]["code"] == "INVALID_REQUEST"


def test_T06_concurrent_double_purchase_same_role(world):
    world.grant(20)
    world.win_clients(1)
    with ThreadPoolExecutor(8) as pool:
        results = list(pool.map(lambda _: world.buy("triage"), range(8)))
    codes = sorted(r.status_code for r in results)
    assert codes == [201] + [409] * 7
    assert _owned(world, "triage") == 1
    assert world.balance()["booked"] == 15  # débité une seule fois


def test_T06_concurrent_purchases_never_make_balance_negative(world):
    world.win_clients(2)
    world.grant(15)  # solde 45 : assez pour le trieur (35) OU le rédacteur (45), jamais les deux
    with ThreadPoolExecutor(4) as pool:
        results = list(pool.map(lambda role: world.buy(role), ["triage", "replier", "triage", "replier"]))
    ok = [r for r in results if r.status_code == 201]
    assert len(ok) == 1
    assert all(r.json()["error"]["code"] in {"INSUFFICIENT_FUNDS", "INVALID_STATE"} for r in results if r.status_code != 201)
    bal = world.balance()
    assert bal["available"] >= 0 and bal["booked"] in {0, 10}
    with world.sf() as db:
        assert db.scalar(select(func.count()).select_from(LedgerEntry).where(LedgerEntry.category == "purchase")) == 1


def test_T06_concurrent_same_key_purchase_is_a_single_debit(world):
    world.grant(20)
    world.win_clients(1)
    key = world.key()
    with ThreadPoolExecutor(8) as pool:
        results = list(pool.map(lambda _: world.buy("triage", key), range(8)))
    assert all(r.status_code in (200, 201) for r in results)
    assert len({r.json()["action_id"] for r in results}) == 1
    assert world.balance()["booked"] == 15


def test_purchase_blocked_by_reservation(world):
    """Le solde disponible (et non comptabilisé) conditionne l'achat : 45 − réservation 11 < 35."""
    world.grant(15)
    world.win_clients(1)
    action_id = world.action()
    from app.services import ledger

    with world.sf() as db:
        ledger.reserve(db, session_id=world.sid, action_id=action_id, amount=11, role="scout", ttl_seconds=60)
        db.commit()
    assert world.buy("triage").json()["error"]["code"] == "INSUFFICIENT_FUNDS"


def test_prices_come_from_rules_data(tmp_path, data_copy):
    import json

    path = data_copy / "rules" / "rules_v2.json"
    rules = json.loads(path.read_text())
    next(a for a in rules["agents"] if a["id"] == "triage")["price"] = 7
    path.write_text(json.dumps(rules))
    w = World(rules_copy(data_copy))
    try:
        w.win_clients(1)
        assert w.buy("triage").json()["balance"]["available"] == 23
    finally:
        w.close()


def test_idempotency_key_is_scoped_per_session_and_sessions_are_isolated(settings):
    a, b = World(settings), World(settings)  # même base, deux parties
    try:
        for w in (a, b):
            w.grant(20)
            w.win_clients(1)
        key = {"Idempotency-Key": "shared-key-00000001"}
        ra, rb = a.buy("triage", key), b.buy("triage", key)
        assert (ra.status_code, rb.status_code) == (201, 201)  # aucune collision entre sessions
        assert ra.json()["action_id"] != rb.json()["action_id"]
        assert a.balance()["booked"] == b.balance()["booked"] == 15
        with a.sf() as db:
            assert db.scalar(select(func.count()).select_from(ActionRun).where(ActionRun.idempotency_key == key["Idempotency-Key"])) == 2
        # chaque partie ne lit que ses propres actions (T13)
        assert a.client.get(f"/api/actions/{rb.json()['action_id']}").status_code == 404
        assert a.client.get(f"/api/actions/{ra.json()['action_id']}").status_code == 200
    finally:
        a.close()
        b.close()


def test_purchase_requires_session_and_key(client):
    r = client.post("/api/agents/purchase", json={"role": "triage"}, headers={"Idempotency-Key": "key-00000001"})
    assert r.status_code == 401 and r.json()["error"]["code"] == "SESSION_REQUIRED"
