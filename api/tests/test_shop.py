"""Ticket C2 (docs/CONTRACTS-V2.md §2) : boutique et instances d'agent en plusieurs exemplaires —
achat, solde insuffisant, prérequis, deux instances en parallèle, idempotence, propriété."""

from __future__ import annotations

import pytest
from sqlalchemy import select

from app.models import AgentConfig, AgentInstance

from .actions_support import World


@pytest.fixture
def world(settings):
    w = World(settings)
    yield w
    w.close()


def _instances(world: World, role: str | None = None) -> list[dict]:
    items = world.client.get("/api/agents/instances").json()["items"]
    return [i for i in items if role is None or i["role"] == role]


def test_shop_catalog_lists_items_with_server_computed_unlock(world):
    r = world.client.get("/api/shop")
    assert r.status_code == 200, r.text
    body = r.json()
    scout_t1 = next(i for i in body["items"] if i["id"] == "scout_t1")
    assert scout_t1 == {
        "id": "scout_t1", "role": "scout", "tier": 1, "label": "Éclaireur", "price": 40,
        "effects": {"duration_multiplier": 1.0, "quality_bonus": 0}, "unlock_clients": None,
        "unlocked": True, "buyable": True,
    }
    triage_t1 = next(i for i in body["items"] if i["id"] == "triage_t1")
    assert triage_t1["unlocked"] is False and triage_t1["buyable"] is False  # aucun client obtenu
    assert body["owned_counts"] == {"scout": 0, "triage": 0, "replier": 0, "ads": 0}


def test_purchase_creates_an_idle_instance_with_initial_config(world):
    world.grant(100)
    r = world.shop_buy("scout_t1")
    assert r.status_code == 201, r.text
    body = r.json()
    assert (body["role"], body["tier"], body["status"], body["label"], body["price_paid"]) == ("scout", 1, "idle", None, 40)
    assert body["config"]["version"] == 1 and body["config"]["tools"] == [] and body["config"]["context_note"] is None
    assert len(body["config"]["instructions"]) <= 1500 and body["config"]["instructions"]
    assert body["config"]["tier_cap"] == 2  # min(tier 1 + 1, max_tier 3)
    assert world.balance() == {"booked": 90, "reserved": 0, "available": 90}
    with world.sf() as db:
        inst = db.get(AgentInstance, body["id"])
        assert inst is not None and inst.session_id == world.sid
        cfg = db.scalar(select(AgentConfig).where(AgentConfig.instance_id == inst.id))
        assert cfg.version == 1 and cfg.created_by == "system"


def test_purchase_insufficient_funds(world):
    # capital initial 30 $ < scout_t1 (40 $), aucun déblocage requis pour scout
    r = world.shop_buy("scout_t1")
    assert (r.status_code, r.json()["error"]["code"]) == (409, "INSUFFICIENT_FUNDS")
    assert _instances(world) == []


def test_purchase_requires_role_unlocked_by_clients_obtained(world):
    world.grant(200)
    r = world.shop_buy("triage_t1")  # aucun client obtenu
    assert (r.status_code, r.json()["error"]["code"]) == (409, "ROLE_LOCKED")
    assert _instances(world, "triage") == []
    world.win_clients(1)
    r = world.shop_buy("triage_t1")
    assert r.status_code == 201, r.text


def test_purchase_unknown_item(world):
    world.grant(100)
    r = world.shop_buy("scout_t99")
    assert (r.status_code, r.json()["error"]["code"]) == (404, "NOT_FOUND")


def test_two_instances_of_the_same_role_can_be_purchased_in_parallel(world):
    world.grant(200)
    r1 = world.shop_buy("scout_t1")
    r2 = world.shop_buy("scout_t1")
    assert r1.status_code == 201 and r2.status_code == 201
    ids = {r1.json()["id"], r2.json()["id"]}
    assert len(ids) == 2
    scouts = _instances(world, "scout")
    assert {s["id"] for s in scouts} == ids
    assert all(s["status"] == "idle" for s in scouts)
    state = world.client.get("/api/state").json()
    assert {a["id"] for a in state["agents"] if a["role"] == "scout"} == ids


def test_purchase_respects_the_max_instances_per_role(world):
    world.grant(400)
    for _ in range(3):  # rules_v2.agents_max_instances_per_role == 3
        assert world.shop_buy("scout_t1").status_code == 201
    r = world.shop_buy("scout_t1")
    assert (r.status_code, r.json()["error"]["code"]) == (409, "INSTANCE_LIMIT")
    assert len(_instances(world, "scout")) == 3


def test_purchase_is_idempotent_by_key(world):
    world.grant(100)
    key = world.key()
    r1 = world.shop_buy("scout_t1", key=key)
    assert r1.status_code == 201, r1.text
    r2 = world.shop_buy("scout_t1", key=key)
    assert r2.status_code == 200  # rejeu : même résultat, aucun second achat
    assert r1.json()["id"] == r2.json()["id"]
    assert world.balance()["booked"] == 90  # un seul débit
    assert len(_instances(world, "scout")) == 1


def test_purchase_rejects_reused_key_with_a_different_request(world):
    world.grant(100)
    key = world.key()
    assert world.shop_buy("scout_t1", key=key).status_code == 201
    r = world.shop_buy("scout_t2", key=key)
    assert (r.status_code, r.json()["error"]["code"]) == (422, "INVALID_REQUEST")


def test_patch_label_updates_the_instance(world):
    world.grant(100)
    instance_id = world.shop_buy("scout_t1").json()["id"]
    r = world.client.patch(f"/api/agents/instances/{instance_id}", json={"label": "Mon éclaireur"}, headers=world.key())
    assert r.status_code == 200, r.text
    assert r.json()["label"] == "Mon éclaireur"
    assert world.client.get("/api/agents/instances").json()["items"][0]["label"] == "Mon éclaireur"


def test_instances_are_session_owned(world, settings):
    world.grant(100)
    instance_id = world.shop_buy("scout_t1").json()["id"]
    other = World(settings)
    try:
        r = other.client.patch(f"/api/agents/instances/{instance_id}", json={"label": "pas le mien"}, headers=other.key())
        assert (r.status_code, r.json()["error"]["code"]) == (404, "NOT_FOUND")
        assert other.client.get("/api/agents/instances").json()["items"] == []
    finally:
        other.close()
