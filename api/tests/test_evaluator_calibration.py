"""Calibration de l'évaluateur (ticket GR3-63/D3) : grilles `data/evaluator/rubrics_*.json`, rôle
`data/roles/evaluator.json` et jeux d'exemples `data/evaluator/examples_*.json` (bon/moyen/mauvais/injection),
notés par le fournisseur simulé déterministe (`api/app/llm/mock_evaluator.py`). Aucun appel réseau.

Le rôle `evaluator` n'est pas encore une valeur de l'énumération `Role` (ticket C4/GR3-56, non fusionné à ce
jour) : les requêtes de bout en bout ci-dessous utilisent un rôle existant (`Role.SCOUT`) uniquement comme
valeur de remplissage, le fournisseur simulé ne dispatchant que sur `expected_schema.title`."""

from __future__ import annotations

import asyncio
import json

import pytest

from app.config import Settings
from app.llm.base import LLMRequest
from app.llm.mock import MockLLMAdapter
from app.llm.mock_evaluator import build_evaluation_json
from app.schemas.common import Role

DATA = Settings().data_dir


def _load(rel: str) -> dict:
    return json.loads((DATA / rel).read_text(encoding="utf-8"))


RUBRIC_PROMPT = _load("evaluator/rubrics_prompt_v1.json")
RUBRIC_NEGOTIATION = _load("evaluator/rubrics_negotiation_v1.json")
EXAMPLES_PROMPT = _load("evaluator/examples_prompt_v1.json")["exemples"]
EXAMPLES_NEGOTIATION = _load("evaluator/examples_negotiation_v1.json")["exemples"]
ROLE_EVALUATOR = _load("roles/evaluator.json")


# --------------------------------------------------------------------------- Intégrité des données


def test_rubric_prompt_weights_sum_to_100():
    assert sum(c["poids"] for c in RUBRIC_PROMPT["criteres"]) == 100
    assert RUBRIC_PROMPT["note_min"] == 0 and RUBRIC_PROMPT["note_max"] == 100


def test_rubric_negotiation_weights_sum_to_100_and_has_one_essential():
    assert sum(c["poids"] for c in RUBRIC_NEGOTIATION["criteres"]) == 100
    essentiels = [c for c in RUBRIC_NEGOTIATION["criteres"] if c.get("essentiel")]
    assert len(essentiels) == 1
    assert essentiels[0]["id"] == "sans_promesse_non_tenable"


def test_role_evaluator_has_required_sections_and_data_rule():
    text = ROLE_EVALUATOR["system_instructions"]
    for h in ["Identité", "Objectif", "Capacités", "Informations accessibles", "Limites", "Formats autorisés", "Comportement en cas de manque", "Outils autorisés", "Demandes de clarification"]:
        assert f"## {h}" in text, f"section manquante : {h}"
    assert "DONNÉE" in text or "donnée" in text
    assert ROLE_EVALUATOR["allowed_tools"] == []
    assert ROLE_EVALUATOR["clarification_requests"]["allowed"] is False
    actions = {a["action"]: a for a in ROLE_EVALUATOR["actions"]}
    assert actions["evaluate_prompt"]["output_schema"] == "PromptEvaluation"
    assert actions["evaluate_negotiation"]["output_schema"] == "NegotiationEvaluation"


def test_examples_cover_all_tags():
    tags_prompt = {e["tag"] for e in EXAMPLES_PROMPT}
    assert {"bon", "moyen", "mauvais", "injection"} <= tags_prompt
    tags_neg = {e["tag"] for e in EXAMPLES_NEGOTIATION}
    assert {"bon", "moyen", "mauvais", "injection"} <= tags_neg
    for metier in ("prospection", "clients", "pub"):
        assert any(e["metier"] == metier for e in EXAMPLES_PROMPT), f"aucun exemple pour le métier {metier}"


# --------------------------------------------------------------------------- Calibration : notes attendues


@pytest.mark.parametrize("ex", EXAMPLES_PROMPT, ids=lambda e: e["id"])
def test_prompt_examples_match_expected_band(ex):
    meta = {"instruction": ex["instruction"], "criteres": RUBRIC_PROMPT["criteres"], "note_min": RUBRIC_PROMPT["note_min"], "note_max": RUBRIC_PROMPT["note_max"]}
    out = json.loads(build_evaluation_json(meta, "PromptEvaluation"))
    lo, hi = ex["score_attendu"]["min"], ex["score_attendu"]["max"]
    assert lo <= out["score"] <= hi, f"{ex['id']} : score {out['score']} hors bande attendue [{lo}, {hi}]"
    assert 0 <= out["score"] <= 100
    assert len(out["feedback"]) <= 300
    assert "<" not in out["feedback"] and ">" not in out["feedback"]


@pytest.mark.parametrize("ex", EXAMPLES_NEGOTIATION, ids=lambda e: e["id"])
def test_negotiation_examples_match_expected_band(ex):
    meta = {"messages": ex["messages"], "criteres": RUBRIC_NEGOTIATION["criteres"], "note_min": RUBRIC_NEGOTIATION["note_min"], "note_max": RUBRIC_NEGOTIATION["note_max"]}
    out = json.loads(build_evaluation_json(meta, "NegotiationEvaluation"))
    lo, hi = ex["score_attendu"]["min"], ex["score_attendu"]["max"]
    assert lo <= out["score"] <= hi, f"{ex['id']} : score {out['score']} hors bande attendue [{lo}, {hi}]"
    assert 0 <= out["score"] <= 100
    assert len(out["feedback"]) <= 300


