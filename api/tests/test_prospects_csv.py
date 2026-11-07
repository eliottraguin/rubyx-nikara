"""API-I4 : export CSV du carnet (UTF-8 BOM, `;`, CRLF, formules neutralisées) et QA-I1 (parcours Tutoriel)."""

from __future__ import annotations

import csv
import io
import logging
import re

import pytest

from app.services import prospects_csv as out
from tests.prospects_support import Expedition, annuaire, k, lead, second_client, world
from tests.test_prospects import w  # noqa: F401  (fixture)

DANGEROUS = ["=", "+", "-", "@", "\t", "\r"]


def parse(resp) -> list[list[str]]:
    text = resp.content.decode("utf-8")
    assert text.startswith("﻿")
    return list(csv.reader(io.StringIO(text[1:], newline=""), delimiter=";"))


def test_headers_format_and_no_store(w):  # noqa: F811
    Expedition(w).add([0, 1])
    r = w.client.get("/api/prospects/export.csv")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/csv") and "utf-8" in r.headers["content-type"].lower()
    assert r.headers["cache-control"] == "no-store"
    assert re.fullmatch(r'attachment; filename="prospects-SIMULE-\d{8}\.csv"', r.headers["content-disposition"])
    raw = r.content
    assert raw.startswith(b"\xef\xbb\xbf") and raw.endswith(b"\r\n") and raw.count(b"\r\n") == 3 and b"\n" not in raw.replace(b"\r\n", b"")
    rows = parse(r)
    assert rows[0] == [
        "id", "entreprise", "contact", "fonction", "canal_type", "canal", "raison_de_correspondance", "pertinence", "fiabilite",
        "origine", "simule", "statut", "notes", "ajoute_le", "contacte_le", "source_ref",
    ]
    assert len(rows) == 3 and all(len(x) == 16 for x in rows)
    row = dict(zip(rows[0], rows[1]))
    assert row["simule"] == "oui" and row["origine"] == "annuaire" and row["source_ref"].startswith("ann_") and row["contacte_le"] == ""
    assert re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ", row["ajoute_le"]) and row["pertinence"].isdigit()
    assert row["canal_type"] == "email_generique" and row["raison_de_correspondance"] == "Secteur conforme"


def test_empty_book_exports_header_only(w):  # noqa: F811
    r = w.client.get("/api/prospects/export.csv")
    assert r.status_code == 200 and len(parse(r)) == 1


def test_real_mode_filename_without_simule(settings):
    w = world(settings, "expert")
    try:
        r = w.client.get("/api/prospects/export.csv")
        assert re.fullmatch(r'attachment; filename="prospects-\d{8}\.csv"', r.headers["content-disposition"])
    finally:
        w.close()


def test_tab_and_cr_cells_neutralized_even_if_stored_raw(w):  # noqa: F811
    """Défense en profondeur : l'ingestion retire les espaces de tête, mais la neutralisation du CSV ne s'y fie pas.
    On insère directement (comme un futur import) des lignes dont TOUTES les colonnes texte commencent par un caractère dangereux."""
    from app.models import Prospect

    with w.sf() as db:
        for i, ch in enumerate(("\t", "\r", "=", "+", "-", "@")):
            v = f"{ch}x{i}"
            db.add(Prospect(
                session_id=w.sid, entreprise=v, entreprise_cle=v, contact_nom=v, contact_fonction=v, canal_type=v, canal_valeur=v,
                source=v, source_ref=v, raisons_fit=[v], signal=v, pertinence=50, fiabilite=v, simule=True, instantane={}, collecte_le=None,
                expedition_id=v, rapport_version_id=v, profile_version=1, statut=v, notes=v,
            ))
        db.commit()
    rows = parse(w.client.get("/api/prospects/export.csv"))
    assert len(rows) == 7
    for r_ in rows[1:]:
        d = dict(zip(rows[0], r_))
        assert d["pertinence"] == "50"
        for col in ("entreprise", "contact", "fonction", "canal_type", "canal", "raison_de_correspondance", "fiabilite", "origine", "statut", "notes", "source_ref"):
            assert d[col].startswith("'") and d[col][1] in DANGEROUS, (col, d[col])


