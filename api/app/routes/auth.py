"""Authentication routes: register, login, logout."""

from __future__ import annotations

from pydantic import BaseModel, EmailStr, Field
from fastapi import APIRouter, Request, Response, HTTPException, status
from sqlalchemy import select

from ..auth import hash_password, verify_password, create_access_token
from ..deps import DB
from ..models import AuthUser
from .common import ERRORS

router = APIRouter(tags=["auth"], prefix="/api/auth")


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class AuthResponse(BaseModel):
    user_id: str
    email: str
    token: str


@router.post("/register", response_model=AuthResponse, status_code=201, responses={422: ERRORS[422]})
def register(payload: RegisterRequest, db: DB, response: Response) -> AuthResponse:
    """Register a new email/password account. Password must be at least 8 characters."""
    existing = db.execute(select(AuthUser).where(AuthUser.email == payload.email)).scalar()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    password_hash = hash_password(payload.password)
    user = AuthUser(email=payload.email, password_hash=password_hash)
    db.add(user)
    db.commit()

    token = create_access_token(user.id)
    response.set_cookie(
        "auth_token",
        token,
        httponly=True,
        samesite="lax",
        secure=True,  # requires HTTPS in production
        path="/",
    )
    return AuthResponse(user_id=user.id, email=user.email, token=token)


@router.post("/login", response_model=AuthResponse, responses={401: ERRORS[401], 422: ERRORS[422]})
def login(payload: LoginRequest, db: DB, response: Response) -> AuthResponse:
    """Login with email and password. Returns JWT token and sets auth cookie."""
    user = db.execute(select(AuthUser).where(AuthUser.email == payload.email)).scalar()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    token = create_access_token(user.id)
    response.set_cookie(
        "auth_token",
        token,
        httponly=True,
        samesite="lax",
        secure=True,  # requires HTTPS in production
        path="/",
    )
    return AuthResponse(user_id=user.id, email=user.email, token=token)


@router.post("/logout", status_code=204)
def logout(response: Response) -> Response:
    """Logout: clear auth cookie."""
    response.delete_cookie("auth_token", path="/")
    return response
