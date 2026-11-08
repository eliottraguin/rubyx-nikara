"""API-Q1 / API-S4 : `GET /api/state.building`, calculé par le serveur depuis le nombre de CLIENTS OBTENUS (écritures de
ledger `client_reward`, une par prospect). Jamais depuis le total gagné ni le solde ; ne baisse jamais."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.config import REPO_DIR
from app.main import create_app
from app.models import LedgerEntry
from app.rules_v2 import load_rules_v2
from app.services import ledger
from app.services.building import building_for

from ._campaign_support import Player, make_settings


@pytest.fixture
def app(tmp_path):
    application = create_app(make_settings(tmp_path))
    with TestClient(application):
        yield application


def building(p: Player) -> dict:
    return p.state()["building"]


def win(app, p: Player, prospect: str) -> bool:
    """Gain de client (source unique par prospect), comme le fait le passage à `gagne`."""
    with app.state.session_factory() as db:
        _, created = ledger.post_entry(db, p.session_id, 20, ledger.CATEGORY_CLIENT, f"client:{p.session_id}:{prospect}")
        db.commit()
    return created


def test_new_game_starts_at_level_1_without_counting_the_initial_capital(app):
    p = Player(app)
    st = p.state()
    assert st["balance"]["booked"] == 30  # le capital existe dans le ledger mais ne fait pas monter l'immeuble
    assert st["building"] == {"level": 1, "clients_obtained": 0, "next_level_at": 1}
    assert st["clients_obtained"] == 0


def test_exact_thresholds_from_rules_v2():
    rules = load_rules_v2(REPO_DIR / "data")
    levels = rules.building.levels
    assert [lv.min_clients for lv in levels] == [0, 1, 2, 4, 7, 11, 16, 22, 30, 40]
    assert levels[-1].level == 10
    for i, lv in enumerate(levels):
        at = building_for(rules, lv.min_clients)
        assert at.level == lv.level
        assert at.next_level_at == (levels[i + 1].min_clients if i + 1 < len(levels) else None)
        if lv.min_clients > 0:
            assert building_for(rules, lv.min_clients - 1).level == lv.level - 1
    top = building_for(rules, 1000)
    assert (top.level, top.next_level_at, top.clients_obtained) == (10, None, 1000)


def test_level_follows_clients_at_the_exact_threshold(app):
    p = Player(app)
    assert win(app, p, "a")
    assert building(p) == {"level": 2, "clients_obtained": 1, "next_level_at": 2}
    win(app, p, "b")
    assert building(p) == {"level": 3, "clients_obtained": 2, "next_level_at": 4}
    win(app, p, "c")
    assert building(p)["level"] == 3  # 3 clients : toujours le niveau 3 (seuil du niveau 4 = 4)
    win(app, p, "d")
    assert building(p) == {"level": 4, "clients_obtained": 4, "next_level_at": 7}


def test_buying_an_agent_never_lowers_the_building(app):
    p = Player(app)
    win(app, p, "a")
    before = building(p)
    assert before["level"] == 2 and p.state()["balance"]["booked"] == 50
    r = p.post("/api/agents/purchase", {"role": "triage"})
    assert r.status_code == 201, r.text
    st = p.state()
    assert st["balance"]["booked"] == 15  # le solde baisse...
    assert st["building"] == before  # ...pas l'immeuble


def test_money_does_not_move_the_building_only_clients_do(app):
    p = Player(app)
    with app.state.session_factory() as db:
        for i, (amount, cat) in enumerate([(500, "test"), (-5, "action_cost"), (40, "refund"), (30, "initial_capital"), (99, "reward")]):
            db.add(LedgerEntry(session_id=p.session_id, amount=amount, category=cat, source_action=f"x:{i}"))
        db.commit()
    assert building(p)["clients_obtained"] == 0 and building(p)["level"] == 1


def test_replayed_win_counts_once(app):
    p = Player(app)
    assert win(app, p, "a") is True
    for _ in range(3):
        assert win(app, p, "a") is False
    assert building(p)["clients_obtained"] == 1


def test_count_is_isolated_per_session(app):
    a, b = Player(app), Player(app)
    win(app, a, "a")
    assert building(a)["clients_obtained"] == 1 and building(b)["clients_obtained"] == 0


def test_browser_cannot_impose_the_building(app):
    p = Player(app)
    r = p.http.post("/api/sessions", json={"company_name": "X", "mode": "beginner", "building": {"level": 10, "clients_obtained": 999}},
                    headers=p.key())
    assert r.status_code == 422
    r = p.http.get("/api/state", params={"building": "10", "level": "10", "clients_obtained": "999"})
    assert r.json()["building"] == {"level": 1, "clients_obtained": 0, "next_level_at": 1}
    r = p.http.get("/api/state", headers={"X-Building-Level": "10"})
    assert r.json()["building"]["level"] == 1
