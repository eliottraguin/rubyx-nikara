"""Chargement de `data/rules/rules_v2.json` (cap prospection), en plus de rules_v1 (moteur livré).

Aucune valeur n'est en dur : prix des 7 rôles, coûts et quotas des actions sur prospect, seuils de réussite,
limites, messagerie, rétention et niveaux de l'immeuble viennent du fichier. Le fichier est validé par ses
modèles stricts (`extra="forbid"`) ; un test le valide aussi par `data/schemas/rules_v2.schema.json`."""

from __future__ import annotations

import json
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field, model_validator


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class AgentRuleV2(_Strict):
    id: str
    label: str
    section: str
    price: int = Field(ge=0)
    unlock_planet: str | None


class PlanetRule(_Strict):
    id: str
    label: str
    max_reward: int = Field(ge=0)
    unit_price: int = Field(ge=0)
    requires_pass: str | None
    initially_available: bool


class QuotasV2(_Strict):
    messages_per_agent_per_attempt: int
    clarifications_per_attempt: int
    model_calls_per_attempt: int
    model_calls_reserved_for_evaluation: int
    max_plan_steps: int


class ScoringV2(_Strict):
    pass_score: int
    final_pass_score: int
    essential_failure_cap: int
    final_mission_id: str
    final_max_spend: int
    final_min_contributing_roles: int


class ProspectActionRule(_Strict):
    cost: int = Field(ge=0)
    quota_per_target: int = Field(ge=1)
    quota_key: list[str]
    target: str
    gain: int = Field(ge=0)
    counts_in_final_spend: bool


class LimitsV2(_Strict):
    prompt_max_chars: int
    business_agent_max_output_tokens: int
    client_or_lead_max_output_tokens: int
    call_timeout_seconds: int
    technical_retries: int
    provider_concurrency: int
    reservation_ttl_seconds: int
    prospects_max: int
    notes_max_chars: int
    player_instruction_max_chars: int
    draft_max_chars: int
    campaigns_max: int
    campaign_name_max_chars: int
    campaign_instruction_max_chars: int


class MessagingRules(_Strict):
    send_per_day: int
    send_per_hour: int
    send_cooldown_hours: int
    inbound_max_chars: int
    sim_turns_max: int
    reply_max_chars: int


class BuildingLevel(_Strict):
    level: int = Field(ge=1)
    min_total_earned: int = Field(ge=0)


class BuildingRules(_Strict):
    levels: list[BuildingLevel] = Field(min_length=1)

    @model_validator(mode="after")
    def _ordered(self) -> "BuildingRules":
        lv = [x.level for x in self.levels]
        th = [x.min_total_earned for x in self.levels]
        if lv != list(range(1, len(lv) + 1)):
            raise ValueError("les niveaux de l'immeuble doivent être consécutifs à partir de 1")
        if th[0] != 0 or any(b <= a for a, b in zip(th, th[1:])):
            raise ValueError("les seuils de l'immeuble doivent commencer à 0 et être strictement croissants")
        return self


class RulesV2(_Strict):
    version: str
    source: str
    supersedes: str
    initial_capital: int = Field(ge=0)
    initial_agents: list[str]
    agents: list[AgentRuleV2]
    real_mode_waives_score_unlock: list[str]
    planets: list[PlanetRule]
    quotas: QuotasV2
    scoring: ScoringV2
    prospect_actions: dict[str, ProspectActionRule]
    prospect_statuses: list[str]
    followup_days: int
    retention_days: int
    retention_notice_days: int
    limits: LimitsV2
    messaging: MessagingRules
    building: BuildingRules

    @model_validator(mode="after")
    def _coherent(self) -> "RulesV2":
        ids = [a.id for a in self.agents]
        if len(set(ids)) != len(ids):
            raise ValueError("rôle dupliqué dans rules_v2")
        if not set(self.initial_agents) <= set(ids):
            raise ValueError("agent initial inconnu")
        if not set(self.prospect_actions) <= set(ids):
            raise ValueError("action sur prospect pour un rôle inconnu")
        planet_ids = {p.id for p in self.planets}
        for a in self.agents:
            if a.unlock_planet is not None and a.unlock_planet not in planet_ids:
                raise ValueError(f"planète de déblocage inconnue pour {a.id}")
        return self

    def agent(self, role: str) -> AgentRuleV2:
        return next(a for a in self.agents if a.id == role)

    @property
    def agent_prices(self) -> dict[str, int]:
        return {a.id: a.price for a in self.agents}


def load_rules_v2(data_dir: Path, version: str = "rules_v2") -> RulesV2:
    if "/" in version or "\\" in version or ".." in version:
        raise ValueError("version de règles invalide")
    path = data_dir / "rules" / f"{version}.json"
    rules = RulesV2.model_validate(json.loads(path.read_text(encoding="utf-8")))
    if rules.version != version:
        raise ValueError(f"{path.name} déclare la version {rules.version}")
    return rules
