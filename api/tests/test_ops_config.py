"""BE08 : configuration validée au démarrage, aucun secret par défaut ni affiché."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pytest

from app.config import API_DIR, ConfigError, Settings

SECRET = "super-secret-value-123456"


def env(tmp_path: Path, **kw: str) -> dict[str, str]:
    return {"RUBIX_DB_PATH": str(tmp_path / "x.db"), **kw}


def test_defaults_have_no_secret(tmp_path):
    s = Settings.from_env(env(tmp_path))
    assert s.demo_secret is None and s.llm_api_key is None
    assert (s.llm_provider, s.retention_days, s.token_cap_session, s.token_cap_global) == ("mock", 7, None, None)
    summary = s.public_summary()
    assert summary["demo_enabled"] is False and "demo_secret" not in summary


@pytest.mark.parametrize(
    "bad, fragment",
    [
        ({"RUBIX_LLM_PROVIDER": "openai"}, "RUBIX_LLM_PROVIDER"),
        ({"RUBIX_LLM_PROVIDER": "real"}, "RUBIX_LLM_API_KEY"),
        ({"RUBIX_DEMO_SECRET": "court"}, "RUBIX_DEMO_SECRET"),
        ({"RUBIX_RETENTION_DAYS": "0"}, "RUBIX_RETENTION_DAYS"),
        ({"RUBIX_RETENTION_DAYS": "abc"}, "RUBIX_RETENTION_DAYS"),
        ({"RUBIX_TOKEN_CAP_SESSION": "-1"}, "RUBIX_TOKEN_CAP_SESSION"),
        ({"RUBIX_TOKEN_CAP_SESSION": "500", "RUBIX_TOKEN_CAP_GLOBAL": "100"}, "ne peut pas dépasser"),
        ({"RUBIX_CORS_ORIGINS": "*"}, "RUBIX_CORS_ORIGINS"),
        ({"RUBIX_CORS_ORIGINS": "localhost:3000"}, "origine invalide"),
        ({"RUBIX_COOKIE_SECURE": "peut-être"}, "RUBIX_COOKIE_SECURE"),
        ({"RUBIX_LOG_FORMAT": "xml"}, "RUBIX_LOG_FORMAT"),
        ({"RUBIX_RULES_VERSION": "rules_v99"}, "Règles introuvables"),
    ],
)
def test_incoherent_values_are_reported(tmp_path, bad, fragment):
    with pytest.raises(ConfigError) as exc:
        Settings.from_env(env(tmp_path, **bad))
    assert fragment in str(exc.value)


def test_all_problems_listed_and_secrets_never_echoed(tmp_path):
    with pytest.raises(ConfigError) as exc:
        Settings.from_env(env(tmp_path, RUBIX_LLM_PROVIDER="real", RUBIX_DEMO_SECRET=SECRET[:5], RUBIX_RETENTION_DAYS="0"))
    assert len(exc.value.problems) == 4
    assert SECRET[:5] not in str(exc.value)


def test_db_path_directory_refused(tmp_path):
    with pytest.raises(ConfigError, match="dossier"):
        Settings.from_env({"RUBIX_DB_PATH": str(tmp_path)})


def test_valid_full_config(tmp_path):
    s = Settings.from_env(
        env(
            tmp_path,
            RUBIX_DEMO_SECRET=SECRET,
            RUBIX_TOKEN_CAP_SESSION="100",
            RUBIX_TOKEN_CAP_GLOBAL="1000",
            RUBIX_CORS_ORIGINS="http://localhost:3000,https://a.example",
        )
    )
    assert s.demo_secret == SECRET and SECRET not in repr(s)
    assert s.public_summary()["demo_enabled"] is True and SECRET not in str(s.public_summary())


def _run(code: str, tmp_path: Path, **kw: str) -> subprocess.CompletedProcess:
    full = {**os.environ, "RUBIX_DB_PATH": str(tmp_path / "s.db"), **kw}
    return subprocess.run([sys.executable, "-c", code], cwd=API_DIR, env=full, capture_output=True, text=True, timeout=60)


def test_startup_fails_readably(tmp_path):
    r = _run("import app.main", tmp_path, RUBIX_LLM_PROVIDER="real", RUBIX_DEMO_SECRET=SECRET)
    assert r.returncode == 2
    assert "Configuration invalide" in r.stderr and "RUBIX_LLM_API_KEY" in r.stderr
    assert "Traceback" not in r.stderr and SECRET not in r.stderr + r.stdout


def test_cli_config_fails_with_code_2(tmp_path):
    r = _run("import sys; from app.cli.__main__ import main; sys.exit(main(['config']))", tmp_path, RUBIX_RETENTION_DAYS="0")
    assert r.returncode == 2 and "RUBIX_RETENTION_DAYS" in r.stderr
