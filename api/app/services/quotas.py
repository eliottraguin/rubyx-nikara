"""Quotas d'une tentative (BE04) : messages par agent, clarifications, plafond d'appels modèle.
Toutes les limites viennent de data/rules/ (rules.quotas) ; aucune valeur en dur."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..errors import ApiError, ErrorCode
from ..models import MissionAttempt, Reservation
from ..rules import Rules


def messages_used(attempt: MissionAttempt, role: str) -> int:
    return int((attempt.message_counts or {}).get(role, 0))


def messages_reserved(db: Session, attempt_id: str, role: str | None) -> int:
    """Messages en cours (réservations ACTIVE). `role=None` : clarifications."""
    q = select(func.coalesce(func.sum(Reservation.quota), 0)).where(
        Reservation.attempt_id == attempt_id, Reservation.status == "ACTIVE"
    )
    q = q.where(Reservation.role.is_(None)) if role is None else q.where(Reservation.role == role)
    return db.scalar(q)


def messages_remaining(db: Session, rules: Rules, attempt: MissionAttempt, role: str) -> int:
    left = rules.quotas.messages_per_agent_per_attempt - messages_used(attempt, role) - messages_reserved(db, attempt.id, role)
    return max(0, left)


def require_messages(db: Session, rules: Rules, attempt: MissionAttempt, role: str, needed: int = 1) -> None:
    if messages_remaining(db, rules, attempt, role) < needed:
        raise ApiError(ErrorCode.MESSAGE_LIMIT)


def clarifications_remaining(db: Session, rules: Rules, attempt: MissionAttempt) -> int:
    left = rules.quotas.clarifications_per_attempt - attempt.clarifications_used - messages_reserved(db, attempt.id, None)
    return max(0, left)


def require_clarification(db: Session, rules: Rules, attempt: MissionAttempt) -> None:
    if clarifications_remaining(db, rules, attempt) < 1:
        raise ApiError(
            ErrorCode.MESSAGE_LIMIT,
            "Les clarifications gratuites au client sont épuisées pour cette tentative.",
        )


def calls_left(rules: Rules, attempt: MissionAttempt) -> int:
    """Appels modèle encore utilisables pour les actions : plafond − appels déjà engagés − 2 réservés
    à l'évaluation du client et sa réparation."""
    q = rules.quotas
    return max(0, q.model_calls_per_attempt - q.model_calls_reserved_for_evaluation - attempt.model_calls)


def require_calls(rules: Rules, attempt: MissionAttempt, needed: int = 1) -> None:
    if calls_left(rules, attempt) < needed:
        raise ApiError(ErrorCode.MESSAGE_LIMIT, "Le plafond d'appels modèle de cette tentative est atteint.")
