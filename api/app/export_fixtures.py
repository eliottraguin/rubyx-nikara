"""Régénère data/fixtures/ : `uv run python -m app.export_fixtures`.

Les états proviennent de l'API réelle (fournisseur simulé, base temporaire) ;
les champs variables (id, date, graine) sont normalisés pour des fixtures stables."""

from __future__ import annotations

import json
import tempfile
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

from .config import REPO_DIR, Settings
from .errors import CATALOG, ApiError, ErrorCode
from .main import create_app
from .schemas.common import ErrorBody, ErrorResponse

FIXTURES_DIR = REPO_DIR / "data" / "fixtures"


def normalize_state(state: dict[str, Any]) -> dict[str, Any]:
    s = json.loads(json.dumps(state))
    s["session"]["id"] = "ses_exemple0000000001"
    s["session"]["created_at"] = "2026-01-01T09:00:00Z"
    s["session"]["seed"] = 12345
    return s


def initial_state(mode: str, settings: Settings) -> dict[str, Any]:
    with TestClient(create_app(settings)) as client:
        r = client.post(
            "/api/sessions",
            json={"company_name": "Atelier Exemple", "mode": mode},
            headers={"Idempotency-Key": f"fixture-key-{mode}"},  # une clé par création (idempotente par clé)
        )
        assert r.status_code == 201, r.text
        return normalize_state(r.json())


def error_fixture(code: ErrorCode) -> dict[str, Any]:
    status, _ = CATALOG[code]
    err = ApiError(code)
    body = ErrorResponse(error=ErrorBody(code=code.value, message=err.message))
    return {"http_status": status, "body": body.model_dump(mode="json", exclude_none=True)}


def build_all(settings: Settings) -> dict[Path, Any]:
    files: dict[Path, Any] = {}
    for mode in ("beginner", "expert"):
        files[FIXTURES_DIR / f"state_initial_{mode}.json"] = initial_state(mode, settings)
    for code in ErrorCode:
        files[FIXTURES_DIR / "errors" / f"{code.value}.json"] = error_fixture(code)
    return files


def main() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        settings = Settings(db_path=Path(tmp) / "fixtures.db")
        files = build_all(settings)
    for path, content in files.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(content, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"{len(files)} fixtures écrites dans {FIXTURES_DIR}")


if __name__ == "__main__":
    main()
