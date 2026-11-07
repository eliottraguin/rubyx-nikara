"""État renvoyé à l'UI (GET /api/state, POST /api/sessions)."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .campaign import AttemptSummary, MissionStatus, Progress
from .common import Mode, Role


class CompanyOut(BaseModel):
    name: str
    profile: str | None = None


class SessionInfo(BaseModel):
    id: str
    mode: Mode
    company: CompanyOut
    state: str
    stage: str
    seed: int
    rules_version: str
    created_at: datetime


class Balance(BaseModel):
    booked: int  # solde comptabilisé
    reserved: int  # réservations actives
    available: int  # booked - reserved


class AgentView(BaseModel):
    role: Role
    label: str
    price: int
    owned: bool
    unlock_mission: str | None
    unlocked: bool = False  # mission de déblocage réussie (BE02) ; l'achat reste contrôlé par le serveur


class MissionView(BaseModel):
    id: str
    label: str
    max_reward: int
    unit_price: int
    status: MissionStatus  # dérivé des tentatives par le moteur de campagne (BE02)
    requires: str | None = None  # mission à réussir avant
    unlocks: list[Role] = []
    attempts_count: int = 0
    best_score: int | None = None
    active_attempt_id: str | None = None
    can_start: bool = False
    can_retry: bool = False


class LLMInfo(BaseModel):
    provider: str
    simulated: bool  # true => badge « mode simulé » obligatoire


class QuotaInfo(BaseModel):
    messages_per_agent_per_attempt: int
    clarifications_per_attempt: int


class ActiveActionView(BaseModel):
    """Action non terminée de la partie (à suivre via `GET /api/actions/{id}`, ou à confirmer / reprendre pour un plan)."""

    id: str
    attempt_id: str | None
    type: str  # message | lead_plan | clarification | purchase
    status: str  # PENDING | RESERVED | RUNNING | AWAITING_CONFIRMATION | PARTIAL
    created_at: datetime
    updated_at: datetime


class GameState(BaseModel):
    session: SessionInfo
    balance: Balance
    agents: list[AgentView]
    missions: list[MissionView]
    attempts: list[AttemptSummary] = []
    progress: Progress | None = None
    active_actions: list[ActiveActionView] = []
    quotas: QuotaInfo
    llm: LLMInfo
    contracts_version: str


class SessionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")  # le client ne peut envoyer ni solde, ni score, ni droits

    company_name: str = Field(min_length=1, max_length=60)
    mode: Mode
    profile: str | None = Field(default=None, max_length=200)

    @field_validator("company_name")
    @classmethod
    def _strip(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("le nom ne peut pas être vide")
        return v


class HealthOut(BaseModel):
    status: Literal["ok"]
    version: str
    contracts_version: str
    rules_version: str
    llm_provider: str
    db: Literal["ok"]
