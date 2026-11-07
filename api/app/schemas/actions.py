"""Schémas des routes d'économie et d'actions (BE03/BE04)."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from .common import HangarRole, Role
from .entities import MessageOut, ReservationOut
from .state import Balance


class PurchaseIn(BaseModel):
    model_config = ConfigDict(extra="forbid")  # aucun prix ni solde choisi par le navigateur

    role: HangarRole | Role  # hangar du cap prospection (`scout`, `triage`, `replier`, `ads`) ; rôles M1–M6 historiques tant que le moteur les utilise


class PurchaseOut(BaseModel):
    action_id: str
    role: HangarRole | Role
    price_paid: int
    purchased_at: datetime
    balance: Balance


class MessageIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: Role
    text: str = Field(min_length=1, description="Instruction au rôle (longueur maximale contrôlée par le serveur : rules.limits)")
    linked_artifact_ids: list[str] = Field(default_factory=list, max_length=20)


class ClarificationIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    question: str = Field(min_length=1)


class ActionStepOut(BaseModel):
    index: int
    kind: str  # message | plan | delegation | clarification
    role: str | None = None
    status: str  # PENDING | RUNNING | DONE | FAILED | SKIPPED
    cost: int = 0
    task: str | None = None
    source_ids: list[str] = Field(default_factory=list)
    depends_on: int | None = None
    message_id: str | None = None
    reservation_id: str | None = None
    error: dict[str, Any] | None = None
    free_credit: bool = False  # message gratuit (crédit de correction M5) : coût 0, compte dans le quota de 5
    artifact_version_id: str | None = None  # version de livrable créée par la réponse de l'agent (contribution liée)


class ActionOut(BaseModel):
    id: str
    attempt_id: str | None
    type: str  # message | lead_plan | clarification | purchase
    status: str  # PENDING | RESERVED | RUNNING | AWAITING_CONFIRMATION | SUCCEEDED | PARTIAL | FAILED
    steps: list[ActionStepOut]
    error: dict[str, Any] | None
    debited: int  # débit confirmé (réponses réussies seulement)
    pending_cost: int  # coût maximal des délégations à confirmer / reprendre
    plan_summary: str | None = None
    answer: str | None = None  # clarification
    reservations: list[ReservationOut]
    messages: list[MessageOut]
    messages_remaining: dict[str, int] = Field(default_factory=dict)
    balance: Balance
    created_at: datetime
    updated_at: datetime
