from __future__ import annotations

from fastapi import APIRouter, Request, Response

from ..deps import IdempotencyKey
from ..schemas.profile import ProfileIn, TargetProfileOut
from ..services import profile as svc
from .common import ERRORS
from .engine_deps import SessionId

router = APIRouter(tags=["fiche entreprise et cible"])


@router.put(
    "/api/profile",
    response_model=TargetProfileOut,
    responses={401: ERRORS[401], 409: ERRORS[409], 422: ERRORS[422]},
)
def put_profile(payload: ProfileIn, request: Request, response: Response, session_id: SessionId, key: IdempotencyKey) -> TargetProfileOut:
    """Remplace la fiche entreprise et cible : crée la **version suivante** (immuable) et la renvoie (200, y compris au rejeu).
    `expected_version` périmée => `VERSION_CONFLICT`. Bornes lues dans `data/profile/` (Réel : offre, secteurs et zone requis).
    Le texte saisi est une donnée : il n'a aucun effet sur les prix, droits ni scores. Même `Idempotency-Key` + même requête :
    même version, aucune écriture."""
    out, _replay = svc.put_profile(request.app.state.session_factory, request.app.state.profile_spec, session_id, key, payload)
    return out
