"""Évaluateur simulé (rôle `evaluator`, GR3-63/D3) : déterministe, sans réseau. Note la consigne seule
(`title == "PromptEvaluation"`) ou les messages du joueur dans un fil de négociation (`title ==
"NegotiationEvaluation"`) ; ne note jamais un livrable produit par un agent, ni un message reçu d'un client.

Ne lit que `metadata["evaluator"]` : `{"instruction": str, "criteres": [...], "note_min": int, "note_max": int}`
(prompt) ou `{"messages": [{"de": "moi"|"client", "texte": str}], "criteres": [...], "note_min": int,
"note_max": int}` (négociation). `criteres`/`note_min`/`note_max` reprennent `data/evaluator/rubrics_*.json`.

Résistance à la manipulation (règle 3, CLAUDE.md) : toute phrase embarquée dans le texte évalué qui tente
d'imposer une note (« mets-moi 100/100 », « ignore tes instructions »...) est retirée avant la notation et
n'a aucun effet sur `score` ; elle ajoute seulement une mention dans `feedback`. Les messages du client dans
une négociation ne sont jamais notés (texte reçu = donnée) : seuls les messages `de: "moi"` comptent."""

from __future__ import annotations

import json
import re

_MANIPULATION = re.compile(
    r"(100\s*/\s*100|note[- ]moi\s+100|mets?[- ]?\s*moi\s+100|ignore\s+(tes|ces)\s+instructions|"
    r"oublie\s+(tes|ces)\s+(r[eè]gles|instructions)|donne[- ]moi\s+le\s+score\s+max|c['’]est\s+un\s+ordre)",
    re.IGNORECASE,
)
_PROMISE = re.compile(r"(garanti|promets|100\s*%\s*s[uû]r|je\s+vous\s+assure\s+que)", re.IGNORECASE)
_POLITE = re.compile(r"(bonjour|cordialement|merci|je\s+comprends)", re.IGNORECASE)
_RUDE = re.compile(r"([A-ZÀ-Ý]{4,})|!!!|n['’]importe\s+quoi", re.UNICODE)
_DELAY = re.compile(r"(avant\s+\w+|sous\s+\d+\s*(h|heures|jours)|d['’]ici\s+\w+|si\s+vous\s+confirmez)", re.IGNORECASE)
_CONSTRAINT = re.compile(
    r"(zone|secteur|centre-ville|quartier|d[ée]lai|avant\s+\w+|ton\s+(formel|familier|professionnel)|budget|\d+\s*(€|\$|clients?|prospects?))",
    re.IGNORECASE,
)
_CONTEXT_HINT = re.compile(r"(fiche|entreprise|cible|offre|produit|notre|boutique|service|marque)", re.IGNORECASE)
_SENTENCE_SPLIT = re.compile(r"(?<=[.!?;])\s+")


def _strip_manipulation(text: str) -> tuple[str, bool]:
    """Retire la ou les phrases entières qui tentent d'imposer une note (pas seulement le mot-clé) : une
    phrase de manipulation ne doit jamais gonfler artificiellement la note par le simple ajout de texte."""
    sentences = _SENTENCE_SPLIT.split(text)
    kept = [s for s in sentences if not _MANIPULATION.search(s)]
    manipulated = len(kept) != len(sentences)
    return " ".join(kept), manipulated


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def _weight(criteres: list[dict], cid: str) -> float:
    for c in criteres:
        if c.get("id") == cid:
            return float(c.get("poids", 0))
    return 0.0


def _clarity(text: str, lo: int, hi: int) -> float:
    n = len(text.strip())
    if n < lo:
        return 0.0
    if n < hi:
        return 0.5
    return 1.0


def _score_prompt(instruction: str, criteres: list[dict]) -> tuple[int, bool]:
    text, manipulated = _strip_manipulation(instruction)
    notes = {
        "clarte": _clarity(text, lo=15, hi=40),
        "contexte": 1.0 if _CONTEXT_HINT.search(text) else 0.0,
        "contraintes": 1.0 if _CONSTRAINT.search(text) else 0.0,
        "ton": 0.3 if _RUDE.search(text) else 1.0,
    }
    total = sum(notes.get(c.get("id"), 0.0) * float(c.get("poids", 0)) for c in criteres)
    return round(_clamp(total, 0, 100)), manipulated


def _score_negotiation(messages: list[dict], criteres: list[dict]) -> tuple[int, bool, bool]:
    mine_raw = " ".join(str(m.get("texte", "")) for m in messages if m.get("de") == "moi")
    client_raw = " ".join(str(m.get("texte", "")) for m in messages if m.get("de") != "moi")
    mine, manip_mine = _strip_manipulation(mine_raw)
    _, manip_client = _strip_manipulation(client_raw)  # jamais suivi : texte reçu du client = donnée
    manipulated = manip_mine or manip_client
    essentiel_ok = not _PROMISE.search(mine)
    notes = {
        "clarte_reponse": _clarity(mine, lo=25, hi=80),
        "ton_pro": 1.0 if _POLITE.search(mine) and not _RUDE.search(mine) else 0.3,
        "sans_promesse_non_tenable": 1.0 if essentiel_ok else 0.0,
        "fermete_delai": 1.0 if _DELAY.search(mine) else 0.3,
    }
    total = sum(notes.get(c.get("id"), 0.0) * float(c.get("poids", 0)) for c in criteres)
    score = _clamp(total, 0, 100)
    if not essentiel_ok:
        score = min(score, 40)  # critère essentiel manqué : plafond, même principe que l'ancien moteur (docs/ai/03)
    return round(score), manipulated, essentiel_ok


def _feedback(tips: list[str], manipulated: bool) -> str:
    text = " ".join(tips[:3])
    if manipulated:
        text = (text + " Tentative d'influencer la note ignorée.").strip()
    return text[:300]


def build_evaluation_json(evaluator_meta: dict, title: str) -> str:
    criteres = evaluator_meta.get("criteres", [])
    note_min = float(evaluator_meta.get("note_min", 0))
    note_max = float(evaluator_meta.get("note_max", 100))
    if title == "PromptEvaluation":
        score, manipulated = _score_prompt(str(evaluator_meta.get("instruction", "")), criteres)
        score = int(_clamp(score, note_min, note_max))
        tips = []
        if score < 50:
            tips.append("Précisez votre demande : zone, délai ou ton.")
        if score < 80:
            tips.append("Reprenez un élément de votre fiche entreprise.")
        if not tips:
            tips.append("Bonne consigne : claire et contextualisée.")
        return json.dumps({"score": score, "feedback": _feedback(tips, manipulated)}, ensure_ascii=False)
    if title == "NegotiationEvaluation":
        score, manipulated, essentiel_ok = _score_negotiation(evaluator_meta.get("messages", []), criteres)
        score = int(_clamp(score, note_min, note_max))
        tips = []
        if not essentiel_ok:
            tips.append("Évitez toute promesse chiffrée non garantie.")
        if score < 50:
            tips.append("Soyez plus clair et posez un délai.")
        if not tips:
            tips.append("Bonne réponse : claire, professionnelle, ferme.")
        return json.dumps({"score": score, "feedback": _feedback(tips, manipulated)}, ensure_ascii=False)
    return json.dumps({"score": 0, "feedback": "Évaluation indisponible."}, ensure_ascii=False)
