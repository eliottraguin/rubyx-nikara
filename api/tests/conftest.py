from __future__ import annotations

import shutil
import uuid
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import REPO_DIR, Settings
from app.main import create_app

KEY = {"Idempotency-Key": "test-key-00000001"}


def new_key(n: int) -> dict[str, str]:
    return {"Idempotency-Key": f"test-key-{n:08d}"}


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(db_path=tmp_path / "test.db")


@pytest.fixture
def client(settings: Settings):
    with TestClient(create_app(settings)) as c:
        yield c


@pytest.fixture
def make_session():
    def _make(client: TestClient, mode: str = "beginner", name: str = "Atelier Test"):
        # une clé neuve par création, comme un vrai client : la création est idempotente par clé
        r = client.post("/api/sessions", json={"company_name": name, "mode": mode}, headers={"Idempotency-Key": f"create-{uuid.uuid4().hex}"})
        assert r.status_code == 201, r.text
        return r.json()

    return _make


@pytest.fixture
def data_copy(tmp_path: Path) -> Path:
    """Copie modifiable du dossier data/ (pour tester le chargement des règles)."""
    dest = tmp_path / "data"
    shutil.copytree(REPO_DIR / "data", dest)
    return dest
