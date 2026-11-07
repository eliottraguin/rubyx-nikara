"""Outils de test du carnet : une expédition factice avec ses enregistrements de source et un rapport d'agent."""

from __future__ import annotations

import json
import uuid
from pathlib import Path

from fastapi.testclient import TestClient

from app.models import ArtifactVersion, ExpeditionRecord, MissionAttempt
from tests.actions_support import World


def k() -> dict[str, str]:
    return {"Idempotency-Key": f"pro-{uuid.uuid4().hex}"}


def annuaire(i: int, **over) -> dict:
    rec = {
        "source_ref": f"ann_{i:04d}", "entreprise": f"Boulangerie {i}", "collecte_le": "2026-10-01", "secteur": "Commerce de détail",
        "ville": "Lyon", "adresse_pro": f"{i} rue de la République", "telephone_standard": "04 78 00 00 00",
        "email_generique": f"contact{i}@exemple.test", "site_web": "https://exemple.test",
    }
    rec.update(over)
    return rec


def lead(i: int, source: str = "annuaire", **over) -> dict:
    out = {"source": source, "source_ref": f"ann_{i:04d}", "signal": "Ouverture récente", "raisons_fit": ["Secteur conforme"], "contact": "gérant"}
    out.update(over)
    return out


class Expedition:
    """Une tentative de la partie de `w`, avec enregistrements renvoyés et un rapport d'agent."""

    def __init__(self, w: World, records: list[tuple[str, dict]] | None = None, leads: list[dict] | None = None, n: int = 5, **attempt_kw):
        self.w = w
        w._exp_n = getattr(w, "_exp_n", 0) + 1  # (session, mission, attempt_no) est unique
        self.attempt_id = w.attempt("m1", attempt_no=w._exp_n, **attempt_kw)
        records = records if records is not None else [("annuaire", annuaire(i)) for i in range(1, n + 1)]
        with w.sf() as db:
            for source, rec in records:
                db.add(ExpeditionRecord(session_id=w.sid, attempt_id=self.attempt_id, source=source, source_ref=rec["source_ref"], record=rec))
            db.commit()
        self.report_id = self.add_report(leads if leads is not None else [lead(i) for i in range(1, n + 1)])

    def add_report(self, leads, author: str = "agent") -> str:
        with self.w.sf() as db:
            art = ArtifactVersion(attempt_id=self.attempt_id, type="report", content=json.dumps({"leads": leads}), author=author)
            db.add(art)
            db.commit()
            return art.id

    def body(self, positions, **over) -> dict:
        b = {"expedition_id": self.attempt_id, "rapport_version_id": self.report_id, "positions": list(positions)}
        b.update(over)
        return b

    def add(self, positions, client: TestClient | None = None, headers=None):
        return (client or self.w.client).post("/api/prospects", json=self.body(positions), headers=headers or k())


def world(settings, mode: str = "beginner") -> World:
    return World(settings, mode=mode)


def second_client(w: World, mode: str = "beginner") -> TestClient:
    """Une 2e partie (autre cookie) sur la même application."""
    c = TestClient(w.app)
    r = c.post("/api/sessions", json={"company_name": "Autre Atelier", "mode": mode}, headers=k())
    assert r.status_code == 201, r.text
    return c


def copy_with_limits(data_copy: Path, **limits: int):
    from app.config import Settings

    path = data_copy / "rules" / "rules_v2.json"
    rules = json.loads(path.read_text(encoding="utf-8"))
    rules["limits"].update(limits)
    path.write_text(json.dumps(rules), encoding="utf-8")
    return Settings(db_path=data_copy.parent / "limits_copy.db", data_dir=data_copy)
