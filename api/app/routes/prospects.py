"""Carnet de prospection : `/api/prospects` (docs/CONTRACTS.md « 2. Carnet de prospection »).

Le carnet de prompts (`/api/notebook`) est retiré (6e décision). Aucune de ces routes ne touche au ledger :
consulter, trier, annoter, exporter et supprimer ne sont jamais conditionnés par l'argent ni par le score."""

from __future__ import annotations

import logging
import time
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Request, Response
from pydantic import BaseModel, ConfigDict

from ..deps import IdempotencyKey
from ..schemas.conversations import ConversationOut
from ..schemas.prospect_drafts import (
    DraftActionIn,
    DraftEditIn,
    ProspectActionOut,
    ProspectDraftOut,
    ProspectDraftsOut,
)
from ..schemas.prospects import (
    ProspectDetailOut,
    ProspectListOut,
    ProspectPatchIn,
)
from ..services import conversations as cv
from ..services import prospect_actions as pact
from ..services import prospects as svc
from ..services import prospects_csv as csv_out
from .common import ERRORS
from .conversations import get_messaging
from .engine_deps import SessionId

router = APIRouter(tags=["carnet de prospection"])
log = logging.getLogger("rubix.prospects")

Tri = Literal[
    "pertinence",
    "date_ajout",
    "entreprise",
    "statut",
    "fiabilite",
    "source",
    "etiquette",
]
Ordre = Literal["asc", "desc"]


class ListParams:
    """Paramètres communs à la liste et à l'export (mêmes filtres, même tri)."""

    def __init__(
        self,
        tri: Annotated[
            Tri, Query(description="Critère de tri ; départage stable par `id`")
        ] = "date_ajout",
        ordre: Annotated[
            Ordre | None,
            Query(
                description="Défaut : `desc` pour pertinence et date_ajout, `asc` sinon"
            ),
        ] = None,
        statut: Annotated[str | None, Query(max_length=32)] = None,
        source: Annotated[str | None, Query(max_length=64)] = None,
        fiabilite: Annotated[str | None, Query(max_length=16)] = None,
        etiquette: Annotated[
            str | None,
            Query(
                max_length=16,
                description="correspond | a_verifier | hors_cible (jamais trié = a_verifier)",
            ),
        ] = None,
        avec_fiche: Annotated[
            bool | None, Query(description="Présence d'une fiche client (jalon J)")
        ] = None,
        avec_brouillon: Annotated[
            bool | None,
            Query(description="Présence d'un brouillon de message (jalon K)"),
        ] = None,
        a_relancer: Annotated[
            bool | None,
            Query(description="Contacté depuis plus de `followup_days` jours"),
        ] = None,
        q: Annotated[
            str | None,
            Query(
                max_length=100,
                description="Recherche : entreprise, contact, fonction, notes",
            ),
        ] = None,
    ):
        self.tri, self.ordre = tri, ordre
        self.filters = svc.Filters(
            statut=statut,
            source=source,
            fiabilite=fiabilite,
            etiquette=etiquette,
            avec_fiche=avec_fiche,
            avec_brouillon=avec_brouillon,
            a_relancer=a_relancer,
            q=q,
        )


@router.get(
    "/api/prospects",
    response_model=ProspectListOut,
    responses={401: ERRORS[401], 422: ERRORS[422]},
)
def list_prospects(
    request: Request,
    session_id: SessionId,
    params: Annotated[ListParams, Depends()],
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    cursor: Annotated[str | None, Query(max_length=512)] = None,
) -> ProspectListOut:
    """Liste côté serveur : tri, filtres, recherche, curseur ; `counts` = prospects par statut sur tout le carnet."""
    app = request.app
    return svc.list_prospects(
        app.state.session_factory,
        app.state.rules_v2,
        session_id,
        params.filters,
        params.tri,
        params.ordre,
        limit,
        cursor,
    )


