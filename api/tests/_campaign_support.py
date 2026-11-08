"""Aides de test : dossier de données minimal et « navigateur » (client HTTP avec son cookie).

L'ancien moteur d'expédition (missions, tentatives, livrables, évaluation) est retiré (6e décision, API-R3) : il ne reste
que la fabrique de réglages (règles, fiche, assistants, pub dans un dossier de données temporaire) et le joueur HTTP."""

from __future__ import annotations

import shutil
from pathlib import Path

from fastapi.testclient import TestClient

from app.config import REPO_DIR, Settings


def make_settings(tmp_path: Path, *, demo_secret: str | None = None, name: str = "t.db") -> Settings:
    data = tmp_path / "data"
    (data / "rules").mkdir(parents=True, exist_ok=True)
    shutil.copy(REPO_DIR / "data" / "rules" / "rules_v1.json", data / "rules" / "rules_v1.json")
    shutil.copy(REPO_DIR / "data" / "rules" / "rules_v2.json", data / "rules" / "rules_v2.json")
    shutil.copytree(REPO_DIR / "data" / "profile", data / "profile", dirs_exist_ok=True)
    shutil.copytree(REPO_DIR / "data" / "assistant", data / "assistant", dirs_exist_ok=True)  # textes lisibles des assistants
    shutil.copytree(REPO_DIR / "data" / "ads", data / "ads", dirs_exist_ok=True)  # section Pub : formats, checklist, réglages du kit
    (data / "rubrics").mkdir(parents=True, exist_ok=True)
    shutil.copy(REPO_DIR / "data" / "rubrics" / "ad_kit_v1.json", data / "rubrics" / "ad_kit_v1.json")
    shutil.copytree(REPO_DIR / "data" / "shop", data / "shop", dirs_exist_ok=True)  # boutique (docs/CONTRACTS-V2.md §2)
    shutil.copytree(REPO_DIR / "data" / "agents", data / "agents", dirs_exist_ok=True)  # paliers (`tiers.json`)
    shutil.copytree(REPO_DIR / "data" / "roles", data / "roles", dirs_exist_ok=True)  # instructions initiales des instances
    return Settings(db_path=tmp_path / name, data_dir=data, demo_secret=demo_secret)


class Player:
    """Un « navigateur » : client HTTP avec son cookie + accès aux services internes."""

    def __init__(self, app, mode: str = "beginner", name: str = "Atelier"):
        self.app = app
        self.http = TestClient(app)
        self.n = 100
        r = self.http.post("/api/sessions", json={"company_name": name, "mode": mode}, headers=self.key())
        assert r.status_code == 201, r.text
        self.session_id = r.json()["session"]["id"]

    def key(self) -> dict[str, str]:
        self.n += 1
        return {"Idempotency-Key": f"player-{id(self)}-{self.n:08d}"}

    def post(self, path: str, json_body=None, headers=None):
        return self.http.post(path, json=json_body, headers={**self.key(), **(headers or {})})

    def state(self) -> dict:
        return self.http.get("/api/state").json()
