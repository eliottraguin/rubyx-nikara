from __future__ import annotations

from fastapi import APIRouter

from ..schemas.actions import ActionOut
from ..services import actions as svc
from .common import ERRORS
from .engine_deps import Engine, SessionId

router = APIRouter(tags=["actions"])


@router.get("/api/actions/{action_id}", response_model=ActionOut, responses={401: ERRORS[401], 404: ERRORS[404]})
def get_action(action_id: str, eng: Engine, session_id: SessionId) -> ActionOut:
    """Statut, résultat partiel, débit confirmé et réservations d'une action de la partie."""
    return svc.load_action_out(eng, session_id, action_id)