@router.get(
    "/api/prospects/export.csv",
    responses={200: {"content": {"text/csv": {}}}, 401: ERRORS[401], 422: ERRORS[422]},
)
def export_prospects_csv(
    request: Request, session_id: SessionId, params: Annotated[ListParams, Depends()]
) -> Response:
    """Export CSV produit par le serveur (mêmes filtres et tri que la liste) : UTF-8 avec BOM, `;`, CRLF, en-têtes français,
    formules neutralisées (préfixe `'`), `Cache-Control: no-store`. Gratuit ; journal : nombre de lignes et durée seulement."""
    start = time.monotonic()
    app = request.app
    rows, mode = svc.all_rows(
        app.state.session_factory,
        app.state.rules_v2,
        session_id,
        params.filters,
        params.tri,
        params.ordre,
    )
    body = csv_out.render(rows)
    name = csv_out.filename(simulated=mode != "expert")
    log.info(
        "prospects_export",
        extra={
            "event": "prospects_export",
            "count": len(rows),
            "duration_ms": int((time.monotonic() - start) * 1000),
        },
    )
    return Response(
        content=body,
        media_type="text/csv; charset=utf-8",
        headers={
            "Cache-Control": "no-store",
            "Content-Disposition": f'attachment; filename="{name}"',
        },
    )


@router.delete(
    "/api/prospects", status_code=204, responses={401: ERRORS[401], 422: ERRORS[422]}
)
def purge_prospects(
    request: Request, session_id: SessionId, key: IdempotencyKey
) -> Response:
    """Supprime **tout le carnet** de la partie (définitif, idempotent, 204 même si vide)."""
    svc.purge_prospects(request.app.state.session_factory, session_id, key)
    return Response(status_code=204)


@router.get(
    "/api/prospects/{prospect_id}",
    response_model=ProspectDetailOut,
    responses={401: ERRORS[401], 404: ERRORS[404]},
)
def get_prospect(
    prospect_id: str, request: Request, session_id: SessionId
) -> ProspectDetailOut:
    """Détail : prospect, provenance, instantané minimisé, historique de statut (fiches et brouillons : jalons J et K)."""
    return svc.get_prospect(request.app.state.session_factory, session_id, prospect_id)


@router.patch(
    "/api/prospects/{prospect_id}",
    response_model=ProspectDetailOut,
    responses={401: ERRORS[401], 404: ERRORS[404], 409: ERRORS[409], 422: ERRORS[422]},
)
def patch_prospect(
    prospect_id: str,
    payload: ProspectPatchIn,
    request: Request,
    session_id: SessionId,
    key: IdempotencyKey,
) -> ProspectDetailOut:
    """Le joueur ne modifie que `statut` et `notes` (`version` obligatoire ; `VERSION_CONFLICT` si périmée). Transitions
    libres et horodatées ; `contacte_le` posé au premier passage à `contacte` ; « contacté » est déclaratif (rien n'est envoyé)."""
    app = request.app
    return svc.patch_prospect(
        app.state.session_factory,
        app.state.rules_v2,
        session_id,
        prospect_id,
        key,
        payload,
    )


@router.delete(
    "/api/prospects/{prospect_id}",
    status_code=204,
    responses={401: ERRORS[401], 404: ERRORS[404], 422: ERRORS[422]},
)
def delete_prospect(
    prospect_id: str, request: Request, session_id: SessionId, key: IdempotencyKey
) -> Response:
    """Suppression définitive. Rejeu avec la même clé : 204. Prospect absent (clé neuve) ou d'une autre session : 404."""
    svc.delete_prospect(request.app.state.session_factory, session_id, prospect_id, key)
    return Response(status_code=204)


class ContactIn(BaseModel):
    model_config = ConfigDict(extra="forbid")


