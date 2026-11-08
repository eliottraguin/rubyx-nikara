from __future__ import annotations

from fastapi import APIRouter, Request, Response

from ..deps import DB, CurrentSession, IdempotencyKey
from ..schemas.agent_instances import AgentInstanceOut, ShopOut, ShopPurchaseIn
from ..services.shop import shop_view
from ..services.shop_purchase import purchase_shop_item
from .common import ERRORS
from .engine_deps import Engine, SessionId

router = APIRouter(tags=["boutique"])


@router.get("/api/shop", response_model=ShopOut, responses={401: ERRORS[401]})
def get_shop(request: Request, db: DB, game: CurrentSession) -> ShopOut:
    """Catalogue de la boutique et état d'achat (gratuit à consulter)."""
    return shop_view(db, request.app.state.rules_v2, request.app.state.shop_catalog, game.mode, game.id)


@router.post(
    "/api/shop/purchase",
    response_model=AgentInstanceOut,
    status_code=201,
    responses={401: ERRORS[401], 404: ERRORS[404], 409: ERRORS[409], 422: ERRORS[422]},
)
def purchase(payload: ShopPurchaseIn, request: Request, response: Response, eng: Engine, session_id: SessionId, key: IdempotencyKey) -> AgentInstanceOut:
    """Achète une nouvelle instance au palier d'un article du catalogue. Même `Idempotency-Key` : même instance,
    aucun second achat (200)."""
    result, replay = purchase_shop_item(
        eng.sf, request.app.state.rules_v2, request.app.state.shop_catalog, request.app.state.settings.data_dir, session_id, key, payload.item_id
    )
    if replay:
        response.status_code = 200
    return result
