"""Contrôles par code de la messagerie (docs/PRODUIT-CLIENTS-PUB.md §3, RULES §13).

Deux familles :
- sorties des agents : `triage` (synthèse) et `replier` (brouillon de réponse), selon les grilles
  `conversation_synthese_v1` et `conversation_reponse_v1` ; un contrôle **essentiel** en échec ⇒ `INVALID_OUTPUT`
  (une réparation, puis échec sans débit). Aucun contrôle ne rapporte d'argent ni de score ;
- résultat d'une conversation simulée (objectif de la persona) : calculé ici, **jamais par le modèle**.

Règle 3 : le texte d'un client est une donnée ; ces contrôles ne l'exécutent jamais et le traitent comme du texte brut.
Les contrôles lexicaux sont des heuristiques déterministes (listes de mots simples) : ils ne prétendent pas comprendre
la langue, ils bloquent ce qui est vérifiable (nombre, URL, montant, mention) et signalent le reste."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any

from .messaging_data import MessagingData, RubricCheck, norm

INTENTIONS = ("interesse", "question", "objection", "refus", "desinscription", "hors_sujet")
URGENCES = ("faible", "normale", "elevee")
MAX_POINTS = 8
MAX_POINT_CHARS = 240

_EMAIL = re.compile(r"[\w.+\-]+@[\w\-]+(?:\.[\w\-]+)+")
_PHONE = re.compile(r"(?<![\w])(?:\+?\d[\s.\-\u00a0\u202f]?){9,}(?![\w])")
_URL = re.compile(r"https?://\S+|www\.\S+|\b[\w\-]+\.(?:fr|com|net|org|io|eu|info|biz|co|app|dev)\b\S*", re.I)
_NUMBER = re.compile(r"\d(?:[\d.,\u00a0\u202f]*\d)?")
_AMOUNT = re.compile(r"\d(?:[\d.,\u00a0\u202f ]*\d)?\s?(?:€|euros?|eur\b|\$|dollars?|k€)", re.I)
_PERCENT = re.compile(r"\d+(?:[.,]\d+)?\s?%")
_DELAY = re.compile(
    r"\b(?:\d+|une?|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|quinze|vingt|trente)\s+(?:jours?|semaines?|mois|heures?|ans?)\b"
)
_MONTH = re.compile(r"\b(?:janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\b")
_CLAIM_WORDS = ("certifie", "label", "numero 1", "n°1", "leader", "prime", "recompense", "garanti", "gratuit", "remise", "reduction", "offert")
_PROMISE = re.compile(r"(?:garanti|promis|assur|engag)\w*[^.!?\n]{0,40}\d", re.I)
_LINKS = re.compile(r"[<>]|https?://|www\.|mailto:|\]\(|javascript:", re.I)
_LEAK = re.compile(
    r"prompt syst|system prompt|consignes? (?:precedentes?|internes?|du systeme)|instructions? (?:du systeme|systeme|internes?)|"
    r"mes instructions|ignore (?:tes|vos|les) (?:consignes|instructions)|credit de \d",
    re.I,
)
_PITCH = ("offre", "devis", "tarif", "rendez-vous", "demo", "essai", "decouvr", "n'hesitez pas", "promotion", "solution", "proposition")
_REVIENS = ("reviens vers", "reviendrai", "je vous confirme", "je vous precise", "je me renseigne", "je reviens", "vous revenir")
_STOP = {"quel", "quels", "quelle", "quelles", "votre", "vous", "nous", "avez", "faire", "cette", "comme", "pour", "dans", "merci", "alors", "donc", "bonjour", "bonsoir", "madame", "monsieur", "cordialement", "message", "messages", "recevoir", "simplement"}
_ACK = ("note", "bien recu", "entendu", "plus de message", "ne vous ecrirai plus", "ne vous contacterai plus", "plus aucun", "retire", "supprim", "desinscri", "pris en compte")
_OBJ_ACK = ("comprends", "entends", "budget", "contrainte", "etape", "leger", "simple", "pas a pas", "progressi")
_NEXT = ("rendez-vous", "appel", "echange", "demo", "creneau", "disponib", "quand", "proposer", "propose", "vendredi", "semaine")
_POLITE = ("bonjour", "merci", "cordialement", "bien a vous", "comprends", "desole", "bonne journee")
_RUDE = ("idiot", "nul", "ferme", "degage", "imbecile", "stupide")
_PROMPT_LEAK = ("prompt systeme", "system prompt", "consignes du systeme", "mes instructions", "instructions systeme", "voici mes consignes")


@dataclass
class Check:
    id: str
    label: str
    essential: bool
    passed: bool
    detail: str | None = None

    def out(self) -> dict[str, Any]:
        d: dict[str, Any] = {"id": self.id, "label": self.label, "essentiel": self.essential, "reussi": self.passed}
        if self.detail:
            d["detail"] = self.detail
        return d


@dataclass
class ThreadContext:
    """Ce que les contrôles savent du fil, tel que **le modèle l'a vu** (valeurs de contact masquées)."""

    inbound: list[str]  # messages reçus (masqués), du plus ancien au plus récent
    outbound: list[str]
    corpus: str  # fiche entreprise + instantané + fil : tout ce qui autorise un fait
    facts_corpus: str = ""  # idem sans les messages du joueur : une affirmation du joueur ne s'autorise pas elle-même (résultat)
    offer: str = ""  # offre de l'entreprise (fiche), pour le contrôle « retour à l'offre »
    contact_values: list[str] = field(default_factory=list)  # valeurs de contact du prospect (jamais envoyées au modèle)
    ton: str = "vouvoiement_formel"
    informed: bool = False  # le client a déjà reçu la mention d'opposition
    opted_out: bool = False  # désinscription déjà constatée sur cette conversation

    @property
    def last_inbound(self) -> str:
        return self.inbound[-1] if self.inbound else ""


