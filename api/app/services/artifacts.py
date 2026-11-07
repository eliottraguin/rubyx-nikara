"""Livrables (BE05) : versions immuables, partage de pièces, livraison figée, reprise complète.

- Une version de livrable n'est jamais modifiée (trigger SQLite en plus) : une édition ou un assemblage crée un enfant.
- `submit` fige texte + version du brief + grille + empreinte, passe la tentative en EVALUATING et s'arrête là :
  le score et l'évaluation sont BE06. Point d'extension : `submission_hooks` (voir `routes/attempts.py`), appelés après commit.
- Une tentative figée (EVALUATING, COMPLETED, FAILED) n'accepte plus aucune version ni aucun partage ; une reprise
  est une NOUVELLE tentative (`campaign.retry_mission`).
- Tout contenu (livrable, document, message) est une donnée non fiable : stocké et renvoyé tel quel, jamais interprété."""

from __future__ import annotations

import hashlib
import json

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..errors import ApiError, ErrorCode
from ..models import (
    AgentOwnership,
    ArtifactShare,
    ArtifactVersion,
    Evaluation,
    GameSession,
    Message,
    MissionAttempt,
    Submission,
)
from ..schemas.campaign import (
    ArtifactCreate,
    MAX_ARTIFACT_CHARS,
    AttemptDetail,
    DocumentView,
    ShareCreate,
    SubmitCreate,
)
from ..schemas.common import Role
from ..schemas.entities import ArtifactShareOut, ArtifactVersionOut, EvaluationOut, MessageOut, SubmissionOut
from . import events as ev
from .campaign import Ctx, load_content, summarize_attempt
from .missions import ContentError, MissionContent, load_corpus, load_rubric

FROZEN_MESSAGE = "La livraison est figée : cette tentative n'accepte plus de modification. Ouvrez une reprise."


def _require_active(attempt: MissionAttempt) -> None:
    if attempt.status != "ACTIVE":
        raise ApiError(ErrorCode.INVALID_STATE, FROZEN_MESSAGE)


def _owned_version(db: Session, attempt: MissionAttempt, version_id: str) -> ArtifactVersion:
    row = db.get(ArtifactVersion, version_id)
    if row is None or row.attempt_id != attempt.id:
        raise ApiError(ErrorCode.NOT_FOUND)  # une version d'une autre tentative/session est indiscernable d'une version inconnue
    return row


def _reject_system(row: ArtifactVersion) -> None:
    if row.author == "system":
        raise ApiError(ErrorCode.INVALID_REQUEST, "Un document du corpus n'est pas un livrable : copiez-en le contenu dans une version.")


def _merge(lists: list[list]) -> list:
    out: list = []
    for items in lists:
        for item in items or []:
            if item not in out:
                out.append(item)
    return out


def add_version(
    db: Session,
    ctx: Ctx,
    game: GameSession,
    attempt: MissionAttempt,
    *,
    type: str,
    content: str,
    author: str,
    parent: ArtifactVersion | None = None,
    sources: list | None = None,
    contributions: list | None = None,
) -> tuple[ArtifactVersion, bool]:
    """Insère une version immuable (jamais de mise à jour). Retourne (version, créée).
    Rejouable : une édition identique (même parent, auteur, type, contenu) renvoie la version existante.
    La première proposition de la tentative déclenche les événements `after_first_proposal`. Commit inclus."""
    _require_active(attempt)
    existing = db.scalars(select(ArtifactVersion).where(ArtifactVersion.attempt_id == attempt.id).order_by(ArtifactVersion.created_at))
    versions = list(existing)
    for v in versions:
        if (v.parent_id == (parent.id if parent else None) and v.author == author and v.type == type and v.content == content
                and author != "agent"):
            return v, False
    first_proposal = not any(v.author == "player" for v in versions)  # les réponses d'agents ne sont pas des propositions
    row = ArtifactVersion(
        attempt_id=attempt.id,
        type=type,
        content=content,
        parent_id=parent.id if parent else None,
        author=author,
        sources=list(sources if sources is not None else (parent.sources if parent else [])),
        contributions=list(contributions if contributions is not None else (parent.contributions if parent else [])),
    )
    db.add(row)
    db.flush()
    if first_proposal and author == "player":
        ev.trigger_events(db, ctx.rules, attempt, load_content(ctx, game, attempt.mission_id), {ev.TRIGGER_FIRST_PROPOSAL})
    db.commit()
    return row, True


