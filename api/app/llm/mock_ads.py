"""Kit de campagne SIMULÉ (rôle `ads`) : déterministe, sans réseau, construit uniquement à partir de la fiche entreprise
transmise en indice (`metadata["ads"]`) : aucun fait, chiffre, URL ni label n'est ajouté. Respecte les limites de
caractères de chaque champ de format. Un fournisseur réel ne lit que `context`."""

from __future__ import annotations

import json
import re
from typing import Any

_GENERIC = ["Une offre claire", "Pour votre entreprise", "Découvrez notre offre", "Parlons de vos besoins", "Une solution adaptée"]
_CTA = ["Nous contacter", "En savoir plus", "Demander un échange"]


def _cut(text: str, limit: int) -> str:
    text = " ".join(text.split())
    if len(text) <= limit:
        return text
    cut = text[:limit]
    if " " in cut and not text[limit].isspace():
        cut = cut.rsplit(" ", 1)[0]
    return cut.rstrip(" ,;:-–.") or text[:limit]


def _sentences(text: str) -> list[str]:
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+", text or "") if s.strip()]


def _human(items: list[str]) -> str:
    return ", ".join(i.replace("_", " ") for i in items)


def build_kit_json(meta: dict[str, Any]) -> str:
    p: dict[str, Any] = meta["profile"]
    nom = p.get("entreprise_nom") or "Notre entreprise"
    offre = _sentences(p.get("offre", ""))
    besoin = _sentences(p.get("besoin", ""))
    secteurs = _human(p.get("cible_secteurs") or [])
    zone = _human(p.get("cible_zone") or [])
    fonctions = _human(p.get("cible_fonctions") or [])

    pool = [*offre, *besoin, nom]
    if secteurs:
        pool.append(f"Pour les entreprises : {secteurs}")
    if zone:
        pool.append(f"{nom} accompagne les entreprises de {zone}")
    pool.extend(_GENERIC)

    def pick(i: int, limit: int) -> str:
        return _cut(pool[i % len(pool)], limit)

    positionnement = _cut(offre[0] if offre else nom, 160)

    accroches = []
    if offre:
        accroches.append({"texte": _cut(offre[0], 200), "fiche": "offre"})
    if besoin:
        accroches.append({"texte": _cut(besoin[0], 200), "fiche": "besoin"})
    elif secteurs:
        accroches.append({"texte": _cut(f"Pour les entreprises : {secteurs}", 200), "fiche": "cible_secteurs"})
    if zone:
        accroches.append({"texte": _cut(f"{nom} accompagne les entreprises de {zone}", 200), "fiche": "cible_zone"})
    for filler in (nom, secteurs or nom, nom):
        if len(accroches) >= 3:
            break
        accroches.append({"texte": _cut(filler, 200), "fiche": "entreprise_nom"})

    audience = f"Entreprises des secteurs : {secteurs or 'à préciser'} ; zone : {zone or 'à préciser'}."
    if fonctions:
        audience += f" Fonctions visées : {fonctions}."
    size = p.get("cible_taille")
    if size:
        audience += f" Taille : de {size['effectif_min']} à {size['effectif_max']} salariés."

    textes = []
    for fmt in meta["formats"]:
        champs: dict[str, list[str]] = {}
        cursor = 0
        for f in fmt["fields"]:
            if not f["required"] and f["id"] == "description" and "count" not in f:
                continue
            lo = f["count"]["min"] if f.get("count") else 1
            values: list[str] = []
            for _ in range(lo):
                if f["id"] == "appel_action":
                    v = _cut(_CTA[len(values) % len(_CTA)], f["max_chars"])
                else:
                    v = pick(cursor, f["max_chars"])
                    cursor += 1
                    n = 0
                    while v in values and n < len(pool):  # variantes distinctes quand plusieurs textes sont demandés
                        v = pick(cursor, f["max_chars"])
                        cursor += 1
                        n += 1
                values.append(v)
            champs[f["id"]] = values
        textes.append({"format": fmt["id"], "champs": champs})

    a_verifier = list(meta.get("missing_labels") or [])
    a_verifier.append("Confirmez vous-même chaque prix, date et preuve à annoncer avant de publier.")

    kit = {
        "positionnement": positionnement,
        "audience_resume": _cut(audience, 500),
        "accroches": accroches[:5],
        "textes": textes,
        "brief_visuel": {
            "sujet": _cut(f"Visuel sobre pour {nom} : {positionnement}", 300),
            "style": "Photographie sobre, lumineuse, sans mise en scène excessive.",
            "texte_image": _cut(positionnement, 60),
            "format_dimensions": "1080 x 1080 px (carré)",
            "prompt": _cut(f"Photographie lumineuse et sobre illustrant : {positionnement}. Aucun texte, aucun logo.", 600),
        },
        "plan": {
            "calendrier": ["Semaine 1 : valider les textes et préparer le visuel", "Semaine 2 : publier vous-même, puis observer", "Semaine 3 : ajuster les textes selon les premiers retours"],
            "repartition_budget": ["Budget indicatif à répartir entre les formats choisis : décision et dépense restent les vôtres."],
            "indicateurs": ["Taux de clic", "Nombre de demandes de contact", "Coût par contact"],
        },
        "checklist": [{"id": i} for i in meta["checklist_ids"]],
        "a_verifier": a_verifier,
    }
    return json.dumps(kit, ensure_ascii=False)
