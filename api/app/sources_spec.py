"""Listes blanches de champs par source : `data/sources/<source>.json` (docs/RULES.md §9, PRODUIT-PROSPECTION.md §14).

Tout champ hors liste est écarté **avant stockage** (instantané d'un prospect). Les champs
`always_excluded` ne passent jamais, même s'ils figuraient par erreur dans la liste. Aucune liste n'est écrite dans le code."""

from __future__ import annotations

import json
import re
import unicodedata
from datetime import date
from pathlib import Path
from typing import Any

from pydantic import BaseModel, ConfigDict


class _Spec(BaseModel):
    model_config = ConfigDict(extra="allow", frozen=True)


class SourceField(_Spec):
    name: str
    type: str
    personal_data: bool = False
    max_chars: int | None = None


class SourceSpec(_Spec):
    id: str
    label: str = ""
    required_fields: list[str]
    allowed_fields: list[SourceField]
    always_excluded: list[str] = []
    snapshot_max_chars: int = 2000

    @property
    def fields(self) -> dict[str, SourceField]:
        return {f.name: f for f in self.allowed_fields if f.name not in self.always_excluded}


def clean_text(value: str, multiline: bool = False) -> str:
    keep = "\n\t" if multiline else ""
    out = "".join(" " if (unicodedata.category(c) == "Cc" and c not in keep) else c for c in value)
    return out.strip() if multiline else " ".join(out.split())


_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}")


def _coerce(f: SourceField, value: Any) -> Any:
    """Valeur conforme au type déclaré, sinon `None` (le champ est alors écarté)."""
    t = f.type
    if t == "string":
        if not isinstance(value, str):
            return None
        text = clean_text(value)
        if f.max_chars is not None:
            text = text[: f.max_chars]
        return text or None
    if t == "integer":
        return value if isinstance(value, int) and not isinstance(value, bool) else None
    if t == "number":
        return value if isinstance(value, (int, float)) and not isinstance(value, bool) else None
    if t == "boolean":
        return value if isinstance(value, bool) else None
    if t == "date":
        if not isinstance(value, str) or not _DATE.match(value):
            return None
        try:
            return date.fromisoformat(value[:10]).isoformat()
        except ValueError:
            return None
    return None


class SourcesSpec:
    def __init__(self, specs: dict[str, SourceSpec]):
        self.specs = specs

    def known(self, source: str) -> bool:
        return source in self.specs

    @property
    def ids(self) -> list[str]:
        return sorted(self.specs)

    def minimize(self, source: str, record: dict[str, Any]) -> dict[str, Any]:
        """Instantané minimisé : champs de la liste blanche, valeurs typées et bornées, taille totale plafonnée.
        Les champs obligatoires ne sont jamais sacrifiés pour la taille."""
        spec = self.specs[source]
        out: dict[str, Any] = {}
        for name, f in spec.fields.items():
            if name in record:
                v = _coerce(f, record[name])
                if v is not None:
                    out[name] = v
        for name in reversed([n for n in out if n not in spec.required_fields]):
            if len(json.dumps(out, ensure_ascii=False)) <= spec.snapshot_max_chars:
                break
            del out[name]
        return out

    def missing_required(self, source: str, snapshot: dict[str, Any]) -> list[str]:
        return [n for n in self.specs[source].required_fields if n not in snapshot]


def load_sources_spec(data_dir: Path) -> SourcesSpec:
    specs: dict[str, SourceSpec] = {}
    base = data_dir / "sources"
    if base.is_dir():
        for path in sorted(base.glob("*.json")):
            spec = SourceSpec.model_validate(json.loads(path.read_text(encoding="utf-8")))
            specs[spec.id] = spec
    return SourcesSpec(specs)
