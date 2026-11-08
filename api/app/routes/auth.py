"""Comptes joueurs : inscription, connexion, déconnexion (ADR 0001). L'identité vient du cookie opaque, jamais du client."""

from __future__ import annotations

from urllib.parse import urlparse

from fastapi import APIRouter, Request, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select

from ..deps import DB, IdempotencyKey, OptionalUser, hash_token, user_cookie_name
from ..errors import ApiError, ErrorCode
from ..models import GameSession, User
from ..services import auth as svc
from .common import ERRORS

router = APIRouter(tags=["auth"])

USER_COOKIE_MAX_AGE = 30 * 24 * 3600  # le cookie de compte expire côté navigateur (l'expiration serveur du jeton reste à faire)


class Credentials(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=False)
    email: str = Field(max_length=320)
    password: str = Field(max_length=svc.MAX_PASSWORD, repr=False)


class AuthOut(BaseModel):
    user_id: str
    email: str
    has_game: bool  # une partie est liée au cookie posé par cette réponse


def _check_origin(request: Request) -> None:
    """Défense CSRF en profondeur (en plus de SameSite=Lax) : un `Origin` présent doit être l'hôte de l'API ou une origine autorisée."""
    origin = request.headers.get("origin")
    if not origin:
        return
    host = urlparse(origin).netloc
    allowed = {request.headers.get("host", "")} | {urlparse(o).netloc for o in request.app.state.settings.cors_origins}
    if host not in allowed:
        raise ApiError(ErrorCode.INVALID_REQUEST, "Origine non autorisée.")


def _set_cookie(request: Request, response: Response, token: str) -> None:
    s = request.app.state.settings
    response.set_cookie(s.cookie_name, token, httponly=True, samesite="lax", secure=s.cookie_secure, path="/")


def _set_user_cookie(request: Request, response: Response, token: str) -> None:
    response.set_cookie(user_cookie_name(request), token, httponly=True, samesite="lax", secure=request.app.state.settings.cookie_secure, path="/", max_age=USER_COOKIE_MAX_AGE)


def _client_ip(request: Request) -> str | None:
    return request.client.host if request.client else None


def _anonymous_game(request: Request, db) -> GameSession | None:
    token = request.cookies.get(request.app.state.settings.cookie_name)
    if not token or len(token) > 256:
        return None
    return db.scalar(select(GameSession).where(GameSession.token_hash == hash_token(token)))


def _out(user: User, game: GameSession | None) -> AuthOut:
    return AuthOut(user_id=user.id, email=user.email, has_game=game is not None)


@router.post("/api/auth/signup", response_model=AuthOut, status_code=201, responses={422: ERRORS[422], 429: ERRORS[429]})
def signup(payload: Credentials, request: Request, response: Response, db: DB, _key: IdempotencyKey) -> AuthOut:
    """Crée un compte (argon2id) et y rattache la partie anonyme du cookie, avec un jeton renouvelé."""
    _check_origin(request)
    user, game, token, user_token = svc.signup(db, payload.email, payload.password, _anonymous_game(request, db), _client_ip(request))
    _set_user_cookie(request, response, user_token)
    if token:
        _set_cookie(request, response, token)
    return _out(user, game)


@router.post("/api/auth/login", response_model=AuthOut, responses={401: ERRORS[401], 422: ERRORS[422], 429: ERRORS[429]})
def login(payload: Credentials, request: Request, response: Response, db: DB, _key: IdempotencyKey) -> AuthOut:
    """Connexion : rouvre la partie la plus récente du compte (jeton renouvelé, l'ancien est révoqué)."""
    _check_origin(request)
    user, game, token, user_token = svc.login(db, payload.email, payload.password, _client_ip(request))
    _set_user_cookie(request, response, user_token)
    if token:
        _set_cookie(request, response, token)
    return _out(user, game)


@router.get("/api/auth/me", response_model=AuthOut, responses={401: ERRORS[401]})
def me(request: Request, db: DB, user: OptionalUser) -> AuthOut:
    """Compte connecté (cookie de compte) et présence d'une partie rattachée ; ne renvoie jamais la partie d'un autre."""
    if user is None:
        raise ApiError(ErrorCode.SESSION_REQUIRED)
    game = db.scalar(select(GameSession).where(GameSession.user_id == user.id).limit(1))
    return _out(user, game)


@router.post("/api/auth/logout", status_code=204, responses={422: ERRORS[422]})
def logout(request: Request, db: DB, user: OptionalUser, _key: IdempotencyKey) -> Response:
    """Déconnexion idempotente : révoque le jeton de compte et celui de la partie rattachée, efface les deux cookies."""
    _check_origin(request)
    svc.logout(db, _anonymous_game(request, db), user)
    response = Response(status_code=204)
    response.delete_cookie(request.app.state.settings.cookie_name, path="/")
    response.delete_cookie(user_cookie_name(request), path="/")
    return response
