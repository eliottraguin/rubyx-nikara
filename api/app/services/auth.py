"""Comptes joueurs (ADR 0001) : hachage argon2id, normalisation d'email, plafond de tentatives, rotation du jeton.

Aucun mot de passe, hash, email ni jeton n'est journalisé ni renvoyé dans une erreur."""

from __future__ import annotations

import re
import secrets
from datetime import timedelta

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..deps import hash_token
from ..errors import ApiError, ErrorCode
from ..models import AuthAttempt, GameSession, User, utcnow

MIN_PASSWORD = 12
MAX_PASSWORD = 128
MAX_FAILURES = 10  # échecs par email (empreinte) et par fenêtre
MAX_FAILURES_IP = 30  # échecs par IP (empreinte) et par fenêtre
WINDOW = timedelta(minutes=15)
_EMAIL_RE = re.compile(r"^[^@\s]{1,64}@[^@\s]{1,255}\.[^@\s.]{2,}$")
_hasher = PasswordHasher()  # argon2id par défaut
_DUMMY_HASH = _hasher.hash("dummy-password-for-timing")  # login sur email inconnu : même coût


def normalize_email(raw: str) -> str:
    email = raw.strip().lower()
    if len(email) > 254 or not _EMAIL_RE.match(email):
        raise ApiError(ErrorCode.INVALID_REQUEST, "Adresse email invalide.")
    return email


def check_password_policy(password: str) -> None:
    if not (MIN_PASSWORD <= len(password) <= MAX_PASSWORD):
        raise ApiError(ErrorCode.INVALID_REQUEST, f"Le mot de passe doit contenir entre {MIN_PASSWORD} et {MAX_PASSWORD} caractères.")


def _throttle_keys(email: str, ip: str | None) -> list[tuple[str, int]]:
    keys = [(hash_token(f"email:{email}"), MAX_FAILURES)]
    if ip:
        keys.append((hash_token(f"ip:{ip}"), MAX_FAILURES_IP))
    return keys


def _check_throttle(db: Session, email: str, ip: str | None) -> None:
    since = utcnow() - WINDOW
    db.execute(delete(AuthAttempt).where(AuthAttempt.created_at < since))
    for key, limit in _throttle_keys(email, ip):
        n = db.scalar(select(func.count()).select_from(AuthAttempt).where(AuthAttempt.key_hash == key, AuthAttempt.created_at >= since))
        if n >= limit:
            db.commit()
            raise ApiError(ErrorCode.RATE_LIMITED, "Trop de tentatives ; réessayez dans quelques minutes.")


def _record_failure(db: Session, email: str, ip: str | None) -> None:
    for key, _ in _throttle_keys(email, ip):
        db.add(AuthAttempt(key_hash=key))
    db.commit()


def _new_token(game: GameSession) -> str:
    token = secrets.token_urlsafe(32)
    game.token_hash = hash_token(token)
    return token


def signup(db: Session, email_raw: str, password: str, anonymous_game: GameSession | None, ip: str | None) -> tuple[User, GameSession | None, str | None]:
    """Crée le compte et rattache la partie anonyme du cookie (jamais un identifiant fourni par le client).
    Retourne (compte, partie rattachée, nouveau jeton). Le jeton est renouvelé (anti-fixation)."""
    email = normalize_email(email_raw)
    check_password_policy(password)
    _check_throttle(db, email, ip)
    user = User(email=email, password_hash=_hasher.hash(password))
    db.add(user)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        _record_failure(db, email, ip)  # l'énumération d'emails par inscription est plafonnée comme le reste
        raise ApiError(ErrorCode.INVALID_REQUEST, "Inscription impossible avec ces informations.") from None
    game, token = None, None
    if anonymous_game is not None and anonymous_game.user_id is None:
        anonymous_game.user_id = user.id
        game, token = anonymous_game, _new_token(anonymous_game)
    db.commit()
    return user, game, token


def login(db: Session, email_raw: str, password: str, ip: str | None) -> tuple[User, GameSession | None, str | None]:
    """Vérifie les identifiants ; message unique en cas d'échec. Rouvre la partie la plus récente du compte avec un jeton neuf
    (le précédent est révoqué : anti-fixation)."""
    try:
        email = normalize_email(email_raw)
    except ApiError:
        raise ApiError(ErrorCode.INVALID_CREDENTIALS) from None
    _check_throttle(db, email, ip)
    user = db.scalar(select(User).where(User.email == email))
    ok = False
    try:
        ok = _hasher.verify(user.password_hash if user else _DUMMY_HASH, password) and user is not None
    except (VerificationError, InvalidHashError):
        ok = False
    if not ok or user is None:
        _record_failure(db, email, ip)
        raise ApiError(ErrorCode.INVALID_CREDENTIALS)
    if _hasher.check_needs_rehash(user.password_hash):
        user.password_hash = _hasher.hash(password)
    game = db.scalar(select(GameSession).where(GameSession.user_id == user.id).order_by(GameSession.created_at.desc(), GameSession.id))
    token = _new_token(game) if game is not None else None
    db.commit()
    return user, game, token


def logout(db: Session, game: GameSession) -> None:
    """Révoque le jeton d'une partie rattachée à un compte (le cookie volé ou resté ouvert ne marche plus).
    Une partie anonyme n'est pas touchée : elle n'a pas d'autre moyen d'être reprise."""
    if game.user_id is not None:
        game.token_hash = hash_token(secrets.token_urlsafe(32))
        db.commit()
