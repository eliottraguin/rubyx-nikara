"""Mode démo : injection d'un événement admissible. Désactivé par défaut ; protégé par un secret serveur."""

from __future__ import annotations

import hmac
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Request

from ..deps import DB, CurrentSession, IdempotencyKey
from ..errors import ApiError, ErrorCode
from ..schemas.campaign import DemoEventIn, DemoEventOut
from ..services import campaign as camp
from ..services import events as ev
from .common import ERRORS

router = APIRouter(tags=["démo"])


def require_demo_secret(
    request: Request,
    x_demo_secret: Annotated[str | None, Header(alias="X-Demo-Secret", description="Secret de démo configuré côté serveur.")] = None,
) -> None:
    """Sans `RUBIX_DEMO_SECRET` la route n'existe pas (404) ; un secret absent ou faux est refusé de la même façon
    (commande cachée : aucune différence observable)."""
    expected = request.app.state.settings.demo_secret
    if not expected or not x_demo_secret or not hmac.compare_digest(x_demo_secret.encode(), expected.encode()):
        raise ApiError(ErrorCode.NOT_FOUND)


@router.post(
    "/api/demo/events",
    response_model=DemoEventOut,
    dependencies=[Depends(require_demo_secret)],
    responses={401: ERRORS[401], 404: ERRORS[404], 409: ERRORS[409], 422: ERRORS[422]},
)
def inject_demo_event(payload: DemoEventIn, request: Request, db: DB, game: CurrentSession, _key: IdempotencyKey) -> DemoEventOut:
    """Injecte un événement admissible (avant livraison) : nouvelle version du brief + diff ; ne touche ni note ni solde."""
    ctx = camp.ctx_from_app(request.app)
    attempt = camp.get_owned_attempt(db, game, payload.attempt_id)
    content = camp.load_content(ctx, game, attempt.mission_id)
    applied = ev.apply_event(db, ctx.rules, attempt, content, payload.event_id, demo=True)
    db.commit()
    return DemoEventOut(event=applied, attempt=camp.summarize_attempt(db, ctx.rules, attempt))
