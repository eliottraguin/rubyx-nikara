"""Moteur d'actions partagé (BE04) : appel du fournisseur hors transaction, journal d'appels, lecture d'une action.

Les actions elles-mêmes (recherche, brouillons de prospect, messagerie, pub, assistants) vivent dans leurs services ; elles
suivent toutes le même schéma : réserver (argent + quota par cible) → commit → appeler → régler dans une NOUVELLE
transaction. Aucune transaction de base n'est ouverte pendant l'appel au fournisseur. Garanties :
- idempotence : même `(session, Idempotency-Key)` => même `ActionRun`, aucun nouvel appel ni débit ;
- erreur technique => aucun débit, aucun quota consommé, réservation libérée (action FAILED) ;
- le serveur ne lit que le texte de la réponse : toute récompense suggérée par le modèle est ignorée.
"""

from __future__ import annotations

import asyncio
import copy
import threading
import time
from dataclasses import dataclass, field
from datetime import UTC
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from ..errors import ApiError, ErrorCode
from ..llm.base import LLMAdapter, LLMRequest, LLMResponse, LLMStatus
from ..models import ActionRun, LLMCall, Reservation
from ..profile_spec import ProfileSpec
from ..rules import Rules
from ..schemas.actions import ActionOut, ActionStepOut
from ..schemas.entities import ReservationOut
from . import ledger
from .purchases import REUSED_KEY


@dataclass
class ActionEngine:
    sf: sessionmaker[Session]
    rules: Rules
    llm: LLMAdapter
    profile_spec: ProfileSpec | None = None  # bornes/exemples de la fiche entreprise (bloc de données des agents, API-H2)
    semaphore: threading.BoundedSemaphore = field(init=False)

    def __post_init__(self) -> None:
        # Concurrence fournisseur : rules.limits.provider_concurrency appels simultanés au plus.
        self.semaphore = threading.BoundedSemaphore(self.rules.limits.provider_concurrency)


# --- utilitaires ------------------------------------------------------------------------------------


def aware(dt):  # noqa: ANN001, ANN201
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


def find_action(db: Session, session_id: str, key: str) -> ActionRun | None:
    return db.scalar(select(ActionRun).where(ActionRun.session_id == session_id, ActionRun.idempotency_key == key))


def replay_of(db: Session, session_id: str, key: str, req_hash: str) -> str | None:
    """Id de l'action déjà créée avec cette clé (rejeu : aucun nouvel appel ni débit) ; clé réutilisée pour une autre requête : refus."""
    existing = find_action(db, session_id, key)
    if existing is None:
        return None
    if existing.request_hash != req_hash:
        raise ApiError(ErrorCode.INVALID_REQUEST, REUSED_KEY)
    return existing.id


def update_step(action: ActionRun, index: int, **fields: Any) -> None:
    steps = copy.deepcopy(action.steps)
    steps[index].update(fields)
    action.steps = steps  # réaffectation : le JSON n'est pas suivi en place


def error_dict(code: ErrorCode, message: str | None = None, reason: str | None = None) -> dict[str, Any]:
    err = ApiError(code, message)
    out: dict[str, Any] = {"code": code.value, "message": err.message}
    if reason:
        out["reason"] = reason
    return out


# --- appel fournisseur (hors transaction) -----------------------------------------------------------


@dataclass
class Outcome:
    response: LLMResponse | None
    error: dict[str, Any] | None
    calls: int  # appels réellement émis (retry technique compris)
    duration_ms: int = 0

    @property
    def ok(self) -> bool:
        return self.response is not None and self.error is None


