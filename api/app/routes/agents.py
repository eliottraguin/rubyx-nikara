from __future__ import annotations

from fastapi import APIRouter, Request, Response

from ..deps import IdempotencyKey
from ..schemas.actions import PurchaseIn, PurchaseOut
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
