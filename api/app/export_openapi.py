"""Exporte l'OpenAPI vers api/openapi.json : `uv run python -m app.export_openapi`."""

from __future__ import annotations

import json

from .config import API_DIR, Settings
from .main import create_app

OPENAPI_PATH = API_DIR / "openapi.json"


def render(settings: Settings | None = None) -> str:
    return json.dumps(create_app(settings).openapi(), indent=2, ensure_ascii=False, sort_keys=True) + "\n"


if __name__ == "__main__":
    OPENAPI_PATH.write_text(render(), encoding="utf-8")
    print(f"écrit : {OPENAPI_PATH}")
