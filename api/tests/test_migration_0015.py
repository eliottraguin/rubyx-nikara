"""Migration 0015 : retrait de l'ancien moteur d'expédition, sur une base existante créée à la révision 0014 AVEC des
données (parties, ledger, prospects, brouillons, conversations, campagnes, recherches, plans d'assistant).

Rien de ce qui reste ne doit être perdu ; la provenance du carnet reste immuable ; le retour arrière est possible."""

from __future__ import annotations

import sqlite3

import pytest
from alembic import command

from app.config import Settings
from app.db import alembic_config

RETIRED = {
    "mission_definitions", "mission_attempts", "messages", "artifact_versions", "artifact_shares", "submissions", "evaluations",
    "expedition_records",
}
KEPT = (
    "game_sessions", "agent_ownerships", "ledger_entries", "action_runs", "reservations", "llm_calls", "target_profile_versions",
    "target_action_uses", "searches", "prospects", "prospect_drafts", "conversations", "conversation_messages", "reply_drafts",
    "conversation_syntheses", "campaigns", "campaign_versions", "assistant_plans",
)


def _insert(c: sqlite3.Connection, table: str, **override) -> None:
    """Insère une ligne valide : colonnes obligatoires remplies selon leur type, `override` pour le reste."""
    values = {}
    for _cid, name, typ, notnull, _default, pk in c.execute(f"PRAGMA table_info({table})").fetchall():
        if name in override:
            values[name] = override[name]
        elif notnull or pk:
            t = typ.upper()
            if "JSON" in t:
                values[name] = "{}" if name in ("instantane", "record", "company", "data", "contenu", "rubric", "kit", "usage", "versions", "message_counts") else "[]"
            elif "INT" in t or "BOOL" in t:
                values[name] = 1
            elif "DATE" in t:
                values[name] = "2026-11-08 10:00:00.000000"
            else:
                values[name] = f"{table[:3]}_{name}"
    cols = ",".join(values)
    c.execute(f"INSERT INTO {table} ({cols}) VALUES ({','.join('?' * len(values))})", list(values.values()))


