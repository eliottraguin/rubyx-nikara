"""Authentication utilities: password hashing, JWT tokens, session management."""

from __future__ import annotations

import os
from datetime import UTC, datetime, timedelta
from typing import Optional

import bcrypt
from jose import JWTError, jwt
from pydantic import BaseModel


class TokenData(BaseModel):
    sub: str  # user_id
    exp: datetime


MAX_PASSWORD_BYTES = 72  # limite de bcrypt : au-delà, refuser plutôt que tronquer silencieusement
TOKEN_TTL = timedelta(hours=24)
# Hash factice pour égaliser le temps de réponse quand l'email est inconnu (anti-énumération par timing).
_DUMMY_HASH = bcrypt.hashpw(b"dummy-password", bcrypt.gensalt(rounds=12)).decode("utf-8")


def normalize_email(email: str) -> str:
    return email.strip().lower()


def burn_password_check(password: str) -> None:
    verify_password(password, _DUMMY_HASH)


def hash_password(password: str) -> str:
    """Hash a password using bcrypt with a salt."""
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain password against a bcrypt hash."""
    raw = plain_password.encode("utf-8")
    if len(raw) > MAX_PASSWORD_BYTES:
        return False
    return bcrypt.checkpw(raw, hashed_password.encode("utf-8"))


def get_jwt_secret() -> str:
    """Get JWT signing key from environment, required for security."""
    secret = os.getenv("JWT_SECRET_KEY")
    if not secret or len(secret) < 32:
        raise RuntimeError("JWT_SECRET_KEY manquante ou trop courte (32 caractères minimum). Générer : openssl rand -base64 32")
    return secret


def get_jwt_algorithm() -> str:
    """Get JWT algorithm to use."""
    return "HS256"


def create_access_token(user_id: str, expires_delta: Optional[timedelta] = None) -> str:
    """Create a JWT access token for the user."""
    if expires_delta is None:
        expires_delta = TOKEN_TTL

    expire = datetime.now(UTC) + expires_delta
    token_data = TokenData(sub=user_id, exp=expire)

    to_encode = {"sub": token_data.sub, "exp": token_data.exp}
    encoded_jwt = jwt.encode(to_encode, get_jwt_secret(), algorithm=get_jwt_algorithm())
    return encoded_jwt


def verify_token(token: str) -> Optional[str]:
    """Verify a JWT token and return the user_id, or None if invalid."""
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[get_jwt_algorithm()])
        user_id: str = payload.get("sub")
        if user_id is None:
            return None
        return user_id
    except JWTError:
        return None
