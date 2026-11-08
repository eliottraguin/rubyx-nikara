"""Contenu des lieux Annuaire et Registre (DATA-S1) : schémas, pièges, données fictives. Aucun code applicatif."""

import json
import re
from pathlib import Path

import jsonschema
import pytest

DATA = Path(__file__).resolve().parents[2] / "data"
PLANETS = ["annuaire", "registre"]
PIEGES_ATTENDUS_MIN = 5
EMAIL = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
PHONE = re.compile(r"(?<!\d)(?:\+\d{2}[ .]?)?(?:\d{1,2}[ .]){4}\d{2}(?!\d)")


def load(p: Path):
    return json.loads(p.read_text(encoding="utf-8"))


def schema(name: str):
    return load(DATA / "schemas" / name)


def validate(instance, name: str):
    jsonschema.Draft202012Validator(schema(name)).validate(instance)


def fiches() -> dict:
    out = {}
    for p in [*(DATA / "profile" / "examples").glob("*.json"), *(DATA / "planets").glob("*/examples/*.json")]:
        f = load(p)
        out[f["id"]] = (p, f)
    return out


@pytest.mark.parametrize("pid", PLANETS)
def test_planet_json_conforme(pid):
    p = load(DATA / "planets" / pid / "planet.json")
    validate(p, "planet.schema.json")
    assert p["id"] == pid
    assert p["deblocage"]["type"] == ("ouvert" if pid == "annuaire" else "prospects_retenus")
    if pid == "registre":
        assert p["deblocage"] == {"type": "prospects_retenus", "planet_id": "annuaire", "min": 3}
    noms = {f["name"] for f in p["champs_renvoyes"]}
    assert not noms & set(p["champs_exclus_toujours"])
    assert not any(f["personal_data"] for f in p["champs_renvoyes"])
    spec = load(DATA / "sources" / f"{pid}.json")  # alignement sur la liste blanche des sources
    assert {f["name"] for f in spec["allowed_fields"]} - {"source_ref"} <= noms
    for f in p["exemples"]:
        assert (DATA / f).is_file()


@pytest.mark.parametrize("pid", PLANETS)
def test_corpus(pid):
    p = load(DATA / "planets" / pid / "planet.json")
    c = load(DATA / "planets" / pid / "corpus.json")
    validate(c, "planet_corpus.schema.json")
    ids = [r["record_id"] for r in c["records"]]
    assert len(ids) >= 30 and len(ids) == len(set(ids))
    autorises = {f["name"] for f in p["champs_renvoyes"]}
    for r in c["records"]:
        assert set(r) <= autorises
        assert "@" not in r["entreprise"]


@pytest.mark.parametrize("pid", PLANETS)
def test_aucune_donnee_personnelle_reelle(pid):
    texte = (DATA / "planets" / pid / "corpus.json").read_text(encoding="utf-8")
    for m in EMAIL.findall(texte):
        assert m.endswith(".invalid"), m
    for m in PHONE.findall(texte):
        assert m == "01 00 00 00 00", m
    for m in re.findall(r"https?://[^\s\"]+", texte):
        assert m.rstrip("/").endswith(".invalid"), m


@pytest.mark.parametrize("pid", PLANETS)
def test_pieges_et_reponses(pid):
    c = load(DATA / "planets" / pid / "corpus.json")
    ids = {r["record_id"] for r in c["records"]}
    a = load(DATA / "planets" / pid / "answers.json")
    types = set()
    connues = fiches()
    for fid, rep in a["fiches"].items():
        assert fid in connues
        assert rep["bons"], fid
        assert set(rep["bons"]) <= ids
        assert set(rep["pieges"]) <= ids
        assert not set(rep["bons"]) & set(rep["pieges"])
        types |= set(rep["pieges"].values())
    assert len(a["fiches"]) >= 2
    assert len(types) >= PIEGES_ATTENDUS_MIN, types
    assert "injection" in types


@pytest.mark.parametrize("pid", PLANETS)
def test_enregistrement_avec_instruction_injectee(pid):
    c = load(DATA / "planets" / pid / "corpus.json")
    a = load(DATA / "planets" / pid / "answers.json")
    inj = [r for r in c["records"] if re.search(r"ignore(?:z)? tes consignes", json.dumps(r, ensure_ascii=False), re.IGNORECASE)]
    assert len(inj) == 1
    marques = {k for rep in a["fiches"].values() for k, t in rep["pieges"].items() if t == "injection"}
    assert inj[0]["record_id"] in marques


def test_fiches_exemples_valides():
    spec = load(DATA / "profile" / "target_profile_v1.json")
    secteurs = {s["id"] for s in spec["sectors"]}
    f = spec["fields"]
    for pid in PLANETS:
        p = load(DATA / "planets" / pid / "planet.json")
        for rel in p["exemples"]:
            fiche = load(DATA / rel)
            validate(fiche, "target_profile_example.schema.json")
            assert fiche["simule"] is True
            assert set(fiche["cible_secteurs"]) <= secteurs
            assert len(fiche["offre"]) <= f["offre"]["max_chars"]
            assert len(fiche["entreprise_nom"]) <= f["entreprise_nom"]["max_chars"]
            assert 1 <= len(fiche["cible_zone"]) <= f["cible_zone"]["max_items"]
            assert fiche["ton"] in f["ton"]["values"]
