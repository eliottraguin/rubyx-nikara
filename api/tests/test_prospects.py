"""Carnet de prospection : API-I1 (modèle, propriété, provenance), API-I2 (ajout), API-I3 (liste, détail, PATCH, suppression)."""

from __future__ import annotations

import json
import sqlite3
import threading
from datetime import timedelta

import pytest
from alembic import command
from sqlalchemy import func, select, text
from sqlalchemy.exc import DatabaseError

from app.db import alembic_config
from app.models import ExpeditionRecord, Prospect, utcnow
from tests.prospects_support import Expedition, annuaire, copy_with_limits, k, lead, second_client, world


@pytest.fixture
def w(settings):
    w = world(settings)
    yield w
    w.close()


def count(w, model=Prospect) -> int:
    with w.sf() as db:
        return db.scalar(select(func.count()).select_from(model).where(model.session_id == w.sid))


# ----------------------------------------------------------------------------- API-I1 : modèle, migration, propriété


def test_migration_0007_up_down(tmp_path):
    from app.config import Settings

    s = Settings(db_path=tmp_path / "m.db")
    cfg = alembic_config(s.database_url)
    command.upgrade(cfg, "0007")
    con = sqlite3.connect(s.db_path)
    names = {r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type IN ('table','trigger')")}
    assert {"prospects", "expedition_records", "prospect_idempotency", "trg_prospects_provenance_immutable"} <= names
    con.close()
    command.downgrade(cfg, "0006")
    con = sqlite3.connect(s.db_path)
    names = {r[0] for r in con.execute("SELECT name FROM sqlite_master")}
    assert "prospects" not in names and "expedition_records" not in names
    con.close()


def test_provenance_is_immutable_in_database(w):
    e = Expedition(w)
    pid = e.add([0]).json()["added"][0]["id"]
    with w.sf() as db:
        with pytest.raises(DatabaseError):
            db.execute(text("UPDATE prospects SET entreprise = 'Autre' WHERE id = :i"), {"i": pid})
            db.commit()
    with w.sf() as db:  # statut et notes restent modifiables
        db.execute(text("UPDATE prospects SET notes = 'ok' WHERE id = :i"), {"i": pid})
        db.commit()


def test_cross_session_access_is_indistinguishable_from_unknown(w):
    e = Expedition(w)
    pid = e.add([0]).json()["added"][0]["id"]
    other = second_client(w)
    unknown = "pro_inexistant000000"
    for method, path, kw in (
        ("GET", "/api/prospects/{}", {}),
        ("PATCH", "/api/prospects/{}", {"json": {"version": 1, "notes": "x"}, "headers": k()}),
        ("DELETE", "/api/prospects/{}", {"headers": k()}),
    ):
        a = other.request(method, path.format(pid), **kw)
        b = other.request(method, path.format(unknown), **kw)
        assert a.status_code == b.status_code == 404
        assert a.json() == b.json()
    assert other.get("/api/prospects").json()["items"] == []
    assert w.client.get(f"/api/prospects/{pid}").status_code == 200  # intact
    # ajout depuis l'expédition d'un autre joueur : 404 comme une expédition inconnue
    r = other.post("/api/prospects", json=e.body([0]), headers=k())
    assert r.status_code == 404
    assert other.post("/api/prospects", json={**e.body([0]), "expedition_id": "att_inconnue"}, headers=k()).json() == r.json()


def test_requires_session_and_idempotency_key(w):
    from fastapi.testclient import TestClient

    anon = TestClient(w.app)
    assert anon.get("/api/prospects").status_code == 401
    assert anon.get("/api/prospects/export.csv").status_code == 401
    e = Expedition(w)
    assert w.client.post("/api/prospects", json=e.body([0])).status_code == 422  # pas d'Idempotency-Key
    assert w.client.patch("/api/prospects/x", json={"version": 1, "notes": "a"}).status_code == 422
    assert w.client.delete("/api/prospects/x").status_code == 422
    assert w.client.delete("/api/prospects").status_code == 422


def test_deleting_the_game_purges_everything(w):
    e = Expedition(w)
    e.add([0, 1, 2])
    assert count(w) == 3 and count(w, ExpeditionRecord) == 5
    assert w.client.delete("/api/session", headers=k()).status_code == 204
    with w.sf() as db:
        for t in ("prospects", "expedition_records", "prospect_idempotency"):
            assert db.scalar(text(f"SELECT count(*) FROM {t}")) == 0


def test_fields_outside_whitelist_are_dropped(w):
    from app.services.prospects import record_returned

    rec = annuaire(1, date_naissance="1980-01-01", email_personnel="a@b.fr", photo="x.png", avis_texte_libre="nul")
    e = Expedition(w, records=[("annuaire", rec)], leads=[lead(1)])  # insertion brute (non minimisée)
    pid = e.add([0]).json()["added"][0]["id"]
    snap = w.client.get(f"/api/prospects/{pid}").json()["instantane_source"]
    assert "date_naissance" not in snap and "email_personnel" not in snap and "photo" not in snap and "avis_texte_libre" not in snap
    assert snap["entreprise"] == "Boulangerie 1"
    # et à l'enregistrement par le moteur (record_returned) : écarté avant stockage
    with w.sf() as db:
        att = w.get_attempt(e.attempt_id)
        row = record_returned(db, w.app.state.sources_spec, att, "annuaire", "ann_0099", annuaire(99, date_naissance="1980-01-01", inconnu="x"))
        db.commit()
        assert "date_naissance" not in row.record and "inconnu" not in row.record
        with pytest.raises(ValueError):
            record_returned(db, w.app.state.sources_spec, att, "source_inconnue", "z", {})


def test_prospects_max_limit_all_or_nothing(data_copy):
    from tests.actions_support import World

    w = World(copy_with_limits(data_copy, prospects_max=3))
    try:
        e = Expedition(w, n=5)
        assert e.add([0, 1]).status_code == 201
        r = e.add([2, 3])  # 2 + 2 > 3 : rien n'est écrit
        assert r.status_code == 409 and r.json()["error"]["code"] == "INVALID_STATE"
        assert count(w) == 2
        assert e.add([2]).status_code == 201  # 3 : exactement la limite
        assert e.add([3]).status_code == 409
        assert e.add([0]).status_code == 200  # un doublon ne compte pas
    finally:
        w.close()


def test_notes_max_chars_from_rules(data_copy):
    from tests.actions_support import World

    w = World(copy_with_limits(data_copy, notes_max_chars=10))
    try:
        pid = Expedition(w).add([0]).json()["added"][0]["id"]
        assert w.client.patch(f"/api/prospects/{pid}", json={"version": 1, "notes": "x" * 11}, headers=k()).status_code == 422
        assert w.client.patch(f"/api/prospects/{pid}", json={"version": 1, "notes": "x" * 10}, headers=k()).status_code == 200
    finally:
        w.close()


# ----------------------------------------------------------------------------- API-I2 : ajout


def test_add_copies_from_server_records_not_from_the_lead(w):
    liar = lead(1, entreprise="Banque Fantôme", canal={"type": "email_generique", "valeur": "pirate@evil.test"}, pertinence=100, fiabilite="verifie", statut="gagne")
    e = Expedition(w, leads=[liar])
    r = e.add([0])
    assert r.status_code == 201, r.text
    p = r.json()["added"][0]
    assert p["entreprise"] == "Boulangerie 1"
    assert p["canal"] == {"type": "email_generique", "valeur": "contact1@exemple.test"}
    assert p["statut"] == "nouveau" and p["simule"] is True and p["fiabilite"] == "simule"
    assert p["source"] == "annuaire" and p["source_ref"] == "ann_0001" and p["collecte_le"] == "2026-10-01"
    assert p["expedition_id"] == e.attempt_id and p["rapport_version_id"] == e.report_id and p["profile_version"] >= 1
    assert p["version"] == 1 and p["possible_doublon"] is False and p["contacte_le"] is None
    assert p["pertinence"] <= 100 and p["raisons_fit"] == ["Secteur conforme"] and p["signal"] == "Ouverture récente"


def test_browser_cannot_impose_content(w):
    e = Expedition(w)
    for extra in ({"entreprise": "X"}, {"canal": {"type": "email_generique", "valeur": "x@y.z"}}, {"source_ref": "ann_0001"}, {"leads": [lead(1)]}):
        r = w.client.post("/api/prospects", json={**e.body([0]), **extra}, headers=k())
        assert r.status_code == 422, extra
    assert count(w) == 0
    # une version écrite par le joueur n'est jamais une source de prospect
    mine = e.add_report([lead(1)], author="player")
    r = w.client.post("/api/prospects", json={**e.body([0]), "rapport_version_id": mine}, headers=k())
    assert r.status_code == 422 and count(w) == 0
    # ni un document système du corpus
    sysv = e.add_report([lead(1)], author="system")
    assert w.client.post("/api/prospects", json={**e.body([0]), "rapport_version_id": sysv}, headers=k()).status_code == 422
    # patch : seuls statut et notes
    pid = e.add([0]).json()["added"][0]["id"]
    for extra in ({"entreprise": "X"}, {"pertinence": 100}, {"source_ref": "z"}, {"fiabilite": "verifie"}):
        assert w.client.patch(f"/api/prospects/{pid}", json={"version": 1, "notes": "a", **extra}, headers=k()).status_code == 422


def test_invented_lead_refused(w):
    leads = [
        lead(1),
        lead(2, source_ref="ann_9999"),  # n'a jamais été renvoyé
        {"signal": "sans référence"},  # pas de source_ref
        lead(3, source="linkedin"),  # source ne correspondant pas à l'enregistrement
        lead(4, source_ref=""),
        lead(5, source_ref=12),
        lead(1, source="source_inconnue"),
    ]
    e = Expedition(w, leads=leads)
    r = e.add(list(range(len(leads))) + [99])
    assert r.status_code == 201
    out = r.json()
    assert [p["source_ref"] for p in out["added"]] == ["ann_0001"]
    assert sorted(x["position"] for x in out["refused"]) == [1, 2, 3, 4, 5, 6, 99]
    assert all(x["code"] == "LEAD_UNVERIFIED" for x in out["refused"])
    assert count(w) == 1


def test_record_of_another_expedition_is_not_verifiable(w):
    e1 = Expedition(w, n=2)
    e2 = Expedition(w, records=[("annuaire", annuaire(7))], leads=[lead(1)])  # ann_0001 n'a pas été renvoyé à e2
    r = e2.add([0])
    assert r.status_code == 200 and r.json()["refused"] == [{"position": 0, "code": "LEAD_UNVERIFIED"}] and r.json()["added"] == []
    assert e1.add([0]).status_code == 201


def test_all_refused_is_not_an_http_error_and_writes_nothing(w):
    e = Expedition(w, leads=[lead(1, source_ref="nope")])
    r = e.add([0])
    assert r.status_code == 200 and r.json() == {"added": [], "already_present": [], "refused": [{"position": 0, "code": "LEAD_UNVERIFIED"}]}
    assert count(w) == 0


def test_dedup_is_idempotent_and_replayable(w):
    e = Expedition(w)
    key = k()
    r1 = e.add([0, 1], headers=key)
    assert r1.status_code == 201 and len(r1.json()["added"]) == 2
    ids = [p["id"] for p in r1.json()["added"]]
    r2 = e.add([0, 1], headers=key)  # rejeu : même résultat, aucune écriture
    assert r2.status_code == 200 and [p["id"] for p in r2.json()["added"]] == ids
    r3 = e.add([1, 2], headers=k())  # autre clé : le lead 1 est déjà au carnet
    assert r3.status_code == 201 and r3.json()["already_present"] == [ids[1]] and len(r3.json()["added"]) == 1
    r4 = e.add([0], headers=k())
    assert r4.status_code == 200 and r4.json()["already_present"] == [ids[0]] and r4.json()["added"] == []
    assert count(w) == 3
    assert w.client.post("/api/prospects", json=e.body([3]), headers=key).status_code == 422  # même clé, autre corps
    assert e.add([0, 0, 0]).json()["already_present"] == [ids[0]]  # positions répétées : une seule fois


def test_same_report_twice_in_one_request_creates_one_prospect(w):
    e = Expedition(w, leads=[lead(1), lead(1)])
    out = e.add([0, 1]).json()
    assert len(out["added"]) == 1 and len(out["already_present"]) == 1 and count(w) == 1


def test_concurrent_adds_of_same_lead_create_one_prospect(w):
    e = Expedition(w, n=3)
    results: list = []
    barrier = threading.Barrier(6)

    def run():
        barrier.wait()
        results.append(e.add([0, 1]))

    threads = [threading.Thread(target=run) for _ in range(6)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert all(r.status_code in (200, 201) for r in results), [r.text for r in results]
    assert count(w) == 2
    ids = {p["id"] for r in results for p in r.json()["added"]} | {i for r in results for i in r.json()["already_present"]}
    assert len(ids) == 2


def test_same_company_two_sources_flagged_as_possible_duplicate(w):
    linkedin = {"source_ref": "lin_1", "entreprise": "Boulangerie 1", "collecte_le": "2026-10-02", "contact_nom": "Jeanne Martin", "contact_fonction": "Gérante", "profil_pro_ref": "p/jm"}
    e = Expedition(w, records=[("annuaire", annuaire(1)), ("linkedin", linkedin)], leads=[lead(1), {"source": "linkedin", "source_ref": "lin_1", "canal": {"type": "reseau_pro"}}])
    out = e.add([0, 1]).json()
    assert len(out["added"]) == 2 and all(p["possible_doublon"] for p in out["added"])
    li = next(p for p in out["added"] if p["source"] == "linkedin")
    assert li["contact_nom"] == "Jeanne Martin" and li["contact_fonction"] == "Gérante" and li["canal"] == {"type": "reseau_pro", "valeur": "p/jm"}
    assert [p["possible_doublon"] for p in w.client.get("/api/prospects").json()["items"]] == [True, True]


def test_record_without_required_fields_not_recevable(w):
    bad = annuaire(1)
    del bad["collecte_le"]
    e = Expedition(w, records=[("annuaire", bad)], leads=[lead(1)])
    assert e.add([0]).json()["refused"] == [{"position": 0, "code": "LEAD_UNVERIFIED"}]


def test_report_not_structured_or_unknown(w):
    e = Expedition(w)
    with w.sf() as db:
        from app.models import ArtifactVersion

        art = ArtifactVersion(attempt_id=e.attempt_id, type="report", content="pas du json", author="agent")
        db.add(art)
        db.commit()
        bad = art.id
    assert w.client.post("/api/prospects", json={**e.body([0]), "rapport_version_id": bad}, headers=k()).status_code == 422
    assert w.client.post("/api/prospects", json={**e.body([0]), "rapport_version_id": "art_x"}, headers=k()).status_code == 404
    assert w.client.post("/api/prospects", json={**e.body([])}, headers=k()).status_code == 422
    assert w.client.post("/api/prospects", json={**e.body([-1])}, headers=k()).json()["refused"] == [{"position": -1, "code": "LEAD_UNVERIFIED"}]


def test_real_mode_reliability_and_relevance(settings):
    w = world(settings, "expert")
    try:
        profile = {
            "expected_version": 1, "entreprise_nom": "Atelier", "offre": "Éclairage sur mesure.", "cible_secteurs": ["commerce_distribution"],
            "cible_zone": ["Lyon"],
        }
        r = w.client.put("/api/profile", json=profile, headers=k())
        assert r.status_code == 200, r.text
        att_kw = {"profile_version": 2}
        recs = [
            ("annuaire", annuaire(1, secteur="Commerce et distribution")),  # secteur et zone conformes, canal présent
            ("annuaire", annuaire(2, ville="Paris", secteur="Commerce et distribution")),  # zone ko
            ("annuaire", annuaire(3, secteur="Commerce et distribution", email_generique=None, telephone_standard=None, site_web=None, adresse_pro=None)),  # pas de canal
        ]
        e = Expedition(w, records=[(s, {a: b for a, b in rec.items() if b is not None}) for s, rec in recs], leads=[lead(1), lead(2), lead(3)], **att_kw)
        out = e.add([0, 1, 2]).json()
        by = {p["source_ref"]: p for p in out["added"]}
        assert by["ann_0001"]["simule"] is False
        assert by["ann_0001"]["fiabilite"] == "verifie" and by["ann_0001"]["pertinence"] == 100
        assert by["ann_0002"]["fiabilite"] == "partiel" and by["ann_0002"]["pertinence"] < 100
        assert by["ann_0003"]["fiabilite"] == "partiel" and by["ann_0003"]["canal"] is None
        assert by["ann_0001"]["profile_version"] == 2
    finally:
        w.close()


# ----------------------------------------------------------------------------- API-I3 : liste, détail, PATCH, suppression


def seeded(w, n=7):
    names = ["Épicerie Zèbre", "boulangerie Alpha", "Café Béta", "Atelier Gamma", "Zoo Delta", "école Epsilon", "Dojo Zêta"]
    recs = [("annuaire", annuaire(i + 1, entreprise=names[i % len(names)], ville="Lyon" if i % 2 == 0 else "Paris")) for i in range(n)]
    e = Expedition(w, records=recs, leads=[lead(i + 1, signal=f"signal {i}") for i in range(n)])
    out = e.add(list(range(n))).json()
    return e, out["added"]


def test_list_sort_is_stable_and_complete(w):
    e, added = seeded(w)
    items = w.client.get("/api/prospects?tri=entreprise").json()["items"]
    assert [p["entreprise"] for p in items] == ["Atelier Gamma", "boulangerie Alpha", "Café Béta", "Dojo Zêta", "école Epsilon", "Épicerie Zèbre", "Zoo Delta"]
    desc = w.client.get("/api/prospects?tri=entreprise&ordre=desc").json()["items"]
    assert [p["id"] for p in desc] == [p["id"] for p in reversed(items)]
    # égalité de pertinence : départage par id, identique à chaque appel
    a = [p["id"] for p in w.client.get("/api/prospects?tri=source&ordre=asc").json()["items"]]
    assert a == sorted(a) and a == [p["id"] for p in w.client.get("/api/prospects?tri=source&ordre=asc").json()["items"]]
    for tri in ("pertinence", "date_ajout", "statut", "fiabilite", "source"):
        r = w.client.get(f"/api/prospects?tri={tri}")
        assert r.status_code == 200 and len(r.json()["items"]) == 7
    assert w.client.get("/api/prospects?tri=inconnu").status_code == 422
    assert w.client.get("/api/prospects?ordre=sideways").status_code == 422
    assert w.client.get("/api/prospects?statut=zzz").status_code == 422
    assert w.client.get("/api/prospects?fiabilite=zzz").status_code == 422
    assert w.client.get("/api/prospects?limit=0").status_code == 422
    assert w.client.get("/api/prospects?limit=101").status_code == 422


@pytest.mark.parametrize("tri,ordre", [("entreprise", "asc"), ("entreprise", "desc"), ("pertinence", None), ("date_ajout", None), ("statut", "asc"), ("fiabilite", "desc"), ("source", "asc")])
def test_cursor_pagination_covers_everything_once(w, tri, ordre):
    seeded(w)
    pid = w.client.get("/api/prospects?tri=entreprise").json()["items"][2]["id"]
    w.client.patch(f"/api/prospects/{pid}", json={"version": 1, "statut": "gagne"}, headers=k())
    base = f"/api/prospects?tri={tri}&limit=3" + (f"&ordre={ordre}" if ordre else "")
    full = [p["id"] for p in w.client.get(base.replace("limit=3", "limit=100")).json()["items"]]
    seen, cursor, pages = [], None, 0
    while True:
        r = w.client.get(base + (f"&cursor={cursor}" if cursor else "")).json()
        seen += [p["id"] for p in r["items"]]
        pages += 1
        cursor = r["next_cursor"]
        if not cursor:
            break
    assert seen == full and len(set(seen)) == 7 and pages == 3
    bad = w.client.get(base + "&cursor=n-importe-quoi")
    assert bad.status_code == 422
    other = w.client.get(f"/api/prospects?tri={'source' if tri != 'source' else 'entreprise'}&cursor={w.client.get(base).json()['next_cursor']}")
    assert other.status_code == 422  # un curseur est lié à son tri


def test_filters_combined_search_and_counts(w):
    e, added = seeded(w)
    items = w.client.get("/api/prospects?tri=entreprise").json()["items"]
    ids = {p["entreprise"]: p["id"] for p in items}
    w.client.patch(f"/api/prospects/{ids['Café Béta']}", json={"version": 1, "statut": "contacte", "notes": "Rappeler jeudi"}, headers=k())
    w.client.patch(f"/api/prospects/{ids['Zoo Delta']}", json={"version": 1, "statut": "contacte"}, headers=k())
    w.client.patch(f"/api/prospects/{ids['Dojo Zêta']}", json={"version": 1, "statut": "ecarte"}, headers=k())
    g = lambda q: w.client.get("/api/prospects?tri=entreprise&" + q).json()  # noqa: E731
    assert {p["entreprise"] for p in g("statut=contacte")["items"]} == {"Café Béta", "Zoo Delta"}
    assert g("statut=contacte&source=annuaire&fiabilite=simule")["total"] == 7
    assert [p["entreprise"] for p in g("statut=contacte&q=rappeler")["items"]] == ["Café Béta"]
    assert g("statut=nouveau&source=linkedin")["items"] == []
    assert g("fiabilite=verifie")["items"] == []
    # recherche : sans accent ni casse, sur entreprise ; sur notes ; caractères génériques SQL échappés
    assert [p["entreprise"] for p in g("q=epicerie")["items"]] == ["Épicerie Zèbre"]
    assert [p["entreprise"] for p in g("q=BOULANGERIE")["items"]] == ["boulangerie Alpha"]
    assert g("q=%25")["items"] == [] and g("q=_")["items"] == []
    assert [p["entreprise"] for p in g("q=gérant")["items"]][:1] != []  # fonction du lead (contact)
    # compteurs : tout le carnet, indépendants des filtres
    c = g("statut=ecarte")
    assert c["counts"] == {"nouveau": 4, "contacte": 2, "en_discussion": 0, "gagne": 0, "perdu": 0, "ecarte": 1} and c["total"] == 7
    assert len(c["items"]) == 1
    # fiches et brouillons : aucun pour l'instant (jalons J et K)
    assert g("avec_fiche=true")["items"] == [] and g("avec_brouillon=true")["items"] == []
    assert len(g("avec_fiche=false")["items"]) == 7


def test_a_relancer(w):
    e, added = seeded(w, 3)
    ids = [p["id"] for p in added]
    for i in ids:
        assert w.client.patch(f"/api/prospects/{i}", json={"version": 1, "statut": "contacte"}, headers=k()).status_code == 200
    assert w.client.get("/api/prospects?a_relancer=true").json()["items"] == []  # contactés à l'instant
    with w.sf() as db:  # vieillit contacte_le (colonne de suivi, pas de provenance)
        db.execute(text("UPDATE prospects SET contacte_le = :d WHERE id = :i"), {"d": (utcnow() - timedelta(days=8)).replace(tzinfo=None), "i": ids[0]})
        db.execute(text("UPDATE prospects SET contacte_le = :d WHERE id = :i"), {"d": (utcnow() - timedelta(days=6)).replace(tzinfo=None), "i": ids[1]})
        db.commit()
    assert [p["id"] for p in w.client.get("/api/prospects?a_relancer=true").json()["items"]] == [ids[0]]
    w.client.patch(f"/api/prospects/{ids[0]}", json={"version": 2, "statut": "en_discussion"}, headers=k())
    assert w.client.get("/api/prospects?a_relancer=true").json()["items"] == []  # n'est plus « contacté »


def test_detail(w):
    e, added = seeded(w, 1)
    d = w.client.get(f"/api/prospects/{added[0]['id']}").json()
    assert d["instantane_source"]["source_ref"] == "ann_0001" and d["fiches"] == [] and d["brouillons"] == []
    assert [h["statut"] for h in d["historique_statut"]] == ["nouveau"]
    assert d["expedition_id"] == e.attempt_id and d["rapport_version_id"] == e.report_id


def test_patch_status_notes_version_and_contacte_le(w):
    e, added = seeded(w, 1)
    pid = added[0]["id"]
    url = f"/api/prospects/{pid}"
    r = w.client.patch(url, json={"version": 1, "statut": "contacte", "notes": "=SOMME(A1)\nsuite"}, headers=k())
    assert r.status_code == 200
    d = r.json()
    assert d["version"] == 2 and d["statut"] == "contacte" and d["notes"] == "=SOMME(A1)\nsuite" and d["contacte_le"] is not None
    first = d["contacte_le"]
    assert w.client.patch(url, json={"version": 1, "notes": "périmé"}, headers=k()).json()["error"]["code"] == "VERSION_CONFLICT"
    assert w.client.get(url).json()["notes"] == "=SOMME(A1)\nsuite"
    # transitions libres ; contacte_le inchangé quand on repasse à « contacté »
    w.client.patch(url, json={"version": 2, "statut": "gagne"}, headers=k())
    d = w.client.patch(url, json={"version": 3, "statut": "contacte"}, headers=k()).json()
    assert d["contacte_le"] == first and d["version"] == 4
    assert [h["statut"] for h in d["historique_statut"]] == ["nouveau", "contacte", "gagne", "contacte"]
    # sans changement réel : pas de nouvelle version
    d = w.client.patch(url, json={"version": 4, "statut": "contacte"}, headers=k()).json()
    assert d["version"] == 4
    # validations
    for bad in ({"version": 4}, {"version": 4, "statut": "inconnu"}, {"version": 0, "notes": "a"}, {"statut": "gagne"}, {"version": 4, "notes": "x" * 2001}):
        assert w.client.patch(url, json=bad, headers=k()).status_code == 422, bad
    # provenance intacte
    assert d["entreprise"] == added[0]["entreprise"] and d["source_ref"] == "ann_0001" and d["pertinence"] == added[0]["pertinence"]
    # notes : contrôle de longueur sur du texte nettoyé (caractères de contrôle remplacés)
    d = w.client.patch(url, json={"version": 4, "notes": "a\x00b\x07c"}, headers=k()).json()
    assert d["notes"] == "a b c"


def test_first_contact_date_when_skipping_contacte(w):
    e, added = seeded(w, 1)
    url = f"/api/prospects/{added[0]['id']}"
    d = w.client.patch(url, json={"version": 1, "statut": "en_discussion"}, headers=k()).json()
    assert d["contacte_le"] is None  # « contacte_le » = premier passage à `contacte` seulement
    d = w.client.patch(url, json={"version": 2, "statut": "contacte"}, headers=k()).json()
    assert d["contacte_le"] is not None


def test_patch_replay_with_same_key(w):
    e, added = seeded(w, 1)
    url = f"/api/prospects/{added[0]['id']}"
    key = k()
    r1 = w.client.patch(url, json={"version": 1, "statut": "contacte"}, headers=key)
    r2 = w.client.patch(url, json={"version": 1, "statut": "contacte"}, headers=key)
    assert r1.status_code == r2.status_code == 200 and r2.json()["version"] == 2
    assert w.client.patch(url, json={"version": 1, "statut": "perdu"}, headers=key).status_code == 422  # même clé, autre corps


def test_concurrent_patches_one_wins(w):
    e, added = seeded(w, 1)
    url = f"/api/prospects/{added[0]['id']}"
    out: list = []
    barrier = threading.Barrier(4)

    def run(s):
        barrier.wait()
        out.append(w.client.patch(url, json={"version": 1, "statut": s}, headers=k()).status_code)

    ts = [threading.Thread(target=run, args=(s,)) for s in ("contacte", "gagne", "perdu", "ecarte")]
    [t.start() for t in ts]
    [t.join() for t in ts]
    assert sorted(out) == [200, 409, 409, 409]


def test_delete_idempotent_and_purge(w):
    e, added = seeded(w, 4)
    ids = [p["id"] for p in added]
    key = k()
    assert w.client.delete(f"/api/prospects/{ids[0]}", headers=key).status_code == 204
    assert w.client.delete(f"/api/prospects/{ids[0]}", headers=key).status_code == 204  # rejeu : même résultat
    assert w.client.delete(f"/api/prospects/{ids[0]}", headers=k()).status_code == 404  # clé neuve : absent
    assert w.client.get(f"/api/prospects/{ids[0]}").status_code == 404
    assert count(w) == 3
    # on peut le rajouter (même lead) : nouveau prospect
    assert e.add([0]).status_code == 201
    key2 = k()
    assert w.client.delete("/api/prospects", headers=key2).status_code == 204
    assert w.client.delete("/api/prospects", headers=key2).status_code == 204
    assert w.client.delete("/api/prospects", headers=k()).status_code == 204  # déjà vide : toujours 204
    assert count(w) == 0
    assert w.client.get("/api/prospects").json() == {"items": [], "next_cursor": None, "counts": {"nouveau": 0, "contacte": 0, "en_discussion": 0, "gagne": 0, "perdu": 0, "ecarte": 0}, "total": 0}


def test_purge_only_touches_own_game(w):
    e, _ = seeded(w, 2)
    other = second_client(w)
    assert other.delete("/api/prospects", headers=k()).status_code == 204
    assert count(w) == 2


def test_never_conditioned_by_money_or_score(w):
    """Consulter, annoter, supprimer, exporter fonctionnent avec un solde à 0 et sans aucun score."""
    e, added = seeded(w, 2)
    with w.sf() as db:
        from app.models import LedgerEntry

        db.add(LedgerEntry(session_id=w.sid, amount=-1000, category="test", source_action="drain"))
        db.commit()
    bal = w.balance()
    pid = added[0]["id"]
    assert w.client.get("/api/prospects").status_code == 200
    assert w.client.patch(f"/api/prospects/{pid}", json={"version": 1, "statut": "contacte"}, headers=k()).status_code == 200
    assert w.client.get("/api/prospects/export.csv").status_code == 200
    assert w.client.delete(f"/api/prospects/{pid}", headers=k()).status_code == 204
    assert e.add([4]).status_code in (200, 201)
    assert w.balance() == bal  # aucune écriture au ledger


def test_logs_contain_no_personal_content(w, caplog):
    import logging

    caplog.set_level(logging.DEBUG)
    logging.getLogger("rubix").addHandler(caplog.handler)  # le logger « rubix » ne se propage pas à la racine
    e, added = seeded(w, 3)
    pid = added[0]["id"]
    w.client.patch(f"/api/prospects/{pid}", json={"version": 1, "notes": "NOTE-SECRETE-xyz"}, headers=k())
    w.client.get("/api/prospects?q=SECRETE-xyz")
    w.client.get("/api/prospects/export.csv")
    w.client.delete(f"/api/prospects/{pid}", headers=k())
    w.client.post("/api/prospects", json=e.body([0]), headers=k())
    blob = "\n".join(r.getMessage() + json.dumps({k_: str(v) for k_, v in r.__dict__.items() if k_ not in ("args", "msg")}, default=str) for r in caplog.records if r.name.startswith("rubix"))
    assert any(getattr(r, "event", "") == "prospects_add" for r in caplog.records)  # le test observe bien les journaux du carnet
    for secret in ("NOTE-SECRETE", "Boulangerie", "contact1@exemple.test", "Jeanne", "Épicerie", "Zèbre", "ann_000"):
        assert secret not in blob, secret
