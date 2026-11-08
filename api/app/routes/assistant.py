"""Assistants personnels (docs/ASSISTANT.md). L'assistant **propose** un plan ; il ne lance rien tout seul.
Aucune route d'envoi, de publication ni de dépense."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response

from ..deps import IdempotencyKey
from ..schemas.assistant import PlanIn, PlanListOut, PlanOut
from ..services import assistant_actions as svc
from ..services import conversations as cv
from ..services.assistant_actions import AssistantEngine, Executors
from ..services.prospect_lookup import ProspectLookup
from .common import ERRORS
from .engine_deps import SessionId

router = APIRouter(tags=["assistant"])


def get_assistant(request: Request) -> AssistantEngine:
    return request.app.state.assistant


def get_lookup(request: Request) -> ProspectLookup:
    return request.app.state.prospects


Assistant = Annotated[AssistantEngine, Depends(get_assistant)]
Lookup = Annotated[ProspectLookup, Depends(get_lookup)]


@router.post(
    "/api/assistant/plans",
    response_model=PlanOut,
    status_code=201,
    responses={401: ERRORS[401], 409: ERRORS[409], 422: ERRORS[422], 429: ERRORS[429], 503: ERRORS[503]},
)
def create_plan(payload: PlanIn, response: Response, a: Assistant, lookup: Lookup, session_id: SessionId, key: IdempotencyKey) -> PlanOut:
    """Demande un plan à l'un des assistants (gratuit). Le plan est **proposé** : rien n'est lancé, rien n'est dépensé.
    Limite de demandes par partie (`MESSAGE_LIMIT` ensuite) ; plan inutilisable après une réparation : `INVALID_OUTPUT`, sans plan
    enregistré. Même clé : même plan, aucun nouvel appel (200)."""
    out, replay = svc.create_plan(a, lookup, session_id, key, payload)
    if replay:
        response.status_code = 200
    return out


@router.get("/api/assistant/plans", response_model=PlanListOut, responses={401: ERRORS[401]})
def list_plans(a: Assistant, session_id: SessionId) -> PlanListOut:
    """Plans de la partie, du plus récent au plus ancien, et le nombre de demandes restantes (jamais conditionné par l'argent)."""
    return svc.list_plans(a, session_id)


@router.get("/api/assistant/plans/{plan_id}", response_model=PlanOut, responses={401: ERRORS[401], 404: ERRORS[404]})
def get_plan(plan_id: str, a: Assistant, session_id: SessionId) -> PlanOut:
    """Détail d'un plan. Le plan d'une autre partie : 404."""
    return svc.get_plan(a, session_id, plan_id)


def get_executors(request: Request) -> Executors:
    st = request.app.state
    msg = None
    if st.messaging_data is not None:
        msg = cv.Messaging(eng=st.actions, rules_v2=st.rules_v2, data=st.messaging_data, prospects=st.prospects)
    return Executors(pub=st.pub, messaging=msg, searches=st.searches)


Exec = Annotated[Executors, Depends(get_executors)]
_RUN = {401: ERRORS[401], 404: ERRORS[404], 409: ERRORS[409], 422: ERRORS[422], 429: ERRORS[429], 503: ERRORS[503]}


@router.post("/api/assistant/plans/{plan_id}/confirm", response_model=PlanOut, status_code=202, responses=_RUN)
def confirm_plan(plan_id: str, response: Response, a: Assistant, ex: Exec, session_id: SessionId, key: IdempotencyKey) -> PlanOut:
    """« Oui, lancer » : exécute les tâches faisables du plan dans l'ordre, chacune par son agent (mêmes limites et mêmes prix que
    s'il les lançait lui-même). Une tâche qui échoue n'annule pas les autres (statut `PARTIAL`) ; rejouer la confirmation avec une
    autre clé retente les tâches en échec. Rien n'est envoyé ni publié. Même clé : même résultat, aucun nouveau lancement (200)."""
    out, replay = svc.confirm_plan(a, ex, session_id, plan_id, key)
    if replay:
        response.status_code = 200
    return out


@router.post("/api/assistant/plans/{plan_id}/reject", response_model=PlanOut, responses={401: ERRORS[401], 404: ERRORS[404], 409: ERRORS[409], 422: ERRORS[422]})
def reject_plan(plan_id: str, a: Assistant, session_id: SessionId, key: IdempotencyKey) -> PlanOut:
    """« Non, annuler » : aucun débit ; un plan annulé ne compte plus dans la limite de demandes. Impossible une fois lancé."""
    return svc.reject_plan(a, session_id, plan_id)
