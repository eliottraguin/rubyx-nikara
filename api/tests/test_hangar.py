"""API-R1 : hangar à 4 rôles (`scout`, `triage`, `replier`, `ads`), déblocage Tutoriel/Réel, quotas par cible,
migration 0006, tri des leads par code. Fournisseur simulé uniquement, aucun réseau."""

from __future__ import annotations

import sqlite3
from concurrent.futures import ThreadPoolExecutor

import pytest
from alembic import command
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.config import REPO_DIR
from app.db import alembic_config
from app.errors import ApiError
from app.main import create_app
from app.models import AgentOwnership, LedgerEntry, TargetActionUse
from app.rules_v2 import load_rules_v2
from app.services import checks, ledger, target_quotas

from ._campaign_support import Player, make_settings
from .actions_support import World

RULES = load_rules_v2(REPO_DIR / "data")
REMOVED = ("qualifier", "profiler", "outreach")
HANGAR = ["scout", "triage", "replier", "ads"]
ASSISTANTS = ["assistant_prospection", "assistant_clients", "assistant_pub"]  # fournis au départ (docs/ASSISTANT.md)


@pytest.fixture
def app(tmp_path):
    application = create_app(make_settings(tmp_path))
    with TestClient(application):
        yield application


def _grant(app, p: Player, amount: int) -> None:
    with app.state.session_factory() as db:
        db.add(LedgerEntry(session_id=p.session_id, amount=amount, category="test", source_action=f"grant-{p.session_id}-{amount}"))
        db.commit()


def _buy(p: Player, role: str):
    return p.post("/api/agents/purchase", {"role": role})


def _hangar(p: Player) -> dict:
    return {h["role"]: h for h in p.state()["hangar"]}


# --- état et catalogue -------------------------------------------------------------------------------------------

def test_state_exposes_the_four_hangar_roles_and_the_three_starting_assistants(app):
    p = Player(app)
    h = _hangar(p)
    assert list(h) == HANGAR + ASSISTANTS
    assert [(h[r]["owned"], h[r]["unlocked"], h[r]["price"]) for r in ASSISTANTS] == [(True, True, 0)] * 3
    assert [h[r]["section"] for r in ASSISTANTS] == ["prospection", "clients", "pub"]
    assert (h["scout"]["owned"], h["scout"]["unlocked"], h["scout"]["price"]) == (True, True, 0)
    assert [(h[r]["price"], h[r]["owned"], h[r]["unlocked"]) for r in HANGAR[1:]] == [(35, False, False), (45, False, False), (50, False, False)]
    assert [h[r]["unlock_clients"] for r in HANGAR[1:]] == [1, 2, 3]
    assert all(h[r]["clients_condition_waived"] is False for r in HANGAR[1:])
    assert [h[r]["unlock_condition"] for r in HANGAR[1:]] == [
        "Obtenez 1 client pour débloquer ce trieur", "Obtenez 2 clients pour débloquer ce rédacteur",
        "Obtenez 3 clients pour débloquer ce directeur de campagne",
    ]
    assert h["scout"]["unlock_clients"] is None and h["scout"]["unlock_condition"] is None
    assert p.state()["clients_obtained"] == 0
    assert not set(REMOVED) & set(h) and "agents" not in p.state()


@pytest.mark.parametrize("role", REMOVED)
def test_removed_role_ids_are_accepted_nowhere(app, role):
    p = Player(app)
    _grant(app, p, 500)
    r = _buy(p, role)
    assert r.status_code == 422 and r.json()["error"]["code"] == "INVALID_REQUEST"
    with pytest.raises(ApiError):
        target_quotas.reserve(app.state.session_factory, RULES, p.session_id, role, "pro_1")
    with pytest.raises(Exception):
        RULES.agent(role)


def test_scout_is_already_owned_and_cannot_be_bought(app):
    p = Player(app)
    r = _buy(p, "scout")
    assert (r.status_code, r.json()["error"]["code"]) == (409, "INVALID_STATE")


# --- déblocage Tutoriel / Réel -----------------------------------------------------------------------------------

def _client(app, p: Player, n: int) -> None:
    """Écrit `n` gains de client distincts (source unique par prospect), comme le fait le passage à `gagne` (API-S4)."""
    with app.state.session_factory() as db:
        for i in range(n):
            ledger.post_entry(db, p.session_id, RULES.client_reward, ledger.CATEGORY_CLIENT, f"client:{p.session_id}:pro_t{i}")
        db.commit()


