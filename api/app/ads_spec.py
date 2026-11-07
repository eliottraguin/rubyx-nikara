"""Données de la section Pub (docs/PRODUIT-CLIENTS-PUB.md §5) : formats et limites par plateforme
(`data/ads/formats.json`), checklist de conformité (`data/ads/checklist.json`), grille de contrôles du kit
(`data/rubrics/ad_kit_v1.json`) et réglages des contrôles (`data/ads/kit_rules.json`).

Aucune limite de caractères, aucun point de checklist ni seuil n'est écrit dans le code (règle 8)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class _Spec(BaseModel):
    model_config = ConfigDict(extra="allow", frozen=True)


class FieldCount(_Spec):
    min: int
    max: int


class FormatField(_Spec):
    id: str
    label: str
    max_chars: int
    required: bool
    count: FieldCount | None = None


class AdFormat(_Spec):
    id: str
    label: str
    verified: bool = False
    fields: list[FormatField]


class Platform(_Spec):
    id: str
    label: str
    formats: list[AdFormat]


class ChecklistItem(_Spec):
    id: str
    label: str
    essential: bool
    platforms: str | list[str]

    def applies_to(self, platform: str) -> bool:
        return self.platforms == "all" or platform in self.platforms


class RubricCheck(_Spec):
    id: str
    label: str
    essential: bool
    kind: str
    description: str = ""
    params: dict[str, Any] = Field(default_factory=dict)


class KitRules(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    id: str
    version: int
    language: str
    notes: str
    versions_max: int = Field(ge=1)
    budget_max_chars: int = Field(ge=1)
    text_bounds: dict[str, int]
    claim_terms: list[str]
    promise_terms: list[str]
    individual_target_terms: list[str]
    person_title_terms: list[str]
    required_facts_by_objective: dict[str, list[str]]
    missing_fact_labels: dict[str, str]
    export: dict[str, str]


class AdsSpec(BaseModel):
    model_config = ConfigDict(frozen=True, arbitrary_types_allowed=True)

    objectifs: list[str]
    platforms: list[Platform]
    checklist: list[ChecklistItem]
    rubric_version: int
    checks: list[RubricCheck]
    repair_attempts: int
    rules: KitRules

    def platform(self, platform_id: str) -> Platform | None:
        return next((p for p in self.platforms if p.id == platform_id), None)

    def check(self, check_id: str) -> RubricCheck | None:
        return next((c for c in self.checks if c.id == check_id), None)

    def checklist_for(self, platform_id: str) -> list[ChecklistItem]:
        return [i for i in self.checklist if i.applies_to(platform_id)]

    @property
    def platform_ids(self) -> list[str]:
        return [p.id for p in self.platforms]


def _load(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def load_ads_spec(data_dir: Path) -> AdsSpec:
    formats = _load(data_dir / "ads" / "formats.json")
    checklist = _load(data_dir / "ads" / "checklist.json")
    rubric = _load(data_dir / "rubrics" / "ad_kit_v1.json")
    rules = KitRules.model_validate(_load(data_dir / "ads" / "kit_rules.json"))
    return AdsSpec(
        objectifs=formats["objectifs"],
        platforms=[Platform.model_validate(p) for p in formats["plateformes"]],
        checklist=[ChecklistItem.model_validate(i) for i in checklist["items"]],
        rubric_version=rubric["version"],
        checks=[RubricCheck.model_validate(c) for c in rubric["checks"]],
        repair_attempts=int(rubric["on_essential_failure"]["repair_attempts"]),
        rules=rules,
    )
