"""Interface unique de l'adaptateur LLM (docs/CONTRACTS.md).

Authentification, timeout, limites et statistiques sont isolés dans les
implémentations. Aucune ne doit journaliser ni renvoyer clé ou prompt système."""

from __future__ import annotations

from abc import ABC, abstractmethod
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field

from ..schemas.common import Role


class LLMStatus(StrEnum):
    OK = "ok"
    ERROR = "error"
    TIMEOUT = "timeout"
    INVALID_OUTPUT = "invalid_output"


class LLMRequest(BaseModel):
    role: Role
    context: str
    allowed_tools: list[str] = Field(default_factory=list)
    expected_schema: dict[str, Any] | None = None
    max_output_tokens: int = Field(gt=0)
    # BE06 : intention de l'appel (`agent`, `evaluation`, `evaluation_repair`, `clarification`) et indices pour le
    # fournisseur SIMULÉ (ids de critères, etc.). Un fournisseur réel n'a pas à les envoyer comme consigne : tout
    # ce qui doit être lu par le modèle est dans `context`.
    purpose: str = "agent"
    metadata: dict[str, Any] = Field(default_factory=dict)


class ToolCall(BaseModel):
    name: str
    arguments: dict[str, Any] = Field(default_factory=dict)
    id: str | None = None  # identifiant d'appel d'outil (facultatif, repris dans `computations` des agents)


class Usage(BaseModel):
    input_tokens: int
    output_tokens: int
    measured: bool  # false => estimation, à signaler comme telle


class LLMResponse(BaseModel):
    content: str
    tool_calls: list[ToolCall] = Field(default_factory=list)  # uniquement des outils autorisés
    usage: Usage | None = None
    duration_ms: int
    provider_call_id: str
    status: LLMStatus


class LLMAdapter(ABC):
    name: str
    simulated: bool  # true => badge « mode simulé » obligatoire

    @abstractmethod
    async def generate(self, request: LLMRequest) -> LLMResponse: ...