def _seed(path) -> None:
    c = sqlite3.connect(path)
    s = "ses_1"
    _insert(c, "game_sessions", id=s, token_hash="h1", mode="beginner", company='{"name": "A"}', stage="m1")
    _insert(c, "game_sessions", id="ses_2", token_hash="h2", mode="expert", company='{"name": "B"}', stage="m3")
    _insert(c, "ledger_entries", id="led_1", session_id=s, amount=30, source_action="init:ses_1")
    _insert(c, "ledger_entries", id="led_2", session_id=s, amount=-3, source_action="action_cost:att_1:act_1:0")
    _insert(c, "ledger_entries", id="led_3", session_id=s, amount=20, source_action="client:pro_1")
    _insert(c, "agent_ownerships", session_id=s, role="scout", price_paid=0)
    _insert(c, "target_profile_versions", id="tpv_1", session_id=s, version=1, data='{"offre": "x"}')
    # ancien moteur : une expédition, ses messages, livrables, livraison, évaluation, enregistrement renvoyé
    _insert(c, "mission_attempts", id="att_1", session_id=s, mission_id="m1", attempt_no=1, unit_price=0)
    _insert(c, "action_runs", id="act_1", session_id=s, attempt_id="att_1", idempotency_key="k1", type="message", status="RUNNING", steps="[]")
    _insert(c, "reservations", id="rsv_1", session_id=s, action_id="act_1", amount=1, attempt_id="att_1", status="ACTIVE", quota=1)
    _insert(c, "messages", id="msg_1", attempt_id="att_1", action_id="act_1")
    _insert(c, "artifact_versions", id="art_1", attempt_id="att_1")
    _insert(c, "artifact_shares", id="shr_1", attempt_id="att_1", artifact_version_id="art_1")
    _insert(c, "submissions", id="sub_1", attempt_id="att_1", artifact_version_id="art_1")
    _insert(c, "evaluations", id="evl_1", submission_id="sub_1")
    _insert(c, "expedition_records", id="rec_1", session_id=s, attempt_id="att_1", source="annuaire", source_ref="ann_1")
    # ce qui reste
    _insert(c, "action_runs", id="act_2", session_id=s, idempotency_key="k2", type="search", status="SUCCEEDED", steps="[]")
    _insert(c, "action_runs", id="act_3", session_id=s, idempotency_key="k3", type="prospect_profile", status="SUCCEEDED", steps="[]")
    _insert(c, "reservations", id="rsv_2", session_id=s, action_id="act_3", amount=3, status="SETTLED", quota=1)
    _insert(c, "llm_calls", id="llm_1", action_id="act_3", role="replier")
    _insert(c, "searches", id="src_1", session_id=s, planet_id="annuaire", status="DONE")
    for i in (1, 2):
        _insert(c, "prospects", id=f"pro_{i}", session_id=s, source="annuaire", source_ref=f"ann_{i}", expedition_id="src_1", rapport_version_id="src_1",
                entreprise=f"E{i}", entreprise_cle=f"e{i}", statut="gagne" if i == 1 else "nouveau", pertinence_etiquette="correspond")
    _insert(c, "prospects", id="pro_9", session_id="ses_2", source="annuaire", source_ref="ann_1", expedition_id="src_x", rapport_version_id="src_x",
            entreprise="Z", entreprise_cle="z")
    _insert(c, "prospect_drafts", id="pdr_1", session_id=s, prospect_id="pro_1", kind="fiche", numero=1)
    _insert(c, "target_action_uses", session_id=s, kind="prospect", target_id="pro_1", key="prospect_profile", used=1, reserved=0)
    _insert(c, "conversations", id="cnv_1", session_id=s, prospect_id="pro_1")
    _insert(c, "conversation_messages", id="cmg_1", conversation_id="cnv_1", seq=1, sens="recu", text="D'accord.")
    _insert(c, "reply_drafts", id="drf_1", conversation_id="cnv_1")
    _insert(c, "conversation_syntheses", id="syn_1", conversation_id="cnv_1")
    _insert(c, "campaigns", id="cmp_1", session_id=s)
    _insert(c, "campaign_versions", id="cpv_1", campaign_id="cmp_1", numero=1, action_id="act_3")
    _insert(c, "assistant_plans", id="pln_1", session_id=s)
    c.commit()
    c.close()


def _counts(path) -> dict[str, int]:
    c = sqlite3.connect(path)
    out = {t: c.execute(f"SELECT count(*) FROM {t}").fetchone()[0] for t in KEPT}
    c.close()
    return out


@pytest.fixture
def old_db(tmp_path):
    settings = Settings(db_path=tmp_path / "old.db")
    cfg = alembic_config(settings.database_url)
    command.upgrade(cfg, "0014_prospect_drafts")
    _seed(settings.db_path)
    return settings, cfg


