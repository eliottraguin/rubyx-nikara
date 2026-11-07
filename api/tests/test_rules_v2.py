"""Étape 1 : chargement de data/rules/rules_v2.json (cap prospection) sans casser rules_v1."""

from __future__ import annotations

import json

import pytest
from jsonschema import Draft202012Validator
from pydantic import ValidationError

from app.config import REPO_DIR, Settings
from app.rules import load_rules
from app.rules_v2 import RulesV2, load_rules_v2

DATA = REPO_DIR / "data"


def test_rules_v2_file_is_valid_against_its_json_schema():
    schema = json.loads((DATA / "schemas" / "rules_v2.schema.json").read_text(encoding="utf-8"))
    doc = json.loads((DATA / "rules" / "rules_v2.json").read_text(encoding="utf-8"))
    errors = [e.message for e in Draft202012Validator(schema).iter_errors(doc)]
    assert errors == []


def test_typed_access_to_every_section():
    r = load_rules_v2(DATA)
    assert r.version == "rules_v2" and r.initial_capital == 30
    assert r.agent_prices == {"scout": 0, "qualifier": 30, "profiler": 40, "outreach": 45, "triage": 35, "replier": 45, "ads": 50}
    assert len(r.agents) == 7
    assert r.scoring.pass_score == 50 and r.scoring.final_pass_score == 60
    assert r.prospect_actions["profiler"].cost == 3 and r.prospect_actions["profiler"].quota_per_target == 5
    assert r.prospect_actions["ads"].cost == 4 and all(a.gain == 0 for a in r.prospect_actions.values())
    assert r.limits.prospects_max == 500 and r.limits.notes_max_chars == 2000
    assert r.messaging.send_per_day == 20
    assert (r.retention_days, r.retention_notice_days, r.followup_days) == (180, 30, 7)
    assert len(r.building.levels) == 10 and r.building.levels[0].min_total_earned == 0
    assert [p.id for p in r.planets][0] == "annuaire"


def test_rules_v1_thresholds_are_already_50_60():
    """Pas de test à adapter : les seuils de rules_v1 sont déjà 50 (ordinaire) et 60 (finale) depuis le commit data 038eeec."""
    v1 = load_rules(DATA, "rules_v1")
    assert (v1.scoring.pass_score, v1.scoring.final_pass_score) == (50, 60)


def test_rules_v2_values_come_from_the_file(tmp_path, data_copy):
    path = data_copy / "rules" / "rules_v2.json"
    doc = json.loads(path.read_text())
    doc["building"]["levels"][1]["min_total_earned"] = 33
    path.write_text(json.dumps(doc))
    assert load_rules_v2(data_copy).building.levels[1].min_total_earned == 33


def test_inconsistent_rules_v2_are_refused(data_copy):
    doc = json.loads((data_copy / "rules" / "rules_v2.json").read_text())
    doc["building"]["levels"][2]["min_total_earned"] = 10  # seuils non croissants
    with pytest.raises(ValidationError):
        RulesV2.model_validate(doc)
    doc = json.loads((data_copy / "rules" / "rules_v2.json").read_text())
    doc["surprise"] = 1  # champ inconnu refusé
    with pytest.raises(ValidationError):
        RulesV2.model_validate(doc)


def test_app_exposes_rules_v2_and_keeps_v1(client):
    app = client.app
    assert app.state.rules.version == "rules_v1" and app.state.rules_v2.version == "rules_v2"
    assert client.get("/api/health").json()["rules_version"] == "rules_v1"


def test_missing_rules_v2_is_a_readable_config_problem(tmp_path, data_copy):
    (data_copy / "rules" / "rules_v2.json").unlink()
    problems = Settings(db_path=tmp_path / "x.db", data_dir=data_copy).problems()
    assert any("rules_v2.json" in p for p in problems)
