from __future__ import annotations

import asyncio

import pytest

from app.errors import ApiError
from app.llm import LLMRequest, LLMStatus, MockLLMAdapter, get_adapter

def test_mock_llm_is_deterministic_and_offline():
    adapter = MockLLMAdapter()
    req = LLMRequest(role="scout", context="Brief client", allowed_tools=[], max_output_tokens=800)
    r1 = asyncio.run(adapter.generate(req))
    r2 = asyncio.run(adapter.generate(req))
    assert r1 == r2
    assert r1.status is LLMStatus.OK and r1.tool_calls == [] and r1.usage and not r1.usage.measured
    other = asyncio.run(adapter.generate(req.model_copy(update={"context": "Autre"})))
    assert other.provider_call_id != r1.provider_call_id
    assert adapter.simulated is True


def test_real_provider_not_available():
    with pytest.raises(ApiError) as exc:
        get_adapter("real")
    assert exc.value.code.value == "LLM_UNAVAILABLE"
