"""Quotas de générations par cible (cap prospection) : `(prospect, action)`, `(conversation, rôle)`, `(campagne, rôle)`.

Mécanisme identique au quota de messages (BE04) : réservation atomique AVANT l'appel modèle (BEGIN IMMEDIATE),
règlement après (`settle`), restitution si la réponse est inexploitable (`release`). Le plafond (5, jamais 6) vient de
`rules_v2.prospect_actions` ; aucune valeur en dur. Une génération ne rapporte jamais d'argent ni de score."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from ..errors import ApiError, ErrorCode
from ..models import AgentOwnership, TargetActionUse
from ..rules_v2 import ProspectActionRule, RulesV2
from . import hangar, ledger


def _rule(rules_v2: RulesV2, action: str) -> ProspectActionRule:
    rule = rules_v2.prospect_actions.get(action)
    if rule is None:
        raise ApiError(ErrorCode.INVALID_REQUEST, "Action inconnue.")
    return rule


def quota_key(rule: ProspectActionRule, action: str) -> str:
    """Seconde moitié de la clé de quota : l'action pour un prospect, le rôle pour une conversation ou une campagne."""
    return action if rule.quota_key[1] == "action" else rule.role.value


def _row(db: Session, session_id: str, rule: ProspectActionRule, target_id: str, key: str) -> TargetActionUse | None:
    return db.scalar(
        select(TargetActionUse).where(
            TargetActionUse.session_id == session_id, TargetActionUse.kind == rule.target,
            TargetActionUse.target_id == target_id, TargetActionUse.key == key,
        )
    )


def remaining(sf: sessionmaker[Session], rules_v2: RulesV2, session_id: str, action: str, target_id: str) -> int:
    rule = _rule(rules_v2, action)
    with sf() as db:
        row = _row(db, session_id, rule, target_id, quota_key(rule, action))
        used = (row.used + row.reserved) if row else 0
    return max(0, rule.quota_per_target - used)


def reserve(sf: sessionmaker[Session], rules_v2: RulesV2, session_id: str, action: str, target_id: str) -> None:
    """Réserve une génération. `ROLE_LOCKED` si le rôle n'est pas acheté, `MESSAGE_LIMIT` au 6e essai.
    Le coût en argent est traité par le moteur d'action (ledger), pas ici."""
    rule = _rule(rules_v2, action)
    key = quota_key(rule, action)
    with sf() as db:
        ledger.begin_immediate(db)
        owned = hangar.owned_hangar_roles(rules_v2, set(db.scalars(select(AgentOwnership.role).where(AgentOwnership.session_id == session_id))))
        if rule.role.value not in owned:
            db.rollback()
            raise ApiError(ErrorCode.ROLE_LOCKED, "Cet agent n'est pas acheté.")
        row = _row(db, session_id, rule, target_id, key)
        if row is None:
            row = TargetActionUse(session_id=session_id, kind=rule.target, target_id=target_id, key=key, used=0, reserved=0)
            db.add(row)
            db.flush()
        if row.used + row.reserved >= rule.quota_per_target:
            db.rollback()
            raise ApiError(ErrorCode.MESSAGE_LIMIT, "Le quota de générations de cette cible est atteint.")
        row.reserved += 1
        db.commit()


def _move(sf: sessionmaker[Session], rules_v2: RulesV2, session_id: str, action: str, target_id: str, *, consume: bool) -> None:
    rule = _rule(rules_v2, action)
    with sf() as db:
        ledger.begin_immediate(db)
        row = _row(db, session_id, rule, target_id, quota_key(rule, action))
        if row is None or row.reserved < 1:
            db.rollback()
            raise ApiError(ErrorCode.INVALID_STATE, "Aucune génération réservée.")
        row.reserved -= 1
        if consume:
            row.used += 1
        db.commit()


def settle(sf: sessionmaker[Session], rules_v2: RulesV2, session_id: str, action: str, target_id: str) -> None:
    """La réponse est exploitable : la génération est consommée."""
    _move(sf, rules_v2, session_id, action, target_id, consume=True)


def release(sf: sessionmaker[Session], rules_v2: RulesV2, session_id: str, action: str, target_id: str) -> None:
    """Réponse inexploitable ou erreur technique : la génération est rendue (rien n'est compté)."""
    _move(sf, rules_v2, session_id, action, target_id, consume=False)