def test_tutorial_unlock_requires_clients_obtained(app):
    p = Player(app, "beginner")
    _grant(app, p, 500)
    assert _buy(p, "triage").json()["error"]["code"] == "ROLE_LOCKED"
    _client(app, p, 1)
    assert _hangar(p)["triage"]["unlocked"] is True
    r = _buy(p, "triage")
    assert r.status_code == 201 and (r.json()["role"], r.json()["price_paid"]) == ("triage", 35)
    assert _hangar(p)["triage"]["owned"] is True
    assert _buy(p, "triage").json()["error"]["code"] == "INVALID_STATE"
    assert _buy(p, "replier").json()["error"]["code"] == "ROLE_LOCKED"
    assert _buy(p, "ads").json()["error"]["code"] == "ROLE_LOCKED"


def test_real_mode_waives_the_clients_condition_but_keeps_the_price(app):
    p = Player(app, "expert")
    h = _hangar(p)
    assert all(h[r]["unlocked"] and h[r]["clients_condition_waived"] for r in HANGAR[1:])
    r = _buy(p, "ads")  # 50 > 30 : seul le prix reste
    assert (r.status_code, r.json()["error"]["code"]) == (409, "INSUFFICIENT_FUNDS")
    _grant(app, p, 100)
    r = _buy(p, "ads")
    assert r.status_code == 201 and r.json()["price_paid"] == 50
    assert p.state()["balance"]["booked"] == 80


def test_hangar_purchase_replay_and_double_buy_debit_once(app):
    p = Player(app, "expert")
    _grant(app, p, 100)
    key = p.key()
    a = p.http.post("/api/agents/purchase", json={"role": "replier"}, headers=key)
    b = p.http.post("/api/agents/purchase", json={"role": "replier"}, headers=key)
    assert (a.status_code, b.status_code) == (201, 200) and a.json()["action_id"] == b.json()["action_id"]
    assert p.state()["balance"]["booked"] == 130 - 45


# --- quotas par cible --------------------------------------------------------------------------------------------

@pytest.fixture
def world(settings):
    w = World(settings)
    yield w
    w.close()


def test_rules_v2_actions_are_carried_by_the_right_roles():
    pa = RULES.prospect_actions
    assert {k: (v.role.value, v.cost, v.quota_per_target) for k, v in pa.items()} == {
        "prospect_profile": ("replier", 3, 5), "prospect_message": ("replier", 2, 5),
        "conversation_triage": ("triage", 1, 5), "conversation_reply": ("replier", 2, 5), "ad_campaign": ("ads", 4, 5),
    }


def test_unowned_role_is_role_locked_and_nothing_is_stored(world):
    with pytest.raises(ApiError) as e:
        target_quotas.reserve(world.sf, RULES, world.sid, "prospect_profile", "pro_1")
    assert e.value.code.value == "ROLE_LOCKED"
    with world.sf() as db:
        assert db.scalar(select(func.count()).select_from(TargetActionUse)) == 0


def test_quota_is_five_never_six_per_prospect_and_action(world):
    world.own("replier")
    for _ in range(5):
        target_quotas.reserve(world.sf, RULES, world.sid, "prospect_profile", "pro_1")
        target_quotas.settle(world.sf, RULES, world.sid, "prospect_profile", "pro_1")
    with pytest.raises(ApiError) as e:
        target_quotas.reserve(world.sf, RULES, world.sid, "prospect_profile", "pro_1")
    assert e.value.code.value == "MESSAGE_LIMIT"
    assert target_quotas.remaining(world.sf, RULES, world.sid, "prospect_profile", "pro_1") == 0
    # clé (prospect, action) : l'autre action et un autre prospect gardent leurs 5
    assert target_quotas.remaining(world.sf, RULES, world.sid, "prospect_message", "pro_1") == 5
    assert target_quotas.remaining(world.sf, RULES, world.sid, "prospect_profile", "pro_2") == 5
    # clé (conversation, rôle) distincte de (prospect, action), même rôle
    assert target_quotas.remaining(world.sf, RULES, world.sid, "conversation_reply", "pro_1") == 5


def test_quota_concurrent_reservations_never_exceed_five(world):
    world.own("replier", "ads")

    def attempt(_):
        try:
            target_quotas.reserve(world.sf, RULES, world.sid, "prospect_message", "pro_9")
            return "ok"
        except ApiError as e:
            return e.code.value

    with ThreadPoolExecutor(max_workers=16) as pool:
        out = list(pool.map(attempt, range(24)))
    assert out.count("ok") == 5 and out.count("MESSAGE_LIMIT") == 19
    with world.sf() as db:
        row = db.scalar(select(TargetActionUse).where(TargetActionUse.target_id == "pro_9"))
        assert (row.used, row.reserved) == (0, 5)