@pytest.mark.parametrize("ex", [e for e in EXAMPLES_PROMPT if e.get("base_appariee")], ids=lambda e: e["id"])
def test_prompt_injection_has_no_effect_on_score(ex):
    """La tentative de manipulation embarquée dans la consigne ne doit jamais changer la note : même score
    que la consigne de base appariée, sans la phrase de manipulation."""
    base = next(e for e in EXAMPLES_PROMPT if e["id"] == ex["base_appariee"])
    meta_common = {"criteres": RUBRIC_PROMPT["criteres"], "note_min": RUBRIC_PROMPT["note_min"], "note_max": RUBRIC_PROMPT["note_max"]}
    score_injection = json.loads(build_evaluation_json({**meta_common, "instruction": ex["instruction"]}, "PromptEvaluation"))["score"]
    score_base = json.loads(build_evaluation_json({**meta_common, "instruction": base["instruction"]}, "PromptEvaluation"))["score"]
    assert score_injection == score_base
    assert score_injection < 100  # la manipulation visait 100/100 : elle n'y arrive jamais


@pytest.mark.parametrize("ex", [e for e in EXAMPLES_NEGOTIATION if e.get("base_appariee")], ids=lambda e: e["id"])
def test_negotiation_injection_has_no_effect_on_score(ex):
    """Que la manipulation vienne du message du joueur ou du message du client, la note ne bouge pas par
    rapport à l'échange de base apparié."""
    base = next(e for e in EXAMPLES_NEGOTIATION if e["id"] == ex["base_appariee"])
    meta_common = {"criteres": RUBRIC_NEGOTIATION["criteres"], "note_min": RUBRIC_NEGOTIATION["note_min"], "note_max": RUBRIC_NEGOTIATION["note_max"]}
    score_injection = json.loads(build_evaluation_json({**meta_common, "messages": ex["messages"]}, "NegotiationEvaluation"))["score"]
    score_base = json.loads(build_evaluation_json({**meta_common, "messages": base["messages"]}, "NegotiationEvaluation"))["score"]
    assert score_injection == score_base
    assert score_injection < 100


def test_negotiation_essential_criterion_failure_caps_score():
    ex = next(e for e in EXAMPLES_NEGOTIATION if e["tag"] == "essentiel_manque")
    meta = {"messages": ex["messages"], "criteres": RUBRIC_NEGOTIATION["criteres"], "note_min": RUBRIC_NEGOTIATION["note_min"], "note_max": RUBRIC_NEGOTIATION["note_max"]}
    out = json.loads(build_evaluation_json(meta, "NegotiationEvaluation"))
    assert out["score"] <= 40
    assert "promesse" in out["feedback"].lower()


def test_client_message_is_never_graded_as_if_it_were_the_player():
    """Si on inverse les rôles (le texte poli vient du client, le texte pauvre du joueur), seul le message du
    joueur compte : la note suit le joueur, pas le client."""
    criteres = RUBRIC_NEGOTIATION["criteres"]
    meta_common = {"criteres": criteres, "note_min": 0, "note_max": 100}
    poor_player = json.loads(
        build_evaluation_json({**meta_common, "messages": [{"de": "client", "texte": "Bonjour, merci pour votre message. Je comprends votre budget ; je peux vous proposer un tarif ajusté si vous confirmez avant vendredi. Cordialement."}, {"de": "moi", "texte": "Ok."}]}, "NegotiationEvaluation")
    )["score"]
    rich_player = json.loads(
        build_evaluation_json({**meta_common, "messages": [{"de": "client", "texte": "Ok."}, {"de": "moi", "texte": "Bonjour, merci pour votre message. Je comprends votre budget ; je peux vous proposer un tarif ajusté si vous confirmez avant vendredi. Cordialement."}]}, "NegotiationEvaluation")
    )["score"]
    assert poor_player < rich_player


# --------------------------------------------------------------------------- Bout en bout via le fournisseur simulé


def test_mock_adapter_dispatches_prompt_evaluation_end_to_end():
    ex = next(e for e in EXAMPLES_PROMPT if e["id"] == "prospection_bon_1")
    request = LLMRequest(
        role=Role.SCOUT,
        context="(contexte minimisé, hors périmètre de ce test)",
        expected_schema={"title": "PromptEvaluation"},
        max_output_tokens=200,
        purpose="evaluator_prompt",
        metadata={"evaluator": {"instruction": ex["instruction"], "criteres": RUBRIC_PROMPT["criteres"], "note_min": 0, "note_max": 100}},
    )
    response = asyncio.run(MockLLMAdapter().generate(request))
    out = json.loads(response.content)
    assert 80 <= out["score"] <= 100
    assert response.status.value == "ok"


def test_mock_adapter_dispatches_negotiation_evaluation_end_to_end():
    ex = next(e for e in EXAMPLES_NEGOTIATION if e["id"] == "negociation_bon_1")
    request = LLMRequest(
        role=Role.SCOUT,
        context="(contexte minimisé, hors périmètre de ce test)",
        expected_schema={"title": "NegotiationEvaluation"},
        max_output_tokens=200,
        purpose="evaluator_negotiation",
        metadata={"evaluator": {"messages": ex["messages"], "criteres": RUBRIC_NEGOTIATION["criteres"], "note_min": 0, "note_max": 100}},
    )
    response = asyncio.run(MockLLMAdapter().generate(request))
    out = json.loads(response.content)
    assert 80 <= out["score"] <= 100
