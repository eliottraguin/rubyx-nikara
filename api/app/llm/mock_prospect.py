"""Fiche client et premier message SIMULÉS (rôle `replier`) : déterministes, sans réseau, construits uniquement à partir des
données transmises en indice (`metadata["prospect_draft"]`) : aucun fait, chiffre, nom ni URL n'est ajouté. Un fournisseur
réel ne lit que `context`."""

from __future__ import annotations

import json
import re
from typing import Any

_PRIORITY = ("cible_secteurs", "cible_zone", "cible_fonctions", "offre")


def _cut(text: str, limit: int) -> str:
    text = " ".join(str(text).split())
    if len(text) <= limit:
        return text
    cut = text[:limit]
    if " " in cut and not text[limit].isspace():
        cut = cut.rsplit(" ", 1)[0]
    return cut.rstrip(" ,;:-–.") or text[:limit]


def _first_sentence(text: str) -> str:
    parts = [s.strip() for s in re.split(r"(?<=[.!?])\s+", text or "") if s.strip()]
    return parts[0] if parts else ""


def _criterion(profile: dict[str, Any], criteria: list[str], i: int) -> str:
    filled = [c for c in _PRIORITY if profile.get(c) and c in criteria]
    if filled:
        return filled[i % len(filled)]
    return criteria[0] if criteria else "offre"


def build_fiche_json(meta: dict[str, Any]) -> str:
    p, pro = meta["profile"], meta["prospect"]
    fields: list[str] = meta["fields"]
    snap = pro.get("instantane") or {}
    own = [f for f in snap if isinstance(snap[f], str) and snap[f] and f != "source_ref"]  # champs de l'instantané renseignés
    entreprise = pro.get("entreprise") or "Ce prospect"
    raisons = [str(r) for r in (pro.get("raisons_fit") or []) if str(r).strip()][:5]
    resume = [f"{entreprise}."]
    if pro.get("fonction"):
        resume.append(f"Contact visé : {pro['fonction']}.")
    if pro.get("signal"):
        resume.append(f"Signal : {pro['signal']}.")
    if raisons:
        resume.append("Raisons de correspondance : " + " ; ".join(raisons) + ".")
    pourquoi = []
    for i, r in enumerate(raisons):
        champ = own[i % len(own)] if own else "raisons_fit"
        pourquoi.append({"texte": _cut(r, 200), "critere": _criterion(p, meta["criteria"], i), "champ": champ if champ in fields else "entreprise"})
    if not pourquoi:
        pourquoi = [{"texte": _cut(f"{entreprise} figure dans la source {pro.get('source') or 'du carnet'}", 200), "critere": _criterion(p, meta["criteria"], 0), "champ": "source"}]
    accroches = []
    offre = _first_sentence(p.get("offre", ""))
    if offre:
        accroches.append(_cut(offre, 200))
    if pro.get("signal"):
        accroches.append(_cut(str(pro["signal"]), 200))
    accroches.append(_cut(f"{entreprise}", 200))
    a_verifier = []
    if meta.get("missing_or_stale"):
        a_verifier.append("Certaines informations du prospect manquent ou sont anciennes : confirmez-les avant de le contacter.")
    a_verifier.append("Vérifiez la correspondance avec votre cible avant tout contact.")
    sources = [pro["source_ref"]] if pro.get("source_ref") else []
    return json.dumps(
        {"resume": _cut(" ".join(resume), 600), "pourquoi_ce_prospect": pourquoi, "points_d_accroche": accroches[:5], "a_verifier": a_verifier[:8], "sources": sources},
        ensure_ascii=False,
    )


def build_message_json(meta: dict[str, Any]) -> str:
    p, pro = meta["profile"], meta["prospect"]
    nom = p.get("entreprise_nom") or ""
    tutoie = str(meta.get("ton", "")).startswith("tutoiement")
    offre = _first_sentence(p.get("offre", ""))
    intro = f"Je me permets d'écrire au nom de {nom}." if nom else "Je me permets de vous écrire."
    if tutoie:
        intro = f"Je t'écris au nom de {nom}." if nom else "Je t'écris."
    mentions = f"{meta['origine']} {meta['opposition']}"
    limit = int(meta["draft_max_chars"])
    fixed = f"Bonjour,\n{intro}\n" + "\n" + mentions + "\nCordialement."
    room = max(0, limit - len(fixed) - 2)
    body = ["Bonjour,", intro]
    if offre and room > 20:
        body.append(_cut(offre, min(room, 300)))
    body += ["", mentions, "Cordialement."]
    objet = _cut(f"{nom} : une prise de contact" if nom else "Une prise de contact", 90)
    return json.dumps(
        {"canal_cible": pro.get("canal_type") or "email_generique", "objet": objet, "corps": "\n".join(body)[:limit]}, ensure_ascii=False
    )