def test_unusable_answer_gives_the_generation_back(world):
    world.own("ads")
    for _ in range(5):
        target_quotas.reserve(world.sf, RULES, world.sid, "ad_campaign", "cmp_1")
    target_quotas.release(world.sf, RULES, world.sid, "ad_campaign", "cmp_1")  # réponse inexploitable : rien n'est compté
    target_quotas.reserve(world.sf, RULES, world.sid, "ad_campaign", "cmp_1")
    with pytest.raises(ApiError):
        target_quotas.reserve(world.sf, RULES, world.sid, "ad_campaign", "cmp_1")
    with pytest.raises(ApiError) as e:  # rien à régler : refusé, jamais de compteur négatif
        target_quotas.settle(world.sf, RULES, world.sid, "ad_campaign", "cmp_other")
    assert e.value.code.value == "INVALID_STATE"


def test_quotas_are_isolated_between_sessions(settings):
    a, b = World(settings), World(settings)
    try:
        a.own("replier")
        b.own("replier")
        for _ in range(5):
            target_quotas.reserve(a.sf, RULES, a.sid, "prospect_profile", "pro_1")
        with pytest.raises(ApiError):
            target_quotas.reserve(a.sf, RULES, a.sid, "prospect_profile", "pro_1")
        target_quotas.reserve(b.sf, RULES, b.sid, "prospect_profile", "pro_1")
    finally:
        a.close()
        b.close()


# --- migration 0006 ----------------------------------------------------------------------------------------------

def test_0006_purges_removed_roles_and_refunds_them(settings):
    cfg = alembic_config(settings.database_url)
    command.upgrade(cfg, "0005")
    with sqlite3.connect(settings.db_path) as c:
        c.execute(
            "insert into game_sessions (id, token_hash, mode, company, state, stage, seed, rules_version, created_at, updated_at) "
            "values ('ses_a','h1','beginner','{}','ACTIVE','m1',1,'rules_v1','2026-01-01','2026-01-01')"
        )
        c.execute("insert into ledger_entries values ('led_1','ses_a',30,'initial_capital','init','POSTED','2026-01-01')")
        c.execute("insert into ledger_entries values ('led_2','ses_a',-30,'purchase','p','POSTED','2026-01-01')")
        c.execute("insert into agent_ownerships (session_id, role, price_paid, purchased_at) values ('ses_a','qualifier',30,'2026-01-01')")
        c.execute("insert into agent_ownerships (session_id, role, price_paid, purchased_at) values ('ses_a','writer',0,'2026-01-01')")
    command.upgrade(cfg, "head")
    with sqlite3.connect(settings.db_path) as c:
        assert [r[0] for r in c.execute("select role from agent_ownerships")] == ["writer"]
        assert c.execute("select sum(amount) from ledger_entries where session_id='ses_a'").fetchone()[0] == 30
        assert c.execute("select count(*) from target_action_uses").fetchone()[0] == 0
    command.downgrade(cfg, "0005")


# --- tri des leads par code (ex-qualifier) -----------------------------------------------------------------------

TARGET = {"cible_secteurs": ["Boulangerie", "Restaurant"], "cible_zone": ["Lyon"], "exclusions": ["franchise"]}


def _lead(ref, nom, secteur="boulangerie", zone="Lyon 3e"):
    return {"source_ref": ref, "nom": nom, "secteur": secteur, "zone": zone}


def test_triage_leads_is_deterministic_and_explains_each_rejection():
    leads = [
        _lead("a1", "Pain d'Or"),
        _lead("A1 ", "Pain d'Or bis"),  # même source_ref (casse/espaces) : doublon
        _lead("a2", "Pain d'Or"),  # même nom et même zone : doublon
        _lead("", "Sans source"),
        _lead("a3", "Franchise du Four"),
        _lead("a4", "Garage Martin", secteur="garage"),
        _lead("a5", "Chez Paul", zone="Paris"),
        _lead("a6", "Le Bistrot", secteur="Restaurant", zone="lyon"),
        _lead("known", "Déjà connu"),
    ]
    res = checks.triage_leads(leads, TARGET, known_refs={"KNOWN"})
    assert [l["source_ref"] for l in res.kept] == ["a1", "a6"]
    assert [m for _l, m in res.rejected] == [
        "doublon", "doublon", "sans_source_ref", "exclu", "hors_cible", "hors_cible", "doublon",
    ]
    again = checks.triage_leads(leads, TARGET, known_refs={"KNOWN"})
    assert again.kept == res.kept and again.rejected == res.rejected


def test_triage_with_empty_target_criteria_filters_nothing_but_duplicates():
    res = checks.triage_leads([_lead("x", "A"), _lead("y", "B", secteur="garage", zone="Nice")], {})
    assert len(res.kept) == 2 and not res.rejected