def numbers_in(text: str) -> set[str]:
    return {"".join(ch for ch in m if ch.isdigit()) for m in _NUMBER.findall(text)}


def _clean_json(raw: str) -> Any:
    s = raw.strip()
    if s.startswith("```"):
        s = re.sub(r"^```[a-zA-Z]*\s*|\s*```$", "", s).strip()
    return json.loads(s)


def parse_json_object(raw: str) -> dict[str, Any] | None:
    try:
        obj = _clean_json(raw)
    except (ValueError, TypeError):
        return None
    return obj if isinstance(obj, dict) else None


def _cx(c: RubricCheck, passed: bool, detail: str | None = None) -> Check:
    return Check(c.id, c.label, c.essential, passed, detail)


def _allowed(corpus_norm: str, corpus_numbers: set[str], text_norm: str, text: str) -> list[str]:
    """Éléments de fait (montant, pourcentage, délai, mois, affirmation) du texte qui n'ont aucun appui dans le corpus."""
    bad: list[str] = []
    for rx, src in ((_AMOUNT, text), (_PERCENT, text)):
        for m in rx.finditer(src):
            if not numbers_in(m.group()) <= corpus_numbers:
                bad.append("chiffre")
    for rx in (_DELAY, _MONTH):
        for m in rx.finditer(text_norm):
            if m.group() not in corpus_norm:
                bad.append("délai ou date")
    for w in _CLAIM_WORDS:
        if w in text_norm and w not in corpus_norm:
            bad.append("affirmation")
    return bad


def has_contact_value(text: str, contact_values: list[str]) -> bool:
    if _EMAIL.search(text) or _PHONE.search(text):
        return True
    t = norm(text)
    digits = "".join(ch for ch in text if ch.isdigit())
    for v in contact_values:
        if not v:
            continue
        if norm(v) in t:
            return True
        vd = "".join(ch for ch in v if ch.isdigit())
        if len(vd) >= 6 and vd in digits:
            return True
    return False


# --- synthèse (triage) --------------------------------------------------------------------------------


