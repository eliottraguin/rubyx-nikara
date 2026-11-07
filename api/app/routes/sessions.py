from __future__ import annotations

from fastapi import APIRouter, Request, Response
from sqlalchemy import delete

from ..deps import DB, CurrentSession, IdempotencyKey
from ..models import GameSession
from ..schemas.state import GameState, SessionCreate
from ..services import sessions as svc
from .common import ERRORS

router = APIRouter(tags=["session"])


@router.post("/api/sessions", response_model=GameState, status_code=201, responses={422: ERRORS[422]})
def create_session(payload: SessionCreate, request: Request, response: Response, db: DB, key: IdempotencyKey) -> GameState:
    """Crée une partie : 30 $ de jeu, rédacteur possédé, cookie de session opaque.
    Rejouable : la même `Idempotency-Key` avec la même requête renvoie la même partie (200), jamais une 2e."""
    app = request.app
    cookie_name = app.state.settings.cookie_name
    game, token, replayed = svc.create_session_idempotent(db, app.state.rules, payload, key, request.cookies.get(cookie_name), app.state.profile_spec)
    if replayed:
        response.status_code = 200
    if token is not None:
        response.set_cookie(
            cookie_name,
            token,
            httponly=True,
            samesite="lax",
            secure=app.state.settings.cookie_secure,
            path="/",
        )
    return svc.build_state(db, app.state.rules, app.state.llm, game, rules_v2=app.state.rules_v2, profile_spec=app.state.profile_spec)


@router.get("/api/state", response_model=GameState, responses={401: ERRORS[401]})
def get_state(request: Request, db: DB, game: CurrentSession) -> GameState:
    """État complet utile à l'UI ; la partie est déterminée par le cookie uniquement."""
    return svc.build_state(db, request.app.state.rules, request.app.state.llm, game, rules_v2=request.app.state.rules_v2, profile_spec=request.app.state.profile_spec)


@router.delete("/api/session", status_code=204, responses={401: ERRORS[401], 422: ERRORS[422]})
def delete_session(request: Request, db: DB, game: CurrentSession, _key: IdempotencyKey) -> Response:
    """Supprime la partie et ses contenus (suppression en cascade) ; efface le cookie."""
    db.execute(delete(GameSession).where(GameSession.id == game.id))
    db.commit()
    response = Response(status_code=204)
    response.delete_cookie(request.app.state.settings.cookie_name, path="/")
    return response
