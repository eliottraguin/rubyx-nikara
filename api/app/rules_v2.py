"""Chargement de `data/rules/rules_v2.json` (cap prospection), en plus de rules_v1 (moteur livré).

Aucune valeur n'est en dur : prix des 4 rôles du hangar, coûts et quotas des actions sur prospect, seuils de réussite,
limites, messagerie, rétention et niveaux de l'immeuble viennent du fichier. Le fichier est validé par ses
modèles stricts (`extra="forbid"`) ; un test le valide aussi par `data/schemas/rules_v2.schema.json`."""

from __future__ import annotations

import json
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .schemas.common import HangarRole


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class AgentRuleV2(_Strict):
    id: HangarRole
    label: str
    section: str
    price: int = Field(ge=0)
    unlock_clients: int | None = Field(ge=1)  # nombre de clients obtenus exigé (null = disponible) ; levé en Réel pour certains rôles


class PlanetRule(_Strict):
    id: str
    label: str
    unit_price: int = Field(ge=0)  # coût affiché d'une étape d'assistant sur ce lieu (la recherche elle-même est gratuite)
    requires_pass: str | None
    initially_available: bool


class ProspectActionRule(_Strict):
    role: HangarRole  # rôle qui porte l'action (doit être possédé)
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
    searches_per_day: int = Field(ge=1)  # plafond technique de recherches du bot par jour (UTC) et par partie ; les recherches sont gratuites
    search_precision_max_chars: int = Field(ge=1)
    search_data_max_age_days: int = Field(ge=1)  # au-delà, la date de collecte d'un enregistrement le rend périmé (écarté par le code)


class MessagingRules(_Strict):
    send_per_day: int
    send_per_hour: int
    send_cooldown_hours: int
    inbound_max_chars: int
    sim_turns_max: int
    reply_max_chars: int


class BuildingLevel(_Strict):
    level: int = Field(ge=1)
    min_clients: int = Field(ge=0)  # nombre de clients obtenus à partir duquel ce niveau est atteint


class BuildingRules(_Strict):
    levels: list[BuildingLevel] = Field(min_length=1)

    @model_validator(mode="after")
    def _ordered(self) -> "BuildingRules":
        lv = [x.level for x in self.levels]
        th = [x.min_clients for x in self.levels]
        if lv != list(range(1, len(lv) + 1)):
            raise ValueError("les niveaux de l'immeuble doivent être consécutifs à partir de 1")
        if th[0] != 0 or any(b <= a for a, b in zip(th, th[1:])):
            raise ValueError("les seuils de l'immeuble doivent commencer à 0 et être strictement croissants")
        return self


class AssistantStepType(_Strict):
    assistant: HangarRole  # assistant qui peut proposer cette étape (sa section)
    agent: HangarRole  # agent spécialisé qui l'exécute
    target: str  # `planet` | `prospect` | `conversation` | `campaign`


class AssistantRules(_Strict):
    """Assistants personnels (docs/ASSISTANT.md) : limites des plans et types d'étapes autorisés par assistant."""

    plans_max: int = Field(ge=1)
    max_steps: int = Field(ge=1)
    instruction_max_chars: int = Field(ge=1)
    summary_max_chars: int = Field(ge=1)
    step_types: dict[str, AssistantStepType]


class RulesV2(_Strict):
    version: str
    source: str
    supersedes: str
    initial_capital: int = Field(ge=0)
    client_reward: int = Field(ge=0)  # $ gagnés une seule fois par prospect devenu client (API-S4)
    initial_agents: list[HangarRole]
    agents: list[AgentRuleV2]
    agents_max_instances_per_role: int = Field(ge=1)  # boutique (docs/CONTRACTS-V2.md §2) : exemplaires achetables au plus par métier
    real_mode_waives_clients_unlock: list[HangarRole]
    planets: list[PlanetRule]
    prospect_actions: dict[str, ProspectActionRule]
    prospect_statuses: list[str]
    followup_days: int
    retention_days: int
    retention_notice_days: int
    limits: LimitsV2
    messaging: MessagingRules
    building: BuildingRules
    assistant: AssistantRules

    @model_validator(mode="after")
    def _coherent(self) -> "RulesV2":
        ids = [a.id for a in self.agents]
        if len(set(ids)) != len(ids):
            raise ValueError("rôle dupliqué dans rules_v2")
        if not set(self.initial_agents) <= set(ids):
            raise ValueError("agent initial inconnu")
        for name, act in self.prospect_actions.items():
            if act.role not in ids:
                raise ValueError(f"action {name} : rôle inconnu")
            expected = ("target", "action") if act.target == "prospect" else ("target", "role")
            if tuple(act.quota_key) != expected:
                raise ValueError(f"action {name} : clé de quota attendue {expected}")
        if not set(self.real_mode_waives_clients_unlock) <= {a.id for a in self.agents if a.unlock_clients is not None}:
            raise ValueError("déblocage levé en Réel pour un rôle sans condition de clients")
        for name, st in self.assistant.step_types.items():
            if st.assistant not in ids or st.agent not in ids:
                raise ValueError(f"étape d'assistant {name} : rôle inconnu")
            act = self.prospect_actions.get(name)
            if act is not None and (act.role != st.agent or act.target != st.target):
                raise ValueError(f"étape d'assistant {name} : agent ou cible différents de prospect_actions")
            if act is None and not (st.target == "planet" and st.agent.value == "scout"):
                raise ValueError(f"étape d'assistant {name} : aucun coût défini (prospect_actions ou lieu)")
        return self

    def agent(self, role: str) -> AgentRuleV2:
        return next(a for a in self.agents if a.id == role)

    def planet(self, planet_id: str) -> PlanetRule:
        return next(p for p in self.planets if p.id == planet_id)

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
