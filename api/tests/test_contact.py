"""API-S3 : `POST /api/prospects/{id}/contact` ouvre la conversation du prospect (aucun envoi)."""

from __future__ import annotations

import pytest
from sqlalchemy import func, select

from app.models import Conversation, ConversationMessage, Prospect

from .test_searches import k, new_game, prospects, search


@pytest.fixture
def app(client):
    return client.app


@pytest.fixture
def game(app):
    c = new_game(app)
    assert search(c).status_code == 202
    return c, prospects(c)


def contact(c, pid, headers=None, json=None):
    return c.post(
        f"/api/prospects/{pid}/contact",
        json={} if json is None else json,
        headers=headers or k(),
    )


def n_messages(app) -> int:
    with app.state.actions.sf() as db:
        return db.scalar(select(func.count()).select_from(ConversationMessage))


def test_create_then_idempotent(app, game):
    c, items = game
    pid = items[0]["id"]
    key = k()
    r = contact(c, pid, key)
    assert r.status_code == 201, r.text
    conv = r.json()
    assert (
        conv["prospect_id"] == pid
        and conv["simule"] is True
        and conv["id"].startswith("cnv_")
    )
    again = contact(c, pid, key)  # rejeu
    assert again.status_code == 200 and again.json()["id"] == conv["id"]
    other = contact(c, pid)  # autre clé
    assert other.status_code == 200 and other.json()["id"] == conv["id"]
    assert (
        c.post("/api/conversations", json={"prospect_id": pid}, headers=k()).json()[
            "id"
        ]
        == conv["id"]
    )
    with app.state.actions.sf() as db:
        assert (
            db.scalar(
                select(func.count())
                .select_from(Conversation)
                .where(Conversation.prospect_id == pid)
            )
            == 1
        )


def test_sends_nothing_and_keeps_status(app, game):
    c, items = game
    pid = items[0]["id"]
    before = c.get(f"/api/prospects/{pid}").json()["statut"]
    assert contact(c, pid).status_code == 201
    assert n_messages(app) == 0
    assert c.get(f"/api/prospects/{pid}").json()["statut"] == before
    assert c.get("/api/state").json()["balance"]["available"] == 30


def test_key_required_and_body_strict(game):
    c, items = game
    pid = items[0]["id"]
    assert c.post(f"/api/prospects/{pid}/contact", json={}).status_code == 422
    assert contact(c, pid, json={"prospect_id": "x"}).status_code == 422
    assert (
        c.post(f"/api/prospects/{pid}/contact", headers=k()).status_code == 201
    )  # sans corps


def test_unknown_and_other_session_are_identical_404(app, game):
    _c, items = game
    other = new_game(app)
    a = contact(other, items[0]["id"])
    b = contact(other, "pro_inexistant")
    assert a.status_code == b.status_code == 404
    assert a.json()["error"]["code"] == b.json()["error"]["code"] == "NOT_FOUND"
    assert a.json()["error"]["message"] == b.json()["error"]["message"]


def test_discarded_prospect_opens_thread_but_sending_stays_refused(app, game):
    c, items = game
    pid = items[0]["id"]
    with app.state.actions.sf() as db:
        db.get(Prospect, pid).statut = "ecarte"
        db.commit()
    r = contact(c, pid)  # même règle que la création de conversation : le fil s'ouvre
    assert r.status_code == 201
    s = c.post(
        f"/api/conversations/{r.json()['id']}/messages",
        json={"text": "Bonjour"},
        headers=k(),
    )
    assert s.status_code == 409 and s.json()["error"]["code"] == "OPTED_OUT"
    assert n_messages(app) == 0


def test_no_contact_value_in_responses_or_errors(app, game):
    c, items = game
    pid = items[0]["id"]
    value = c.get(f"/api/prospects/{pid}").json()["canal"]["valeur"]
    assert value
    texts = [
        contact(c, pid).text,
        contact(c, "pro_inexistant").text,
        c.post(f"/api/prospects/{pid}/contact", json={}).text,
    ]
    assert all(value not in t for t in texts)


def test_full_journey_search_notebook_contact(app):
    c = new_game(app)
    assert search(c).status_code == 202
    pid = prospects(c)[0]["id"]
    conv = contact(c, pid).json()
    detail = c.get(f"/api/conversations/{conv['id']}")
    assert detail.status_code == 200 and detail.json()["prospect_id"] == pid
    assert [x["id"] for x in c.get("/api/conversations").json()["items"]] == [
        conv["id"]
    ]