def call_provider(eng: ActionEngine, request: LLMRequest, extra_calls_allowed: int) -> Outcome:
    """Timeout `limits.call_timeout_seconds`, `limits.technical_retries` nouvelle(s) tentative(s) technique(s)
    (dans la limite du plafond d'appels). Une sortie invalide n'est pas retentée. Ne touche pas la base."""
    lim = eng.rules.limits
    if not eng.semaphore.acquire(timeout=lim.call_timeout_seconds):
        return Outcome(None, error_dict(ErrorCode.RATE_LIMITED), calls=0)
    start = time.monotonic()
    calls = 0
    error: dict[str, Any] | None = None
    try:
        attempts = 1 + max(0, min(lim.technical_retries, extra_calls_allowed))
        for _ in range(attempts):
            calls += 1
            try:
                resp = asyncio.run(asyncio.wait_for(eng.llm.generate(request), timeout=lim.call_timeout_seconds))
            except Exception:  # noqa: BLE001 - timeout, réseau, bug fournisseur : tous techniques, jamais détaillés
                error = error_dict(ErrorCode.LLM_UNAVAILABLE)
                continue
            if resp.status == LLMStatus.OK and resp.content.strip():
                return Outcome(resp, None, calls, int((time.monotonic() - start) * 1000))
            if resp.status in (LLMStatus.INVALID_OUTPUT, LLMStatus.OK):  # OK ici = contenu vide : inexploitable, non retenté
                return Outcome(None, error_dict(ErrorCode.INVALID_OUTPUT), calls, int((time.monotonic() - start) * 1000))
            error = error_dict(ErrorCode.LLM_UNAVAILABLE)
        return Outcome(None, error, calls, int((time.monotonic() - start) * 1000))
    finally:
        eng.semaphore.release()


def log_call(db: Session, eng: ActionEngine, action_id: str, role: str, outcome: Outcome) -> None:
    resp = outcome.response
    db.add(
        LLMCall(
            action_id=action_id,
            role=role,
            model=eng.llm.name,
            usage=resp.usage.model_dump() if resp and resp.usage else None,
            usage_measured=bool(resp and resp.usage and resp.usage.measured),
            duration_ms=outcome.duration_ms,
            attempts=max(1, outcome.calls),
            versions={"rules": eng.rules.version},
        )
    )


def _fail(db: Session, action: ActionRun, error: dict[str, Any], step_index: int = 0) -> None:
    """Échec sans débit : réservations de l'action libérées, étape et action marquées FAILED."""
    for rsv in db.scalars(select(Reservation).where(Reservation.action_id == action.id)):
        ledger.release(rsv)
    if action.steps:
        update_step(action, step_index, status="FAILED", error=error)
    action.status = "FAILED"
    action.error = error


# --- lecture ----------------------------------------------------------------------------------------


def build_action_out(eng: ActionEngine, db: Session, action: ActionRun) -> ActionOut:
    steps = [ActionStepOut(**{k: v for k, v in s.items() if k in ActionStepOut.model_fields}) for s in action.steps]
    debited = sum(s.cost for s in steps if s.status == "DONE")
    rsvs = db.scalars(select(Reservation).where(Reservation.action_id == action.id).order_by(Reservation.created_at, Reservation.id))
    return ActionOut(
        id=action.id,
        type=action.type,
        status=action.status,
        steps=steps,
        error=action.error,
        debited=debited,
        reservations=[_rsv_out(r) for r in rsvs],
        messages_remaining={},
        balance=ledger.balance(db, action.session_id),
        created_at=aware(action.created_at),
        updated_at=aware(action.updated_at),
    )


def _rsv_out(r: Reservation) -> ReservationOut:
    out = ReservationOut.model_validate(r)
    return out.model_copy(update={"expires_at": aware(r.expires_at), "created_at": aware(r.created_at)})


def load_action_out(eng: ActionEngine, session_id: str, action_id: str, *, raise_failed: bool = False) -> ActionOut:
    """Lit une action de la partie (NOT_FOUND sinon). `raise_failed` : rejoue l'erreur stockée d'une action
    échouée (même clé ⇒ même résultat, erreur comprise)."""
    with eng.sf() as db:
        action = db.get(ActionRun, action_id)
        if action is None or action.session_id != session_id:
            raise ApiError(ErrorCode.NOT_FOUND)
        if raise_failed and action.status == "FAILED" and action.error:
            raise ApiError(ErrorCode(action.error["code"]), action.error.get("message"))
        return build_action_out(eng, db, action)
