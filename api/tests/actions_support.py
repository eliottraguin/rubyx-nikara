"""Outils de test des moteurs d'économie et d'actions : faux fournisseur scripté, fabrique d'application,
préparation directe de la base (la tentative est ouverte par BE02 ; ici on l'insère)."""

from __future__ import annotations

import asyncio
import json
import threading
from collections.abc import Callable
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker

from app.config import Settings
from app.db import make_engine, make_session_factory
from app.llm.base import LLMAdapter, LLMRequest, LLMResponse, LLMStatus, Usage
from app.main import create_app
from app.models import AgentOwnership, LedgerEntry, MissionAttempt, new_id


class FakeLLM(LLMAdapter):
    """Fournisseur scripté, sans réseau. `handler(request, n)` (n = n-ième appel) renvoie
    "ok" | "error" | "raise" | "timeout" | "invalid" | un texte | une LLMResponse."""

    name = "fake"
    simulated = True

    def __init__(self, handler: Callable[[LLMRequest, int], object] | None = None, delay: float = 0.0):
        self.handler = handler or (lambda req, n: "ok")
        self.delay = delay
        self.requests: list[LLMRequest] = []
        self._lock = threading.Lock()

    @property
    def calls(self) -> int:
        return len(self.requests)

    async def generate(self, request: LLMRequest) -> LLMResponse:
        with self._lock:
            self.requests.append(request)
            n = len(self.requests)
        if self.delay:
            await asyncio.sleep(self.delay)
        out = self.handler(request, n)
        if out == "raise":
            raise RuntimeError("panne fournisseur simulée")
        if out == "timeout":
            await asyncio.sleep(30)
        if isinstance(out, LLMResponse):
            return out
        status, content = LLMStatus.OK, f"Réponse simulée n°{n} du rôle {request.role.value}."
        if out == "error":
            status, content = LLMStatus.ERROR, ""
        elif out == "invalid":
            status, content = LLMStatus.INVALID_OUTPUT, "???"
        elif out not in ("ok", None):
            content = str(out)
        return LLMResponse(
            content=content, usage=Usage(input_tokens=1, output_tokens=1, measured=False), duration_ms=1,
            provider_call_id=f"fake_{n}", status=status,
        )


def plan_json(*steps: dict, summary: str = "Plan de test") -> str:
    return json.dumps({"steps": list(steps), "summary": summary})


def step(role: str = "writer", task: str = "Tâche", source_ids: list[str] | None = None, depends_on: int | None = None) -> dict:
    return {"role": role, "task": task, "source_ids": source_ids or [], "depends_on": depends_on}


def lead_handler(plan: str) -> Callable[[LLMRequest, int], object]:
    """Le chef renvoie `plan` ; les autres rôles répondent normalement."""
    return lambda req, n: plan if (req.expected_schema or {}).get("title") == "LeadPlan" else "ok"


class World:
    """Une application + une partie + accès direct à la base."""

    def __init__(self, settings: Settings, llm: LLMAdapter | None = None, mode: str = "beginner"):
        self.settings = settings
        self._n = 0
        self._nlock = threading.Lock()
        app = create_app(settings)
        if llm is not None:
            app.state.llm = llm
        self.llm = llm
        self.app = app
        self._client = TestClient(app)
        self.client = self._client.__enter__()
        r = self.client.post("/api/sessions", json={"company_name": "Atelier Test", "mode": mode}, headers=self.key())
        assert r.status_code == 201, r.text
        self.sid = r.json()["session"]["id"]
        self._engine = make_engine(settings)
        self.sf: sessionmaker[Session] = make_session_factory(self._engine)

    def close(self) -> None:
        self._client.__exit__(None, None, None)
        self._engine.dispose()

    def key(self) -> dict[str, str]:
        with self._nlock:
            self._n += 1
            return {"Idempotency-Key": f"key-{id(self)}-{self._n:06d}"}

    # --- préparation directe de la base ---
    def grant(self, amount: int, source: str | None = None) -> None:
        with self.sf() as db:
            db.add(LedgerEntry(session_id=self.sid, amount=amount, category="test", source_action=source or new_id("test")))
            db.commit()

    def own(self, *roles: str) -> None:
        with self.sf() as db:
            for role in roles:
                db.add(AgentOwnership(session_id=self.sid, role=role, price_paid=0))
            db.commit()

    def attempt(self, mission_id: str = "m2", unit_price: int = 1, status: str = "ACTIVE", spend_cap: int | None = None, attempt_no: int = 1, **kw) -> str:
        with self.sf() as db:
            att = MissionAttempt(session_id=self.sid, mission_id=mission_id, unit_price=unit_price, status=status, spend_cap=spend_cap, attempt_no=attempt_no, **kw)
            db.add(att)
            db.commit()
            return att.id

    def complete(self, mission_id: str) -> None:
        self.attempt(mission_id, status="COMPLETED")

    def get_attempt(self, attempt_id: str) -> MissionAttempt:
        with self.sf() as db:
            return db.get(MissionAttempt, attempt_id)

    # --- API ---
    def balance(self) -> dict:
        return self.client.get("/api/state").json()["balance"]

    def send(self, attempt_id: str, role: str = "writer", text: str = "Rédige une annonce", key: dict | None = None, **extra):
        return self.client.post(f"/api/attempts/{attempt_id}/messages", json={"role": role, "text": text, **extra}, headers=key or self.key())

    def clarify(self, attempt_id: str, question: str = "Quels horaires ?", key: dict | None = None):
        return self.client.post(f"/api/attempts/{attempt_id}/clarifications", json={"question": question}, headers=key or self.key())

    def buy(self, role: str, key: dict | None = None):
        return self.client.post("/api/agents/purchase", json={"role": role}, headers=key or self.key())

    def confirm(self, action_id: str, key: dict | None = None):
        return self.client.post(f"/api/actions/{action_id}/confirm", headers=key or self.key())


def rules_copy(data_copy: Path, **limits: int) -> Settings:
    """Copie des règles avec des limites modifiées (ex. timeout court pour les tests)."""
    path = data_copy / "rules" / "rules_v1.json"
    rules = json.loads(path.read_text(encoding="utf-8"))
    rules["limits"].update(limits)
    path.write_text(json.dumps(rules), encoding="utf-8")
    return Settings(db_path=data_copy.parent / "rules_copy.db", data_dir=data_copy)