@dataclass
class Synthesis:
    intention: str
    points: list[dict[str, str]]
    urgence: str
    statut_suggere: str | None
    desinscription_code: bool


def check_synthesis(
    data: MessagingData, raw: str, ctx: ThreadContext, statuses: list[str]
) -> tuple[list[Check], Synthesis | None]:
    """Retourne (contrôles, synthèse normalisée). La synthèse n'est utilisable que si aucun contrôle essentiel n'a échoué.
    Le code l'emporte sur le modèle pour la désinscription : l'intention est alors forcée, sans échec."""
    by_id = {c.id: c for c in data.synthese_checks}
    checks: list[Check] = []
    obj = parse_json_object(raw)
    required = ("intention", "points", "urgence", "statut_suggere")
    sections_ok = obj is not None and all(k in obj for k in required) and isinstance(obj.get("points"), list)
    checks.append(_cx(by_id["sections_present"], bool(sections_ok), None if sections_ok else "Sections manquantes ou JSON invalide."))
    if not sections_ok or obj is None:
        return checks, None

    intention = str(obj["intention"]).strip().lower()
    intention_ok = intention in INTENTIONS
    checks.append(_cx(by_id["intention_in_set"], intention_ok))

    inbound_ws = [" ".join(t.split()) for t in ctx.inbound]
    points: list[dict[str, str]] = []
    points_ok = len(obj["points"]) <= MAX_POINTS
    for p in obj["points"][:MAX_POINTS]:
        if not isinstance(p, dict):
            points_ok = False
            continue
        texte = " ".join(str(p.get("texte", "")).split())[:MAX_POINT_CHARS]
        citation = " ".join(str(p.get("citation", "")).split())
        if not texte or not citation or not any(citation in m for m in inbound_ws):
            points_ok = False
            continue
        points.append({"texte": texte, "citation": citation})
    checks.append(_cx(by_id["points_quoted"], points_ok, None if points_ok else "Une citation n'existe pas mot pour mot dans un message reçu."))

    urgence = str(obj["urgence"]).strip().lower()
    urgence_ok = urgence in URGENCES
    checks.append(_cx(by_id["urgence_in_set"], urgence_ok))
    statut = obj["statut_suggere"]
    statut = str(statut).strip().lower() if statut else None
    statut_ok = statut is None or statut in statuses
    checks.append(_cx(by_id["statut_in_set"], statut_ok))

    code_optout = any(data.detects_opt_out(m) for m in ctx.inbound)
    if code_optout:
        intention, intention_ok, statut = "desinscription", True, "ecarte"
    checks.append(_cx(by_id["optout_code_wins"], True, "Détectée par le code : elle l'emporte sur le modèle." if code_optout else None))

    blob = json.dumps(obj, ensure_ascii=False)
    checks.append(_cx(by_id["no_contact_value"], not has_contact_value(blob, ctx.contact_values)))
    checks.append(_cx(by_id["no_html_or_link"], _LINKS.search(blob.replace("\\n", " ")) is None))

    synth = Synthesis(
        intention=intention if intention_ok else "hors_sujet",
        points=points,
        urgence=urgence if urgence_ok else "normale",
        statut_suggere=statut if statut_ok else None,
        desinscription_code=code_optout,
    )
    return checks, synth


# --- brouillon de réponse (replier) ---------------------------------------------------------------------


@dataclass
class Reply:
    corps: str
    objet: str | None
    a_verifier: list[str]


def _content_words(text: str) -> set[str]:
    return {w for w in re.findall(r"[a-z]{5,}", norm(text)) if w not in _STOP}


