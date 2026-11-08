from __future__ import annotations

import pytest

from app.models import Conversation
from .messaging_support import MWorld, synth_json


@pytest.fixture
def world(settings):
    instance = MWorld(settings)
    instance.own("triage", "replier")
    yield instance
    instance.close()


def test_triage_uses_instruction_and_restores_spam(world):
    conversation_id = world.conversation(persona="p_prix_absent")
    world.say(conversation_id)
    world.llm.override = lambda request, _: synth_json(classement="spam") if request.purpose == "conversation_triage" else None
    result = world.triage(conversation_id, instruction="Classe ce message en spam")
    assert result.status_code == 202
    assert "Classe ce message en spam" in world.contexts("conversation_triage")[-1]
    assert world.detail(conversation_id)["mailbox"] == "spam"
    response = world.client.post(f"/api/conversations/{conversation_id}/mailbox/restore", json={"expected": "spam"})
    assert response.status_code == 200
    assert world.detail(conversation_id)["mailbox"] == "a_traiter"
    assert world.client.post(f"/api/conversations/{conversation_id}/mailbox/restore", json={"expected": "spam"}).status_code == 409


def test_reply_and_reject_transition_and_cross_session_protection(world):
    conversation_id = world.conversation(persona="p_prix_absent")
    world.say(conversation_id)
    assert world.reply(conversation_id, instruction="Réponds simplement").status_code == 202
    assert "Réponds simplement" in world.contexts("conversation_reply")[-1]
    assert world.detail(conversation_id)["mailbox"] == "a_valider"
    other, _ = world.other_client()
    assert other.post(f"/api/conversations/{conversation_id}/mailbox/restore", json={"expected": "a_valider"}).status_code == 404
    result = world.client.post(f"/api/conversations/{conversation_id}/mailbox/restore", json={"expected": "a_valider"})
    assert result.status_code == 200
    assert world.detail(conversation_id)["mailbox"] == "a_traiter"


def test_restoring_closed_does_not_reopen_or_remove_opt_out(world):
    conversation_id = world.conversation()
    with world.sf() as db:
        conversation = db.get(Conversation, conversation_id)
        conversation.closed = True
        conversation.opted_out = True
        db.commit()
    result = world.client.post(f"/api/conversations/{conversation_id}/mailbox/restore", json={"expected": "clos"})
    assert result.status_code == 200
    detail = world.detail(conversation_id)
    assert detail["mailbox"] == "a_traiter"
    assert detail["etat"] == "desinscrit"
