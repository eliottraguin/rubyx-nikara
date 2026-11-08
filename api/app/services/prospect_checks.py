"""Contrôles par code de la fiche client et du premier message d'un prospect (grilles `prospect_fiche_v1` et
`prospect_message_v1`, docs/PRODUIT-PROSPECTION.md §13). Un contrôle essentiel en échec ⇒ `INVALID_OUTPUT` (une réparation,
puis échec sans débit). Aucun contrôle ne rapporte d'argent ni de score.

Comme pour la messagerie, les contrôles lexicaux sont des heuristiques déterministes : ils bloquent ce qui est vérifiable
(nombre, URL, montant, nom propre absent des données, mention, coordonnée) et ne prétendent pas comprendre la langue.
Le texte contrôlé est celui que **le modèle a vu** (valeurs de contact masquées)."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any

from . import messaging_checks as chk
from .messaging_checks import Check
from .messaging_data import MessagingData, RubricCheck, norm

CHANNEL_TYPES = ("email_generique", "formulaire", "adresse", "telephone_standard", "reseau_pro")
PROSPECT_FIELDS = ("entreprise", "fonction", "canal_type", "source", "source_ref", "collecte_le", "signal", "raisons_fit")
SUBJECT_MAX = 90
RESUME_MAX = 600
MAX_ITEM_CHARS = 300

_SENTENCES = re.compile(r"(?<=[.!?])\s+|\n+")
_WORD = re.compile(r"[A-Za-zÀ-ÿ\-]+")
_CIVIL = {"madame", "monsieur", "bonjour", "bonsoir", "cordialement", "merci", "salut", "cher", "chere", "mesdames", "messieurs"}
_MD_LINK = re.compile(r"\[[^\]]*\]\([^)]*\)")


@dataclass
class DraftContext:
    """Ce que les contrôles savent des données, tel que **le modèle les a vues** (valeurs de contact masquées)."""

    snapshot_text: str  # enregistrement du prospect (champs du carnet + instantané)
    profile_text: str  # fiche entreprise et cible
    snapshot_fields: set[str]  # champs citables dans `champ`
    profile_fields: set[str]  # critères citables dans `critere`
    source_refs: set[str]
    contact_values: list[str] = field(default_factory=list)
    ton: str = "vouvoiement_formel"
    draft_max_chars: int = 800
    missing_or_stale: bool = False

    @property
    def corpus(self) -> str:
        return self.snapshot_text + "\n" + self.profile_text


def _cx(checks: dict[str, RubricCheck], cid: str, passed: bool, detail: str | None = None) -> Check:
    c = checks[cid]
    return Check(c.id, c.label, c.essential, passed, detail)


def new_names(text: str, corpus_norm: str) -> list[str]:
    """Noms propres (mot capitalisé hors début de phrase) absents des données : un nom ou un lieu inventé."""
    bad: list[str] = []
    for sentence in _SENTENCES.split(text):
        words = _WORD.findall(sentence)
        for w in words[1:]:
            n = norm(w)
            if len(w) >= 3 and w[0].isupper() and n not in _CIVIL and n not in corpus_norm:
                bad.append(w)
    return bad


def _facts(ctx: DraftContext, text: str) -> list[str]:
    cn = norm(ctx.corpus)
    bad = chk._allowed(cn, chk.numbers_in(ctx.corpus), norm(text), text)
    if chk.numbers_in(text) - chk.numbers_in(ctx.corpus):
        bad.append("nombre")
    if new_names(text, cn):
        bad.append("nom")
    return bad


def _no_link(text: str) -> bool:
    return chk._LINKS.search(text.replace("\\n", " ")) is None and _MD_LINK.search(text) is None


def _count(items: Any, lo: int, hi: int) -> bool:
    return isinstance(items, list) and lo <= len(items) <= hi


# --- fiche client ---------------------------------------------------------------------------------------------


def check_fiche(data: MessagingData, raw: str, ctx: DraftContext) -> tuple[list[Check], dict[str, Any] | None]:
    by_id = {c.id: c for c in data.fiche_checks}
    obj = chk.parse_json_object(raw)
    keys = ("resume", "pourquoi_ce_prospect", "points_d_accroche", "a_verifier", "sources")
    ok = (
        obj is not None
        and all(k in obj for k in keys)
        and isinstance(obj["resume"], str)
        and all(isinstance(obj[k], list) for k in keys[1:])
    )
    checks = [_cx(by_id, "sections_present", bool(ok), None if ok else "Sections manquantes ou JSON invalide.")]
    if not ok or obj is None:
        return checks, None

    pourquoi: list[dict[str, str]] = []
    for p in obj["pourquoi_ce_prospect"]:
        if isinstance(p, dict):
            pourquoi.append({k: " ".join(str(p.get(k, "")).split()) for k in ("texte", "critere", "champ")})
        elif isinstance(p, str):
            pourquoi.append({"texte": " ".join(p.split()), "critere": "", "champ": ""})
    accroches = [" ".join(str(x).split()) for x in obj["points_d_accroche"] if isinstance(x, str) and x.strip()]
    a_verifier = [" ".join(str(x).split()) for x in obj["a_verifier"] if isinstance(x, str) and x.strip()]
    sources = [str(x).strip() for x in obj["sources"] if isinstance(x, (str, int)) and str(x).strip()]
    content = {
        "resume": obj["resume"].strip(), "pourquoi_ce_prospect": pourquoi, "points_d_accroche": accroches,
        "a_verifier": a_verifier, "sources": sources,
    }
    stored = {**content, "points_d_accroche": accroches[:5], "a_verifier": a_verifier[:8]}  # contrôles non essentiels : signalés, listes tronquées
    shape_ok = len(pourquoi) == len(obj["pourquoi_ce_prospect"]) and all(p["texte"] for p in pourquoi)
    items_ok = all(len(s) <= MAX_ITEM_CHARS for s in [*accroches, *a_verifier, *(p["texte"] for p in pourquoi)])

    checks.append(_cx(by_id, "resume_len", 0 < len(content["resume"]) <= RESUME_MAX))
    checks.append(_cx(by_id, "pourquoi_count", _count(pourquoi, 1, 5) and shape_ok and items_ok))
    linked = bool(pourquoi) and all(p["critere"] in ctx.profile_fields and p["champ"] in ctx.snapshot_fields for p in pourquoi)
    checks.append(_cx(by_id, "pourquoi_linked", linked, None if linked else "Une raison ne cite pas un critère de la fiche et un champ du prospect."))
    checks.append(_cx(by_id, "accroches_count", _count(accroches, 1, 5)))
    checks.append(_cx(by_id, "a_verifier_count", _count(a_verifier, 0, 8)))
    sources_ok = all(s in ctx.source_refs for s in sources)
    checks.append(_cx(by_id, "sources_in_snapshot", sources_ok, None if sources_ok else "Une source citée n'existe pas dans l'instantané."))

    text = "\n".join([content["resume"], *(p["texte"] for p in pourquoi), *accroches, *a_verifier])
    bad = _facts(ctx, text)
    checks.append(_cx(by_id, "no_new_fact", not bad, "Un fait absent des données a été avancé." if bad else None))
    cn = norm(ctx.snapshot_text)
    new_urls = [u for u in chk._URL.findall(text) if norm(u) not in cn]
    checks.append(_cx(by_id, "no_new_url", not new_urls, "Une URL absente de l'instantané." if new_urls else None))
    checks.append(_cx(by_id, "a_verifier_if_missing", bool(a_verifier) or not ctx.missing_or_stale))
    blob = json.dumps(content, ensure_ascii=False)
    checks.append(_cx(by_id, "no_contact_value", not chk.has_contact_value(blob, ctx.contact_values)))
    checks.append(_cx(by_id, "no_html_or_link", _no_link(text)))
    return checks, stored


# --- premier message ------------------------------------------------------------------------------------------


def message_checks(data: MessagingData, content: dict[str, Any], ctx: DraftContext) -> list[Check]:
    """Contrôles d'un brouillon déjà normalisé (`canal_cible`, `objet`, `corps`)."""
    by_id = {c.id: c for c in data.message_checks}
    corps, objet = content["corps"], content["objet"]
    text = corps + "\n" + objet
    checks = [_cx(by_id, "body_len", 0 < len(corps) <= ctx.draft_max_chars)]
    checks.append(_cx(by_id, "subject_len", len(objet) <= SUBJECT_MAX))
    checks.append(_cx(by_id, "channel_type_only", content.get("canal_cible") in CHANNEL_TYPES))
    bad = _facts(ctx, text)
    checks.append(_cx(by_id, "no_new_fact", not bad, "Un fait absent des données a été avancé." if bad else None))
    cn = norm(ctx.corpus)
    new_urls = [u for u in chk._URL.findall(text) if norm(u) not in cn]
    new_nums = chk.numbers_in(text) - chk.numbers_in(ctx.corpus)
    checks.append(_cx(by_id, "no_new_url_or_number", not new_urls and not new_nums, "Une URL ou un nombre absent des données." if new_urls or new_nums else None))
    checks.append(_cx(by_id, "mention_origin", data.has_origin(corps), None if data.has_origin(corps) else "L'origine des coordonnées n'est pas mentionnée."))
    checks.append(_cx(by_id, "mention_opposition", data.has_opposition(corps), None if data.has_opposition(corps) else "La possibilité de refuser de nouveaux messages manque."))
    tn = norm(text)
    if ctx.ton.startswith("vouvoiement"):
        informal = re.search(r"\b(?:tu|toi|ton|ta|tes|t')\b", tn) is not None
    else:
        informal = re.search(r"\b(?:vous|votre|vos)\b", tn) is not None
    checks.append(_cx(by_id, "tone_matches", not informal))
    cnums = chk.numbers_in(ctx.corpus)
    promise = [m for m in chk._PROMISE.finditer(text) if not chk.numbers_in(m.group()) <= cnums]
    checks.append(_cx(by_id, "no_numeric_promise", not promise))
    checks.append(_cx(by_id, "no_contact_value", not chk.has_contact_value(text, ctx.contact_values)))
    checks.append(_cx(by_id, "no_html_or_link", _no_link(text)))
    return checks


def check_message(data: MessagingData, raw: str, ctx: DraftContext, default_channel: str | None) -> tuple[list[Check], dict[str, Any] | None]:
    by_id = {c.id: c for c in data.message_checks}
    obj = chk.parse_json_object(raw)
    parsed = obj is not None and isinstance(obj.get("corps"), str) and bool(obj["corps"].strip())
    if not parsed or obj is None:
        return [_cx(by_id, "body_len", False, "Réponse vide ou JSON invalide.")], None
    canal = obj.get("canal_cible") if isinstance(obj.get("canal_cible"), str) else default_channel  # absent : le type du prospect
    content = {
        "canal_cible": (canal or "").strip(),
        "objet": " ".join(str(obj.get("objet") or "").split()),
        "corps": obj["corps"].strip(),
    }
    checks = message_checks(data, content, ctx)
    stored = {**content, "objet": content["objet"][:SUBJECT_MAX], "mentions": detect_mentions(data, content["corps"])}  # objet trop long : contrôle signalé, texte tronqué
    return checks, stored


def detect_mentions(data: MessagingData, corps: str) -> list[str]:
    return [m for m, found in (("origine", data.has_origin(corps)), ("opposition", data.has_opposition(corps))) if found]