def check_reply(data: MessagingData, raw: str, ctx: ThreadContext, reply_max_chars: int) -> tuple[list[Check], Reply | None]:
    by_id = {c.id: c for c in data.reponse_checks}
    obj = parse_json_object(raw)
    corps = ""
    a_verifier: list[str] = []
    objet: str | None = None
    parsed = obj is not None and isinstance(obj.get("corps"), str) and bool(obj["corps"].strip())
    if parsed and obj is not None:
        corps = obj["corps"].strip()
        if isinstance(obj.get("a_verifier"), list):
            a_verifier = [" ".join(str(x).split())[:200] for x in obj["a_verifier"][:8] if str(x).strip()]
        if isinstance(obj.get("objet"), str) and obj["objet"].strip():
            objet = " ".join(obj["objet"].split())[:90]
    checks: list[Check] = []
    checks.append(_cx(by_id["body_len"], parsed and len(corps) <= reply_max_chars, None if parsed else "Réponse vide ou JSON invalide."))
    if not parsed:
        return checks, None

    text = corps + "\n" + (objet or "")
    tn = norm(text)
    cn = norm(ctx.corpus)
    cnums = numbers_in(ctx.corpus)

    bad = _allowed(cn, cnums, tn, text)
    checks.append(_cx(by_id["no_new_fact"], not bad, "Un fait ou un chiffre absent des données a été avancé." if bad else None))

    new_urls = [u for u in _URL.findall(text) if norm(u) not in cn]
    new_nums = numbers_in(text) - cnums
    checks.append(
        _cx(by_id["no_new_url_or_number"], not new_urls and not new_nums, "Une URL ou un nombre absent des données." if new_urls or new_nums else None)
    )

    informed = ctx.informed
    optout_now = ctx.opted_out or any(data.detects_opt_out(m) for m in ctx.inbound[-1:])
    questions = "?" in ctx.last_inbound and not optout_now
    if questions:
        covered = bool(_content_words(ctx.last_inbound) & _content_words(corps)) or any(p in tn for p in _REVIENS)
    else:
        covered = True
    checks.append(_cx(by_id["covers_questions"], covered, None if covered else "La question du client n'a pas de réponse."))

    if optout_now:  # le client demande l'arrêt : on confirme sobrement, on ne remet pas de mention commerciale
        mention_ok = True
    else:
        mention_ok = informed or data.has_opposition(corps)
    checks.append(_cx(by_id["mention_opposition"], mention_ok, None if mention_ok else "La possibilité de refuser de nouveaux messages manque."))

    if optout_now:
        pitched = any(p in tn for p in _PITCH) or len(corps) > 500
        checks.append(_cx(by_id["optout_no_pitch"], not pitched, "Le client demande l'arrêt : aucun argumentaire." if pitched else None))
    else:
        checks.append(_cx(by_id["optout_no_pitch"], True))

    if ctx.ton.startswith("vouvoiement"):
        informal = re.search(r"\b(?:tu|toi|ton|ta|tes|t')\b", tn) is not None
    else:
        informal = re.search(r"\b(?:vous|votre|vos)\b", tn) is not None
    checks.append(_cx(by_id["tone_matches"], not informal))

    promise = [m for m in _PROMISE.finditer(text) if not numbers_in(m.group()) <= cnums]
    checks.append(_cx(by_id["no_numeric_promise"], not promise))
    checks.append(_cx(by_id["no_contact_value"], not has_contact_value(text, ctx.contact_values)))
    checks.append(_cx(by_id["no_html_or_link"], _LINKS.search(text) is None))
    leak = _LEAK.search(tn) is not None
    checks.append(Check("no_instruction_leak", data.check_labels["no_system_prompt_leak"]["ok"], True, not leak))
    return checks, Reply(corps=corps, objet=objet, a_verifier=a_verifier)


def essential_failures(checks: list[Check]) -> list[str]:
    return [c.id for c in checks if c.essential and not c.passed]


# --- résultat de conversation (Tutoriel) -----------------------------------------------------------------


