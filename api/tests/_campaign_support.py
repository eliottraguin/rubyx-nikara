"""Aides de test du moteur de campagne et des livrables (BE02/BE05) : contenu minimal, parcours simulés.

Le contenu réel (data/missions, data/rubrics) est rédigé par P3 : ces tests utilisent des fixtures minimales
écrites dans un dossier de données temporaire, jamais le contenu du dépôt."""

from __future__ import annotations

import json
import shutil
from pathlib import Path

from fastapi.testclient import TestClient

from app.config import REPO_DIR, Settings
from app.main import create_app
from app.models import Evaluation, GameSession, MissionAttempt, Submission
from app.schemas.common import Role
from app.services import artifacts as art
from app.services import campaign as camp

MISSIONS = ["m1", "m2", "m3", "m4", "m5", "m6", "rescue"]
TARGET_CHANGE = {
    "id": "evt_target_change",
    "type": "target_change",
    "trigger": "after_first_proposal",
    "normal_play": True,
    "demo_selectable": True,
    "description": "Le client change de cible.",
    "creates_brief_version": 2,
    "brief_diff": [{"field": "objective", "before": "Cibler les étudiants", "after": "Cibler les actifs"}],
    "added_documents": ["doc_late"],
    "correction_credit": {"per_role": True},
}
M6_EVENT = {
    "id": "evt_m6_context",
    "type": "budget_reduced",
    "trigger": "before_first_action",
    "normal_play": True,
    "demo_selectable": False,
    "description": "Budget réduit.",
    "creates_brief_version": 2,
    "brief_diff": [{"field": "summary", "before": "Budget confortable", "after": "Budget réduit"}],
    "added_documents": [],
    "correction_credit": None,
}
DEMO_ONLY = {**TARGET_CHANGE, "id": "evt_demo_sources", "type": "contradictory_sources", "normal_play": False,
             "added_documents": [], "correction_credit": None,
             "brief_diff": [{"field": "summary", "before": "A", "after": "B"}]}


def variant(mission_id: str, mode: str, events: list[dict]) -> dict:
    return {
        "id": f"{mission_id}_{mode}_v1",
        "mission_id": mission_id,
        "mode": mode,
        "version": 1,
        "title": f"Titre {mission_id} {mode}",
        "rubric_id": f"{mission_id}_v1",
        "brief": {
            "version": 1,
            "client_name": "Client Test",
            "summary": "Budget confortable",
            "objective": "Cibler les étudiants",
            "facts": [{"id": "f_price", "label": "Prix", "value": "9,90", "essential": True, "source": "brief"}],
            "constraints": ["80 mots"],
            "deliverable_format": "texte",
            "missing_on_purpose": ["canal"],
        },
        "corpus_refs": ["doc_a"],
        "client": {"persona": "secret", "private_facts": [{"id": "x", "answer": "SECRET-CLIENT"}], "default_answer": "x", "max_questions": 2},
        "events": events,
        "reference_solution": {"deliverable": "SOLUTION-SECRETE"},
    }


def write_content(data_dir: Path, modes=("beginner", "expert")) -> None:
    (data_dir / "missions" / "_shared").mkdir(parents=True, exist_ok=True)
    (data_dir / "rubrics").mkdir(parents=True, exist_ok=True)
    for m in MISSIONS:
        for mode in modes:
            events = {"m5": [TARGET_CHANGE, DEMO_ONLY], "m6": [M6_EVENT]}.get(m, [])
            (data_dir / "missions" / f"{m}_{mode}_v1.json").write_text(json.dumps(variant(m, mode, events)), encoding="utf-8")
        (data_dir / "rubrics" / f"{m}_v1.json").write_text(
            json.dumps({"id": f"{m}_v1", "mission_id": m, "criteria": [{"id": "price", "weight": 100, "essential": True}]}), encoding="utf-8"
        )
        (data_dir / "missions" / "_shared" / f"{m}_corpus.json").write_text(
            json.dumps({
                "mission_id": m, "version": 1,
                "documents": [
                    {"id": "doc_a", "title": "Doc A", "kind": "document", "date": "2026-01-01", "authority": "x", "status": "current",
                     "visibility": "public", "added_by_event": None, "text": "Contenu A"},
                    {"id": "doc_secret", "title": "Privé", "kind": "document", "date": "2026-01-01", "authority": "x", "status": "current",
                     "visibility": "client_private", "added_by_event": None, "text": "PRIVE"},
                    {"id": "doc_late", "title": "Doc tardif", "kind": "document", "date": "2026-02-01", "authority": "x", "status": "current",
                     "visibility": "public", "added_by_event": "evt_target_change", "text": "Contenu tardif"},
                ],
            }),
            encoding="utf-8",
        )


