"""Création de partie et construction de l'état (le serveur seul décide)."""

from __future__ import annotations

import secrets
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import CONTRACTS_VERSION
from ..deps import hash_token
from ..errors import ApiError, ErrorCode
from ..llm.base import LLMAdapter
from ..models import (
    ActionRun,
    AgentOwnership,
    GameSession,
    LedgerEntry,
    Reservation,
    utcnow,
)
from ..profile_spec import ProfileSpec
from ..rules import Rules
from ..rules_v2 import RulesV2
from ..schemas.common import Mode
from ..schemas.state import (
    ActiveActionView,
    Balance,
    CompanyOut,
    GameState,
    LLMInfo,
    SessionCreate,
    SessionInfo,
)
from . import building, clients, hangar, profile
from .purchases import REUSED_KEY, request_hash
from .search_actions import planets_view


def _aware(dt: datetime) -> datetime:
    # SQLite ne stocke pas le fuseau : les dates sont toujours en UTC.
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


def _add_game(
    db: Session, rules: Rules, payload: SessionCreate, key_hash: str | None, req_hash: str | None, profile_spec: ProfileSpec | None = None, user_id: str | None = None
) -> tuple[GameSession, str]:
    """Insère partie, capital initial (écriture de ledger) et agents initiaux, sans commit. Retourne (partie, jeton en clair)."""
    token = secrets.token_urlsafe(32)
    game = GameSession(
        token_hash=hash_token(token),
        mode=payload.mode.value,
        company={"name": payload.company_name, "profile": payload.profile},
        state="ACTIVE",
        seed=secrets.randbits(31),
        rules_version=rules.version,
        creation_key_hash=key_hash,
        creation_request_hash=req_hash,
        user_id=user_id,
    )
    db.add(game)
    db.flush()
    db.add(
        LedgerEntry(
            session_id=game.id,
            amount=rules.initial_capital,
            category="initial_capital",
            source_action=f"init:{game.id}",
            state="POSTED",
        )
    )
    for role in rules.initial_agents:
        db.add(AgentOwnership(session_id=game.id, role=role.value, price_paid=0, purchased_at=utcnow()))
    profile.add_initial_version(db, game, profile_spec, payload.profile)  # fiche v1 ; l'ancien `profile` devient `offre`
    return game, token


def create_session(db: Session, rules: Rules, payload: SessionCreate, profile_spec: ProfileSpec | None = None) -> tuple[GameSession, str]:
    """Crée une partie sans clé d'idempotence (CLI de démo, tests). Retourne (partie, jeton en clair)."""
    game, token = _add_game(db, rules, payload, None, None, profile_spec)
    db.commit()
    return game, token


def _creation_replay(db: Session, key_hash: str, req_hash: str, current_token: str | None) -> tuple[GameSession, str | None] | None:
    """Rejeu d'une création : même partie, jamais une 2e. La clé prouve que l'appelant est le créateur : si le cookie
    manque ou ne correspond plus (réponse perdue avant réception du cookie), un nouveau jeton est émis."""
    game = db.scalar(select(GameSession).where(GameSession.creation_key_hash == key_hash))
    if game is None:
        return None
    if game.creation_request_hash != req_hash:
        raise ApiError(ErrorCode.INVALID_REQUEST, REUSED_KEY)
    if current_token and hash_token(current_token) == game.token_hash:
        return game, None
    token = secrets.token_urlsafe(32)
    game.token_hash = hash_token(token)
    db.commit()
    return game, token


def create_session_idempotent(
    db: Session, rules: Rules, payload: SessionCreate, key: str, current_token: str | None, profile_spec: ProfileSpec | None = None, user_id: str | None = None
) -> tuple[GameSession, str | None, bool]:
    """Création rejouable par `Idempotency-Key`. Retourne (partie, jeton à poser en cookie ou None, rejeu)."""
    key_hash = hash_token(key)
    req_hash = request_hash(payload.model_dump(mode="json"))
    replay = _creation_replay(db, key_hash, req_hash, current_token)
    if replay is not None:
        return replay[0], replay[1], True
    try:
        game, token = _add_game(db, rules, payload, key_hash, req_hash, profile_spec, user_id)
        db.commit()
    except IntegrityError:  # deux créations simultanées avec la même clé : l'unicité n'en laisse passer qu'une
        db.rollback()
        replay = _creation_replay(db, key_hash, req_hash, current_token)
        if replay is None:
            raise
        return replay[0], replay[1], True
    return game, token, False


def balance(db: Session, session_id: str) -> Balance:
    booked = db.scalar(
        select(func.coalesce(func.sum(LedgerEntry.amount), 0)).where(
            LedgerEntry.session_id == session_id, LedgerEntry.state == "POSTED"
        )
    )
    reserved = db.scalar(
        select(func.coalesce(func.sum(Reservation.amount), 0)).where(
            Reservation.session_id == session_id, Reservation.status == "ACTIVE"
        )
    )
    return Balance(booked=booked, reserved=reserved, available=booked - reserved)


ACTIVE_ACTION_STATUSES = ("PENDING", "RESERVED", "RUNNING", "AWAITING_CONFIRMATION", "PARTIAL")


def active_actions(db: Session, session_id: str) -> list[ActiveActionView]:
    rows = db.scalars(
        select(ActionRun)
        .where(ActionRun.session_id == session_id, ActionRun.status.in_(ACTIVE_ACTION_STATUSES))
        .order_by(ActionRun.created_at, ActionRun.id)
    )
    return [
        ActiveActionView(
            id=a.id, type=a.type, status=a.status,
            created_at=_aware(a.created_at), updated_at=_aware(a.updated_at),
        )
        for a in rows
    ]


def build_state(db: Session, rules: Rules, adapter: LLMAdapter, game: GameSession, *, rules_v2: RulesV2, profile_spec: ProfileSpec, searches=None) -> GameState:
    owned = set(db.scalars(select(AgentOwnership.role).where(AgentOwnership.session_id == game.id)))
    bal = balance(db, game.id)
    return GameState(
        session=SessionInfo(
            id=game.id,
            mode=Mode(game.mode),
            company=CompanyOut(**game.company),
            state=game.state,
            seed=game.seed,
            rules_version=game.rules_version,
            created_at=_aware(game.created_at),
        ),
        balance=bal,
        hangar=hangar.hangar_view(db, rules_v2, game.mode, owned, game.id),
        active_actions=active_actions(db, game.id),
        target_profile=profile.view_for_game(db, profile_spec, game),
        clients_obtained=clients.obtained_count(db, game.id),
        building=building.building_view(db, rules_v2, game.id),
        planets=planets_view(searches, db, game.id) if searches is not None else [],
        llm=LLMInfo(provider=adapter.name, simulated=adapter.simulated),
        contracts_version=CONTRACTS_VERSION,
    )
