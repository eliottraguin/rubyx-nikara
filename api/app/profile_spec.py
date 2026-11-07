"""Spécification de la fiche entreprise et cible : `data/profile/target_profile_v1.json` (bornes, énumérations,
exemples du Tutoriel). Aucune borne n'est écrite dans le code (docs/BACKLOG.md DATA-H1, API-H1)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from pydantic import BaseModel, ConfigDict


class _Spec(BaseModel):
    model_config = ConfigDict(extra="allow", frozen=True)


class FieldSpec(_Spec):
    type: str
    required: bool = False
    required_for_real: bool = False
    min_chars: int = 0
    max_chars: int | None = None
    min_items: int = 0
    max_items: int | None = None
    item_max_chars: int | None = None
    min_value: int | None = None
    max_value: int | None = None
    keys: list[str] | None = None
    values: list[str] | None = None
    default: str | None = None


class ProfileSpec(_Spec):
    id: str
    version: int
    fields: dict[str, FieldSpec]
    sectors: list[dict[str, str]] = []
    free_entry_allowed: bool = True
    examples: list[dict[str, Any]] = []  # fiches d'exemple du Tutoriel (data/profile/examples/), triées par nom de fichier

    @property
    def field_names(self) -> list[str]:
        return list(self.fields)


def load_profile_spec(data_dir: Path) -> ProfileSpec:
    base = data_dir / "profile"
    raw = json.loads((base / "target_profile_v1.json").read_text(encoding="utf-8"))
    examples: list[dict[str, Any]] = []
    ex_dir = base / "examples"
    if ex_dir.is_dir():
        for path in sorted(ex_dir.glob("*.json")):
            examples.append(json.loads(path.read_text(encoding="utf-8")))
    return ProfileSpec.model_validate({**raw, "examples": examples})
