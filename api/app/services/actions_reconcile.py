"""Réconciliation au démarrage (BE04) : `RUNNING` interrompus et réservations expirées.

Aucune réponse n'est inventée : une action interrompue ne débite rien et ne consomme aucun message
(le règlement n'a pas eu lieu)."""

from __future__ import annotations

from sqlalchemy import select

from ..errors import ErrorCode
from ..models import ActionRun, Reservation
from . import ledger
from .actions import ActionEngine, error_dict, update_step
from .conversation_actions import release_interrupted_quota

INTERRUPTED_STATUSES = ("PENDING", "RESERVED", "RUNNING")


def reconcile(eng: ActionEngine) -> dict[str, int]:
    with eng.sf() as db:
        ledger.begin_immediate(db)
        expired = ledger.release_expired(db)
        interrupted = 0
        for action in db.scalars(select(ActionRun).where(ActionRun.status.in_(INTERRUPTED_STATUSES))):
            interrupted += 1
            for rsv in db.scalars(select(Reservation).where(Reservation.action_id == action.id)):
                ledger.release(rsv)
            release_interrupted_quota(db, action)  # messagerie : la génération réservée est rendue
            error = error_dict(ErrorCode.LLM_UNAVAILABLE, "Action interrompue : rien n'a été débité, vous pouvez réessayer.", "interrupted")
            if action.steps:
                update_step(action, 0, status="FAILED", error=error)
            action.status = "FAILED"
            action.error = error
        db.commit()
        return {"interrupted": interrupted, "expired_reservations": expired}
