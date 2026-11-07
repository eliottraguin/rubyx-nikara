"""Dépendances FastAPI : base, session (propriété), Idempotency-Key."""

from __future__ import annotations

import hashlib
import re
from collections.abc import Iterator
from typing import Annotated

from fastapi import Depends, Header, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from .errors import ApiError, ErrorCode
from .models import GameSession

_KEY_RE = re.compile(r"^[A-Za-z0-9_.:\-]{8,128}$")


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def get_db(request: Request) -> Iterator[Session]:
    with request.app.state.session_factory() as db:
        yield db


DB = Annotated[Session, Depends(get_db)]


def get_current_session(request: Request, db: DB) -> GameSession:
    """Retrouve la partie par le cookie opaque ; jamais par un identifiant fourni par le client."""
    token = request.cookies.get(request.app.state.settings.cookie_name)
    if not token or len(token) > 256:
        raise ApiError(ErrorCode.SESSION_REQUIRED)
    game = db.scalar(select(GameSession).where(GameSession.token_hash == hash_token(token)))
    if game is None:
        raise ApiError(ErrorCode.SESSION_REQUIRED)
    return game


CurrentSession = Annotated[GameSession, Depends(get_current_session)]


def require_idempotency_key(
    idempotency_key: Annotated[
        str | None,
        Header(
            alias="Idempotency-Key",
            description="Obligatoire sur toute mutation (8 à 128 caractères : lettres, chiffres, _ . : -).",
        ),
    ] = None,
) -> str:
    # BE01 : présence et format seulement ; la rejouabilité complète est BE04.
    if not idempotency_key:
        raise ApiError(ErrorCode.INVALID_REQUEST, "L'en-tête Idempotency-Key est obligatoire sur cette opération.")
    if not _KEY_RE.match(idempotency_key):
        raise ApiError(ErrorCode.INVALID_REQUEST, "Idempotency-Key invalide (8 à 128 caractères : lettres, chiffres, _ . : -).")
    return idempotency_key


IdempotencyKey = Annotated[str, Depends(require_idempotency_key)]
