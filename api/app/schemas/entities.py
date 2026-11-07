"""Schémas d'entités (docs/DATA-MODEL.md). Montants = entiers de jeu."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict

from .common import Mode, Role


class _Entity(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class GameSessionOut(_Entity):
    """Jamais de jeton de session ici."""

    id: str
    mode: Mode
    company: dict[str, Any]
    state: str
    stage: str
    seed: int
    rules_version: str
    created_at: datetime
    updated_at: datetime


class AgentOwnershipOut(_Entity):
    session_id: str
    role: Role
    price_paid: int
    purchased_at: datetime


class MissionDefinitionOut(_Entity):
    id: str
    version: str
    mode: Mode
    brief: str
    corpus: list[Any]
    criteria: list[Any]
    max_reward: int
    unit_price: int
    events: list[Any]
    prerequisites: list[Any]


class MissionAttemptOut(_Entity):
    id: str
    session_id: str
    mission_id: str
    brief_version: int
    status: str
    spend_cap: int | None
    message_counts: dict[str, int]
    clarifications_used: int
    model_calls: int
    attempt_no: int
    unit_price: int


class MessageOut(_Entity):
    id: str
    attempt_id: str
    role: Role
    author: str
    text: str
    linked_artifact_ids: list[str]
    status: str
    action_id: str | None
    created_at: datetime


class ArtifactVersionOut(_Entity):
    id: str
    attempt_id: str
    type: str
    content: str
    parent_id: str | None
    author: str
    sources: list[str]
    contributions: list[Any]
    created_at: datetime


class SubmissionOut(_Entity):
    id: str
    attempt_id: str
    artifact_version_id: str
    brief_version: int
    content_hash: str
    rubric: dict[str, Any]
    status: str
    created_at: datetime


class EvaluationOut(_Entity):
    id: str
    submission_id: str
    model: str
    judge_version: str
    criteria: list[Any]
    score: int | None
    evidence: list[Any]
    status: str
    report: dict[str, Any] | None = None  # BE06 : retour client, réussite, paiement (calculés par le serveur)
    created_at: datetime


class LedgerEntryOut(_Entity):
    id: str
    session_id: str
    amount: int
    category: str
    source_action: str
    state: str
    created_at: datetime


class ActionRunOut(_Entity):
    id: str
    attempt_id: str | None
    idempotency_key: str
    type: str
    reservation_id: str | None
    status: str
    steps: list[Any]
    error: dict[str, Any] | None
    created_at: datetime
    updated_at: datetime


class LLMCallOut(_Entity):
    id: str
    action_id: str
    role: Role
    model: str
    usage: dict[str, Any] | None
    usage_measured: bool
    duration_ms: int
    attempts: int
    real_cost: float | None


class NotebookEntryOut(_Entity):
    id: str
    session_id: str
    title: str
    prompt: str
    role: Role
    mission_id: str | None
    created_at: datetime


class ReservationOut(_Entity):
    id: str
    session_id: str
    action_id: str
    amount: int
    role: Role | None
    attempt_id: str | None
    quota: int
    status: str
    expires_at: datetime
    created_at: datetime


class ArtifactShareOut(_Entity):
    id: str
    attempt_id: str
    artifact_version_id: str
    role: Role
    action_id: str | None
    created_at: datetime


class AppliedEventOut(_Entity):
    id: str
    attempt_id: str
    event_id: str
    brief_version: int
    created_at: datetime
