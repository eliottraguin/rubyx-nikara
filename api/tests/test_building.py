"""API-Q1 : `GET /api/state.building`, calculé par le serveur depuis le ledger (paiements d'expédition)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.models import LedgerEntry
from app.rules_v2 import load_rules_v2
from app.config import REPO_DIR
from app.services import ledger_payments as pay
from app.services.building import building_for

from ._campaign_support import Player, make_settings


@pytest.fixture
def app(tmp_path):
    application = create_app(make_settings(tmp_path))
    with TestClient(application):
        yield application


def building(p: Player) -> dict:
    return p.state()["building"]


def earn(app, p: Player, mission: str, score: int, submission_id: str):
    """Paiement d'expédition par le service du moteur (BE03), comme le fait l'évaluateur après un score serveur."""
    with app.state.session_factory() as db:
        res = pay.award_submission(db, app.state.rules, p.session_id, mission, submission_id, score)
        db.commit()
    return res


def test_new_game_starts_at_level_1_without_counting_the_initial_capital(app):
    p = Player(app)
    st = p.state()
    assert st["balance"]["booked"] == 30  # le capital existe dans le ledger mais ne fait pas monter l'immeuble
    assert st["building"] == {"level": 1, "total_earned": 0, "next_level_at": 20}


def test_exact_thresholds_from_rules_v2():
    rules = load_rules_v2(REPO_DIR / "data")
    levels = rules.building.levels
    assert levels[-1].level == 10
    for i, lv in enumerate(levels):
        at = building_for(rules, lv.min_total_earned)
        assert at.level == lv.level
        assert at.next_level_at == (levels[i + 1].min_total_earned if i + 1 < len(levels) else None)
        if lv.min_total_earned > 0:
            assert building_for(rules, lv.min_total_earned - 1).level == lv.level - 1
    top = building_for(rules, 10_000)
    assert (top.level, top.next_level_at, top.total_earned) == (10, None, 10_000)


def test_level_follows_expedition_payments_at_the_exact_threshold(app):
    p = Player(app)
    earn(app, p, "m1", 95, "sub_a")  # 19 $ : un de moins que le seuil du niveau 2 (20)
    assert building(p) == {"level": 1, "total_earned": 19, "next_level_at": 20}
    earn(app, p, "m1", 100, "sub_b")  # reprise : paiement différentiel +1 => 20 au total
    assert building(p) == {"level": 2, "total_earned": 20, "next_level_at": 45}


def test_buying_an_agent_never_lowers_the_building(app):
    p = Player(app)
    earn(app, p, "m1", 100, "sub_a")
    before = building(p)
    assert before["level"] == 2 and p.state()["balance"]["booked"] == 50
    p.play("m1", 100)  # débloque le prospecteur (clôture de la tentative ; sans paiement ici)
    r = p.post("/api/agents/purchase", {"role": "prospector"})
    assert r.status_code == 201, r.text
    st = p.state()
    assert st["balance"]["booked"] == 30  # le solde baisse...
    assert st["building"] == before  # ...pas l'immeuble


def test_costs_grants_and_other_ledger_lines_do_not_count(app):
    p = Player(app)
    sf = app.state.session_factory
    with sf() as db:
        for i, (amount, cat) in enumerate([(500, "test"), (-5, "action_cost"), (40, "refund"), (30, "initial_capital")]):
            db.add(LedgerEntry(session_id=p.session_id, amount=amount, category=cat, source_action=f"x:{i}"))
        db.commit()
    assert building(p)["total_earned"] == 0 and building(p)["level"] == 1


def test_replayed_payment_counts_once(app):
    p = Player(app)
    assert earn(app, p, "m1", 100, "sub_a").amount == 20
    for _ in range(3):  # même livraison rejouée
        res = earn(app, p, "m1", 100, "sub_a")
        assert res.created is False and res.amount == 0
    assert building(p)["total_earned"] == 20


def test_total_is_isolated_per_session(app):
    a, b = Player(app), Player(app)
    earn(app, a, "m1", 100, "sub_a")
    assert building(a)["total_earned"] == 20 and building(b)["total_earned"] == 0


def test_browser_cannot_impose_the_building(app):
    p = Player(app)
    r = p.http.post("/api/sessions", json={"company_name": "X", "mode": "beginner", "building": {"level": 10, "total_earned": 999}},
                    headers=p.key())
    assert r.status_code == 422
    r = p.http.get("/api/state", params={"building": "10", "level": "10", "total_earned": "999"})
    assert r.json()["building"] == {"level": 1, "total_earned": 0, "next_level_at": 20}
    r = p.http.get("/api/state", headers={"X-Building-Level": "10"})
    assert r.json()["building"]["level"] == 1


def test_real_evaluation_pays_and_raises_the_building_once(tmp_path):
    """Bout en bout avec l'évaluateur serveur (juge simulé) : une livraison à 100/100 rapporte 20 $ => niveau 2 ;
    rejouer la livraison ne change rien."""
    import json
    import shutil

    from app.config import Settings

    from .test_evaluation import _ann

    data = tmp_path / "data"
    for sub in ("rules", "rubrics", "missions", "roles", "profile", "ads"):
        shutil.copytree(REPO_DIR / "data" / sub, data / sub)
    application = create_app(Settings(db_path=tmp_path / "e2e.db", data_dir=data, auto_evaluate=True))
    with TestClient(application):
        p = Player(application)
        aid = p.start("m1")["attempt"]["id"]
        v = p.artifact(aid, _ann("ann_m1_complete")["deliverable_text"]).json()["id"]
        assert p.submit(aid, v).status_code == 201
        assert building(p) == {"level": 2, "total_earned": 20, "next_level_at": 45}
        assert p.state()["balance"]["booked"] == 50
        p.submit(aid, v)  # rejeu / double envoi : aucun second paiement
        assert building(p)["total_earned"] == 20 and json.dumps(p.state()["balance"]["booked"]) == "50"
