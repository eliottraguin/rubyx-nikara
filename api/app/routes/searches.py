"""Recherches du bot `scout` (docs/CONTRACTS.md §11). Gratuites ; rien n'est envoyé ni publié."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response

from ..deps import IdempotencyKey
from ..schemas.searches import SearchIn, SearchListOut, SearchOut
from ..services import search_actions as svc
from ..services.search_actions import SearchEngine
from .common import ERRORS
from .engine_deps import SessionId

router = APIRouter(tags=["searches"])


def get_searches(request: Request) -> SearchEngine:
    return request.app.state.searches


Searches = Annotated[SearchEngine, Depends(get_searches)]


@router.post(
    "/api/searches",
    response_model=SearchOut,
    status_code=202,
    responses={401: ERRORS[401], 404: ERRORS[404], 409: ERRORS[409], 422: ERRORS[422], 429: ERRORS[429], 503: ERRORS[503]},
)
def create_search(payload: SearchIn, response: Response, se: Searches, session_id: SessionId, key: IdempotencyKey) -> SearchOut:
    """Lance une recherche du bot `scout` sur un lieu (gratuite : aucun débit, aucun gain). Les prospects recevables sont recopiés
    par le serveur dans le carnet (`source_ref` revérifié) ; une recherche sans résultat est valide (`DONE`, `kept: 0`).
    Erreurs : `PROFILE_INCOMPLETE` et `PLANET_LOCKED` (409), lieu inconnu (404), plafond du jour `RATE_LIMITED` (429),
    `LLM_UNAVAILABLE` (503, dont mode Réel : source non branchée), `INVALID_OUTPUT` (422). Même clé : même recherche, aucun nouvel appel (200)."""
    out, replay = svc.run(se, session_id, key, payload)
    if replay:
        response.status_code = 200
    return out


@router.get("/api/searches", response_model=SearchListOut, responses={401: ERRORS[401]})
def list_searches(se: Searches, session_id: SessionId) -> SearchListOut:
    """Recherches de la partie, de la plus récente à la plus ancienne, et le nombre de recherches restantes aujourd'hui."""
    return svc.list_searches(se, session_id)


@router.get("/api/searches/{search_id}", response_model=SearchOut, responses={401: ERRORS[401], 404: ERRORS[404]})
def get_search(search_id: str, se: Searches, session_id: SessionId) -> SearchOut:
    """Détail d'une recherche : bilan, prospects ajoutés, écartés avec leur raison. Celle d'une autre partie : 404."""
    return svc.get_search(se, session_id, search_id)
