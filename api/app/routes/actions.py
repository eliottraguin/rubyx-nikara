from __future__ import annotations

from fastapi import APIRouter

from ..deps import IdempotencyKey
from ..schemas.actions import ActionOut
from ..services import actions as svc
from ..services.actions_lead import confirm_action
from .common import ERRORS
from .engine_deps import Engine, SessionId

router = APIRouter(tags=["actions"])


@router.get("/api/actions/{action_id}", response_model=ActionOut, responses={401: ERRORS[401], 404: ERRORS[404]})
def get_action(action_id: str, eng: Engine, session_id: SessionId) -> ActionOut:
    """Statut, résultat partiel, débit confirmé et réservations d'une action de la partie."""
    return svc.load_action_out(eng, session_id, action_id)


@router.post(
    "/api/actions/{action_id}/confirm",
    response_model=ActionOut,
    status_code=202,
    responses={401: ERRORS[401], 404: ERRORS[404], 409: ERRORS[409], 422: ERRORS[422], 503: ERRORS[503]},
)
def confirm(action_id: str, eng: Engine, session_id: SessionId, key: IdempotencyKey) -> ActionOut:
    """Confirme séparément les délégations du plan du chef et réserve leur surcoût, sans nouvelle
    planification. Après un résultat partiel, une nouvelle confirmation reprend sans rejouer les étapes
    terminées. Même clé : aucun nouvel appel ni débit."""
    confirm_action(eng, session_id, action_id, key)
    return svc.load_action_out(eng, session_id, action_id, raise_failed=True)
