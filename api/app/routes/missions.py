"""BE02 : ouverture et reprise d'une mission (le serveur fige tarif et plafond)."""

from __future__ import annotations

from fastapi import APIRouter, Request, Response

from ..deps import DB, CurrentSession, IdempotencyKey
from ..schemas.campaign import AttemptDetail
from ..services import artifacts as art
from ..services import campaign as camp
from .common import ERRORS

router = APIRouter(tags=["missions"])


@router.post(
    "/api/missions/{mission_id}/start",
    response_model=AttemptDetail,
    status_code=201,
    responses={404: ERRORS[404], 409: ERRORS[409], 401: ERRORS[401]},
)
def start_mission(mission_id: str, request: Request, response: Response, db: DB, game: CurrentSession, key: IdempotencyKey) -> AttemptDetail:
    """Ouvre une tentative (tarif et plafond figés). Rejouable : une tentative ACTIVE existante est renvoyée (200)."""
    ctx = camp.ctx_from_app(request.app)
    attempt, created = camp.start_mission(db, ctx, game, mission_id, key)
    if not created:
        response.status_code = 200
    return art.attempt_detail(db, ctx, game, attempt)


@router.post(
    "/api/missions/{mission_id}/retry",
    response_model=AttemptDetail,
    status_code=201,
    responses={404: ERRORS[404], 409: ERRORS[409], 401: ERRORS[401]},
)
def retry_mission(mission_id: str, request: Request, response: Response, db: DB, game: CurrentSession, key: IdempotencyKey) -> AttemptDetail:
    """Nouvelle tentative (compteurs neufs, historique conservé). Ne rouvre jamais une livraison figée.
    Rejouable : la même clé renvoie la même tentative (200), jamais une 2e."""
    ctx = camp.ctx_from_app(request.app)
    attempt, created = camp.retry_mission(db, ctx, game, mission_id, key)
    if not created:
        response.status_code = 200
    return art.attempt_detail(db, ctx, game, attempt)
