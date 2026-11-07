"""Chargement des règles depuis les données versionnées (data/rules/)."""

from __future__ import annotations

import json
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .schemas.common import Role


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class AgentRule(_Strict):
    id: Role
    label: str
    price: int = Field(ge=0)
    unlock_mission: str | None


class MissionRule(_Strict):
    id: str
    label: str
    max_reward: int = Field(ge=0)
    unit_price: int = Field(ge=0)
    unlocks: list[Role]
    initially_available: bool


class Quotas(_Strict):
    messages_per_agent_per_attempt: int
    clarifications_per_attempt: int
    model_calls_per_attempt: int
    model_calls_reserved_for_evaluation: int
    max_plan_steps: int


class Scoring(_Strict):
    pass_score: int
    final_pass_score: int
    essential_failure_cap: int
    final_mission_id: str
    final_max_spend: int
    final_min_contributing_roles: int


class Limits(_Strict):
    prompt_max_chars: int
    business_agent_max_output_tokens: int
    client_or_lead_max_output_tokens: int
    call_timeout_seconds: int
    technical_retries: int
    provider_concurrency: int
    reservation_ttl_seconds: int


class Rules(_Strict):
    version: str
    source: str
    initial_capital: int = Field(ge=0)
    initial_stage: str
    initial_agents: list[Role]
    agents: list[AgentRule]
    missions: list[MissionRule]
    quotas: Quotas
    scoring: Scoring
    limits: Limits

    @model_validator(mode="after")
    def _coherent(self) -> "Rules":
        ids = [a.id for a in self.agents]
        if len(set(ids)) != len(ids):
            raise ValueError("rôle dupliqué dans les règles")
        if not set(self.initial_agents) <= set(ids):
            raise ValueError("agent initial inconnu")
        mission_ids = {m.id for m in self.missions}
        if self.initial_stage not in mission_ids:
            raise ValueError("étape initiale inconnue")
        for a in self.agents:
            if a.unlock_mission is not None and a.unlock_mission not in mission_ids:
                raise ValueError(f"mission de déblocage inconnue pour {a.id}")
        return self

    def agent(self, role: str) -> AgentRule:
        return next(a for a in self.agents if a.id == role)


def load_rules(data_dir: Path, version: str) -> Rules:
    if "/" in version or "\\" in version or ".." in version:
        raise ValueError("version de règles invalide")
    path = data_dir / "rules" / f"{version}.json"
    rules = Rules.model_validate(json.loads(path.read_text(encoding="utf-8")))
    if rules.version != version:
        raise ValueError(f"{path.name} déclare la version {rules.version}")
    return rules