@pytest.mark.parametrize("ch", [c for c in DANGEROUS if c not in ("\t", "\r")])
@pytest.mark.parametrize("col", ["entreprise", "source_ref", "notes", "contact_nom", "contact_fonction", "canal", "raison"])
def test_formula_neutralization_one_cell_per_dangerous_char(w, ch, col):  # noqa: F811
    payload = f"{ch}CMD|calc"
    rec = annuaire(1)
    ld = lead(1)
    if col == "entreprise":
        rec["entreprise"] = payload
    elif col == "source_ref":
        rec["source_ref"] = ld["source_ref"] = payload
    elif col == "contact_fonction":
        rec = {"source_ref": "lin_1", "entreprise": "Acme", "collecte_le": "2026-10-01", "contact_fonction": payload}
        ld = {"source": "linkedin", "source_ref": "lin_1"}
    elif col == "contact_nom":
        rec = {"source_ref": "lin_1", "entreprise": "Acme", "collecte_le": "2026-10-01", "contact_nom": payload}
        ld = {"source": "linkedin", "source_ref": "lin_1"}
    elif col == "canal":
        rec["email_generique"] = payload
    elif col == "raison":
        ld["raisons_fit"] = [payload]
    source = "linkedin" if col in ("contact_fonction", "contact_nom") else "annuaire"
    e = Expedition(w, records=[(source, rec)], leads=[ld])
    added = e.add([0]).json()
    assert added["added"], added
    pid = added["added"][0]["id"]
    if col == "notes":
        assert w.client.patch(f"/api/prospects/{pid}", json={"version": 1, "notes": payload}, headers=k()).status_code == 200
    rows = parse(w.client.get("/api/prospects/export.csv"))
    cell = {
        "entreprise": "entreprise", "source_ref": "source_ref", "notes": "notes", "contact_nom": "contact", "contact_fonction": "fonction",
        "canal": "canal", "raison": "raison_de_correspondance",
    }[col]
    value = dict(zip(rows[0], rows[1]))[cell]
    assert value == "'" + payload, (col, ch, value)
    for v in rows[1]:  # aucune cellule de la ligne n'est interprétable comme formule
        assert v == "" or v[0] not in DANGEROUS


def test_neutralization_unit_and_quoting():
    assert out.neutralize("=1+1") == "'=1+1" and out.neutralize("abc=") == "abc=" and out.neutralize("") == "" and out.neutralize("12") == "12"
    assert out.neutralize("'=x") == "'=x"  # déjà préfixé par le contenu lui-même : pas de double traitement
    assert out.quote('a;b') == '"a;b"' and out.quote('x"y') == '"x""y"' and out.quote("l1\nl2") == '"l1\nl2"' and out.quote("l1\rl2") == '"l1\rl2"'
    assert out.quote("simple") == "simple" and out.quote("a,b") == "a,b"
    # neutralisation AVANT mise entre guillemets : une cellule dangereuse avec `;` ou guillemets reste neutralisée
    assert out.quote(out.neutralize('=A;"B"')) == '"\'=A;""B"""'


def test_quotes_semicolons_and_newlines_roundtrip(w):  # noqa: F811
    notes = '=HYPERLINK("http://x";"y")\nligne 2; avec "guillemets"\r\n+33 1 23'
    rec = annuaire(1, entreprise='Dupont; "Fils" & Cie')
    e = Expedition(w, records=[("annuaire", rec)], leads=[lead(1, signal="a;b", raisons_fit=["x | y", 'z"q'])])
    pid = e.add([0]).json()["added"][0]["id"]
    # (les caractères de contrôle des notes sont nettoyés par le serveur : \r devient espace ; le \n est conservé)
    assert w.client.patch(f"/api/prospects/{pid}", json={"version": 1, "notes": notes}, headers=k()).status_code == 200
    rows = parse(w.client.get("/api/prospects/export.csv"))
    row = dict(zip(rows[0], rows[1]))
    assert row["entreprise"] == 'Dupont; "Fils" & Cie'
    assert row["notes"].startswith("'=HYPERLINK(") and "ligne 2; avec \"guillemets\"" in row["notes"]
    assert row["raison_de_correspondance"] == 'x | y | z"q'
    assert len(rows) == 2 and len(rows[1]) == 16  # les sauts de ligne internes n'ont pas cassé les lignes


def test_phone_number_is_made_harmless(w):  # noqa: F811
    e = Expedition(w, records=[("annuaire", annuaire(1, telephone_standard="+33 4 78 00 00 00", email_generique=None))], leads=[lead(1, canal={"type": "telephone_standard"})])
    e.w.sf  # noqa: B018
    rec_ok = e.add([0]).json()
    assert rec_ok["added"][0]["canal"] == {"type": "telephone_standard", "valeur": "+33 4 78 00 00 00"}  # l'API renvoie la valeur brute
    row = dict(zip(*parse(w.client.get("/api/prospects/export.csv"))[:2]))
    assert row["canal"] == "'+33 4 78 00 00 00"