def create_from_request(db: Session, ctx: Ctx, game: GameSession, attempt: MissionAttempt, payload: ArtifactCreate) -> tuple[ArtifactVersion, bool]:
    """Version manuelle (création ou édition => enfant) ou assemblage ; l'auteur est toujours `player`."""
    _require_active(attempt)
    if payload.kind == "manual":
        parent = _owned_version(db, attempt, payload.parent_id) if payload.parent_id else None
        if parent is not None:
            _reject_system(parent)
        assert payload.content is not None
        return add_version(db, ctx, game, attempt, type=payload.type, content=payload.content, author="player", parent=parent)
    parts = [_owned_version(db, attempt, pid) for pid in payload.part_ids or []]
    for p in parts:
        _reject_system(p)
    text = "\n\n".join(p.content for p in parts)
    if len(text) > MAX_ARTIFACT_CHARS:
        raise ApiError(ErrorCode.INVALID_REQUEST, "L'assemblage dépasse la taille maximale d'un livrable.")
    return add_version(
        db, ctx, game, attempt,
        type=payload.type, content=text, author="player", parent=parts[0],
        sources=_merge([p.sources for p in parts]), contributions=_merge([p.contributions for p in parts]),
    )


def create_agent_version(
    db: Session,
    ctx: Ctx,
    game: GameSession,
    attempt: MissionAttempt,
    *,
    role: Role,
    content: str,
    action_id: str | None = None,
    parent_id: str | None = None,
    sources: list | None = None,
    type: str = "text",
) -> ArtifactVersion:
    """Appelée par BE04/BE06 après une réponse exploitable d'un agent : crée la version avec sa contribution liée."""
    parent = _owned_version(db, attempt, parent_id) if parent_id else None
    contributions = _merge([parent.contributions if parent else [], [{"role": role.value, "action_id": action_id}]])
    row, _ = add_version(
        db, ctx, game, attempt,
        type=type, content=content, author="agent", parent=parent,
        sources=sources if sources is not None else (parent.sources if parent else []), contributions=contributions,
    )
    return row


def stage_agent_version(db: Session, attempt: MissionAttempt, *, role: str, content: str, action_id: str, sources: list[str]) -> ArtifactVersion:
    """Version issue d'une réponse exploitable d'un agent, avec sa contribution liée (rôle + action), SANS commit :
    appelée dans la transaction de règlement de l'action (`actions.py`, `actions_lead.py`). Le serveur est seul à
    écrire `author` et `contributions` ; le joueur les hérite en éditant ou en assemblant ces versions (M6 : rôles
    contributeurs). Ne déclenche aucun événement (la « première proposition » est la première version du joueur)."""
    row = ArtifactVersion(
        attempt_id=attempt.id,
        type="text",
        content=content[:MAX_ARTIFACT_CHARS],
        parent_id=None,
        author="agent",
        sources=list(sources),
        contributions=[{"role": role, "action_id": action_id}],
    )
    db.add(row)
    db.flush()
    return row


# ---------------------------------------------------------------- documents et partages

def visible_documents(db: Session, ctx: Ctx, attempt: MissionAttempt, content: MissionContent | None) -> list[dict]:
    applied = {e.event_id for e in ev.applied_events(db, attempt.id)}
    revealed = ev.revealed_documents(db, attempt, content)
    docs = load_corpus(ctx.data_dir, attempt.mission_id, content.corpus_refs if content else None)
    return [d for d in docs if (not d.get("added_by_event") or d["added_by_event"] in applied or d["id"] in revealed)]


