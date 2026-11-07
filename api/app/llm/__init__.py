from __future__ import annotations

from ..errors import ApiError, ErrorCode
from .base import LLMAdapter, LLMRequest, LLMResponse, LLMStatus
from .mock import MockLLMAdapter


def get_adapter(provider: str) -> LLMAdapter:
    if provider == "mock":
        return MockLLMAdapter()
    # Le fournisseur réel n'est pas encore confirmé (AI01, docs/OPEN-QUESTIONS.md).
    raise ApiError(ErrorCode.LLM_UNAVAILABLE, "Fournisseur de modèles non configuré.")


__all__ = ["LLMAdapter", "LLMRequest", "LLMResponse", "LLMStatus", "MockLLMAdapter", "get_adapter"]
