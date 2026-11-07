"""Carnet de prospection : `/api/prospects` (docs/CONTRACTS.md « 2. Carnet de prospection »).

À ne pas confondre avec le carnet de prompts (`/api/notebook`, 501). Aucune de ces routes ne touche au ledger :
consulter, trier, annoter, exporter et supprimer ne sont jamais conditionnés par l'argent ni par le score."""

from __future__ import annotations

import logging
import time
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Request, Response

from ..deps import IdempotencyKey
from ..schemas.prospects import ProspectAddIn, ProspectAddOut, ProspectDetailOut, ProspectListOut, ProspectPatchIn
from ..services import prospects as svc
from ..services import prospects_csv as csv_out
from .common import ERRORS
from .engine_deps import SessionId

router = APIRouter(tags=["carnet de prospection"])
log = logging.getLogger("rubix.prospects")

Tri = Literal["pertinence", "date_ajout", "entreprise", "statut", "fiabilite", "source"]
Ordre = Literal["asc", "desc"]


class ListParams:
    """Paramètres communs à la liste et à l'export (mêmes filtres, même tri)."""

    def __init__(
        self,
        tri: Annotated[Tri, Query(description="Critère de tri ; départage stable par `id`")] = "date_ajout",
        ordre: Annotated[Ordre | None, Query(description="Défaut : `desc` pour pertinence et date_ajout, `asc` sinon")] = None,
        statut: Annotated[str | None, Query(max_length=32)] = None,
        source: Annotated[str | None, Query(max_length=64)] = None,
        fiabilite: Annotated[str | None, Query(max_length=16)] = None,
        avec_fiche: Annotated[bool | None, Query(description="Présence d'une fiche client (jalon J)")] = None,
        avec_brouillon: Annotated[bool | None, Query(description="Présence d'un brouillon de message (jalon K)")] = None,
        a_relancer: Annotated[bool | None, Query(description="Contacté depuis plus de `followup_days` jours")] = None,
        q: Annotated[str | None, Query(max_length=100, description="Recherche : entreprise, contact, fonction, notes")] = None,
    ):
        self.tri, self.ordre = tri, ordre
        self.filters = svc.Filters(statut=statut, source=source, fiabilite=fiabilite, avec_fiche=avec_fiche, avec_brouillon=avec_brouillon, a_relancer=a_relancer, q=q)


@router.post(
    "/api/prospects",
    response_model=ProspectAddOut,
    status_code=201,
    responses={401: ERRORS[401], 404: ERRORS[404], 409: ERRORS[409], 422: ERRORS[422]},
)
def add_prospects(payload: ProspectAddIn, request: Request, response: Response, session_id: SessionId, key: IdempotencyKey) -> ProspectAddOut:
    """Ajoute au carnet des leads d'un rapport : références seulement (expédition, version de rapport, positions).
    Le serveur recopie depuis l'enregistrement renvoyé par la source et revérifie `source_ref` ; un lead non vérifiable est
    listé dans `refused` (`LEAD_UNVERIFIED`). Doublon `(source, source_ref)` : `already_present`, sans erreur. 201 si au moins
    un prospect est créé, 200 sinon et au rejeu. Carnet plein (`limits.prospects_max`) : `INVALID_STATE`, rien n'est écrit."""
    app = request.app
    out, status = svc.add_prospects(app.state.session_factory, app.state.rules_v2, app.state.sources_spec, app.state.profile_spec, session_id, key, payload)
    response.status_code = status
    return out


@router.get("/api/prospects", response_model=ProspectListOut, responses={401: ERRORS[401], 422: ERRORS[422]})
def list_prospects(
    request: Request,
    session_id: SessionId,
    params: Annotated[ListParams, Depends()],
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    cursor: Annotated[str | None, Query(max_length=512)] = None,
) -> ProspectListOut:
    """Liste côté serveur : tri, filtres, recherche, curseur ; `counts` = prospects par statut sur tout le carnet."""
    app = request.app
    return svc.list_prospects(app.state.session_factory, app.state.rules_v2, session_id, params.filters, params.tri, params.ordre, limit, cursor)


@router.get("/api/prospects/export.csv", responses={200: {"content": {"text/csv": {}}}, 401: ERRORS[401], 422: ERRORS[422]})
def export_prospects_csv(request: Request, session_id: SessionId, params: Annotated[ListParams, Depends()]) -> Response:
    """Export CSV produit par le serveur (mêmes filtres et tri que la liste) : UTF-8 avec BOM, `;`, CRLF, en-têtes français,
    formules neutralisées (préfixe `'`), `Cache-Control: no-store`. Gratuit ; journal : nombre de lignes et durée seulement."""
    start = time.monotonic()
    app = request.app
    rows, mode = svc.all_rows(app.state.session_factory, app.state.rules_v2, session_id, params.filters, params.tri, params.ordre)
    body = csv_out.render(rows)
    name = csv_out.filename(simulated=mode != "expert")
    log.info("prospects_export", extra={"event": "prospects_export", "count": len(rows), "duration_ms": int((time.monotonic() - start) * 1000)})
    return Response(
        content=body,
        media_type="text/csv; charset=utf-8",
        headers={"Cache-Control": "no-store", "Content-Disposition": f'attachment; filename="{name}"'},
    )


@router.delete("/api/prospects", status_code=204, responses={401: ERRORS[401], 422: ERRORS[422]})
def purge_prospects(request: Request, session_id: SessionId, key: IdempotencyKey) -> Response:
    """Supprime **tout le carnet** de la partie (définitif, idempotent, 204 même si vide)."""
    svc.purge_prospects(request.app.state.session_factory, session_id, key)
    return Response(status_code=204)


@router.get("/api/prospects/{prospect_id}", response_model=ProspectDetailOut, responses={401: ERRORS[401], 404: ERRORS[404]})
def get_prospect(prospect_id: str, request: Request, session_id: SessionId) -> ProspectDetailOut:
    """Détail : prospect, provenance, instantané minimisé, historique de statut (fiches et brouillons : jalons J et K)."""
    return svc.get_prospect(request.app.state.session_factory, session_id, prospect_id)


@router.patch(
    "/api/prospects/{prospect_id}",
    response_model=ProspectDetailOut,
    responses={401: ERRORS[401], 404: ERRORS[404], 409: ERRORS[409], 422: ERRORS[422]},
)
def patch_prospect(prospect_id: str, payload: ProspectPatchIn, request: Request, session_id: SessionId, key: IdempotencyKey) -> ProspectDetailOut:
    """Le joueur ne modifie que `statut` et `notes` (`version` obligatoire ; `VERSION_CONFLICT` si périmée). Transitions
    libres et horodatées ; `contacte_le` posé au premier passage à `contacte` ; « contacté » est déclaratif (rien n'est envoyé)."""
    app = request.app
    return svc.patch_prospect(app.state.session_factory, app.state.rules_v2, session_id, prospect_id, key, payload)


@router.delete("/api/prospects/{prospect_id}", status_code=204, responses={401: ERRORS[401], 404: ERRORS[404], 422: ERRORS[422]})
def delete_prospect(prospect_id: str, request: Request, session_id: SessionId, key: IdempotencyKey) -> Response:
    """Suppression définitive. Rejeu avec la même clé : 204. Prospect absent (clé neuve) ou d'une autre session : 404."""
    svc.delete_prospect(request.app.state.session_factory, session_id, prospect_id, key)
    return Response(status_code=204)
