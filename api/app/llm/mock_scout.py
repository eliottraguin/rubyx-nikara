"""Rapport simulé du bot `scout` : déterministe, sans réseau. Ne lit que `metadata["scout"]` (`records` = enregistrements
**minimisés** renvoyés par le lieu, `precision`, `purpose`) ; ne cite jamais qu'une référence de cette liste (sauf marqueur de test).
Les textes sont bâtis sur des champs structurés courts : un texte libre d'un enregistrement (donnée non fiable) n'est jamais recopié
et aucune instruction qu'il contiendrait n'est suivie.

Marqueurs de test dans la précision : `#vide` (aucun lead) ; `#invente` (ajoute une référence absente de la liste) ;
`#doublon` (répète le premier lead) ; `#invalide` (jamais un JSON valide) ; `#reparable` (premier appel invalide)."""

from __future__ import annotations

import json
import unicodedata


def _norm(text: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", text.lower()) if unicodedata.category(c) != "Mn")


def _lead(rec: dict) -> dict:
    parts = [rec.get("secteur") or rec.get("secteur_code"), rec.get("ville"), rec.get("effectif_tranche")]
    reasons = [str(p)[:100] for p in parts if isinstance(p, str) and p]
    return {
        "source_ref": rec["source_ref"],
        "signal": f"Fiche collectée le {rec['collecte_le']}" if rec.get("collecte_le") else "Fiche trouvée dans la source",
        "raisons_fit": reasons,
    }


def build_report_json(hints: dict) -> str:
    precision = _norm(str(hints.get("precision") or ""))
    repair = str(hints.get("purpose", "")).endswith("repair")
    if "#invalide" in precision or ("#reparable" in precision and not repair):
        return "Voici mon rapport : plusieurs entreprises correspondent."  # pas du JSON : provoque une réparation
    records = [r for r in hints.get("records", []) if isinstance(r, dict) and r.get("source_ref")]
    if "#vide" in precision:
        return json.dumps({"leads": []}, ensure_ascii=False)
    leads = [_lead(r) for r in records]
    if "#doublon" in precision and leads:
        leads.append(dict(leads[0]))
    if "#invente" in precision:
        leads.append({"source_ref": "ann_999", "signal": "Entreprise inventée", "raisons_fit": []})
    return json.dumps({"leads": leads}, ensure_ascii=False)
