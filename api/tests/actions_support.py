"""Outils de test des moteurs d'économie et d'actions : faux fournisseur scripté, fabrique d'application,
préparation directe de la base."""

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
from app.models import ActionRun, AgentOwnership, LedgerEntry, new_id
from app.services import ledger


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

    def action(self, type: str = "test", status: str = "RUNNING") -> str:
        """Une action nue de la partie (pour y rattacher une réservation)."""
        with self.sf() as db:
            row = ActionRun(session_id=self.sid, idempotency_key=new_id("k"), type=type, status=status)
            db.add(row)
            db.commit()
            return row.id

    def win_clients(self, n: int) -> None:
        """Porte à `n` le nombre de clients obtenus (écritures `client_reward` de 0 $ pour garder les soldes des tests ;
        la source unique par prospect est celle du vrai gain). Remplace l'ancien déblocage par score (API-S4)."""
        with self.sf() as db:
            for i in range(n):
                ledger.post_entry(db, self.sid, 0, ledger.CATEGORY_CLIENT, f"client:{self.sid}:t{i}")
            db.commit()

    # --- API ---
    def balance(self) -> dict:
        return self.client.get("/api/state").json()["balance"]

    def buy(self, role: str, key: dict | None = None):
        return self.client.post("/api/agents/purchase", json={"role": role}, headers=key or self.key())

    def shop_buy(self, item_id: str, key: dict | None = None):
        return self.client.post("/api/shop/purchase", json={"item_id": item_id}, headers=key or self.key())


def rules_copy(data_copy: Path, **limits: int) -> Settings:
    """Copie des règles avec des limites modifiées (ex. timeout court pour les tests)."""
    path = data_copy / "rules" / "rules_v1.json"
    rules = json.loads(path.read_text(encoding="utf-8"))
    rules["limits"].update(limits)
    path.write_text(json.dumps(rules), encoding="utf-8")
    return Settings(db_path=data_copy.parent / "rules_copy.db", data_dir=data_copy)
