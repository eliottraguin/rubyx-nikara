"""Outils de test de la messagerie : faux carnet (`ProspectLookup` injecté), monde de test, fournisseur scripté."""

from __future__ import annotations

import json
import threading
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.config import Settings
from app.llm.base import LLMRequest, LLMResponse, LLMStatus, Usage
from app.llm.mock import MockLLMAdapter
from app.models import Conversation, GameSession
from app.services.prospect_lookup import ProspectRef

from .actions_support import World

EMAIL = "contact@boulangerie-test.example"
PHONE = "01 23 45 67 89"


class RecMock(MockLLMAdapter):
    """Fournisseur simulé du dépôt + enregistrement des requêtes + sorties forcées.
    `override(request, n)` renvoie None (comportement du simulé), « error », « invalid », « raise » ou le texte à produire."""

    name = "mock"

    def __init__(self, override=None):  # noqa: ANN001
        self.override = override
        self.requests: list[LLMRequest] = []
        self._lock = threading.Lock()

    async def generate(self, request: LLMRequest) -> LLMResponse:
        with self._lock:
            self.requests.append(request)
            n = len(self.requests)
        out = self.override(request, n) if self.override else None
        if out is None:
            return await super().generate(request)
        if out == "raise":
            raise RuntimeError("panne fournisseur simulée")
        status, content = LLMStatus.OK, str(out)
        if out == "error":
            status, content = LLMStatus.ERROR, ""
        elif out == "invalid":
            status, content = LLMStatus.INVALID_OUTPUT, "???"
        return LLMResponse(content=content, usage=Usage(input_tokens=1, output_tokens=1, measured=False), duration_ms=1, provider_call_id=f"rec_{n}", status=status)

    @property
    def calls(self) -> int:
        return len(self.requests)


class FakeProspects:
    """Faux carnet en mémoire : un prospect n'est visible que de sa session ; les statuts sont modifiables."""

    def __init__(self) -> None:
        self.rows: dict[tuple[str, str], ProspectRef] = {}
        self._lock = threading.Lock()

    def add(self, session_id: str, pid: str = "pro_01", **kw) -> ProspectRef:
        base = dict(
            id=pid, entreprise="Boulangerie Dupont", fonction="gérant", canal_type="email_generique", canal_value=EMAIL,
            source="annuaire", collecte_le="2026-11-07", statut="nouveau",
            instantane={"secteur": "boulangerie", "ville": "Lille", "contact_public": f"{EMAIL} / {PHONE}"},
        )
        base.update(kw)
        ref = ProspectRef(**base)
        self.rows[(session_id, pid)] = ref
        return ref

    def get(self, db, session_id, prospect_id):  # noqa: ANN001, ANN201
        return self.rows.get((session_id, prospect_id))

    def set_status(self, db, session_id, prospect_id, statut):  # noqa: ANN001
        with self._lock:
            ref = self.rows[(session_id, prospect_id)]
            self.rows[(session_id, prospect_id)] = ProspectRef(**{**ref.__dict__, "statut": statut})

    def status(self, session_id: str, pid: str = "pro_01") -> str:
        return self.rows[(session_id, pid)].statut


def reply_json(corps: str, a_verifier: list[str] | None = None, **extra) -> str:
    return json.dumps({"corps": corps, "a_verifier": a_verifier or [], **extra}, ensure_ascii=False)


def synth_json(intention: str = "question", citation: str = "", urgence: str = "normale", statut: str | None = "en_discussion", **extra) -> str:
    points = [{"texte": "Point", "citation": citation}] if citation else []
    return json.dumps({"intention": intention, "points": points, "urgence": urgence, "statut_suggere": statut, **extra}, ensure_ascii=False)


OPPOSITION = "Si vous ne souhaitez plus recevoir de message de ma part, répondez simplement « stop » et je ne vous écrirai plus."


class MWorld(World):
    """World + faux carnet + helpers de messagerie. `client_lines` : sortie du client simulé si on veut la forcer."""

    def __init__(self, settings: Settings, llm: RecMock | None = None, mode: str = "beginner"):
        super().__init__(settings, llm or RecMock(), mode)
        self.prospects = FakeProspects()
        self.app.state.prospects = self.prospects

    # --- préparation ---
    def prospect(self, pid: str = "pro_01", **kw) -> ProspectRef:
        return self.prospects.add(self.sid, pid, **kw)

    def conversation(self, pid: str = "pro_01", persona: str | None = None, **kw) -> str:
        self.prospect(pid, **kw) if (self.sid, pid) not in self.prospects.rows else None
        r = self.client.post("/api/conversations", json={"prospect_id": pid}, headers=self.key())
        assert r.status_code == 201, r.text
        cid = r.json()["id"]
        if persona:
            self.set_persona(cid, persona)
        return cid

    def set_persona(self, cid: str, persona: str) -> None:
        with self.sf() as db:
            db.get(Conversation, cid).persona_id = persona
            db.commit()

    def seed(self) -> int:
        with self.sf() as db:
            return db.get(GameSession, self.sid).seed

    # --- API ---
    def say(self, cid: str, text: str = "Bonjour, je vous écris au sujet de notre offre.", key: dict | None = None, **extra):
        return self.client.post(f"/api/conversations/{cid}/messages", json={"text": text, **extra}, headers=key or self.key())

    def triage(self, cid: str, key: dict | None = None, **body):
        return self.client.post(f"/api/conversations/{cid}/triage", json=body or None, headers=key or self.key())

    def reply(self, cid: str, key: dict | None = None, **body):
        return self.client.post(f"/api/conversations/{cid}/reply", json=body or None, headers=key or self.key())

    def detail(self, cid: str) -> dict:
        r = self.client.get(f"/api/conversations/{cid}")
        assert r.status_code == 200, r.text
        return r.json()

    def available(self) -> int:
        return self.balance()["available"]

    def other_client(self) -> tuple[TestClient, str]:
        """Un second joueur (autre partie) sur la même application."""
        c = TestClient(self.app)
        r = c.post("/api/sessions", json={"company_name": "Autre", "mode": "beginner"}, headers=self.key())
        assert r.status_code == 201
        return c, r.json()["session"]["id"]

    def contexts(self, purpose: str | None = None) -> list[str]:
        return [r.context for r in self.llm.requests if purpose is None or r.purpose.startswith(purpose)]  # type: ignore[union-attr]


def client_says(text: str, then=None):  # noqa: ANN001
    """Surcharge : le client simulé dit `text` ; les autres appels passent à `then(req, n)` ou au simulé du dépôt."""

    def handler(req: LLMRequest, n: int) -> object:
        if req.purpose == "client_sim":
            return text
        return then(req, n) if then else None

    return handler


def data_with_persona(data_copy: Path, persona: dict) -> Settings:
    """Copie de data/ où une persona de test est ajoutée (ex. longue, pour le plafond de tours)."""
    path = data_copy / "clients" / "personas_v1.json"
    raw = json.loads(path.read_text(encoding="utf-8"))
    raw["personas"].append(persona)
    path.write_text(json.dumps(raw, ensure_ascii=False), encoding="utf-8")
    return Settings(db_path=data_copy.parent / "persona.db", data_dir=data_copy)


def conv_ids(world: MWorld) -> list[str]:
    with world.sf() as db:
        return list(db.scalars(select(Conversation.id).where(Conversation.session_id == world.sid)))
