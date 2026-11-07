"""Routes de docs/CONTRACTS.md pas encore livrées : 501 avec le schéma d'erreur stable.
Chaque route sera remplacée par son ticket (BE02 à BE06)."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from ..deps import require_idempotency_key
from ..errors import ApiError, ErrorCode
from .common import ERRORS

router = APIRouter(tags=["à venir (501)"], responses={501: ERRORS[501]})

_MUTATION = [Depends(require_idempotency_key)]


def _todo() -> None:
    raise ApiError(ErrorCode.NOT_IMPLEMENTED)


@router.post("/api/notebook", dependencies=_MUTATION)
def add_notebook_entry() -> None:
    _todo()


@router.get("/api/notebook")
def list_notebook() -> None:
    _todo()
