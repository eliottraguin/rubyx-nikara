"""Authentication routes: register, login, logout, me."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from ..auth import (
    MAX_PASSWORD_BYTES,
    TOKEN_TTL,
    burn_password_check,
    create_access_token,
    hash_password,
    normalize_email,
    verify_password,
    verify_token,
)
from ..deps import DB
from ..errors import ApiError, ErrorCode
from ..models import AuthUser
from .common import ERRORS

router = APIRouter(tags=["auth"], prefix="/api/auth")

AUTH_COOKIE = "auth_token"


def _check_password_size(v: str) -> str:
    if len(v.encode("utf-8")) > MAX_PASSWORD_BYTES:
        raise ValueError(f"Mot de passe trop long ({MAX_PASSWORD_BYTES} octets maximum)")
    return v


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)

    _size = field_validator("password")(_check_password_size)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=256)


class AuthResponse(BaseModel):
    user_id: str
    email: str


def _set_cookie(request: Request, response: Response, user_id: str) -> None:
    # Le jeton n'est livré que par cookie httpOnly : il n'est pas exposé au JavaScript du client.
    response.set_cookie(
        AUTH_COOKIE,
        create_access_token(user_id),
        max_age=int(TOKEN_TTL.total_seconds()),
        httponly=True,
        samesite="lax",
        secure=request.app.state.settings.cookie_secure,
        path="/",
    )


def current_user(request: Request, db: DB) -> AuthUser:
    token = request.cookies.get(AUTH_COOKIE)
    user_id = verify_token(token) if token and len(token) <= 2048 else None
    user = db.get(AuthUser, user_id) if user_id else None
    if user is None:
        raise ApiError(ErrorCode.AUTH_REQUIRED)
    return user


CurrentUser = Annotated[AuthUser, Depends(current_user)]


@router.post("/register", response_model=AuthResponse, status_code=201, responses={409: ERRORS[409], 422: ERRORS[422]})
def register(payload: RegisterRequest, db: DB, request: Request, response: Response) -> AuthResponse:
    """Register a new email/password account. Password: 8 characters minimum."""
    email = normalize_email(payload.email)
    if db.execute(select(AuthUser).where(AuthUser.email == email)).scalar():
        raise ApiError(ErrorCode.EMAIL_TAKEN)
    user = AuthUser(email=email, password_hash=hash_password(payload.password))
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise ApiError(ErrorCode.EMAIL_TAKEN)
    _set_cookie(request, response, user.id)
    return AuthResponse(user_id=user.id, email=user.email)


@router.post("/login", response_model=AuthResponse, responses={401: ERRORS[401], 422: ERRORS[422]})
def login(payload: LoginRequest, db: DB, request: Request, response: Response) -> AuthResponse:
    """Login with email and password; sets the httpOnly auth cookie."""
    user = db.execute(select(AuthUser).where(AuthUser.email == normalize_email(payload.email))).scalar()
    if user is None:
        burn_password_check(payload.password)
    if user is None or not verify_password(payload.password, user.password_hash):
        raise ApiError(ErrorCode.INVALID_CREDENTIALS)
    _set_cookie(request, response, user.id)
    return AuthResponse(user_id=user.id, email=user.email)


@router.post("/logout", status_code=204)
def logout(request: Request) -> Response:
    """Logout: clear the auth cookie (stateless JWT; expiry bounds its lifetime)."""
    response = Response(status_code=204)
    response.delete_cookie(
        AUTH_COOKIE, path="/", httponly=True, samesite="lax", secure=request.app.state.settings.cookie_secure
    )
    return response


@router.get("/me", response_model=AuthResponse, responses={401: ERRORS[401]})
def me(user: CurrentUser) -> AuthResponse:
    return AuthResponse(user_id=user.id, email=user.email)
