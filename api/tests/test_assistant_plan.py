"""Validateur de plan d'assistant (ASSIST-2) : pur, sans base ni réseau (docs/ASSISTANT.md §3 à §5)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.rules_v2 import load_rules_v2
from app.services.assistant_plan import FAILURE_CODES, PlanFacts, validate_plan

RULES = load_rules_v2(Path(__file__).resolve().parents[2] / "data")


def facts(assistant="assistant_clients", **kw) -> PlanFacts:
    base = {
        "assistant": assistant,
        "owned_roles": frozenset({"scout", "triage", "replier", "ads", "assistant_prospection", "assistant_clients", "assistant_pub"}),
        "targets": {
            "conversation": frozenset({"c1", "c2", "c3", "c4"}),
            "prospect": frozenset({"p1"}),
            "campaign": frozenset({"k1"}),
            "planet": frozenset({"annuaire", "registre"}),
        },
        "balance": 50,
    }
    base.update(kw)
    return PlanFacts(**base)


def plan(*steps, summary="Voici ce que je propose.") -> str:
    return json.dumps({"summary": summary, "steps": list(steps)})


def step(t, target, instruction="", **extra):
    return {"type": t, "target_id": target, "instruction": instruction, **extra}


def codes(p):
    return [f.code for f in p.failures]


def test_valid_plan_computes_costs_from_rules_not_from_the_model():
    p = validate_plan(RULES, facts(), plan(step("conversation_triage", "c1", cost=0, reward=999, score=100), step("conversation_reply", "c1", "Propose jeudi")))
    assert p.ok and [s.cost for s in p.steps] == [1, 2] and p.total_cost == 3
    assert [s.agent for s in p.steps] == ["triage", "replier"] and all(s.blocked_reason is None for s in p.steps)
    assert p.steps[1].instruction == "Propose jeudi"


def test_scout_search_costs_the_planet_unit_price():
    p = validate_plan(RULES, facts("assistant_prospection"), plan(step("scout_search", "registre")))
    assert p.ok and p.steps[0].cost == 1 and p.steps[0].agent == "scout"


def test_empty_plan_is_valid_and_costs_nothing():
    p = validate_plan(RULES, facts(), plan(summary="Je ne peux pas faire cela."))
    assert p.ok and p.steps == [] and p.total_cost == 0


def test_fenced_json_is_accepted():
    p = validate_plan(RULES, facts(), "```json\n" + plan(step("conversation_triage", "c1")) + "\n```")
    assert p.ok and len(p.steps) == 1


@pytest.mark.parametrize("content", ["bonjour", "", "[1, 2]", '{"steps": []}', '{"summary": "x", "steps": "non"}'])
def test_unusable_shapes_fail_for_the_whole_plan(content):
    p = validate_plan(RULES, facts(), content)
    assert not p.ok and p.steps == [] and codes(p)[0] in {"NOT_JSON", "BAD_SHAPE"}


def test_too_many_steps_fail_and_extra_steps_are_dropped():
    p = validate_plan(RULES, facts(), plan(*[step("conversation_triage", c) for c in ("c1", "c2", "c3", "c4")]))
    assert codes(p) == ["TOO_MANY_STEPS"] and len(p.steps) == 3


def test_unknown_type_and_other_sections_assistant_are_rejected():
    p = validate_plan(RULES, facts(), plan(step("send_email", "c1"), step("ad_campaign", "k1"), step("conversation_triage", "c1")))
    assert codes(p) == ["UNKNOWN_TYPE", "WRONG_ASSISTANT"] and [s.type for s in p.steps] == ["conversation_triage"]


def test_target_must_be_in_the_players_list():
    p = validate_plan(RULES, facts(), plan(step("conversation_triage", "c999"), step("conversation_triage", "p1")))
    assert codes(p) == ["UNKNOWN_TARGET", "UNKNOWN_TARGET"] and p.steps == []


def test_duplicate_type_on_same_target_is_rejected_but_other_target_is_fine():
    p = validate_plan(RULES, facts(), plan(step("conversation_triage", "c1"), step("conversation_triage", "c1"), step("conversation_triage", "c2")))
    assert codes(p) == ["DUPLICATE"] and [s.target_id for s in p.steps] == ["c1", "c2"]


def test_instruction_limits_and_control_characters():
    too_long = "x" * (RULES.assistant.instruction_max_chars + 1)
    assert codes(validate_plan(RULES, facts(), plan(step("conversation_triage", "c1", too_long)))) == ["BAD_TEXT"]
    assert codes(validate_plan(RULES, facts(), plan(step("conversation_triage", "c1", 5)))) == ["BAD_TEXT"]
    ok = validate_plan(RULES, facts(), plan(step("conversation_triage", "c1", "  Résume\x00 vite\x07  ")))
    assert ok.ok and ok.steps[0].instruction == "Résume vite"
    assert codes(validate_plan(RULES, facts(), plan(step("conversation_triage", "c1"), summary=""))) == ["BAD_TEXT"]


def test_unowned_agent_blocks_only_that_step_with_a_plain_sentence():
    p = validate_plan(RULES, facts(owned_roles=frozenset({"triage", "assistant_clients"})), plan(step("conversation_triage", "c1"), step("conversation_reply", "c1")))
    assert p.ok and p.steps[0].blocked_reason is None and "manque" in p.steps[1].blocked_reason and p.total_cost == 1


def test_exhausted_quota_blocks_the_step():
    p = validate_plan(RULES, facts(quota_left={("conversation_reply", "c1"): 0}), plan(step("conversation_reply", "c1"), step("conversation_reply", "c2")))
    assert p.steps[0].blocked_reason and p.steps[1].blocked_reason is None


def test_balance_is_spent_in_order_and_later_steps_are_blocked():
    p = validate_plan(RULES, facts(balance=2), plan(step("conversation_reply", "c1"), step("conversation_triage", "c1"), step("conversation_triage", "c2")))
    assert [s.blocked_reason is None for s in p.steps] == [True, False, False] and p.total_cost == 2
    assert "argent" in p.steps[1].blocked_reason


def test_blocked_reasons_use_no_technical_words():
    p = validate_plan(RULES, facts(balance=0), plan(step("conversation_triage", "c1")))
    text = p.steps[0].blocked_reason.lower()
    assert text and not any(w in text for w in ("quota", "token", "agent", "plan de délégation", "llm", "erreur"))


def test_failure_codes_are_all_documented():
    seen = set()
    for c in ('x', '[]', plan(*[step("conversation_triage", f"c{i}") for i in range(4)]), plan(step("zz", "c1")), plan(step("ad_campaign", "k1")),
              plan(step("conversation_triage", "no")), plan(step("conversation_triage", "c1"), step("conversation_triage", "c1")),
              plan(step("conversation_triage", "c1"), summary="")):
        seen |= {f.code for f in validate_plan(RULES, facts(), c).failures}
    assert seen == set(FAILURE_CODES)
