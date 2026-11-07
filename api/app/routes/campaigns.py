"""Section Pub : campagnes et kits (docs/CONTRACTS.md §7). Gratuit sauf la génération d'un kit ; **aucune route de
publication**, aucune connexion à une plateforme publicitaire, aucune dépense réelle."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, Response

from ..deps import IdempotencyKey
from ..schemas.actions import ActionOut
from ..schemas.ads import CampaignIn, CampaignListOut, CampaignOut, CampaignPatch, CampaignVersionOut, GenerateIn, VersionEditIn
from ..services import actions as actions_svc
from ..services import ad_actions, campaigns as svc
from ..services.campaigns import PubEngine
from .common import ERRORS
from .engine_deps import SessionId

router = APIRouter(tags=["pub"])


def get_pub(request: Request) -> PubEngine:
    return request.app.state.pub


Pub = Annotated[PubEngine, Depends(get_pub)]
_READ = {401: ERRORS[401], 404: ERRORS[404]}
_WRITE = {401: ERRORS[401], 404: ERRORS[404], 409: ERRORS[409], 422: ERRORS[422]}


@router.post("/api/campaigns", response_model=CampaignOut, status_code=201, responses=_WRITE)
def create_campaign(payload: CampaignIn, response: Response, pub: Pub, session_id: SessionId, key: IdempotencyKey) -> CampaignOut:
    """Crée une campagne (gratuit). `audience` dérivée de la fiche cible si absente. Au plus `limits.campaigns_max` par partie
    (409 `INVALID_STATE` au-delà). `budget_indicatif` est un texte de plan : il ne touche jamais la monnaie du jeu. Rejeu : 200."""
    out, replay = svc.create_campaign(pub, session_id, key, payload)
    if replay:
        response.status_code = 200
    return out


@router.get("/api/campaigns", response_model=CampaignListOut, responses={401: ERRORS[401]})
def list_campaigns(pub: Pub, session_id: SessionId) -> CampaignListOut:
    """Liste des campagnes de la partie (gratuit, jamais conditionné par l'argent ni le score)."""
    return svc.list_campaigns(pub, session_id)


@router.get("/api/campaigns/{campaign_id}", response_model=CampaignOut, responses=_READ)
def get_campaign(campaign_id: str, pub: Pub, session_id: SessionId) -> CampaignOut:
    """Détail et versions de kit (immuables, numérotées). Une campagne d'une autre partie : 404."""
    return svc.read_campaign(pub, session_id, campaign_id)


@router.patch("/api/campaigns/{campaign_id}", response_model=CampaignOut, responses=_WRITE)
def patch_campaign(campaign_id: str, payload: CampaignPatch, pub: Pub, session_id: SessionId, key: IdempotencyKey) -> CampaignOut:
    """Modifie `nom`, `objectif`, `plateforme`, `audience`, `budget_indicatif`, `consigne` ; `version` périmée : `VERSION_CONFLICT`."""
    return svc.patch_campaign(pub, session_id, key, campaign_id, payload)


@router.delete("/api/campaigns/{campaign_id}", status_code=204, responses=_READ)
def delete_campaign(campaign_id: str, pub: Pub, session_id: SessionId, key: IdempotencyKey) -> Response:
    """Supprime la campagne et ses versions (gratuit, jamais refusé pour manque de fonds). Rejouable par clé."""
    svc.delete_campaign(pub, session_id, key, campaign_id)
    return Response(status_code=204)


@router.post(
    "/api/campaigns/{campaign_id}/generate",
    response_model=ActionOut,
    status_code=202,
    responses={**_WRITE, 429: ERRORS[429], 503: ERRORS[503]},
)
def generate(campaign_id: str, pub: Pub, session_id: SessionId, key: IdempotencyKey, payload: GenerateIn = GenerateIn()) -> ActionOut:
    """Action `ad_campaign` (agent `ads`, coût lu dans les règles, jamais de gain) : crée une version de kit, contrôlée par code.
    Quota 5 par campagne (`MESSAGE_LIMIT` ensuite). Contrôle essentiel en échec après une réparation : `INVALID_OUTPUT`, sans débit.
    La version créée est dans `steps[0].artifact_version_id`. Même clé : aucun nouvel appel ni débit. Rien n'est publié ni dépensé."""
    action_id, prepared = ad_actions.submit_generate(pub, session_id, key, campaign_id, payload.consigne)
    if prepared is not None:
        ad_actions.execute_generate(pub, prepared)
    return actions_svc.load_action_out(pub.eng, session_id, action_id, raise_failed=True)


@router.patch(
    "/api/campaigns/{campaign_id}/versions/{version_id}",
    response_model=CampaignVersionOut,
    status_code=201,
    responses=_WRITE,
)
def edit_version(
    campaign_id: str, version_id: str, payload: VersionEditIn, response: Response, pub: Pub, session_id: SessionId, key: IdempotencyKey
) -> CampaignVersionOut:
    """Copie éditée d'un kit : nouvelle version enfant (auteur `joueur`) ; l'originale reste immuable. Gratuit. Rejeu : 200."""
    out, replay = svc.edit_version(pub, session_id, key, campaign_id, version_id, payload)
    if replay:
        response.status_code = 200
    return out


@router.get(
    "/api/campaigns/{campaign_id}/export.md",
    response_class=Response,
    responses={200: {"content": {"text/markdown": {}}, "description": "Kit au format Markdown (pièce jointe)"}, **_READ},
)
def export_markdown(
    campaign_id: str, pub: Pub, session_id: SessionId,
    version: Annotated[str | None, Query(max_length=64, description="Numéro ou identifiant de version ; dernière par défaut")] = None,
) -> Response:
    """Export Markdown d'une version, produit par le serveur (texte inerte : aucun lien ni HTML injectable). Gratuit."""
    filename, text = svc.export_markdown(pub, session_id, campaign_id, version)
    return Response(
        content=text,
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"', "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"},
    )