def share_piece(db: Session, ctx: Ctx, game: GameSession, attempt: MissionAttempt, payload: ShareCreate) -> tuple[ArtifactShare, bool]:
    """Journalise le partage d'une version ou d'un document avec un rôle possédé (l'agent n'accède qu'à ce qui est partagé)."""
    _require_active(attempt)
    owned = db.scalar(select(AgentOwnership.id).where(AgentOwnership.session_id == game.id, AgentOwnership.role == payload.role.value))
    if owned is None:
        raise ApiError(ErrorCode.ROLE_LOCKED)
    if payload.artifact_version_id:
        piece = _owned_version(db, attempt, payload.artifact_version_id)
    else:
        content = load_content(ctx, game, attempt.mission_id)
        doc = next((d for d in visible_documents(db, ctx, attempt, content) if d["id"] == payload.document_id), None)
        if doc is None:
            raise ApiError(ErrorCode.NOT_FOUND)
        # le document devient une version « document » de la tentative (auteur système) pour pouvoir être journalisé
        piece = next(
            (v for v in db.scalars(select(ArtifactVersion).where(ArtifactVersion.attempt_id == attempt.id, ArtifactVersion.type == "document"))
             if v.sources == [doc["id"]]),
            None,
        )
        if piece is None:
            body = f"{doc['title']}\n\n{doc.get('text') or ''}".strip()
            piece = ArtifactVersion(attempt_id=attempt.id, type="document", content=body, author="system", sources=[doc["id"]], contributions=[])
            db.add(piece)
            db.flush()
    existing = db.scalar(
        select(ArtifactShare).where(
            ArtifactShare.attempt_id == attempt.id, ArtifactShare.artifact_version_id == piece.id, ArtifactShare.role == payload.role.value
        )
    )
    if existing:
        db.commit()
        return existing, False
    share = ArtifactShare(attempt_id=attempt.id, artifact_version_id=piece.id, role=payload.role.value)
    db.add(share)
    db.commit()
    return share, True


# ---------------------------------------------------------------- livraison