def make_settings(tmp_path: Path, *, content: bool = True, demo_secret: str | None = None, name: str = "t.db", auto_evaluate: bool = False) -> Settings:
    data = tmp_path / "data"
    (data / "rules").mkdir(parents=True, exist_ok=True)
    shutil.copy(REPO_DIR / "data" / "rules" / "rules_v1.json", data / "rules" / "rules_v1.json")
    if content:
        write_content(data)
    return Settings(db_path=tmp_path / name, data_dir=data, demo_secret=demo_secret, auto_evaluate=auto_evaluate)


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

    def start(self, mission: str) -> dict:
        r = self.post(f"/api/missions/{mission}/start")
        assert r.status_code in (200, 201), r.text
        return r.json()

    def retry(self, mission: str) -> dict:
        r = self.post(f"/api/missions/{mission}/retry")
        assert r.status_code == 201, r.text
        return r.json()

    def artifact(self, attempt_id: str, content: str = "Texte du livrable", **extra):
        return self.post(f"/api/attempts/{attempt_id}/artifacts", {"content": content, **extra})

    def submit(self, attempt_id: str, artifact_id: str, **extra):
        return self.post(f"/api/attempts/{attempt_id}/submit", {"artifact_version_id": artifact_id, **extra})

    def mission(self, mission_id: str) -> dict:
        return next(m for m in self.state()["missions"] if m["id"] == mission_id)

    def play(self, mission: str, score: int, *, roles: tuple[Role, ...] = (), essential_failed: bool = False,
             spend: int | None = None, retry: bool = False):
        """Tentative complète simulée : ouvre, produit un livrable (contributions des `roles`), livre, injecte une
        évaluation au score donné (fonction de service interne, comme le fera BE06), clôt. Retourne (attempt_id, outcome)."""
        detail = self.retry(mission) if retry else self.start(mission)
        attempt_id = detail["attempt"]["id"]
        sf = self.app.state.session_factory
        ctx = camp.ctx_from_app(self.app)
        with sf() as db:
            game = db.get(GameSession, self.session_id)
            attempt = db.get(MissionAttempt, attempt_id)
            version_id = None
            for role in roles:
                v = art.create_agent_version(db, ctx, game, attempt, role=role, content=f"Contribution {role.value}", parent_id=version_id)
                version_id = v.id
        if version_id is None:
            r = self.artifact(attempt_id)
            assert r.status_code == 201, r.text
            version_id = r.json()["id"]
        r = self.submit(attempt_id, version_id)
        assert r.status_code == 201, r.text
        with sf() as db:
            game = db.get(GameSession, self.session_id)
            attempt = db.get(MissionAttempt, attempt_id)
            sub = db.get(Submission, r.json()["id"])
            evaluation = Evaluation(submission_id=sub.id, model="mock", judge_version="test", score=score, status="DONE")
            db.add(evaluation)
            db.flush()
            outcome = camp.settle_attempt(db, ctx.rules, game, attempt, evaluation, essential_failed=essential_failed, spend=spend)
        return attempt_id, outcome
