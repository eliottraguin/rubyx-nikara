from __future__ import annotations

from typing import TYPE_CHECKING

from ..errors import ApiError, ErrorCode
from .base import LLMAdapter, LLMRequest, LLMResponse, LLMStatus
from .mock import MockLLMAdapter

if TYPE_CHECKING:
    from ..config import Settings


def get_adapter(provider: str, settings: Settings | None = None) -> LLMAdapter:
    if provider == "mock":
        return MockLLMAdapter()
    if provider == "real" and settings is not None and settings.llm_api_key and settings.llm_base_url:
        from .models_spec import load_llm_models
        from .real import RealLLMAdapter

        return RealLLMAdapter(
            base_url=settings.llm_base_url,
            api_key=settings.llm_api_key,
            models=load_llm_models(settings.data_dir),
            data_dir=settings.data_dir,
        )
    raise ApiError(ErrorCode.LLM_UNAVAILABLE, "Fournisseur de modèles non configuré.")


__all__ = ["LLMAdapter", "LLMRequest", "LLMResponse", "LLMStatus", "MockLLMAdapter", "get_adapter"]
