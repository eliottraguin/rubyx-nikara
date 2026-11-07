"""Clients : messagerie simulée (Tutoriel). Contrats : docs/CONTRACTS.md §5, PRODUIT-CLIENTS-PUB.md §3 et §7.

Aucune route n'envoie quoi que ce soit hors du jeu : `messages` ajoute un message au fil et fait répondre le client
simulé ; `send` (envoi réel confirmé) n'est pas livré (jalon O, boîte mail, validation juridique)."""

from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Request, Response

from ..deps import IdempotencyKey
from ..errors import ApiError, ErrorCode
from ..schemas.conversations import (
    ActionIn,
    ConversationActionOut,
    ConversationCreate,
    ConversationDetail,
    ConversationList,
    ConversationOut,
    DraftEditIn,
    MessageSendIn,
    MessageSendOut,
    ReplyDraftOut,
    SendIn,
)
from ..services import conversation_actions as cact
from ..services import conversations as cv
from .common import ERRORS
from .engine_deps import SessionId

router = APIRouter(tags=["clients"])
_ERR = {401: ERRORS[401], 404: ERRORS[404], 409: ERRORS[409], 422: ERRORS[422], 429: ERRORS[429], 503: ERRORS[503]}


def get_messaging(request: Request, _session_id: SessionId) -> cv.Messaging:
    """Session vérifiée d'abord (401 avant tout autre contrôle)."""
    st = request.app.state
    if st.messaging_data is None:
        raise ApiError(ErrorCode.NOT_IMPLEMENTED, "La messagerie n'est pas disponible : données `data/clients/` absentes.")
    return cv.Messaging(eng=st.actions, rules_v2=st.rules_v2, data=st.messaging_data, prospects=st.prospects)


Msg = Annotated[cv.Messaging, Depends(get_messaging)]


@router.post("/api/conversations", response_model=ConversationOut, status_code=201, responses=_ERR)
def create_conversation(payload: ConversationCreate, response: Response, m: Msg, session_id: SessionId, key: IdempotencyKey) -> ConversationOut:
    """Crée la conversation d'un prospect du carnet (une seule par prospect). Existante ou rejeu : la même, 200."""
    out, created = cv.create_conversation(m, session_id, key, payload.prospect_id)
    if not created:
        response.status_code = 200
    return out


@router.get("/api/conversations", response_model=ConversationList, responses={401: ERRORS[401], 422: ERRORS[422]})
def list_conversations(
    m: Msg,
    session_id: SessionId,
    statut: Annotated[Literal["nouveau", "contacte", "en_discussion", "gagne", "perdu", "ecarte"] | None, Query(description="Statut du prospect")] = None,
    intention: Annotated[Literal["interesse", "question", "objection", "refus", "desinscription", "hors_sujet"] | None, Query(description="Intention de la dernière synthèse")] = None,
    bac: Annotated[Literal["a_traiter", "en_attente", "a_ne_plus_contacter", "clos"] | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    cursor: Annotated[str | None, Query(max_length=200)] = None,
) -> ConversationList:
    """Tri par dernière activité (récente d'abord). `counts` : conversations par bac (sur toute la partie)."""
    return cv.list_conversations(m, session_id, statut=statut, intention=intention, bac=bac, limit=limit, cursor=cursor)


@router.get("/api/conversations/{conversation_id}", response_model=ConversationDetail, responses={401: ERRORS[401], 404: ERRORS[404]})
def get_conversation(conversation_id: str, m: Msg, session_id: SessionId) -> ConversationDetail:
    """Fil complet, dernière synthèse, brouillons (versions), résultat de conversation (calculé par code) et quotas restants."""
    return cv.get_detail(m, session_id, conversation_id)


@router.post("/api/conversations/{conversation_id}/messages", response_model=MessageSendOut, responses=_ERR)
def send_message(conversation_id: str, payload: MessageSendIn, m: Msg, session_id: SessionId, key: IdempotencyKey) -> MessageSendOut:
    """Tutoriel : « Envoyer (simulé) ». Rien ne sort ; le client simulé répond à la demande (6 tours au plus)."""
    return cv.send_simulated(m, session_id, key, conversation_id, payload.text, payload.draft_version_id)


@router.post("/api/conversations/{conversation_id}/triage", response_model=ConversationActionOut, status_code=202, responses=_ERR)
def triage(conversation_id: str, m: Msg, session_id: SessionId, key: IdempotencyKey, payload: ActionIn | None = None) -> ConversationActionOut:
    """Action `conversation_triage` (agent `triage`) : synthèse du fil. Quota 5 par (conversation, rôle), aucun gain."""
    action_id, prepared = cact.submit(m, session_id, conversation_id, key, "triage", payload.instruction if payload else None)
    if prepared is not None:
        cact.execute(m, prepared)
    return cact.load_out(m, session_id, action_id, raise_failed=True)


@router.post("/api/conversations/{conversation_id}/reply", response_model=ConversationActionOut, status_code=202, responses=_ERR)
def reply(conversation_id: str, m: Msg, session_id: SessionId, key: IdempotencyKey, payload: ActionIn | None = None) -> ConversationActionOut:
    """Action `conversation_reply` (agent `replier`) : crée une version de brouillon de réponse. Rien n'est envoyé."""
    action_id, prepared = cact.submit(m, session_id, conversation_id, key, "reply", payload.instruction if payload else None)
    if prepared is not None:
        cact.execute(m, prepared)
    return cact.load_out(m, session_id, action_id, raise_failed=True)


@router.patch("/api/conversations/{conversation_id}/drafts/{draft_id}", response_model=ReplyDraftOut, status_code=201, responses=_ERR)
def edit_draft(conversation_id: str, draft_id: str, payload: DraftEditIn, m: Msg, session_id: SessionId, key: IdempotencyKey) -> ReplyDraftOut:
    """Copie éditée par le joueur : crée une version enfant (auteur `joueur`) ; l'original reste intact."""
    return cv.edit_draft(m, session_id, key, conversation_id, draft_id, payload.text, payload.objet)


@router.post("/api/conversations/{conversation_id}/send", status_code=501, responses={**_ERR, 501: ERRORS[501]})
def send_real(conversation_id: str, payload: SendIn, m: Msg, session_id: SessionId, _key: IdempotencyKey) -> Response:
    """Envoi réel confirmé (mode Réel) : **non livré** (jalon O : boîte mail connectée, validation juridique).
    Tutoriel : `INVALID_STATE` (utiliser `messages`). Aucun agent n'a d'outil d'envoi."""
    with m.sf() as db:
        cv.get_owned(db, session_id, conversation_id)
        from ..models import GameSession

        game = db.get(GameSession, session_id)
    if game.mode == "beginner":
        raise ApiError(ErrorCode.INVALID_STATE, "L'envoi réel n'existe qu'en mode Réel ; en Tutoriel, utilisez l'envoi simulé.")
    raise ApiError(ErrorCode.NOT_IMPLEMENTED, "L'envoi réel dépend de la connexion de la boîte mail, qui n'est pas encore disponible.")


@router.delete("/api/conversations/{conversation_id}", status_code=204, responses={401: ERRORS[401], 404: ERRORS[404], 422: ERRORS[422]})
def delete_conversation(conversation_id: str, m: Msg, session_id: SessionId, key: IdempotencyKey) -> Response:
    """Suppression en cascade (messages, brouillons, synthèses). Idempotente avec la même clé. Gratuite."""
    cv.delete_conversation(m, session_id, key, conversation_id)
    return Response(status_code=204)