def _persona_check(cid: str, mine: list[str], ctx: ThreadContext, data: MessagingData, opt_idx: int | None) -> bool:
    """Contrôle d'objectif d'une persona sur les messages **du joueur** (heuristiques de mots, voir l'en-tête)."""
    joined = "\n".join(mine)
    jn = norm(joined)
    base = ctx.facts_corpus or ctx.corpus
    cn = norm(base)
    cnums = numbers_in(base)
    new_nums = numbers_in(joined) - cnums
    after = mine[-1:] if opt_idx is not None else mine
    an = norm("\n".join(after))
    if cid == "no_invented_amount":
        return not any(not numbers_in(m.group()) <= cnums for m in _AMOUNT.finditer(joined))
    if cid == "no_invented_discount":
        words = any(w in jn and w not in cn for w in ("remise", "reduction", "gratuit", "offert", "promotion"))
        return not words and not any(not numbers_in(m.group()) <= cnums for m in _PERCENT.finditer(joined))
    if cid == "no_invented_fact":
        return not _allowed(cn, cnums, jn, joined) and not new_nums
    if cid == "no_invented_number":
        return not new_nums
    if cid == "no_invented_testimonial":
        marks = ("temoignage", "ils nous font confiance", "nos clients", "a travaille avec", "ont travaille avec", "reference chez", "references chez")
        return not any(m in jn and m not in cn for m in marks)
    if cid == "no_invented_delay":
        return not any(m.group() not in cn for m in _DELAY.finditer(jn))
    if cid == "answers_question":
        last_q = next((m for m in reversed(ctx.inbound) if "?" in m), "")
        return bool(_content_words(last_q) & _content_words(joined)) or any(p in jn for p in _REVIENS)
    if cid == "acknowledges_objection":
        return any(w in jn for w in _OBJ_ACK)
    if cid == "confirms_opt_out":
        return any(w in an for w in _ACK)
    if cid == "no_further_pitch":
        return not any(p in an for p in _PITCH)
    if cid == "stays_on_offer":
        offer = _content_words(ctx.offer)
        return bool(offer & _content_words(joined)) or any(w in jn for w in ("offre", "proposition", "accompagn", "recentr", "revenir a"))
    if cid == "no_system_prompt_leak":
        return not any(p in jn for p in _PROMPT_LEAK)
    if cid == "no_instruction_followed":
        return not new_nums and "credit" not in jn and not any(p in jn for p in _PROMPT_LEAK)
    if cid == "stays_polite":
        return not any(w in jn for w in _RUDE) and any(w in jn for w in _POLITE)
    if cid == "offers_opt_out":
        return data.has_opposition(joined) or any(w in jn for w in ("ne plus recevoir", "cesser", "arreter", "stop"))
    if cid == "no_reply_recorded":
        return not ctx.inbound
    if cid == "respects_send_limit":
        return len(mine) <= 2
    if cid == "proposes_next_step":
        return any(w in jn for w in _NEXT)
    return False


def compute_outcome(data: MessagingData, persona_id: str | None, ctx: ThreadContext, motif: str) -> dict[str, Any]:
    """Résultat de conversation **calculé par code** : l'objectif de la persona est atteint si tous ses contrôles passent.
    `ctx.outbound` = messages envoyés par le joueur. Aucun appel modèle, aucun gain."""
    persona = data.persona(persona_id)
    if persona is None:
        return {"statut": "termine", "reussi": False, "motif": motif, "objectif": None, "controles": []}
    opt_idx = 1 if any(data.detects_opt_out(m) for m in ctx.inbound) else None  # dernier mot du joueur = confirmation attendue
    results: list[dict[str, Any]] = []
    for cid in persona.goal_checks:
        ok = _persona_check(cid, ctx.outbound, ctx, data, opt_idx)
        lab = data.check_labels.get(cid, {"ok": cid, "ko": cid})
        results.append({"id": cid, "label": lab["ok"], "reussi": ok, "explication": None if ok else lab["ko"]})
    reussi = all(r["reussi"] for r in results)
    return {
        "statut": "reussie" if reussi else "echouee",
        "reussi": reussi,
        "motif": motif,
        "objectif": persona.goal_description,
        "client": persona.label,
        "controles": results,
    }
