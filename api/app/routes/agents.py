from __future__ import annotations

from fastapi import APIRouter, Request, Response

from ..deps import DB, IdempotencyKey
from ..schemas.actions import PurchaseIn, PurchaseOut
from ..schemas.agent_instances import (
    AgentInstanceOut,
    AgentInstancePatchIn,
    AgentInstancesOut,
)
from ..services import agent_instances as ai
from ..services.purchases import purchase_agent
from .common import ERRORS
from .engine_deps import Engine, SessionId

router = APIRouter(tags=["économie"])


@router.post(
    "/api/agents/purchase",
    response_model=PurchaseOut,
    status_code=201,
    responses={401: ERRORS[401], 409: ERRORS[409], 422: ERRORS[422]},
)
def purchase(payload: PurchaseIn, request: Request, response: Response, eng: Engine, session_id: SessionId, key: IdempotencyKey) -> PurchaseOut:
    """Achète un rôle débloqué (nombre de clients obtenus atteint, ou condition levée en Réel) si le solde disponible le permet.
    Le prix vient des règles serveur. Même `Idempotency-Key` : même résultat, aucun second débit (200)."""
    result, replay = purchase_agent(eng.sf, eng.rules, session_id, key, payload.role.value, request.app.state.rules_v2)
    if replay:
        response.status_code = 200
    return result


@router.get("/api/agents/instances", response_model=AgentInstancesOut, responses={401: ERRORS[401]})
def list_instances(db: DB, session_id: SessionId) -> AgentInstancesOut:
    """Instances possédées, triées par rôle puis date d'achat (docs/CONTRACTS-V2.md §2)."""
    return AgentInstancesOut(items=[ai.to_out(db, i) for i in ai.list_instances(db, session_id)])


@router.patch(
    "/api/agents/instances/{instance_id}",
    response_model=AgentInstanceOut,
    responses={401: ERRORS[401], 404: ERRORS[404], 422: ERRORS[422]},
)
def patch_instance(instance_id: str, payload: AgentInstancePatchIn, db: DB, session_id: SessionId, _key: IdempotencyKey) -> AgentInstanceOut:
    """Le joueur ne modifie que le surnom (`label`, ≤ 40 caractères)."""
    instance = ai.set_label(db, session_id, instance_id, payload.label)
    return ai.to_out(db, instance)
