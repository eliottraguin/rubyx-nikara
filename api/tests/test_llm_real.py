"""Adaptateur LLM réel : tout est testé sur faux transport httpx, AUCUN appel réseau."""

from __future__ import annotations

import asyncio
import json
import logging

import httpx
import jsonschema
import pytest

from app.config import REPO_DIR, ConfigError, Settings
from app.errors import ApiError, ErrorCode
from app.llm import LLMRequest, LLMStatus, get_adapter
from app.llm.models_spec import LLMModelsError, load_llm_models
from app.llm.real import RealLLMAdapter
from app.rules import load_rules
from app.schemas.common import HangarRole
from app.services.actions import ActionEngine, call_provider

KEY = "sk-SENTINELLE-0123456789"
BASE = "https://relais.example.test"
BODY_SECRET = "CORPS-RELAIS-CONFIDENTIEL"
DATA = REPO_DIR / "data"


def ok_body(text="Bonjour", usage=True, content=None):
    body = {"id": "msg_123", "model": "m", "content": [{"type": "text", "text": text}] if content is None else content, "stop_reason": "end_turn"}
    if usage:
        body["usage"] = {"input_tokens": 11, "output_tokens": 7, "cache_read_input_tokens": 0}
    return body


def make(handler, **kw):
    models = load_llm_models(DATA)
    return RealLLMAdapter(base_url=BASE + "/", api_key=KEY, models=models, data_dir=DATA, transport=httpx.MockTransport(handler), **kw)


def req(role="scout", **kw):
    return LLMRequest(role=role, context="CONTEXTE <<<DONNEES>>>", max_output_tokens=321, **kw)


def run(adapter, request):
    return asyncio.run(adapter.generate(request))


def test_request_well_formed():
    seen = {}

    def handler(r: httpx.Request):
        seen.update(url=str(r.url), headers=dict(r.headers), body=json.loads(r.content))
        return httpx.Response(200, json=ok_body())

    resp = run(make(handler), req("replier"))
    assert seen["url"] == BASE + "/v1/messages"
    h = seen["headers"]
    assert h["x-api-key"] == KEY and h["anthropic-version"] == "2023-06-01" and h["content-type"] == "application/json"
    b = seen["body"]
    assert b["model"] == "claude-sonnet-5-5" and b["max_tokens"] == 321 and b["temperature"] == 0.2
    assert b["messages"] == [{"role": "user", "content": "CONTEXTE <<<DONNEES>>>"}]
    assert "tools" not in b
    assert "system" in b and len(b["system"]) > 50
    assert resp.status == LLMStatus.OK and resp.content == "Bonjour" and resp.provider_call_id == "msg_123"
    assert resp.usage and resp.usage.measured and (resp.usage.input_tokens, resp.usage.output_tokens) == (11, 7)


def test_model_per_role():
    models = []

    def handler(r):
        models.append(json.loads(r.content)["model"])
        return httpx.Response(200, json=ok_body())

    a = make(handler)
    for role in HangarRole:
        run(a, req(role.value))
    haiku, sonnet = "claude-haiku-4-5-20251001", "claude-sonnet-5-5"
    expected = {"scout": haiku, "triage": haiku, "replier": sonnet, "ads": sonnet,
                "assistant_prospection": sonnet, "assistant_clients": sonnet, "assistant_pub": sonnet}
    assert set(expected) == {r.value for r in HangarRole}  # tout rôle du hangar a un modèle explicite
    assert dict(zip((r.value for r in HangarRole), models, strict=True)) == expected


def test_tools_translated_and_filtered():
    seen = {}

    def handler(r):
        seen.update(json.loads(r.content))
        content = [
            {"type": "text", "text": "ok"},
            {"type": "tool_use", "id": "t1", "name": "search_catalog", "input": {"q": "x"}},
            {"type": "tool_use", "id": "t2", "name": "pas_autorise", "input": {}},
        ]
        return httpx.Response(200, json=ok_body(content=content))

    resp = run(make(handler), req(allowed_tools=["search_catalog"]))
    assert [t["name"] for t in seen["tools"]] == ["search_catalog"] and "input_schema" in seen["tools"][0]
    assert [(c.name, c.id) for c in resp.tool_calls] == [("search_catalog", "t1")]


def test_missing_usage_is_none():
    resp = run(make(lambda r: httpx.Response(200, json=ok_body(usage=False))), req())
    assert resp.status == LLMStatus.OK and resp.usage is None


def test_schema_instruction_and_fenced_json():
    seen = {}

    def handler(r):
        seen.update(json.loads(r.content))
        return httpx.Response(200, json=ok_body("Voici :\n```json\n{\"a\": 1}\n```"))

    resp = run(make(handler), req(expected_schema={"type": "object", "title": "S"}))
    assert "JSON" in seen["messages"][0]["content"] and '"title": "S"' in seen["messages"][0]["content"]
    assert json.loads(resp.content) == {"a": 1}


def test_invalid_json_left_as_is():
    resp = run(make(lambda r: httpx.Response(200, json=ok_body("{pas du json"))), req(expected_schema={"type": "object"}))
    assert resp.status == LLMStatus.OK and resp.content == "{pas du json"


def test_no_text_is_invalid_output():
    resp = run(make(lambda r: httpx.Response(200, json=ok_body(content=[]))), req())
    assert resp.status == LLMStatus.INVALID_OUTPUT
    resp = run(make(lambda r: httpx.Response(200, content=b"pas du json")), req())
    assert resp.status == LLMStatus.INVALID_OUTPUT


