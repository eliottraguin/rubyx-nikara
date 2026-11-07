from __future__ import annotations

import asyncio

import pytest
from pydantic import ValidationError

from app.errors import ApiError
from app.llm import LLMRequest, LLMStatus, MockLLMAdapter, get_adapter
from app.schemas.evaluator import EvaluatorOutput
from app.schemas.plan import LeadPlan

EVAL = {
    "submission_id": "sub_001",
    "rubric_version": "m1_v1",
    "out_of_scope": False,
    "criteria": [
        {"id": "price", "rating": 1.0, "evidence": "Formule à 9,90", "comment": "Prix exact"},
        {"id": "hours", "rating": 0.0, "evidence": "", "comment": "Horaires absents"},
    ],
    "client_feedback": "Ajoutez les horaires de la formule.",
    "next_action": "Corriger les informations de disponibilité",
}

PLAN = {
    "steps": [
        {"role": "researcher", "task": "Comparer les sources", "source_ids": ["doc_1", "doc_2"]},
        {"role": "writer", "task": "Préparer la publication", "depends_on": 0},
    ],
    "summary": "Vérifier puis rédiger",
}


def test_evaluator_contract_example_and_reward_ignored():
    out = EvaluatorOutput.model_validate({**EVAL, "reward": 9999, "payment": 20})
    assert len(out.criteria) == 2
    assert "reward" not in out.model_dump() and "payment" not in out.model_dump()


@pytest.mark.parametrize("rating", [-0.1, 1.01])
def test_evaluator_rating_bounds(rating):
    bad = {**EVAL, "criteria": [{"id": "price", "rating": rating}]}
    with pytest.raises(ValidationError):
        EvaluatorOutput.model_validate(bad)


def test_evaluator_duplicate_ids_rejected():
    bad = {**EVAL, "criteria": [{"id": "a", "rating": 1}, {"id": "a", "rating": 0}]}
    with pytest.raises(ValidationError):
        EvaluatorOutput.model_validate(bad)


def test_plan_contract_example():
    assert len(LeadPlan.model_validate(PLAN).steps) == 2


def test_plan_rejections():
    three = {**PLAN, "steps": PLAN["steps"] + [{"role": "qa", "task": "Relire"}]}
    cycle = {**PLAN, "steps": [{"role": "writer", "task": "x", "depends_on": 1}, {"role": "qa", "task": "y", "depends_on": 0}]}
    selfdep = {**PLAN, "steps": [{"role": "writer", "task": "x", "depends_on": 0}]}
    recursive = {**PLAN, "steps": [{"role": "lead", "task": "x"}]}
    unknown_role = {**PLAN, "steps": [{"role": "hacker", "task": "x"}]}
    for bad in (three, cycle, selfdep, recursive, unknown_role):
        with pytest.raises(ValidationError):
            LeadPlan.model_validate(bad)


def test_mock_llm_is_deterministic_and_offline():
    adapter = MockLLMAdapter()
    req = LLMRequest(role="writer", context="Brief client", allowed_tools=[], max_output_tokens=800)
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
