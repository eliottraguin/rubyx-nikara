"""Dépendances des routes du moteur (BE03/BE04) : moteur d'actions et partie courante.

Le jeton de session est résolu puis la connexion est rendue immédiatement : une requête ne garde
aucune connexion de base pendant l'attente du fournisseur."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy import select

from ..deps import hash_token
from ..errors import ApiError, ErrorCode
from ..models import GameSession
from ..services.actions import ActionEngine


def get_engine(request: Request) -> ActionEngine:
    return request.app.state.actions


def current_session_id(request: Request) -> str:
    token = request.cookies.get(request.app.state.settings.cookie_name)
    if not token or len(token) > 256:
        raise ApiError(ErrorCode.SESSION_REQUIRED)
    with request.app.state.session_factory() as db:
        game_id = db.scalar(select(GameSession.id).where(GameSession.token_hash == hash_token(token)))
    if game_id is None:
        raise ApiError(ErrorCode.SESSION_REQUIRED)
    return game_id


Engine = Annotated[ActionEngine, Depends(get_engine)]
SessionId = Annotated[str, Depends(current_session_id)]
