"""Achat d'une instance d'agent en boutique (docs/CONTRACTS-V2.md §2, ticket C2). Atomique : réservation
(contrôles) avant, règlement (débit) après, dans une seule transaction d'écriture ; idempotent par
`Idempotency-Key` (même clé => même instance, jamais un second achat)."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, sessionmaker

from ..errors import ApiError, ErrorCode
from ..models import ActionRun, GameSession
from ..rules_v2 import RulesV2
from ..schemas.agent_instances import AgentInstanceOut
from . import agent_instances as ai
from . import clients, hangar, ledger
from .shop import ShopCatalog

REUSED_KEY = "Cette Idempotency-Key a déjà servi pour une autre requête."


def _request_hash(payload: dict) -> str:
    return hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def purchase_shop_item(
    sf: sessionmaker[Session], rules_v2: RulesV2, catalog: ShopCatalog, data_dir: Path, session_id: str, key: str, item_id: str
) -> tuple[AgentInstanceOut, bool]:
    """Retourne (résultat, rejeu ?). Contrôles dans l'ordre du contrat : rôle débloqué (`ROLE_LOCKED`), limite
    d'instances du rôle (`INSTANCE_LIMIT`), solde (`INSUFFICIENT_FUNDS`)."""
    req_hash = _request_hash({"type": "shop_purchase", "item_id": item_id})
    with sf() as db:
        ledger.begin_immediate(db)
        existing = db.scalar(select(ActionRun).where(ActionRun.session_id == session_id, ActionRun.idempotency_key == key))
        if existing is not None:
            if existing.request_hash != req_hash or existing.type != "shop_purchase":
                raise ApiError(ErrorCode.INVALID_REQUEST, REUSED_KEY)
            instance = ai.get_owned(db, session_id, existing.steps[0]["instance_id"])
            return ai.to_out(db, instance), True

        found = catalog.find(item_id)
        if found is None:
            raise ApiError(ErrorCode.NOT_FOUND, "Article de boutique inconnu.")
        role, item = found

        game = db.get(GameSession, session_id)
        rule = rules_v2.agent(role)
        n = clients.obtained_count(db, session_id)
        if not hangar.is_unlocked(rules_v2, rule, game.mode, n):
            raise ApiError(ErrorCode.ROLE_LOCKED, hangar.unlock_condition(rule) or "Cet agent n'est pas encore débloqué.")

        if ai.count_by_role(db, session_id, role) >= rules_v2.agents_max_instances_per_role:
            raise ApiError(ErrorCode.INSTANCE_LIMIT)

        if item.price > ledger.available(db, session_id):
            raise ApiError(ErrorCode.INSUFFICIENT_FUNDS)

        instance = ai.create_instance(db, data_dir, session_id, role, item.tier, item.price, catalog.role_max_tier(role))
        action = ActionRun(
            session_id=session_id,
            idempotency_key=key,
            request_hash=req_hash,
            type="shop_purchase",
            status="SUCCEEDED",
            steps=[{"index": 0, "kind": "shop_purchase", "role": role, "item_id": item_id, "status": "DONE", "cost": item.price, "instance_id": instance.id}],
        )
        db.add(action)
        try:
            db.flush()
            if item.price > 0:
                ledger.post_entry(db, session_id, -item.price, ledger.CATEGORY_PURCHASE, f"shop_purchase:{action.id}")
            db.commit()
        except IntegrityError:  # filet de sécurité : l'unicité en base l'emporte toujours
            db.rollback()
            raise ApiError(ErrorCode.INVALID_REQUEST, REUSED_KEY) from None
        return ai.to_out(db, instance), False
