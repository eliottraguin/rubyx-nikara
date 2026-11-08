"""Tri de pertinence simulé du bot `scout` (schéma `RelevanceTriage`) : déterministe, sans réseau. Ne lit que
`metadata["relevance"]` : `records` (enregistrements **minimisés**, sans email ni téléphone), `facts` (indices structurés calculés
par le code, par `source_ref`), `exclusions` (de la fiche), `precision`. Les citations sont toujours la valeur **entière** d'un champ
structuré court ; aucun texte libre d'un enregistrement n'est recopié et aucune consigne qu'il contiendrait n'est suivie.

Règles : exclusion de la fiche trouvée dans un champ -> `hors_cible` ; secteur, zone ou taille connus et hors cible -> `hors_cible` ;
tout concorde -> `correspond` ; sinon (inconnu ou taille voisine) -> `a_verifier`.

Marqueurs de test dans la précision : `#tri-invalide` (jamais un JSON valide) ; `#tri-reparable` (premier appel invalide) ;
`#tri-invente` (citation inventée pour le premier prospect, plus une référence étrangère)."""

from __future__ import annotations

import json
import unicodedata

_SECTOR = ("secteur", "secteur_libelle", "secteur_code")
_EXCL = ("secteur", "secteur_libelle", "forme_juridique")


def _fold(text: str) -> str:
    return " ".join("".join(c for c in unicodedata.normalize("NFKD", text.casefold()) if not unicodedata.combining(c)).split())


SHORT = 60  # on ne cite que des valeurs courtes (étiquettes structurées), jamais un texte libre long


def _first(rec: dict, names: tuple[str, ...]) -> tuple[str, str] | None:
    for n in names:
        if isinstance(rec.get(n), str) and rec[n].strip() and len(rec[n]) <= SHORT:
            return n, rec[n]
    return None


def _item(rec: dict, fact: dict, exclusions: list[str]) -> dict:
    ref = rec["source_ref"]
    for name in _EXCL:
        v = rec.get(name)
        if isinstance(v, str) and len(v) <= SHORT and any(_fold(x) in _fold(v) for x in exclusions):
            return {"source_ref": ref, "etiquette": "hors_cible", "citation": v}
    sector = _first(rec, _SECTOR)
    zone = _first(rec, ("ville", "region"))
    size = _first(rec, ("effectif_tranche",))
    if fact.get("secteur") is False and sector:
        return {"source_ref": ref, "etiquette": "hors_cible", "citation": sector[1]}
    if fact.get("zone") is False and zone:
        return {"source_ref": ref, "etiquette": "hors_cible", "citation": zone[1]}
    if fact.get("taille") == "hors" and size:
        return {"source_ref": ref, "etiquette": "hors_cible", "citation": size[1]}
    if fact.get("taille") in ("partielle", "inconnue") and size:
        return {"source_ref": ref, "etiquette": "a_verifier", "citation": size[1]}
    if fact.get("secteur") is None or fact.get("zone") is None or fact.get("taille") == "inconnue":
        return {"source_ref": ref, "etiquette": "a_verifier", "citation": ""}
    cite = sector or zone
    return {"source_ref": ref, "etiquette": "correspond", "citation": cite[1] if cite else ""}


def build_triage_json(hints: dict) -> str:
    precision = _fold(str(hints.get("precision") or ""))
    repair = str(hints.get("purpose", "")).endswith("repair")
    if "#tri-invalide" in precision or ("#tri-reparable" in precision and not repair):
        return "Voici mon tri : tous les prospects correspondent."  # pas du JSON : provoque une réparation
    facts = hints.get("facts") or {}
    exclusions = [x for x in hints.get("exclusions", []) if isinstance(x, str)]
    items = [_item(r, facts.get(r["source_ref"], {}), exclusions) for r in hints.get("records", []) if isinstance(r, dict) and r.get("source_ref")]
    if "#tri-invente" in precision and items:
        items[0] = {**items[0], "etiquette": "correspond", "citation": "Texte qui n'existe pas dans la source"}
        items.append({"source_ref": "ann_999", "etiquette": "correspond", "citation": "Entreprise inventée"})
    return json.dumps({"tri": items}, ensure_ascii=False)
