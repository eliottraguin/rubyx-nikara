"""Délégations du chef d'équipe (BE04, RULES §4) : plan borné, confirmation séparée, reprise partielle.

- L'instruction au chef consomme 1 de ses 5 messages et paie la PRÉPARATION du plan (`actions.py`).
- Le plan (≤ `quotas.max_plan_steps` étapes, rôles possédés, pas de chef→chef ni de client, dépendances
  sans cycle, pièces de la tentative) est validé par le serveur ; sortie invalide ⇒ rien n'est débité.
- `confirm` ne replanifie jamais : il réserve le surcoût des étapes restantes, les exécute une à une
  (chacune consomme un message du destinataire + son tarif), conserve le résultat partiel, libère les
  réservations inutilisées. Une nouvelle confirmation reprend sans rejouer les étapes terminées.
"""

from __future__ import annotations

import json
import re
from collections import Counter
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..errors import ApiError, ErrorCode
from ..llm.base import LLMRequest
from ..models import ActionRun, GameSession, Message, MissionAttempt, Reservation
from ..schemas.common import Role
from ..schemas.plan import LeadPlan
from . import artifacts, events, ledger, quotas
from . import profile as profile_svc
from .actions import (
    ActionEngine,
    call_provider,
    check_spend_cap,
    error_dict,
    find_action,
    get_attempt,
    known_source_ids,
    log_call,
    max_tokens,
    source_context,
    update_step,
)
from .purchases import REUSED_KEY, owned_roles

_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE)


def apply_plan(db: Session, eng: ActionEngine, game: GameSession, attempt: MissionAttempt, content: str) -> tuple[list[dict[str, Any]] | None, str, dict[str, Any] | None]:
    """Valide la sortie du chef. Retourne (étapes de délégation, résumé, erreur). Aucun code exécuté."""

    def invalid(reason: str) -> tuple[None, str, dict[str, Any]]:
        return None, "", error_dict(ErrorCode.INVALID_OUTPUT, "Le plan proposé par le chef est invalide ; rien n'a été débité.", reason)

    try:
        plan = LeadPlan.model_validate_json(_FENCE.sub("", content.strip()))
    except Exception:  # noqa: BLE001 - ValidationError : 3e délégation, chef→chef, dépendance cyclique, JSON illisible
        return invalid("plan_schema")
    if len(plan.steps) > eng.rules.quotas.max_plan_steps:
        return invalid("too_many_steps")
    owned = owned_roles(db, game.id)
    known = known_source_ids(db, game, attempt)
    for step in plan.steps:
        if step.role.value not in owned:
            return invalid("role_not_owned")
        if not set(step.source_ids) <= known:
            return invalid("unknown_source")
    steps = [
        {
            "index": i + 1,
            "kind": "delegation",
            "role": s.role.value,
            "task": s.task,
            "source_ids": list(s.source_ids),
            "depends_on": s.depends_on,
            "status": "PENDING",
            "cost": attempt.unit_price,
        }
        for i, s in enumerate(plan.steps)
    ]
    return steps, plan.summary, None


def _delegations(action: ActionRun) -> list[dict[str, Any]]:
    return [s for s in action.steps if s.get("kind") == "delegation"]


