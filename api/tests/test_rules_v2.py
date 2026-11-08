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
    assert r.agent_prices == {"scout": 0, "triage": 35, "replier": 45, "ads": 50, "assistant_prospection": 0, "assistant_clients": 0, "assistant_pub": 0}
    assert len(r.agents) == 7
    assert [a.value for a in r.initial_agents] == ["scout", "assistant_prospection", "assistant_clients", "assistant_pub"]
    pa = r.prospect_actions
    assert pa["prospect_profile"].cost == 3 and pa["prospect_profile"].quota_per_target == 5
    assert pa["prospect_message"].cost == 2 and pa["prospect_message"].role == "replier"
    assert pa["ad_campaign"].cost == 4 and all(a.gain == 0 for a in r.prospect_actions.values())
    assert r.limits.prospects_max == 500 and r.limits.notes_max_chars == 2000
    assert r.limits.searches_per_day == 10 and r.limits.search_precision_max_chars == 300 and r.limits.search_data_max_age_days == 365
    assert r.messaging.send_per_day == 20
    assert (r.retention_days, r.retention_notice_days, r.followup_days) == (180, 30, 7)
    assert len(r.building.levels) == 10 and r.building.levels[0].min_clients == 0
    assert [p.id for p in r.planets] == ["annuaire", "registre", "carte-locale", "linkedin", "glassdoor", "constellation"]  # plus de lieu « secours »
    assert not hasattr(r, "quotas") and not hasattr(r.planets[0], "engine_mission")  # ancien moteur d'expédition retiré


def test_rules_v1_keeps_only_capital_agents_and_technical_limits():
    """6e décision (API-R3) : plus de score, de paiement, de mission ni de quota d'expédition dans rules_v1."""
    v1 = load_rules(DATA, "rules_v1")
    assert not hasattr(v1, "scoring") and not hasattr(v1, "agents") and not hasattr(v1, "missions") and not hasattr(v1, "quotas")
    assert [a.value for a in v1.initial_agents] == ["scout"] and v1.initial_capital == 30
    assert v1.limits.reservation_ttl_seconds == 300 and v1.limits.provider_concurrency == 5


def test_rules_v2_values_come_from_the_file(tmp_path, data_copy):
    path = data_copy / "rules" / "rules_v2.json"
    doc = json.loads(path.read_text())
    doc["building"]["levels"][9]["min_clients"] = 77
    path.write_text(json.dumps(doc))
    assert load_rules_v2(data_copy).building.levels[9].min_clients == 77


def test_inconsistent_rules_v2_are_refused(data_copy):
    doc = json.loads((data_copy / "rules" / "rules_v2.json").read_text())
    doc["building"]["levels"][2]["min_clients"] = 10  # seuils non croissants
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


def test_client_economy_values():
    r = load_rules_v2(DATA)
    assert r.client_reward == 20
    assert {a.id.value: a.unlock_clients for a in r.agents if a.unlock_clients} == {"triage": 1, "replier": 2, "ads": 3}
    assert [x.value for x in r.real_mode_waives_clients_unlock] == ["triage", "replier", "ads"]
