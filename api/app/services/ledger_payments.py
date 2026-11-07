"""Paiement d'une livraison (BE03 ; T04, T05). Le score est calculé par le serveur ; toute récompense
suggérée par un modèle est ignorée (cette fonction ne reçoit qu'un score entier)."""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..errors import ApiError, ErrorCode
from ..models import LedgerEntry
from ..rules import Rules
from . import ledger


def target_payment(max_reward: int, score: int) -> int:
    """floor(gain_max × score / 100), en arithmétique entière (ex. max 20 : 0->0, 65->13, 100->20)."""
    if not 0 <= score <= 100:
        raise ValueError("score hors bornes")
    return (max_reward * score) // 100


def reward_source(mission_id: str, submission_id: str) -> str:
    return f"{ledger.CATEGORY_REWARD}:{mission_id}:{submission_id}"


def paid_for_mission(db: Session, session_id: str, mission_id: str) -> int:
    """Meilleur paiement déjà acquis pour la mission : somme des paiements différentiels (>= 0)."""
    return db.scalar(
        select(func.coalesce(func.sum(LedgerEntry.amount), 0)).where(
            LedgerEntry.session_id == session_id,
            LedgerEntry.category == ledger.CATEGORY_REWARD,
            LedgerEntry.source_action.startswith(f"{ledger.CATEGORY_REWARD}:{mission_id}:", autoescape=True),
        )
    )


def differential(target: int, already_paid: int) -> int:
    """Paiement supplémentaire d'une reprise : max(0, cible − meilleur paiement acquis)."""
    return max(0, target - already_paid)


@dataclass(frozen=True)
class PaymentResult:
    amount: int  # crédité par cette livraison (0 si rejeu ou score non amélioré)
    target: int
    previously_paid: int
    created: bool  # faux = rejeu de la même livraison, aucun effet


def award_submission(db: Session, rules: Rules, session_id: str, mission_id: str, submission_id: str, score: int) -> PaymentResult:
    """Crédite une livraison évaluée. Source unique `reward:<mission>:<livraison>` : rejouer l'id d'une
    livraison ne rapporte rien (T04). Reprise : seul le différentiel est crédité (T05).

    Ouvre sa propre section critique ; l'appelant valide ensuite (`db.commit()`)."""
    mission = next((m for m in rules.missions if m.id == mission_id), None)
    if mission is None:
        raise ApiError(ErrorCode.NOT_FOUND)
    ledger.begin_immediate(db)
    target = target_payment(mission.max_reward, score)
    source = reward_source(mission_id, submission_id)
    existing = db.scalar(select(LedgerEntry).where(LedgerEntry.source_action == source))
    if existing is not None:
        if existing.session_id != session_id:
            raise ApiError(ErrorCode.INVALID_STATE)
        return PaymentResult(amount=0, target=target, previously_paid=paid_for_mission(db, session_id, mission_id) - existing.amount, created=False)
    previous = paid_for_mission(db, session_id, mission_id)
    amount = differential(target, previous)
    # Une ligne est écrite même à 0 : elle verrouille la source et explique la variation (journal).
    ledger.post_entry(db, session_id, amount, ledger.CATEGORY_REWARD, source)
    return PaymentResult(amount=amount, target=target, previously_paid=previous, created=True)
