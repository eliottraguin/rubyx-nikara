"""Exploitation protégée par le secret de démo : réinitialisation de la démo (F14) et suivi technique des appels IA.

Hors contrat OpenAPI (outils d'équipe). Sans `RUBIX_DEMO_SECRET`, ces routes n'existent pas (404, comme `/api/demo/events`)."""

from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Request, Response
from fastapi.responses import JSONResponse

from ..cli import demo as demo_ops
from ..cli import storage
from ..deps import DB, IdempotencyKey
from .demo import require_demo_secret

router = APIRouter(tags=["exploitation"], dependencies=[Depends(require_demo_secret)], include_in_schema=False)


@router.post("/api/demo/reset")
def reset_demo(
    request: Request, response: Response, db: DB, _key: IdempotencyKey, mode: Annotated[Literal["beginner", "expert"], Query()] = "beginner"
) -> JSONResponse:
    """F14 : supprime les parties de DÉMO uniquement (jamais une partie normale) puis recrée la démo seedée ; pose le cookie de la démo."""
    app = request.app
    game, token, removed = demo_ops.reset_demo(db, app.state.rules, mode)
    out = JSONResponse(
        {"session_id": game.id, "mode": game.mode, "seed": game.seed, "demo": True, "simulated": app.state.llm.simulated, "removed": removed}
    )
    out.set_cookie(app.state.settings.cookie_name, token, httponly=True, samesite="lax", secure=app.state.settings.cookie_secure, path="/")
    return out


@router.get("/api/ops/usage")
def usage(request: Request, db: DB) -> dict:
    """Tableau de suivi technique : appels, échecs, tokens mesurés / estimés (compteurs seulement, aucun contenu)."""
    return storage.usage_report(db, request.app.state.settings)
