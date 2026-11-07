from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from sqlalchemy import text

from .. import CONTRACTS_VERSION, __version__
from ..cli.health import check_state
from ..deps import DB
from ..schemas.state import HealthOut

router = APIRouter(tags=["santé"])


@router.get("/api/health", response_model=HealthOut)
def health(request: Request, db: DB) -> HealthOut:
    db.execute(text("SELECT 1"))
    return HealthOut(
        status="ok",
        version=__version__,
        contracts_version=CONTRACTS_VERSION,
        rules_version=request.app.state.rules.version,
        llm_provider=request.app.state.llm.name,
        db="ok",
    )


@router.get("/api/ready", include_in_schema=False)
def ready(request: Request) -> JSONResponse:
    """Disponibilité (réplication de trafic) : base, schéma à la dernière migration, règles, fournisseur. Aucun appel réseau,
    aucun secret ni chemin dans la réponse. 200 si tout est prêt, 503 sinon. Hors contrat OpenAPI (exploitation)."""
    app = request.app
    report = check_state(app.state.engine, app.state.settings, getattr(app.state, "rules", None), getattr(app.state, "llm", None))
    return JSONResponse(report, status_code=200 if report["ok"] else 503)
