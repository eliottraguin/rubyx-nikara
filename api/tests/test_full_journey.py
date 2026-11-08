"""Parcours complet du joueur (docs/PARCOURS-BOT.md) sur l'API réelle : fournisseur simulé, aucun réseau.

Seule donnée insérée en base : le solde de test (écriture au ledger). Le reste passe par les routes."""

from __future__ import annotations

import json
import re
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.config import REPO_DIR
from app.models import LedgerEntry
from app.rules_v2 import load_rules_v2

RULES = load_rules_v2(REPO_DIR / "data")
REWARD = RULES.client_reward
EXAMPLES = REPO_DIR / "data" / "planets"
PHONE_RE = re.compile(r"(?<![\w])(?:\+33|0)\s?[1-9](?:[\s.-]?\d{2}){4}(?![\w])")
EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")


def k() -> dict[str, str]:
    return {"Idempotency-Key": f"jr-{uuid.uuid4().hex}"}


def example(name: str) -> dict:
    raw = json.loads((EXAMPLES / "annuaire" / "examples" / name).read_text(encoding="utf-8"))
    return {key: v for key, v in raw.items() if key not in ("id", "simule", "profile_spec")}


class Journey:
    def __init__(self, app) -> None:
        self.app = app
        self.c = TestClient(app)
        r = self.c.post("/api/sessions", json={"company_name": "Caisselia", "mode": "beginner"}, headers=k())
        assert r.status_code == 201, r.text
        self.sid = r.json()["session"]["id"]
        self.seen: list[str] = []

    # --- outils ---
    def check(self, r, *codes: int):
        assert r.status_code in codes, f"{r.request.method} {r.request.url.path} -> {r.status_code} {r.text}"
        # le carnet montre au joueur SON contact (c'est le produit) ; toutes les autres routes ne doivent jamais le montrer
        if not (r.request.url.path.startswith("/api/prospects") and r.request.method in ("GET", "PATCH")):
            self.seen.append(r.text)
        return r

    def state(self) -> dict:
        return self.check(self.c.get("/api/state"), 200).json()

    def balance(self) -> int:
        return self.state()["balance"]["booked"]

    def grant(self, amount: int) -> None:
        with self.app.state.session_factory() as db:
            db.add(LedgerEntry(session_id=self.sid, amount=amount, category="test", source_action="grant"))
            db.commit()

    def put_profile(self, profile: dict) -> None:
        version = self.state()["target_profile"]["profile_version"]
        self.check(self.c.put("/api/profile", json={"expected_version": version, **profile}, headers=k()), 200)

    def search(self, planet: str, precision: str | None = None):
        body = {"planet_id": planet, **({"precision": precision} if precision else {})}
        return self.c.post("/api/searches", json=body, headers=k())

    def prospects(self) -> list[dict]:
        return self.check(self.c.get("/api/prospects?limit=100"), 200).json()["items"]

    def contact(self, pid: str) -> str:
        return self.check(self.c.post(f"/api/prospects/{pid}/contact", json={}, headers=k()), 200, 201).json()["id"]

    def say(self, cid: str, text: str, **extra):
        return self.c.post(f"/api/conversations/{cid}/messages", json={"text": text, **extra}, headers=k())

    def set_status(self, pid: str, statut: str):
        v = self.c.get(f"/api/prospects/{pid}").json()["version"]
        return self.c.patch(f"/api/prospects/{pid}", json={"version": v, "statut": statut}, headers=k())

    def buy(self, role: str):
        return self.c.post("/api/agents/purchase", json={"role": role}, headers=k())

    def role(self, role: str) -> dict:
        return next(h for h in self.state()["hangar"] if h["role"] == role)

    def win_one(self) -> str:
        """Obtient un client par le chemin légitime : contact, premier message, réponse du client simulé, statut `gagne`.
        Certaines personas simulées restent silencieuses (par conception) : on passe au prospect suivant."""
        for p in self.prospects():
            if p["statut"] == "gagne":
                continue
            cid = self.contact(p["id"])
            r = self.say(cid, "Bonjour, nous proposons une caisse sur tablette pour votre commerce.")
            if r.status_code == 409 and r.json()["error"]["code"] == "OPTED_OUT":
                continue
            out = self.check(r, 200).json()
            if out["etat"] == "ouverte" and any(m["sens"] == "recu" for m in out["messages"]):
                self.check(self.set_status(p["id"], "gagne"), 200)
                return p["id"]
        raise AssertionError("aucun prospect du carnet n'a répondu")

    def no_contact_value_leaked(self) -> None:
        values = set()
        with self.app.state.session_factory() as db:
            from app.models import Prospect
            for p in db.scalars(select(Prospect).where(Prospect.session_id == self.sid)):
                if p.canal_valeur:
                    values.add(p.canal_valeur)
        for text in self.seen:
            assert not PHONE_RE.search(text), "numéro de téléphone dans une réponse"
            assert not EMAIL_RE.search(text), "adresse email dans une réponse"
            assert all(v not in text for v in values)