@pytest.mark.parametrize("code", [400, 401, 403, 404, 429, 500, 503])
def test_http_errors_are_generic(code, caplog):
    err = {"error": {"code": "model_not_found", "message": BODY_SECRET, "type": "x"}}
    with caplog.at_level(logging.DEBUG):
        resp = run(make(lambda r: httpx.Response(code, json=err)), req())
    assert resp.status == LLMStatus.ERROR and resp.content == ""
    assert BODY_SECRET not in resp.model_dump_json() and BODY_SECRET not in caplog.text and KEY not in caplog.text


def test_network_error_and_timeout():
    def boom(r):
        raise httpx.ConnectError(f"connexion refusée {KEY}")

    def slow(r):
        raise httpx.ReadTimeout("trop long")

    assert run(make(boom), req()).status == LLMStatus.ERROR
    assert run(make(slow), req()).status == LLMStatus.TIMEOUT


def test_secrets_never_leak(caplog):
    with caplog.at_level(logging.DEBUG):
        a = make(lambda r: httpx.Response(200, json=ok_body()))
        resp = run(a, req("replier"))
    system = json.loads(json.dumps(a.build_payload(req("replier"))))["system"]
    assert KEY not in repr(a) and KEY not in caplog.text and KEY not in resp.model_dump_json()
    assert "CONTEXTE" not in caplog.text and "Bonjour" not in caplog.text and system[:60] not in caplog.text


def test_call_provider_end_to_end_with_retry():
    calls = []

    def handler(r):
        calls.append(1)
        return httpx.Response(503, json={"error": {"message": BODY_SECRET}}) if len(calls) == 1 else httpx.Response(200, json=ok_body())

    rules = load_rules(DATA, "rules_v1")
    eng = ActionEngine(None, rules, make(handler))  # type: ignore[arg-type]
    out = call_provider(eng, req(), extra_calls_allowed=1)
    assert out.ok and out.calls == 2 and out.response.content == "Bonjour"

    calls.clear()
    out = call_provider(ActionEngine(None, rules, make(lambda r: httpx.Response(401, json={}))), req(), extra_calls_allowed=1)  # type: ignore[arg-type]
    assert not out.ok and out.error["code"] == "LLM_UNAVAILABLE" and BODY_SECRET not in json.dumps(out.error) and KEY not in json.dumps(out.error)

    out = call_provider(ActionEngine(None, rules, make(lambda r: httpx.Response(200, json=ok_body(content=[])))), req(), extra_calls_allowed=1)  # type: ignore[arg-type]
    assert out.error["code"] == "INVALID_OUTPUT" and out.calls == 1


# --- configuration -------------------------------------------------------------------------------


def settings(tmp_path, **kw):
    return {"RUBIX_DB_PATH": str(tmp_path / "x.db"), **kw}


def test_real_requires_key_and_url(tmp_path):
    with pytest.raises(ConfigError) as e:
        Settings.from_env(settings(tmp_path, RUBIX_LLM_PROVIDER="real"))
    text = " ".join(e.value.problems)
    assert "RUBIX_LLM_API_KEY" in text and "RUBIX_LLM_BASE_URL" in text


def test_real_url_must_be_https_except_localhost(tmp_path):
    with pytest.raises(ConfigError):
        Settings.from_env(settings(tmp_path, RUBIX_LLM_PROVIDER="real", RUBIX_LLM_API_KEY=KEY, RUBIX_LLM_BASE_URL="http://relais.example.test"))
    s = Settings.from_env(settings(tmp_path, RUBIX_LLM_PROVIDER="real", RUBIX_LLM_API_KEY=KEY, RUBIX_LLM_BASE_URL="http://localhost:9999"))
    assert s.llm_base_url == "http://localhost:9999"


def test_axis_fallback_names_and_no_secret_exposed(tmp_path):
    s = Settings.from_env(settings(tmp_path, RUBIX_LLM_PROVIDER="real", AXIS_GATEWAY_KEY=KEY, AXIS_GATEWAY_URL=BASE))
    assert s.llm_api_key == KEY and s.llm_base_url == BASE
    assert KEY not in repr(s) and KEY not in json.dumps(s.public_summary())
    assert s.public_summary()["llm_api_key_set"] is True
    a = get_adapter("real", s)
    assert a.name == "real" and a.simulated is False and KEY not in repr(a)


def test_get_adapter_real_without_config_is_unavailable():
    with pytest.raises(ApiError) as e:
        get_adapter("real")
    assert e.value.code == ErrorCode.LLM_UNAVAILABLE
    assert get_adapter("mock").simulated is True


def test_unknown_model_is_config_error(tmp_path):
    (tmp_path / "llm").mkdir()
    bad = json.loads((DATA / "llm" / "models.json").read_text())
    bad["roles"]["scout"] = "modele-inexistant"
    (tmp_path / "llm" / "models.json").write_text(json.dumps(bad))
    with pytest.raises(LLMModelsError, match="scout"):
        load_llm_models(tmp_path)


def test_models_file_valid_and_covers_hangar():
    data = json.loads((DATA / "llm" / "models.json").read_text())
    schema = json.loads((DATA / "schemas" / "llm_models.schema.json").read_text())
    jsonschema.validate(data, schema)
    models = load_llm_models(DATA)
    for role in HangarRole:
        assert role.value in models.roles
    for extra in ("relevance", "assistant_prospection", "assistant_clients", "assistant_pub"):
        assert extra in models.roles
    assert models.roles["scout"] == models.roles["triage"] == "claude-haiku-4-5-20251001"
    assert models.roles["replier"] == models.roles["ads"] == "claude-sonnet-5-5"
