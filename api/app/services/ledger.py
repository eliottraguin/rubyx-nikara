"""Ledger et réservations (BE03). Montants entiers signés ; le serveur seul écrit.

Invariants (docs/DATA-MODEL.md) :
- solde disponible = solde comptabilisé (ledger POSTED) − réservations ACTIVE, jamais négatif ;
- une écriture de ledger a une `source_action` unique (pas de double débit ni double paiement) ;
- toute section critique commence par `begin_immediate` (verrou d'écriture SQLite pris AVANT la lecture
  du solde) : deux achats ou deux réservations concurrents sont sérialisés, sans course lecture/écriture.
"""

from __future__ import annotations

from datetime import timedelta

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from ..errors import ApiError, ErrorCode
from ..models import LedgerEntry, Reservation, utcnow
from ..schemas.state import Balance

CATEGORY_INITIAL = "initial_capital"
CATEGORY_PURCHASE = "purchase"
CATEGORY_COST = "action_cost"
CATEGORY_CLIENT = "client_reward"  # gain unique par client obtenu (API-S4), source `client:<session>:<prospect>`


def begin_immediate(db: Session) -> None:
    """Ouvre une transaction d'écriture (BEGIN IMMEDIATE) si aucune n'est déjà ouverte sur la connexion.

    Doit être appelé avant toute lecture qui conditionne une écriture (solde, quota, unicité)."""
    raw = db.connection().connection.dbapi_connection
    if not raw.in_transaction:
        db.execute(text("BEGIN IMMEDIATE"))


# --- soldes ---------------------------------------------------------------------------------------


def booked(db: Session, session_id: str) -> int:
    return db.scalar(
        select(func.coalesce(func.sum(LedgerEntry.amount), 0)).where(
            LedgerEntry.session_id == session_id, LedgerEntry.state == "POSTED"
        )
    )


def reserved(db: Session, session_id: str) -> int:
    return db.scalar(
        select(func.coalesce(func.sum(Reservation.amount), 0)).where(
            Reservation.session_id == session_id, Reservation.status == "ACTIVE"
        )
    )


def balance(db: Session, session_id: str) -> Balance:
    b, r = booked(db, session_id), reserved(db, session_id)
    return Balance(booked=b, reserved=r, available=b - r)


def available(db: Session, session_id: str) -> int:
    return balance(db, session_id).available


# --- écritures ------------------------------------------------------------------------------------


def post_entry(db: Session, session_id: str, amount: int, category: str, source_action: str) -> tuple[LedgerEntry, bool]:
    """Écrit une ligne de ledger de source unique. Retourne (ligne, créée?). Idempotent : une source
    déjà écrite est renvoyée telle quelle, sans second effet.

    Un débit qui rendrait le solde disponible négatif est refusé (INSUFFICIENT_FUNDS). L'appelant doit
    avoir libéré/réglé sa propre réservation avant de comptabiliser son débit."""
    existing = db.scalar(select(LedgerEntry).where(LedgerEntry.source_action == source_action))
    if existing is not None:
        if existing.session_id != session_id:  # ne jamais révéler ni réutiliser la ligne d'une autre partie
            raise ApiError(ErrorCode.INVALID_STATE)
        return existing, False
    if amount < 0 and available(db, session_id) + amount < 0:
        raise ApiError(ErrorCode.INSUFFICIENT_FUNDS)
    entry = LedgerEntry(session_id=session_id, amount=amount, category=category, source_action=source_action, state="POSTED")
    db.add(entry)
    db.flush()
    return entry, True


# --- réservations ---------------------------------------------------------------------------------


def reserve(
    db: Session,
    *,
    session_id: str,
    action_id: str,
    amount: int,
    role: str | None,
    ttl_seconds: int,
) -> Reservation:
    """Réserve de l'argent. Le contrôle du solde disponible est fait ici (dans la transaction
    d'écriture de l'appelant)."""
    if amount < 0:
        raise ValueError("montant de réservation négatif")
    if amount > available(db, session_id):
        raise ApiError(ErrorCode.INSUFFICIENT_FUNDS)
    rsv = Reservation(
        session_id=session_id,
        action_id=action_id,
        amount=amount,
        role=role,
        status="ACTIVE",
        expires_at=utcnow() + timedelta(seconds=ttl_seconds),
    )
    db.add(rsv)
    db.flush()
    return rsv


def release(rsv: Reservation) -> None:
    if rsv.status == "ACTIVE":
        rsv.status = "RELEASED"


def settle(rsv: Reservation) -> bool:
    """Passe une réservation ACTIVE en SETTLED. Faux si elle n'est plus active (expirée/libérée)."""
    if rsv.status != "ACTIVE":
        return False
    rsv.status = "SETTLED"
    return True


def release_expired(db: Session, session_id: str | None = None) -> int:
    """Réconciliation : libère les réservations ACTIVE dont l'échéance est dépassée."""
    q = select(Reservation).where(Reservation.status == "ACTIVE", Reservation.expires_at < utcnow())
    if session_id is not None:
        q = q.where(Reservation.session_id == session_id)
    rows = list(db.scalars(q))
    for r in rows:
        r.status = "RELEASED"
    return len(rows)