@pytest.fixture
def app(client):
    return client.app


@pytest.fixture
def j(app) -> Journey:
    return Journey(app)


@pytest.fixture
def searched(j: Journey) -> Journey:
    j.put_profile(example("exemple_caisse_commerce.json"))
    s = j.check(j.search("annuaire"), 202).json()
    assert s["kept"] >= 3
    return j


# --- 1 à 3 : partie, fiche, état ---------------------------------------------------------------------------------


def test_step1_state_after_profile(j: Journey):
    st = j.state()
    assert st["balance"]["booked"] == 30 and st["clients_obtained"] == 0
    j.put_profile(example("exemple_caisse_commerce.json"))
    st = j.state()
    assert st["target_profile"]["profile_version"] >= 2
    planets = {p["id"]: p for p in st["planets"]}
    assert planets["annuaire"]["status"] == "AVAILABLE" and planets["registre"]["status"] == "LOCKED"
    assert st["building"]["level"] == 1 and st["building"]["clients_obtained"] == 0
    assert {h["role"] for h in st["hangar"]} >= {"scout", "triage", "replier", "ads"}
    assert j.role("replier")["unlocked"] is False and j.role("scout")["owned"] is True


# --- 4 à 6 : recherches, étiquettes, déblocage du registre ----------------------------------------------------------


def test_step2_annuaire_search_fills_the_notebook(j: Journey):
    j.put_profile(example("exemple_caisse_commerce.json"))
    s = j.check(j.search("annuaire"), 202).json()
    assert s["status"] == "DONE" and s["kept"] >= 3
    items = j.prospects()
    assert len(items) == s["kept"]
    assert sum(1 for p in items if p["pertinence_etiquette"] == "correspond") >= 3, [p["pertinence_etiquette"] for p in items]
    assert j.balance() == 30  # recherche gratuite
    j.no_contact_value_leaked()


def test_step3_registre_unlocks_and_can_be_searched(searched: Journey):
    j = searched
    planets = {p["id"]: p for p in j.state()["planets"]}
    assert planets["registre"]["status"] == "AVAILABLE"
    j.put_profile(example("exemple_emballages_restauration.json"))
    r = j.check(j.search("registre"), 202).json()
    assert r["status"] == "DONE" and r["planet_id"] == "registre"
    assert {p["source"] for p in j.prospects()} <= {"annuaire", "registre"}
    j.no_contact_value_leaked()


# --- 7 : contact, sans envoi -------------------------------------------------------------------------------------------


def test_step4_contact_opens_a_conversation_without_sending(searched: Journey):
    j = searched
    pid = j.prospects()[0]["id"]
    cid = j.contact(pid)
    d = j.check(j.c.get(f"/api/conversations/{cid}"), 200).json()
    assert d["prospect_id"] == pid and d["simule"] is True and not [m for m in d["messages"] if m["sens"] == "envoye"]
    assert j.balance() == 30
    j.no_contact_value_leaked()


# --- 8 à 10 : premier client, agents, immeuble -------------------------------------------------------------------------


def test_step5_agents_are_locked_with_zero_client(searched: Journey):
    j = searched
    r = j.buy("replier")
    assert r.status_code == 409 and r.json()["error"]["code"] == "ROLE_LOCKED"
    r = j.buy("triage")
    assert r.status_code == 409 and r.json()["error"]["code"] == "ROLE_LOCKED"
    assert j.state()["clients_obtained"] == 0


