"""Achat d'un agent (BE03 ; F07, T06). Atomique : contrôle du déblocage, du solde, de l'unicité
(session, rôle) et débit dans une seule transaction d'écriture. Un double achat concurrent ne débite
et ne crée qu'une fois ; le solde disponible ne devient jamais négatif."""

from __future__ import annotations

import hashlib
import json
from datetime import UTC

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, sessionmaker

from ..errors import ApiError, ErrorCode
from ..models import ActionRun, AgentOwnership, GameSession, MissionAttempt
from ..rules import Rules
from ..rules_v2 import RulesV2
from ..schemas.actions import PurchaseOut
from . import campaign, hangar, ledger

REUSED_KEY = "Cette Idempotency-Key a déjà servi pour une autre requête."


def request_hash(payload: dict) -> str:
    return hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def missions_cleared(db: Session, session_id: str) -> set[str]:
    """Missions réussies : tentative `COMPLETED` (DATA-MODEL : AVAILABLE→ACTIVE→(EVALUATING)→COMPLETED|FAILED)."""
    return set(
        db.scalars(
            select(MissionAttempt.mission_id).where(MissionAttempt.session_id == session_id, MissionAttempt.status == "COMPLETED")
        )
    )


def owned_roles(db: Session, session_id: str) -> set[str]:
    return set(db.scalars(select(AgentOwnership.role).where(AgentOwnership.session_id == session_id)))


def _result(db: Session, session_id: str, action: ActionRun, role: str) -> PurchaseOut:
    own = db.scalar(select(AgentOwnership).where(AgentOwnership.session_id == session_id, AgentOwnership.role == role))
    assert own is not None
    return PurchaseOut(
        action_id=action.id,
        role=role,
        price_paid=own.price_paid,
        purchased_at=own.purchased_at if own.purchased_at.tzinfo else own.purchased_at.replace(tzinfo=UTC),
        balance=ledger.balance(db, session_id),
    )


def purchase_agent(
    sf: sessionmaker[Session], rules: Rules, session_id: str, key: str, role: str, rules_v2: RulesV2 | None = None
) -> tuple[PurchaseOut, bool]:
    """Retourne (résultat, rejeu?). Même clé => même résultat, aucun second débit.
    Rôles du hangar (`scout`, `triage`, `replier`, `ads`) : prix et déblocage de `rules_v2` ; sinon moteur livré (rules_v1)."""
    req_hash = request_hash({"type": "purchase", "role": role})
    with sf() as db:
        ledger.begin_immediate(db)
        existing = db.scalar(select(ActionRun).where(ActionRun.session_id == session_id, ActionRun.idempotency_key == key))
        if existing is not None:
            if existing.request_hash != req_hash or existing.type != "purchase":
                raise ApiError(ErrorCode.INVALID_REQUEST, REUSED_KEY)
            return _result(db, session_id, existing, role), True

        hangar_rule = next((a for a in rules_v2.agents if a.id.value == role), None) if rules_v2 is not None else None
        rule = hangar_rule or next((a for a in rules.agents if a.id.value == role), None)
        if rule is None:
            raise ApiError(ErrorCode.INVALID_REQUEST, "Rôle inconnu.")
        owned = owned_roles(db, session_id)
        if hangar_rule is not None:
            owned = hangar.owned_hangar_roles(rules_v2, owned)
        if role in owned:
            raise ApiError(ErrorCode.INVALID_STATE, "Cet agent est déjà possédé.")
        if hangar_rule is not None:
            game = db.get(GameSession, session_id)
            scores = hangar.best_scores_by_planet(db, rules_v2, campaign.attempts_of(db, session_id))
            if not hangar.is_unlocked(rules_v2, hangar_rule, game.mode, scores):
                raise ApiError(ErrorCode.ROLE_LOCKED, "Cet agent n'est pas encore débloqué : atteignez le score requis sur le lieu indiqué.")
        elif rule.unlock_mission is not None and rule.unlock_mission not in missions_cleared(db, session_id):
            raise ApiError(ErrorCode.ROLE_LOCKED, "Cet agent n'est pas encore débloqué : réussissez d'abord la mission requise.")
        if rule.price > ledger.available(db, session_id):
            raise ApiError(ErrorCode.INSUFFICIENT_FUNDS)

        action = ActionRun(
            session_id=session_id,
            idempotency_key=key,
            request_hash=req_hash,
            type="purchase",
            status="SUCCEEDED",
            steps=[{"index": 0, "kind": "purchase", "role": role, "status": "DONE", "cost": rule.price}],
        )
        db.add(action)
        db.add(AgentOwnership(session_id=session_id, role=role, price_paid=rule.price))
        try:
            db.flush()
            if rule.price > 0:
                ledger.post_entry(db, session_id, -rule.price, ledger.CATEGORY_PURCHASE, f"purchase:{session_id}:{role}")
            db.commit()
        except IntegrityError:  # filet de sécurité : l'unicité en base l'emporte toujours
            db.rollback()
            raise ApiError(ErrorCode.INVALID_STATE, "Cet agent est déjà possédé.") from None
        return _result(db, session_id, action, role), False
