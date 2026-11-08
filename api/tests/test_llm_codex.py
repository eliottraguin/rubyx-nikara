"""Fournisseur `codex` (SDK AXIS / Codex, GR3-61) : même contrat que `real`, testé sur faux transport httpx,
AUCUN appel réseau. Couvre la config, le branchement et la commande de diagnostic `llm-check`."""

from __future__ import annotations

import asyncio
import json

import httpx
import pytest

from app.cli.llm_check import run_llm_check
from app.config import ConfigError, Settings
from app.errors import ApiError, ErrorCode
from app.llm import LLMRequest, LLMStatus, get_adapter
from app.llm.codex import CodexLLMAdapter
from app.llm.mock import MockLLMAdapter
from app.llm.models_spec import load_llm_models

KEY = "sk-SENTINELLE-CODEX-0123456789"
BASE = "https://relais.example.test"
DATA = Settings().data_dir


def ok_body(text="OK"):
    return {"id": "msg_codex", "model": "m", "content": [{"type": "text", "text": text}], "usage": {"input_tokens": 5, "output_tokens": 2}}


def settings(tmp_path, **kw):
    return {"RUBIX_DB_PATH": str(tmp_path / "x.db"), **kw}


# --- configuration -------------------------------------------------------------------------------


def test_codex_requires_key_and_url(tmp_path):
    with pytest.raises(ConfigError) as e:
        Settings.from_env(settings(tmp_path, RUBIX_LLM_PROVIDER="codex"))
    text = " ".join(e.value.problems)
    assert "RUBIX_LLM_API_KEY" in text and "RUBIX_LLM_BASE_URL" in text


def test_codex_accepts_axis_fallback_names(tmp_path):
    s = Settings.from_env(settings(tmp_path, RUBIX_LLM_PROVIDER="codex", AXIS_GATEWAY_KEY=KEY, AXIS_GATEWAY_URL=BASE))
    assert s.llm_api_key == KEY and s.llm_base_url == BASE
    assert KEY not in json.dumps(s.public_summary())


# --- branchement -----------------------------------------------------------------------------------


def test_get_adapter_codex_returns_codex_adapter(tmp_path):
    s = Settings.from_env(settings(tmp_path, RUBIX_LLM_PROVIDER="codex", RUBIX_LLM_API_KEY=KEY, RUBIX_LLM_BASE_URL=BASE))
    a = get_adapter("codex", s)
    assert isinstance(a, CodexLLMAdapter) and a.name == "codex" and a.simulated is False
    assert KEY not in repr(a)


def test_get_adapter_codex_without_config_is_unavailable():
    with pytest.raises(ApiError) as e:
        get_adapter("codex")
    assert e.value.code == ErrorCode.LLM_UNAVAILABLE


def test_codex_same_protocol_as_real_on_fake_transport():
    seen = {}

    def handler(r: httpx.Request):
        seen.update(url=str(r.url), headers=dict(r.headers))
        return httpx.Response(200, json=ok_body())

    models = load_llm_models(DATA)
    adapter = CodexLLMAdapter(base_url=BASE, api_key=KEY, models=models, data_dir=DATA, transport=httpx.MockTransport(handler))
    req = LLMRequest(role="scout", context="CONTEXTE", max_output_tokens=20)
    resp = asyncio.run(adapter.generate(req))
    assert seen["url"] == BASE + "/v1/messages"
    assert seen["headers"]["x-api-key"] == KEY
    assert resp.status == LLMStatus.OK and resp.content == "OK"
    assert KEY not in resp.model_dump_json()


# --- diagnostic `llm-check` -------------------------------------------------------------------------


def test_run_llm_check_never_leaks_content_or_key():
    def handler(r: httpx.Request):
        return httpx.Response(200, json=ok_body("SECRET-REPONSE-DU-MODELE"))

    models = load_llm_models(DATA)
    adapter = CodexLLMAdapter(base_url=BASE, api_key=KEY, models=models, data_dir=DATA, transport=httpx.MockTransport(handler))
    report = run_llm_check(adapter)
    assert report == {
        "ok": True,
        "provider": "codex",
        "simulated": False,
        "role": "scout",
        "status": "ok",
        "duration_ms": report["duration_ms"],
        "usage": {"input_tokens": 5, "output_tokens": 2, "measured": True},
    }
    assert KEY not in json.dumps(report) and "SECRET-REPONSE-DU-MODELE" not in json.dumps(report)


def test_run_llm_check_with_mock_provider_is_deterministic_and_networkless():
    report = run_llm_check(MockLLMAdapter(), role="scout")
    assert report["ok"] is True and report["provider"] == "mock" and report["simulated"] is True