def test_step6_no_client_without_a_reply(searched: Journey):
    j = searched
    pid = j.prospects()[0]["id"]
    j.contact(pid)
    r = j.set_status(pid, "gagne")
    assert r.status_code == 409 and r.json()["error"]["code"] == "INVALID_STATE"
    assert j.balance() == 30 and j.state()["clients_obtained"] == 0


def test_step7_first_client_pays_once_and_unlocks_triage(searched: Journey):
    j = searched
    pid = j.win_one()
    st = j.state()
    assert st["clients_obtained"] == 1 and st["balance"]["booked"] == 30 + REWARD
    assert st["building"]["clients_obtained"] == 1 and st["building"]["level"] == 2
    j.check(j.set_status(pid, "gagne"), 200)  # rejeu du même statut : aucun second gain
    assert j.balance() == 30 + REWARD
    assert j.role("triage")["unlocked"] is True and j.role("replier")["unlocked"] is False
    j.grant(100)
    assert j.buy("replier").json()["error"]["code"] == "ROLE_LOCKED"
    before = j.balance()
    j.check(j.buy("triage"), 201)
    assert j.balance() == before - 35 and j.role("triage")["owned"] is True
    j.no_contact_value_leaked()


def test_step8_second_client_unlocks_replier(searched: Journey):
    j = searched
    j.win_one()
    j.win_one()
    st = j.state()
    assert st["clients_obtained"] == 2 and st["balance"]["booked"] == 30 + 2 * REWARD
    assert st["building"]["level"] == 3
    j.grant(100)
    before = j.balance()
    j.check(j.buy("replier"), 201)
    assert j.balance() == before - 45 and j.role("replier")["owned"] is True


# --- 11 : brouillon du premier message utilisé dans la conversation -----------------------------------------------------


def test_step9_first_message_draft_used_in_conversation(searched: Journey):
    j = searched
    j.win_one()
    j.win_one()
    j.grant(100)
    j.check(j.buy("replier"), 201)
    pid = j.prospects()[2]["id"]
    before = j.balance()
    r = j.check(j.c.post(f"/api/prospects/{pid}/message", json={"instruction": "ton chaleureux"}, headers=k()), 202).json()
    assert r["status"] == "SUCCEEDED" and r["version"]["kind"] == "message" and r["debited"] >= 1
    assert j.balance() == before - r["debited"]
    vid = r["version"]["id"]
    cid = j.contact(pid)
    sent = j.check(j.say(cid, r["version"].get("corps") or "Bonjour", draft_version_id=vid), 200).json()
    assert any(m["sens"] == "envoye" for m in sent["messages"])
    j.no_contact_value_leaked()


# --- 12 : assistant ----------------------------------------------------------------------------------------------------------


def test_step10_assistant_plan_triage_then_confirm(searched: Journey):
    j = searched
    j.win_one()
    j.grant(100)
    j.check(j.buy("triage"), 201)
    plan = j.c.post("/api/assistant/plans", json={"assistant": "assistant_clients", "message": "Résume la conversation du client"}, headers=k())
    plan = j.check(plan, 201).json()
    assert plan["status"] in ("PROPOSED", "READY", "PENDING") or plan["status"], plan
    types = [s["type"] for s in plan["steps"]]
    assert "conversation_triage" in types, plan
    before = j.balance()
    done = j.check(j.c.post(f"/api/assistant/plans/{plan['id']}/confirm", headers=k()), 202).json()
    assert done["status"] in ("DONE", "SUCCEEDED", "COMPLETED", "PARTIAL"), done
    assert j.balance() <= before
    j.no_contact_value_leaked()


# --- défaut produit connu : un prospect qui demande l'arrêt ne doit pas pouvoir devenir « client » ----------------------


def test_step11_opted_out_prospect_cannot_become_a_client(searched: Journey):
    from tests.messaging_support import RecMock, client_says

    j = searched
    j.app.state.actions.llm = RecMock(client_says("Merci de ne plus me contacter, arrêtez les messages, stop."))
    pid = j.prospects()[0]["id"]
    cid = j.contact(pid)
    out = j.check(j.say(cid, "Bonjour, nous proposons une caisse sur tablette."), 200).json()
    assert out["etat"] == "desinscrit", out
    r = j.set_status(pid, "gagne")
    assert r.status_code == 409, r.text
    assert j.balance() == 30 and j.state()["clients_obtained"] == 0