def confirm_action(eng: ActionEngine, session_id: str, action_id: str, key: str) -> str:
    """Confirme (ou reprend) les délégations d'un plan. Retourne l'id de l'action ; exécution synchrone.
    Une clé de confirmation déjà reçue est un rejeu : aucun nouvel appel ni débit."""
    with eng.sf() as db:
        ledger.begin_immediate(db)
        action = db.get(ActionRun, action_id)
        if action is None or action.session_id != session_id:
            raise ApiError(ErrorCode.NOT_FOUND)
        if key in (action.confirm_keys or []):
            return action.id
        if find_action(db, session_id, key) is not None:
            raise ApiError(ErrorCode.INVALID_REQUEST, REUSED_KEY)
        plan_done = bool(action.steps) and action.steps[0].get("status") == "DONE"
        if action.type != "lead_plan" or not plan_done or action.status not in {"AWAITING_CONFIRMATION", "PARTIAL", "FAILED"}:
            raise ApiError(ErrorCode.INVALID_STATE, "Aucun plan à confirmer pour cette action.")
        todo = [s for s in _delegations(action) if s["status"] != "DONE"]
        if not todo:
            raise ApiError(ErrorCode.INVALID_STATE, "Toutes les étapes du plan sont déjà terminées.")
        attempt = get_attempt(db, session_id, action.attempt_id)
        if attempt.status != "ACTIVE":
            raise ApiError(ErrorCode.INVALID_STATE, "Cette tentative n'est pas active.")
        ledger.release_expired(db, session_id)
        owned = owned_roles(db, session_id)
        for role, needed in Counter(s["role"] for s in todo).items():
            if role not in owned:
                raise ApiError(ErrorCode.ROLE_LOCKED)
            quotas.require_messages(db, eng.rules, attempt, role, needed)
        quotas.require_calls(eng.rules, attempt, len(todo))
        # Crédit de correction (M5) : au plus une délégation gratuite par rôle ; tarif recalculé à chaque (re)confirmation.
        credited: set[str] = set()
        for s in todo:
            free = s["role"] not in credited and events.free_message_applies(db, attempt, s["role"])
            if free:
                credited.add(s["role"])
            s["cost"] = 0 if free else attempt.unit_price
            s["free_credit"] = free
            update_step(action, s["index"], cost=s["cost"], free_credit=free)
        total = sum(s["cost"] for s in todo)
        if total > ledger.available(db, session_id):
            raise ApiError(ErrorCode.INSUFFICIENT_FUNDS)
        check_spend_cap(db, attempt, total)
        for s in todo:
            rsv = ledger.reserve(
                db, session_id=session_id, action_id=action.id, amount=s["cost"], role=s["role"], attempt_id=attempt.id,
                quota=1, ttl_seconds=eng.rules.limits.reservation_ttl_seconds,
            )
            update_step(action, s["index"], status="PENDING", reservation_id=rsv.id, error=None)
        attempt.model_calls += len(todo)
        action.status = "RUNNING"
        action.error = None
        action.confirm_keys = [*(action.confirm_keys or []), key]
        extra = quotas.calls_left(eng.rules, attempt)
        indexes = [s["index"] for s in todo]
        db.commit()
    _run_delegations(eng, action_id, indexes, extra)
    return action_id


