"""BE02/BE05 : tentative, livrables, partages, livraison, reprise. Toute tentative est vérifiée contre la session (T13)."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Request, Response

from ..deps import DB, CurrentSession, IdempotencyKey
from ..schemas.campaign import ArtifactCreate, AttemptDetail, ShareCreate, SubmitCreate, SubmitOut
from ..schemas.entities import ArtifactShareOut, ArtifactVersionOut, SubmissionOut
from ..services import artifacts as art
from ..services import campaign as camp
from .common import ERRORS

router = APIRouter(tags=["tentatives et livrables"])
log = logging.getLogger("rubix.attempts")
_ERR = {401: ERRORS[401], 404: ERRORS[404], 409: ERRORS[409], 422: ERRORS[422]}


@router.get("/api/attempts/{attempt_id}", response_model=AttemptDetail, responses=_ERR)
def get_attempt(attempt_id: str, request: Request, db: DB, game: CurrentSession) -> AttemptDetail:
    """Reprise complète (F12) : brief et diff, documents, messages, versions, partages, livraisons, évaluations."""
    attempt = camp.get_owned_attempt(db, game, attempt_id)
    return art.attempt_detail(db, camp.ctx_from_app(request.app), game, attempt)


@router.post("/api/attempts/{attempt_id}/artifacts", response_model=ArtifactVersionOut, status_code=201, responses=_ERR)
def create_artifact(
    attempt_id: str, payload: ArtifactCreate, request: Request, response: Response, db: DB, game: CurrentSession, _key: IdempotencyKey
) -> ArtifactVersionOut:
    """Version manuelle ou assemblage. Les versions sont immuables : une édition crée un enfant (auteur `player`)."""
    attempt = camp.get_owned_attempt(db, game, attempt_id)
    row, created = art.create_from_request(db, camp.ctx_from_app(request.app), game, attempt, payload)
    if not created:
        response.status_code = 200
    return ArtifactVersionOut.model_validate(row)


@router.post("/api/attempts/{attempt_id}/shares", response_model=ArtifactShareOut, status_code=201, responses=_ERR)
def share_piece(
    attempt_id: str, payload: ShareCreate, request: Request, response: Response, db: DB, game: CurrentSession, _key: IdempotencyKey
) -> ArtifactShareOut:
    """Partage journalisé d'une version ou d'un document avec un rôle possédé."""
    attempt = camp.get_owned_attempt(db, game, attempt_id)
    share, created = art.share_piece(db, camp.ctx_from_app(request.app), game, attempt, payload)
    if not created:
        response.status_code = 200
    return ArtifactShareOut.model_validate(share)


@router.post("/api/attempts/{attempt_id}/submit", response_model=SubmitOut, status_code=201, responses=_ERR)
def submit(
    attempt_id: str, payload: SubmitCreate, request: Request, response: Response, db: DB, game: CurrentSession, _key: IdempotencyKey
) -> SubmitOut:
    """Fige la version (texte, version du brief, grille, empreinte), passe en EVALUATING puis lance l'évaluation serveur (BE06) :
    score, paiement et clôture calculés par le serveur. Si l'évaluation échoue, la livraison reste EVALUATING (rejouer `submit`)."""
    ctx = camp.ctx_from_app(request.app)
    attempt = camp.get_owned_attempt(db, game, attempt_id)
    sub, replayed = art.submit_attempt(db, ctx, game, attempt, payload)
    if replayed:
        response.status_code = 200
    else:
        db.commit()  # aucune transaction ouverte pendant les hooks (BE06 : appel fournisseur)
        # point d'extension : `app.state.submission_hooks` = liste de fonctions (db, rules, submission) ; un échec
        # de hook ne défait jamais la livraison (elle reste EVALUATING, récupérable).
        for hook in getattr(request.app.state, "submission_hooks", []):
            try:
                hook(db, ctx.rules, sub)
            except Exception:  # noqa: BLE001
                db.rollback()
                log.exception("submission hook failed")
    # BE06 : évaluation serveur (fournisseur simulé ou réel, hors transaction). Idempotente : sur un rejeu, elle ne fait
    # quelque chose que si la livraison est restée EVALUATING sans évaluation (reprise après panne ou sortie invalide).
    evaluator = getattr(request.app.state, "evaluator", None)
    if evaluator is not None and sub.status == "EVALUATING":
        db.commit()
        try:
            evaluator(sub.id)
        except Exception:  # noqa: BLE001 - la livraison reste figée et récupérable ; aucun détail dans la réponse
            log.exception("evaluation failed")
        db.refresh(sub)
    db.refresh(attempt)
    return SubmitOut(**SubmissionOut.model_validate(sub).model_dump(), attempt_status=attempt.status, replayed=replayed)
