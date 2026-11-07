"""Raccord messagerie ↔ carnet réel : une conversation s'ouvre sur un vrai prospect, et sa suppression l'emporte."""

from __future__ import annotations

import pytest
from sqlalchemy import func, select

from app.models import Conversation
from tests.prospects_support import Expedition, k, second_client, world


@pytest.fixture
def w(settings):
    w = world(settings)
    yield w
    w.close()


def test_conversation_opens_on_real_prospect_and_follows_its_deletion(w):
    pid = Expedition(w).add([0]).json()["added"][0]["id"]
    r = w.client.post("/api/conversations", json={"prospect_id": pid}, headers=k())
    assert r.status_code == 201, r.text
    cid = r.json()["id"]
    assert w.client.get(f"/api/conversations/{cid}").status_code == 200
    assert w.client.delete(f"/api/prospects/{pid}", headers=k()).status_code == 204
    assert w.client.get(f"/api/conversations/{cid}").status_code == 404
    with w.sf() as db:
        assert db.scalar(select(func.count()).select_from(Conversation)) == 0


def test_other_session_cannot_open_a_conversation_on_my_prospect(w):
    pid = Expedition(w).add([0]).json()["added"][0]["id"]
    other = second_client(w)
    assert other.post("/api/conversations", json={"prospect_id": pid}, headers=k()).status_code == 404


def test_purging_the_notebook_removes_conversations(w):
    pid = Expedition(w).add([0]).json()["added"][0]["id"]
    assert w.client.post("/api/conversations", json={"prospect_id": pid}, headers=k()).status_code == 201
    assert w.client.delete("/api/prospects", headers=k()).status_code == 204
    with w.sf() as db:
        assert db.scalar(select(func.count()).select_from(Conversation)) == 0
