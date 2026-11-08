"""Règles communes du moteur d'appels (data/rules/rules_v1.json) : capital et agents de départ, limites techniques des
appels au fournisseur. Réduit à l'essentiel par le retrait de l'ancien moteur d'expédition (6e décision, API-R3) : plus de
missions, de quotas par expédition ni d'étape. Prix, déblocages, quotas par cible, lieux et rétention : `rules_v2`."""

from __future__ import annotations

import json
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field

from .schemas.common import Role


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class Limits(_Strict):
    call_timeout_seconds: int
    technical_retries: int
    provider_concurrency: int
    reservation_ttl_seconds: int


class Rules(_Strict):
    version: str
    source: str
    initial_capital: int = Field(ge=0)
    initial_agents: list[Role]
    limits: Limits


def load_rules(data_dir: Path, version: str) -> Rules:
    if "/" in version or "\\" in version or ".." in version:
        raise ValueError("version de règles invalide")
    path = data_dir / "rules" / f"{version}.json"
    rules = Rules.model_validate(json.loads(path.read_text(encoding="utf-8")))
    if rules.version != version:
        raise ValueError(f"{path.name} déclare la version {rules.version}")
    return rules
