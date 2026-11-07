"""Réconciliation au démarrage (BE04) : `RUNNING` interrompus et réservations expirées.

Aucune réponse n'est inventée : une action interrompue ne débite rien et ne consomme aucun message
(le règlement n'a pas eu lieu). Un plan du chef dont la préparation est réglée reste confirmable
(reprise sans rejouer les étapes terminées)."""

from __future__ import annotations

from sqlalchemy import select

from ..errors import ErrorCode
from ..models import ActionRun, Message, Reservation
from . import ledger
from .actions import ActionEngine, error_dict, update_step

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
            for msg in db.scalars(select(Message).where(Message.action_id == action.id, Message.status == "PENDING")):
                msg.status = "FAILED"
            error = error_dict(ErrorCode.LLM_UNAVAILABLE, "Action interrompue : rien n'a été débité, vous pouvez réessayer.", "interrupted")
            plan_ready = action.type == "lead_plan" and bool(action.steps) and action.steps[0].get("status") == "DONE"
            if plan_ready:
                # étapes en cours ou en attente : redeviennent PENDING (reprise) ; les étapes DONE restent acquises
                for s in action.steps:
                    if s.get("kind") == "delegation" and s["status"] != "DONE":
                        update_step(action, s["index"], status="PENDING", reservation_id=None)
                done = any(s["status"] == "DONE" for s in action.steps if s.get("kind") == "delegation")
                action.status = "PARTIAL" if done else "AWAITING_CONFIRMATION"
            else:
                if action.steps:
                    update_step(action, 0, status="FAILED", error=error)
                action.status = "FAILED"
            action.error = error
        db.commit()
        return {"interrupted": interrupted, "expired_reservations": expired}
