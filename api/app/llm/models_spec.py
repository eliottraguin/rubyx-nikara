"""Modèles LLM par rôle, lus dans `data/llm/models.json` (règle 8). Validation au démarrage."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path


class LLMModelsError(Exception):
    """Fichier de modèles invalide (message sans secret)."""


@dataclass(frozen=True)
class LLMModels:
    default: str
    roles: dict[str, str]
    available: tuple[str, ...]

    def for_role(self, role: str) -> str:
        return self.roles.get(role, self.default)


def load_llm_models(data_dir: Path) -> LLMModels:
    path = data_dir / "llm" / "models.json"
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise LLMModelsError(f"data/llm/models.json illisible ou invalide ({type(exc).__name__}).") from None
    if not isinstance(raw, dict):
        raise LLMModelsError("data/llm/models.json : objet attendu.")
    available, default, roles = raw.get("available"), raw.get("default"), raw.get("roles")
    if not (isinstance(available, list) and available and all(isinstance(m, str) and m for m in available)):
        raise LLMModelsError("data/llm/models.json : `available` doit être une liste non vide de modèles.")
    if not isinstance(default, str) or not isinstance(roles, dict) or not roles:
        raise LLMModelsError("data/llm/models.json : `default` et `roles` sont requis.")
    named = {"default": default, **{f"roles.{k}": v for k, v in roles.items()}}
    for where, model in named.items():
        if not isinstance(model, str) or model not in available:
            raise LLMModelsError(f"data/llm/models.json : modèle inconnu pour « {where} » (absent de `available`).")
    return LLMModels(default=default, roles=dict(roles), available=tuple(available))
