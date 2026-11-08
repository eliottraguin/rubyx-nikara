"""Branche l'exécution de `tools/validate_content.py` dans pytest (GR3-83) : il ne doit plus jamais se
périmer en silence. Exécuté en sous-processus pour reproduire fidèlement `python tools/validate_content.py`."""
from __future__ import annotations

import json
import shutil
import subprocess
import sys

from app.config import REPO_DIR

VALIDATE_SCRIPT = REPO_DIR / "tools" / "validate_content.py"


def _run(root) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(VALIDATE_SCRIPT), "--root", str(root)],
        capture_output=True,
        text=True,
        check=False,
    )


def test_validate_content_passes_on_repo():
    result = _run(REPO_DIR)
    assert result.returncode == 0, result.stdout + result.stderr
    assert "OK : contenu valide." in result.stdout


def test_validate_content_detects_invalid_data(tmp_path):
    root = tmp_path / "repo"
    shutil.copytree(REPO_DIR / "data", root / "data")

    levels_path = root / "data" / "company" / "levels.json"
    levels = json.loads(levels_path.read_text(encoding="utf-8"))
    levels["levels"][2]["objectifs"]["clients_min"] = 0  # casse la progression croissante du niveau 3
    levels_path.write_text(json.dumps(levels, ensure_ascii=False), encoding="utf-8")

    result = _run(root)
    assert result.returncode == 1
    assert "company/levels" in result.stdout