def _fingerprint(text: str, brief_version: int, frozen: dict) -> str:
    canon = json.dumps({"text": text, "brief_version": brief_version, "frozen": frozen}, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(canon.encode()).hexdigest()


def submit_attempt(db: Session, ctx: Ctx, game: GameSession, attempt: MissionAttempt, payload: SubmitCreate) -> tuple[Submission, bool]:
    """Fige une version : texte, version du brief, grille, empreinte. Statut EVALUATING. AUCUN score ici (BE06).
    Retourne (livraison, rejouée). Une seconde livraison de la même version est rejouée sans effet."""
    if attempt.status in ("EVALUATING", "COMPLETED", "FAILED"):  # figée : la même version est rejouée, sans nouvel effet
        same = db.scalar(
            select(Submission).where(Submission.attempt_id == attempt.id, Submission.artifact_version_id == payload.artifact_version_id)
        )
        if same is not None:
            return same, True
    _require_active(attempt)
    artifact = _owned_version(db, attempt, payload.artifact_version_id)
    _reject_system(artifact)
    if payload.brief_version is not None and payload.brief_version != attempt.brief_version:
        raise ApiError(ErrorCode.VERSION_CONFLICT, "Le brief a changé depuis votre dernière lecture : relisez-le avant de livrer.")
    content = load_content(ctx, game, attempt.mission_id)
    try:
        rubric = load_rubric(ctx.data_dir, content.rubric_id if content else None)
    except ContentError as exc:
        raise exc.to_api_error() from exc
    brief = ev.build_brief(attempt, content, ev.applied_events(db, attempt.id))
    frozen = {
        "mission_id": attempt.mission_id,
        "mode": game.mode,
        "rubric_id": content.rubric_id if content else None,
        "rubric": rubric,  # null si la grille n'est pas encore rédigée : BE06 doit alors refuser d'évaluer
        "brief": brief.model_dump(mode="json"),
    }
    # compare-and-set : une seule livraison peut faire passer la tentative de ACTIVE à EVALUATING, et seulement si le
    # brief n'a pas changé depuis sa lecture (un événement concurrent ne doit pas être figé en version périmée)
    moved = db.execute(
        update(MissionAttempt)
        .where(MissionAttempt.id == attempt.id, MissionAttempt.status == "ACTIVE", MissionAttempt.brief_version == attempt.brief_version)
        .values(status="EVALUATING")
    )
    if moved.rowcount != 1:
        db.rollback()
        db.refresh(attempt)
        if attempt.status == "ACTIVE":  # le brief a changé pendant la livraison : relire avant de livrer
            raise ApiError(ErrorCode.VERSION_CONFLICT, "Le brief a changé depuis votre dernière lecture : relisez-le avant de livrer.")
        return _lost_race(db, attempt, payload)
    sub = Submission(
        attempt_id=attempt.id,
        artifact_version_id=artifact.id,
        brief_version=attempt.brief_version,
        content_hash=_fingerprint(artifact.content, attempt.brief_version, frozen),
        rubric=frozen,
        status="EVALUATING",
    )
    db.add(sub)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        return _lost_race(db, attempt, payload)
    db.refresh(attempt)
    return sub, False


def _lost_race(db: Session, attempt: MissionAttempt, payload: SubmitCreate) -> tuple[Submission, bool]:
    """Une livraison concurrente a figé la tentative juste avant nous : la même version est rejouée (comme un rejeu
    séquentiel, sans nouvel effet) ; une autre version reste refusée."""
    same = db.scalar(
        select(Submission).where(Submission.attempt_id == attempt.id, Submission.artifact_version_id == payload.artifact_version_id)
    )
    if same is not None:
        return same, True
    raise ApiError(ErrorCode.INVALID_STATE, FROZEN_MESSAGE)


# ---------------------------------------------------------------- sauvegarde / reprise (F12)

def attempt_detail(db: Session, ctx: Ctx, game: GameSession, attempt: MissionAttempt) -> AttemptDetail:
    content = load_content(ctx, game, attempt.mission_id)
    brief = ev.build_brief(attempt, content, ev.applied_events(db, attempt.id))
    docs = visible_documents(db, ctx, attempt, content)
    messages = db.scalars(select(Message).where(Message.attempt_id == attempt.id).order_by(Message.created_at))
    artifacts = db.scalars(select(ArtifactVersion).where(ArtifactVersion.attempt_id == attempt.id).order_by(ArtifactVersion.created_at))
    shares = db.scalars(select(ArtifactShare).where(ArtifactShare.attempt_id == attempt.id).order_by(ArtifactShare.created_at))
    subs = list(db.scalars(select(Submission).where(Submission.attempt_id == attempt.id).order_by(Submission.created_at)))
    evals = (
        list(db.scalars(select(Evaluation).where(Evaluation.submission_id.in_([s.id for s in subs])).order_by(Evaluation.created_at)))
        if subs
        else []
    )
    return AttemptDetail(
        attempt=summarize_attempt(db, ctx.rules, attempt),
        mission_title=content.title if content else None,
        content_available=content is not None,
        brief=brief,
        documents=[
            DocumentView(
                id=d["id"], title=d["title"], kind=d.get("kind"), date=d.get("date"),
                authority=d.get("authority"), status=d.get("status"), text=d.get("text"),
            )
            for d in docs
        ],
        messages=[MessageOut.model_validate(m) for m in messages],
        artifacts=[ArtifactVersionOut.model_validate(a) for a in artifacts],
        shares=[ArtifactShareOut.model_validate(s) for s in shares],
        submissions=[SubmissionOut.model_validate(s) for s in subs],
        evaluations=[EvaluationOut.model_validate(e) for e in evals],
    )
