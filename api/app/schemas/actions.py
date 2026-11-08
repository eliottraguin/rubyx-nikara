"""Schémas des routes d'économie et d'actions (BE03/BE04)."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from .common import HangarRole, Role
from .entities import ReservationOut
from .state import Balance


class PurchaseIn(BaseModel):
    model_config = ConfigDict(extra="forbid")  # aucun prix ni solde choisi par le navigateur

    role: HangarRole | Role  # hangar du cap prospection (`scout`, `triage`, `replier`, `ads`)


class PurchaseOut(BaseModel):
    action_id: str
    role: HangarRole | Role
    price_paid: int
    purchased_at: datetime
    balance: Balance


class ActionStepOut(BaseModel):
    index: int
    kind: str  # message | purchase | …
    role: str | None = None
    status: str  # PENDING | RUNNING | DONE | FAILED | SKIPPED
    cost: int = 0
    task: str | None = None
    source_ids: list[str] = Field(default_factory=list)
    depends_on: int | None = None
    reservation_id: str | None = None
    error: dict[str, Any] | None = None
    artifact_version_id: str | None = None  # version de livrable créée par la réponse de l'agent (contribution liée)


class ActionOut(BaseModel):
    id: str
    type: str  # purchase | search | prospect_profile | …
    status: str  # PENDING | RESERVED | RUNNING | SUCCEEDED | FAILED
    steps: list[ActionStepOut]
    error: dict[str, Any] | None
    debited: int  # débit confirmé (réponses réussies seulement)
    reservations: list[ReservationOut]
    messages_remaining: dict[str, int] = Field(default_factory=dict)
    balance: Balance
    created_at: datetime
    updated_at: datetime