def _run_delegations(eng: ActionEngine, action_id: str, indexes: list[int], extra: int) -> None:
    first_error: dict[str, Any] | None = None
    for idx in indexes:
        # A. préparation (transaction courte)
        with eng.sf() as db:
            ledger.begin_immediate(db)
            action = db.get(ActionRun, action_id)
            if action is None or action.status != "RUNNING":
                return  # réconcilié entre-temps
            step = action.steps[idx]
            attempt = db.get(MissionAttempt, action.attempt_id)
            deps = _delegations(action)
            dep = step.get("depends_on")
            if first_error is not None or (dep is not None and deps[dep]["status"] != "DONE"):
                _skip(db, action, idx)
                db.commit()
                continue
            player = db.scalar(select(Message).where(Message.action_id == action.id, Message.author == "player"))
            mode = db.scalar(select(GameSession.mode).where(GameSession.id == attempt.session_id))
            profile_block = profile_svc.block_for_attempt(db, eng.profile_spec, attempt, mode or "beginner")
            parts = [profile_block] if profile_block else []
            parts += [f"Instruction du joueur au chef d'équipe (donnée) :\n{player.text if player else ''}", f"Tâche déléguée :\n{step['task']}"]
            if step.get("source_ids"):
                parts.append(f"Pièces :\n{source_context(db, attempt, step['source_ids'])}")
            if dep is not None:
                reply = db.get(Message, deps[dep].get("message_id")) if deps[dep].get("message_id") else None
                if reply is not None:
                    parts.append(f"Résultat de l'étape précédente :\n{reply.text}")
            request = LLMRequest(role=Role(step["role"]), context="\n\n".join(parts), allowed_tools=[], max_output_tokens=max_tokens(eng.rules, step["role"]))
            update_step(action, idx, status="RUNNING")
            rsv_id, role, cost, task, session_id = step["reservation_id"], step["role"], step["cost"], step["task"], action.session_id
            attempt_id = attempt.id
            db.commit()
        # B. appel hors transaction
        outcome = call_provider(eng, request, extra)
        extra = max(0, extra - max(0, outcome.calls - 1))
        # C. règlement atomique
        with eng.sf() as db:
            ledger.begin_immediate(db)
            action = db.get(ActionRun, action_id)
            if action is None or action.status != "RUNNING":
                return
            attempt = db.get(MissionAttempt, attempt_id)
            rsv = db.get(Reservation, rsv_id)
            attempt.model_calls = max(0, attempt.model_calls + outcome.calls - 1)
            log_call(db, eng, action.id, role, outcome, attempt)
            error = outcome.error
            if outcome.ok and rsv.status != "ACTIVE":
                error = error_dict(ErrorCode.LLM_UNAVAILABLE, reason="reservation_expired")
            if error is not None:
                ledger.release(rsv)
                update_step(action, idx, status="FAILED", error=error)
                first_error = error
            else:
                ledger.settle(rsv)
                if cost > 0:
                    ledger.post_entry(db, session_id, -cost, ledger.CATEGORY_COST, f"{ledger.CATEGORY_COST}:{attempt_id}:{action.id}:{idx}")
                counts = dict(attempt.message_counts or {})
                counts[role] = counts.get(role, 0) + 1
                attempt.message_counts = counts
                if action.steps[idx].get("free_credit"):
                    events.consume_correction_credit(attempt, role)  # consommé seulement sur réponse exploitable
                db.add(Message(attempt_id=attempt_id, role=role, author="lead", text=task, linked_artifact_ids=[], status="SENT", action_id=action.id))
                reply = Message(attempt_id=attempt_id, role=role, author="agent", text=outcome.response.content, linked_artifact_ids=[], status="SENT", action_id=action.id)
                db.add(reply)
                db.flush()
                version = artifacts.stage_agent_version(
                    db, attempt, role=role, content=outcome.response.content, action_id=action.id,
                    sources=action.steps[idx].get("source_ids") or [],
                )
                update_step(action, idx, status="DONE", message_id=reply.id, artifact_version_id=version.id, error=None)
            db.commit()
    _finalize(eng, action_id, first_error)


def _skip(db: Session, action: ActionRun, idx: int) -> None:
    rsv_id = action.steps[idx].get("reservation_id")
    rsv = db.get(Reservation, rsv_id) if rsv_id else None
    if rsv is not None:
        ledger.release(rsv)
    update_step(action, idx, status="SKIPPED")


def _finalize(eng: ActionEngine, action_id: str, first_error: dict[str, Any] | None) -> None:
    with eng.sf() as db:
        ledger.begin_immediate(db)
        action = db.get(ActionRun, action_id)
        if action is None or action.status != "RUNNING":
            return
        deleg = _delegations(action)
        for s in deleg:  # filet : toute étape non terminée libère sa réservation
            if s["status"] not in {"DONE", "FAILED", "SKIPPED"}:
                _skip(db, action, s["index"])
        deleg = _delegations(action)
        done = sum(1 for s in deleg if s["status"] == "DONE")
        if done == len(deleg):
            action.status, action.error = "SUCCEEDED", None
        else:
            action.status = "PARTIAL" if done else "FAILED"
            action.error = first_error or error_dict(ErrorCode.LLM_UNAVAILABLE, reason="step_not_completed")
        db.commit()