@router.post(
    "/api/prospects/{prospect_id}/contact",
    response_model=ConversationOut,
    status_code=201,
    tags=["clients"],
    responses={401: ERRORS[401], 404: ERRORS[404], 409: ERRORS[409], 422: ERRORS[422]},
)
def contact_prospect(
    prospect_id: str,
    response: Response,
    m: Annotated[cv.Messaging, Depends(get_messaging)],
    session_id: SessionId,
    key: IdempotencyKey,
    _payload: ContactIn | None = None,
) -> ConversationOut:
    """« Contacter » : ouvre la conversation du prospect (même logique que `POST /api/conversations`).
    201 à la création, 200 si elle existait ou en cas de rejeu. N'envoie rien, ne change pas le statut, ne coûte rien."""
    out, created = cv.create_conversation(m, session_id, key, prospect_id)
    if not created:
        response.status_code = 200
    return out


_DRAFT_ERR = {401: ERRORS[401], 404: ERRORS[404], 409: ERRORS[409], 422: ERRORS[422], 429: ERRORS[429], 503: ERRORS[503]}
Msg = Annotated[cv.Messaging, Depends(get_messaging)]


def _run(m: cv.Messaging, session_id: str, prospect_id: str, key: str, kind: str, payload: DraftActionIn | None) -> ProspectActionOut:
    action_id, prepared = pact.submit(
        m, session_id, prospect_id, key, kind, payload.instruction if payload else None, payload.profile_version if payload else None
    )
    if prepared is not None:
        pact.execute(m, prepared)
    return pact.load_out(m, session_id, action_id, raise_failed=True)


@router.post("/api/prospects/{prospect_id}/profile", response_model=ProspectActionOut, status_code=202, tags=["clients"], responses=_DRAFT_ERR)
def prospect_profile(prospect_id: str, m: Msg, session_id: SessionId, key: IdempotencyKey, payload: DraftActionIn | None = None) -> ProspectActionOut:
    """Action `prospect_profile` (agent `replier`, coût lu dans les règles, jamais de gain) : crée une version de fiche client,
    contrôlée par code. Quota 5 par (prospect, action) (`MESSAGE_LIMIT` ensuite). Contrôle essentiel en échec après une
    réparation : `INVALID_OUTPUT`, sans débit. La version est dans `version` (et `steps[0].artifact_version_id`). Rien n'est envoyé."""
    return _run(m, session_id, prospect_id, key, "profile", payload)


@router.post("/api/prospects/{prospect_id}/message", response_model=ProspectActionOut, status_code=202, tags=["clients"], responses=_DRAFT_ERR)
def prospect_message(prospect_id: str, m: Msg, session_id: SessionId, key: IdempotencyKey, payload: DraftActionIn | None = None) -> ProspectActionOut:
    """Action `prospect_message` (agent `replier`) : crée une version de brouillon de premier message (texte que le joueur copie
    ou lie à son contact). Mêmes garanties que `profile`. Aucun envoi, aucun `mailto:`."""
    return _run(m, session_id, prospect_id, key, "message", payload)


@router.get("/api/prospects/{prospect_id}/drafts", response_model=ProspectDraftsOut, tags=["clients"], responses={401: ERRORS[401], 404: ERRORS[404]})
def prospect_drafts(prospect_id: str, m: Msg, session_id: SessionId) -> ProspectDraftsOut:
    """Versions de fiche client et de premier message du prospect (numérotées, immuables) et générations restantes. Gratuit."""
    return pact.list_drafts(m, session_id, prospect_id)


@router.patch("/api/prospects/{prospect_id}/drafts/{draft_id}", response_model=ProspectDraftOut, status_code=201, tags=["clients"], responses=_DRAFT_ERR)
def edit_prospect_draft(prospect_id: str, draft_id: str, payload: DraftEditIn, m: Msg, session_id: SessionId, key: IdempotencyKey) -> ProspectDraftOut:
    """Copie éditée par le joueur : crée une version enfant (auteur `joueur`) ; l'original reste intact. Gratuit."""
    return pact.edit(m, session_id, key, prospect_id, draft_id, payload)