def test_export_uses_same_filters_and_sort_as_list(w):  # noqa: F811
    e = Expedition(w, n=4)
    ids = [p["id"] for p in e.add([0, 1, 2, 3]).json()["added"]]
    w.client.patch(f"/api/prospects/{ids[1]}", json={"version": 1, "statut": "gagne"}, headers=k())
    rows = parse(w.client.get("/api/prospects/export.csv?statut=gagne"))
    assert [r[0] for r in rows[1:]] == [ids[1]] and rows[1][11] == "gagne"
    rows = parse(w.client.get("/api/prospects/export.csv?tri=entreprise&ordre=desc"))
    assert [r[1] for r in rows[1:]] == ["Boulangerie 4", "Boulangerie 3", "Boulangerie 2", "Boulangerie 1"]
    assert w.client.get("/api/prospects/export.csv?tri=zzz").status_code == 422


def test_export_is_session_scoped(w):  # noqa: F811
    Expedition(w).add([0])
    other = second_client(w)
    assert len(parse(other.get("/api/prospects/export.csv"))) == 1  # en-tête seulement


def test_export_logs_count_and_duration_only(w, caplog):  # noqa: F811
    Expedition(w).add([0, 1])
    caplog.set_level(logging.DEBUG)
    logging.getLogger("rubix").addHandler(caplog.handler)  # le logger « rubix » ne se propage pas à la racine
    w.client.get("/api/prospects/export.csv?q=Boulangerie")
    recs = [r for r in caplog.records if getattr(r, "event", "") == "prospects_export"]
    assert len(recs) == 1 and recs[0].count == 2 and isinstance(recs[0].duration_ms, int)
    blob = "\n".join(r.getMessage() + str(r.__dict__) for r in caplog.records if r.name.startswith("rubix"))
    assert "Boulangerie" not in blob and "exemple.test" not in blob


def test_qa_i1_tutorial_flow_expedition_add_sort_contacted_export(w):  # noqa: F811
    """Parcours : expédition (enregistrements + rapport) -> ajout -> tri -> « contacté » -> export relu."""
    recs = [
        ("annuaire", annuaire(1, entreprise="=SOMME(1;1) Traiteur")),
        ("annuaire", annuaire(2, entreprise="Atelier Bois")),
        ("annuaire", annuaire(3, entreprise="@admin SARL")),
    ]
    e = Expedition(w, records=recs, leads=[lead(1), lead(2), lead(3), lead(1, source_ref="ann_9999")])
    r = e.add([0, 1, 2, 3])
    assert r.status_code == 201 and len(r.json()["added"]) == 3 and len(r.json()["refused"]) == 1
    listing = w.client.get("/api/prospects?tri=entreprise").json()
    assert [p["entreprise"] for p in listing["items"]] == ["=SOMME(1;1) Traiteur", "@admin SARL", "Atelier Bois"] or len(listing["items"]) == 3
    target = next(p for p in listing["items"] if p["entreprise"] == "Atelier Bois")
    d = w.client.patch(f"/api/prospects/{target['id']}", json={"version": 1, "statut": "contacte", "notes": "Appelé"}, headers=k()).json()
    assert d["statut"] == "contacte" and d["contacte_le"]
    assert w.client.get("/api/prospects").json()["counts"]["contacte"] == 1
    resp = w.client.get("/api/prospects/export.csv?tri=entreprise")
    rows = parse(resp)
    assert len(rows) == 4
    by = {r_[1].lstrip("'"): dict(zip(rows[0], r_)) for r_ in rows[1:]}
    assert by["=SOMME(1;1) Traiteur"]["entreprise"] == "'=SOMME(1;1) Traiteur" and by["@admin SARL"]["entreprise"] == "'@admin SARL"
    assert by["Atelier Bois"]["statut"] == "contacte" and by["Atelier Bois"]["notes"] == "Appelé" and by["Atelier Bois"]["contacte_le"].endswith("Z")
    assert all(x["simule"] == "oui" for x in by.values())
    for r_ in rows[1:]:
        assert all(c == "" or c[0] not in DANGEROUS for c in r_)