def test_upgrade_keeps_everything_that_remains(old_db):
    settings, cfg = old_db
    before = _counts(settings.db_path)
    command.upgrade(cfg, "head")
    assert _counts(settings.db_path) == before  # ni partie, ni écriture de ledger, ni prospect, ni conversation perdus
    c = sqlite3.connect(settings.db_path)
    names = {r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert RETIRED.isdisjoint(names)
    assert not c.execute("PRAGMA foreign_key_check").fetchall()
    cols = lambda t: {r[1] for r in c.execute(f"PRAGMA table_info({t})")}
    assert "attempt_id" not in cols("action_runs") and not {"attempt_id", "quota"} & cols("reservations")
    assert "stage" not in cols("game_sessions")
    assert "search_id" in cols("prospects") and not {"expedition_id", "rapport_version_id"} & cols("prospects")
    # le ledger est intact (aucune écriture ajoutée, retirée ni modifiée)
    assert sorted(c.execute("SELECT id, amount, source_action FROM ledger_entries")) == [
        ("led_1", 30, "init:ses_1"), ("led_2", -3, "action_cost:att_1:act_1:0"), ("led_3", 20, "client:pro_1"),
    ]
    # la provenance des prospects pointe vers la recherche d'origine ; unicité (session, source, source_ref) conservée
    assert sorted(c.execute("SELECT id, search_id, source_ref FROM prospects")) == [
        ("pro_1", "src_1", "ann_1"), ("pro_2", "src_1", "ann_2"), ("pro_9", "src_x", "ann_1"),
    ]
    with pytest.raises(sqlite3.IntegrityError):
        _insert(c, "prospects", id="pro_dup", session_id="ses_1", source="annuaire", source_ref="ann_1", search_id="src_1", entreprise="D", entreprise_cle="d")
    c.rollback()
    # actions de l'ancien parcours : closes sans débit, réservation libérée ; les autres inchangées
    assert dict(c.execute("SELECT id, status FROM action_runs")) == {"act_1": "FAILED", "act_2": "SUCCEEDED", "act_3": "SUCCEEDED"}
    assert dict(c.execute("SELECT id, status FROM reservations")) == {"rsv_1": "RELEASED", "rsv_2": "SETTLED"}
    c.close()


def test_provenance_stays_immutable_but_status_and_notes_can_change(old_db):
    settings, cfg = old_db
    command.upgrade(cfg, "head")
    c = sqlite3.connect(settings.db_path)
    for column in ("source_ref", "entreprise", "search_id", "profile_version", "pertinence"):
        with pytest.raises(sqlite3.DatabaseError, match="immuable"):
            c.execute(f"UPDATE prospects SET {column} = {column} WHERE id = 'pro_1'")
    c.execute("UPDATE prospects SET notes = 'ok', statut = 'contacte' WHERE id = 'pro_1'")
    c.close()


def test_other_immutable_tables_stay_immutable_and_session_deletion_cascades(old_db):
    settings, cfg = old_db
    command.upgrade(cfg, "head")
    c = sqlite3.connect(settings.db_path)
    c.execute("PRAGMA foreign_keys=ON")
    for table, column in (("campaign_versions", "kit"), ("prospect_drafts", "contenu"), ("reply_drafts", "corps"), ("conversation_syntheses", "intention")):
        with pytest.raises(sqlite3.DatabaseError, match="immuable"):
            c.execute(f"UPDATE {table} SET {column} = {column}")
    # supprimer la partie supprime tout, y compris les versions immuables (le détachement `action_id` de la cascade est permis)
    c.execute("DELETE FROM game_sessions WHERE id = 'ses_1'")
    c.commit()
    left = _counts(settings.db_path)
    assert left["game_sessions"] == 1 and left["prospects"] == 1  # la partie 2 demeure
    for table in ("action_runs", "reservations", "llm_calls", "campaign_versions", "prospect_drafts", "conversations", "searches", "assistant_plans", "ledger_entries"):
        assert left[table] == 0, table
    c.close()


def test_downgrade_then_upgrade_again_is_lossless(old_db):
    settings, cfg = old_db
    command.upgrade(cfg, "head")
    after_up = _counts(settings.db_path)
    command.downgrade(cfg, "0014_prospect_drafts")
    c = sqlite3.connect(settings.db_path)
    names = {r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert RETIRED <= names
    assert dict(c.execute("SELECT id, expedition_id FROM prospects")) == {"pro_1": "src_1", "pro_2": "src_1", "pro_9": "src_x"}
    assert dict(c.execute("SELECT id, rapport_version_id FROM prospects")) == {"pro_1": "src_1", "pro_2": "src_1", "pro_9": "src_x"}
    assert dict(c.execute("SELECT id, stage FROM game_sessions")) == {"ses_1": "m1", "ses_2": "m1"}
    triggers = {r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='trigger'")}
    assert {"trg_prospects_provenance_immutable", "trg_artifact_versions_immutable", "trg_submissions_frozen"} <= triggers
    assert not c.execute("PRAGMA foreign_key_check").fetchall()
    c.close()
    assert _counts(settings.db_path) == after_up
    command.upgrade(cfg, "head")
    assert _counts(settings.db_path) == after_up


def test_fresh_database_gets_a_single_head(tmp_path):
    from alembic.script import ScriptDirectory

    settings = Settings(db_path=tmp_path / "fresh.db")
    cfg = alembic_config(settings.database_url)
    assert ScriptDirectory.from_config(cfg).get_heads() == ["0016_users"]
    command.upgrade(cfg, "head")
    c = sqlite3.connect(settings.db_path)
    names = {r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert RETIRED.isdisjoint(names)
