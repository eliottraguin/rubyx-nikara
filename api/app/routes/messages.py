from __future__ import annotations

from fastapi import APIRouter

from ..deps import IdempotencyKey
from ..schemas.actions import ActionOut, ClarificationIn, MessageIn
from ..services import actions as svc
from .common import ERRORS
from .engine_deps import Engine, SessionId

router = APIRouter(tags=["actions"])
_ERR = {401: ERRORS[401], 404: ERRORS[404], 409: ERRORS[409], 422: ERRORS[422], 429: ERRORS[429], 503: ERRORS[503]}


@router.post("/api/attempts/{attempt_id}/messages", response_model=ActionOut, status_code=202, responses=_ERR)
def send_message(attempt_id: str, payload: MessageIn, eng: Engine, session_id: SessionId, key: IdempotencyKey) -> ActionOut:
    """Réserve quota + coût, appelle le rôle, règle après réponse exploitable. Une instruction au chef
    prépare un plan (`AWAITING_CONFIRMATION`) à confirmer via `POST /api/actions/{id}/confirm`.
    Même clé : même action, aucun nouvel appel ni débit. Une action échouée rejoue son erreur."""
    action_id, prepared = svc.submit_message(eng, session_id, attempt_id, key, payload.role.value, payload.text, payload.linked_artifact_ids)
    if prepared is not None:
        svc.execute_single(eng, prepared)
    return svc.load_action_out(eng, session_id, action_id, raise_failed=True)


@router.post("/api/attempts/{attempt_id}/clarifications", response_model=ActionOut, status_code=202, responses=_ERR)
def clarify(attempt_id: str, payload: ClarificationIn, eng: Engine, session_id: SessionId, key: IdempotencyKey) -> ActionOut:
    """Question factuelle au client : 2 gratuites par tentative, hors quotas des agents."""
    action_id, prepared = svc.submit_clarification(eng, session_id, attempt_id, key, payload.question)
    if prepared is not None:
        svc.execute_single(eng, prepared)
    return svc.load_action_out(eng, session_id, action_id, raise_failed=True)
