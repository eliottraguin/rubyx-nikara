"""API-S4 : économie et progression par CLIENTS OBTENUS. Un prospect qui accepte (statut `gagne`) rapporte
`client_reward` $ une seule fois ; le compteur déverrouille les agents et monte l'immeuble. Fournisseur simulé, aucun réseau."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.config import REPO_DIR
from app.main import create_app
from app.models import Conversation, ConversationMessage, LedgerEntry, Prospect
from app.rules_v2 import load_rules_v2

from ._campaign_support import Player, make_settings

REWARD = load_rules_v2(REPO_DIR / "data").client_reward


@pytest.fixture
def app(tmp_path):
    application = create_app(make_settings(tmp_path))
    with TestClient(application):
        yield application


def add_prospect(app, p: Player, name: str = "Boulangerie Dupont", *, reply: bool = True, sent_only: bool = False) -> str:
    """Prospect du carnet + conversation. `reply` : un message REÇU du prospect ; `sent_only` : seulement un message envoyé."""
    with app.state.session_factory() as db:
        pr = Prospect(
            session_id=p.session_id, entreprise=name, entreprise_cle=name.lower(), source="annuaire", source_ref=f"ref-{name}",
            pertinence=80, fiabilite="simule", simule=True, instantane={}, search_id="src_x", profile_version=1,
            historique=[{"statut": "nouveau", "le": "2026-01-01T00:00:00+00:00"}],
        )
        db.add(pr)
        db.flush()
        if reply or sent_only:
            conv = Conversation(session_id=p.session_id, prospect_id=pr.id)
            db.add(conv)
            db.flush()
            db.add(ConversationMessage(conversation_id=conv.id, seq=1, sens="envoye", etat="ENVOYE", text="Bonjour"))
            if reply and not sent_only:
                db.add(ConversationMessage(conversation_id=conv.id, seq=2, sens="recu", text="Oui, volontiers."))
        db.commit()
        return pr.id


def version(p: Player, pid: str) -> int:
    return p.http.get(f"/api/prospects/{pid}").json()["version"]


def patch(p: Player, pid: str, statut: str, v: int | None = None, headers=None):
    return p.http.patch(f"/api/prospects/{pid}", json={"version": v or version(p, pid), "statut": statut}, headers=headers or p.key())


def balance(p: Player) -> int:
    return p.state()["balance"]["booked"]


def client_entries(app, p: Player) -> int:
    with app.state.session_factory() as db:
        return db.scalar(select(func.count()).select_from(LedgerEntry).where(
            LedgerEntry.session_id == p.session_id, LedgerEntry.category == "client_reward"))


def win(app, p: Player, name: str) -> str:
    pid = add_prospect(app, p, name)
    assert patch(p, pid, "gagne").status_code == 200
    return pid


def test_win_pays_once_and_counts_the_client(app):
    p = Player(app)
    pid = add_prospect(app, p)
    r = patch(p, pid, "gagne")
    assert r.status_code == 200 and r.json()["statut"] == "gagne"
    st = p.state()
    assert st["balance"]["booked"] == 30 + REWARD and st["clients_obtained"] == 1
    assert st["building"] == {"level": 2, "clients_obtained": 1, "next_level_at": 2}
    with app.state.session_factory() as db:
        src = db.scalar(select(LedgerEntry.source_action).where(LedgerEntry.category == "client_reward"))
    assert src == f"client:{p.session_id}:{pid}"


def test_same_request_replayed_does_not_pay_twice(app):
    p = Player(app)
    pid = add_prospect(app, p)
    key, v = p.key(), version(p, pid)
    assert patch(p, pid, "gagne", v, key).status_code == 200
    assert patch(p, pid, "gagne", v, key).status_code == 200
    assert balance(p) == 30 + REWARD and client_entries(app, p) == 1


def test_leaving_and_coming_back_to_gagne_does_not_pay_again_nor_lower_the_count(app):
    p = Player(app)
    pid = add_prospect(app, p)
    patch(p, pid, "gagne")
    assert patch(p, pid, "perdu").status_code == 200
    st = p.state()
    assert st["clients_obtained"] == 1 and st["building"]["level"] == 2  # ne baisse jamais
    assert patch(p, pid, "gagne").status_code == 200
    assert balance(p) == 30 + REWARD and p.state()["clients_obtained"] == 1


def test_win_refused_without_a_message_received_from_the_prospect(app):
    p = Player(app)
    for kw in ({"reply": False}, {"sent_only": True}):
        pid = add_prospect(app, p, f"Sans reponse {kw}", **kw)
        r = patch(p, pid, "gagne")
        assert r.status_code == 409 and r.json()["error"]["code"] == "INVALID_STATE"
        assert "répondu" in r.json()["error"]["message"]
        assert p.http.get(f"/api/prospects/{pid}").json()["statut"] == "nouveau"
    assert balance(p) == 30 and p.state()["clients_obtained"] == 0 and client_entries(app, p) == 0


def test_concurrent_wins_pay_once(app):
    p = Player(app)
    pid = add_prospect(app, p)
    v = version(p, pid)
    keys = [p.key(), p.key(), p.key()]
    with ThreadPoolExecutor(max_workers=3) as pool:
        codes = list(pool.map(lambda k: patch(p, pid, "gagne", v, k).status_code, keys))
    assert codes.count(200) >= 1
    assert client_entries(app, p) == 1 and balance(p) == 30 + REWARD and p.state()["clients_obtained"] == 1


def test_other_statuses_never_pay(app):
    p = Player(app)
    pid = add_prospect(app, p)
    for s in ("contacte", "en_discussion", "perdu", "ecarte", "nouveau"):
        assert patch(p, pid, s).status_code == 200
    assert balance(p) == 30 and p.state()["clients_obtained"] == 0 and client_entries(app, p) == 0


def test_prospect_of_another_session_cannot_be_won(app):
    a, b = Player(app), Player(app)
    pid = add_prospect(app, a)
    r = b.http.patch(f"/api/prospects/{pid}", json={"version": 1, "statut": "gagne"}, headers=b.key())
    assert r.status_code == 404
    assert balance(a) == 30 and balance(b) == 30 and client_entries(app, a) == 0


def test_counter_counts_distinct_prospects_and_survives_deletion(app):
    p = Player(app)
    a, _b = win(app, p, "A"), win(app, p, "B")
    assert p.state()["clients_obtained"] == 2 and balance(p) == 30 + 2 * REWARD
    assert p.http.delete(f"/api/prospects/{a}", headers=p.key()).status_code == 204
    assert p.state()["clients_obtained"] == 2  # le ledger fait foi, pas le statut courant


def test_agent_unlock_at_1_2_3_clients_then_purchase(app):
    p = Player(app)
    with app.state.session_factory() as db:
        db.add(LedgerEntry(session_id=p.session_id, amount=500, category="test", source_action="grant"))
        db.commit()
    buy = lambda role: p.post("/api/agents/purchase", {"role": role})
    r = buy("triage")
    assert r.status_code == 409 and r.json()["error"]["code"] == "ROLE_LOCKED"
    assert "Obtenez 1 client" in r.json()["error"]["message"]
    win(app, p, "A")
    assert buy("triage").status_code == 201
    assert buy("replier").json()["error"]["code"] == "ROLE_LOCKED"
    win(app, p, "B")
    assert buy("replier").status_code == 201
    assert buy("ads").json()["error"]["code"] == "ROLE_LOCKED"
    win(app, p, "C")
    h = {x["role"]: x for x in p.state()["hangar"]}
    assert h["ads"]["unlocked"] is True and h["ads"]["owned"] is False
    assert buy("ads").status_code == 201


def test_unlocked_but_too_poor_is_insufficient_funds(app):
    p = Player(app)
    win(app, p, "A")
    with app.state.session_factory() as db:  # solde ramené sous le prix du trieur (35)
        db.add(LedgerEntry(session_id=p.session_id, amount=-(balance(p) - 10), category="test", source_action="drain"))
        db.commit()
    r = p.post("/api/agents/purchase", {"role": "triage"})
    assert r.status_code == 409 and r.json()["error"]["code"] == "INSUFFICIENT_FUNDS"
    assert balance(p) == 10


def test_real_mode_waives_unlock_but_not_price(app):
    p = Player(app, "expert")
    h = {x["role"]: x for x in p.state()["hangar"]}
    assert all(h[r]["unlocked"] and h[r]["clients_condition_waived"] for r in ("triage", "replier", "ads"))
    r = p.post("/api/agents/purchase", {"role": "triage"})  # 30 $ < 35 : seul le prix bloque
    assert r.json()["error"]["code"] == "INSUFFICIENT_FUNDS"


def test_no_other_route_grants_money(app):
    p = Player(app)
    pid = add_prospect(app, p)
    patch(p, pid, "contacte")
    p.http.get("/api/prospects/export.csv")
    p.state()
    assert balance(p) == 30 and client_entries(app, p) == 0
    r = p.http.patch(f"/api/prospects/{pid}", json={"version": version(p, pid), "client_reward": 999}, headers=p.key())
    assert r.status_code in (400, 422)
    assert balance(p) == 30


def test_balance_never_negative_after_wins(app):
    p = Player(app)
    win(app, p, "A")
    assert p.state()["balance"]["available"] >= 0
