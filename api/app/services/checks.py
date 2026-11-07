"""Contrôles déterministes d'une grille (BE06) : exécutés en code, jamais par le modèle.

Sémantique de référence : `tools/validate_content.py` (`run_check`, `run_rubric_checks`, `compute_score`) et
`docs/ai/03-evaluateur.md`. Ce module la reproduit à l'identique ; toute divergence doit être écrite dans ce
document. Fonctions pures : aucune base, aucun réseau, aucune valeur de jeu en dur (poids, seuils, plafond viennent
de la grille figée et de `data/rules/`).

Le texte contrôlé est une DONNÉE non fiable ; les motifs viennent de la grille (donnée de confiance)."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

SP = r"[\s\u00a0\u202f]*"
NUM = r"\d{1,3}(?:[ \u00a0\u202f]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?"
AMOUNT_RE = re.compile(rf"({NUM}){SP}(?:€|euros?\b|EUR\b)", re.I)
PERCENT_RE = re.compile(rf"({NUM}){SP}%")

# Identifiants de pièces du corpus cités dans un texte (ex. m4_doc_offre_v2, m2_cat) : préfixe de mission + suffixe.
SOURCE_REF_RE = re.compile(r"(?<![A-Za-z0-9_])(?:m[1-6]|rescue)_[a-z0-9]+(?:_[a-z0-9]+)*(?![A-Za-z0-9_])", re.I)

EVIDENCE_WS = re.compile(r"[\s\u00a0\u202f]+")


def parse_num(s: str) -> float:
    return float(re.sub(r"[\s\u00a0\u202f]", "", s).replace(",", "."))


def word_count(text: str) -> int:
    """Mot = jeton séparé par des espaces contenant au moins un caractère alphanumérique."""
    return sum(1 for tok in text.split() if re.search(r"\w", tok))


def norm_ws(s: str) -> str:
    return EVIDENCE_WS.sub(" ", s).strip().lower()


def _rx(p: str) -> re.Pattern[str]:
    return re.compile(p, re.I | re.U)


def scoped(text: str, scope: dict | None) -> str:
    if not scope:
        return text
    m = re.search(scope["start"], text)
    if not m:
        return ""
    rest = text[m.end():]
    e = re.search(scope["end"], rest) if scope.get("end") else None
    return rest[: e.start()] if e else rest


def run_check(chk: dict[str, Any], text: str, trace: dict[str, Any], results: dict[str, float]) -> float:
    """Fraction dans [0, 1]. Lève une exception si le contrôle est mal formé (traitée par l'appelant : 0)."""
    p = chk.get("params") or {}
    k = chk["kind"]
    seg = scoped(text, p.get("scope"))
    if k == "regex_all":
        return 1.0 if all(_rx(x).search(seg) for x in p["patterns"]) else 0.0
    if k == "regex_any":
        return 1.0 if any(_rx(x).search(seg) for x in p["patterns"]) else 0.0
    if k == "regex_none":
        return 1.0 if not any(_rx(x).search(seg) for x in p["patterns"]) else 0.0
    if k in ("max_words", "min_words"):
        body = seg
        if p.get("exclude_pattern"):
            body = re.sub(p["exclude_pattern"], "", body)
        n = word_count(body)
        return 1.0 if (n <= p["max"] if k == "max_words" else n >= p["min"]) else 0.0
    if k in ("amounts_allowed", "percents_allowed"):
        rx = AMOUNT_RE if k == "amounts_allowed" else PERCENT_RE
        found = [parse_num(m.group(1)) for m in rx.finditer(seg)]
        ok = all(any(abs(f - a) < 0.005 for a in p["allowed"]) for f in found)
        return 1.0 if ok else 0.0
    if k == "number_tolerance":
        targets = p["targets"]
        hits = 0
        for t in targets:
            good = False
            for line in seg.splitlines():
                if not _rx(t["line_pattern"]).search(line):
                    continue
                for m in re.finditer(rf"({NUM}){SP}(?:{t['unit_regex']})", line, re.I):
                    if abs(parse_num(m.group(1)) - t["expected"]) <= t["tolerance"] + 1e-9:
                        good = True
            hits += good
        return hits / len(targets)
    if k == "capture_in_set":
        m = re.search(p["pattern"], text)
        return 1.0 if m and m.group(1) in p["allowed"] else 0.0
    if k == "capture_keyed_regex":
        m = re.search(p["capture_pattern"], text)
        if not m or m.group(1) not in p["keyed_patterns"]:
            return 0.0
        return 1.0 if any(_rx(x).search(text) for x in p["keyed_patterns"][m.group(1)]) else 0.0
    if k == "trace_flag":
        val = trace.get(p["name"])
        if val is None:
            return 0.0
        val = float(val)
        ops = {">=": val >= p["value"], "==": val == p["value"], "<=": val <= p["value"]}
        return 1.0 if ops[p["op"]] else 0.0
    if k == "any_of":
        return max(results[c] for c in p["check_ids"])
    raise ValueError(f"type de contrôle inconnu : {k}")


@dataclass
class CheckReport:
    results: dict[str, float] = field(default_factory=dict)  # fraction par contrôle
    errors: dict[str, str] = field(default_factory=dict)  # contrôle mal formé => 0, jamais de crédit
    deterministic: dict[str, float | None] = field(default_factory=dict)  # note déterministe par critère (None = aucun contrôle)


def run_rubric_checks(rubric: dict[str, Any], text: str, trace: dict[str, Any]) -> CheckReport:
    report = CheckReport()
    pending = list(rubric.get("deterministic_checks") or [])
    guard = 0
    while pending and guard < 50:
        guard += 1
        rest = []
        for c in pending:
            if c.get("kind") == "any_of" and not all(i in report.results for i in (c.get("params") or {}).get("check_ids", [])):
                rest.append(c)
                continue
            try:
                report.results[c["id"]] = run_check(c, text, trace, report.results)
            except Exception as exc:  # noqa: BLE001 - motif invalide, paramètre manquant : aucun crédit, signalé
                report.results[c["id"]] = 0.0
                report.errors[c["id"]] = type(exc).__name__
        pending = rest
    for c in pending:  # any_of cyclique ou vers un contrôle inconnu
        report.results[c["id"]] = 0.0
        report.errors[c["id"]] = "unresolved"
    for cr in rubric.get("criteria") or []:
        ids = cr.get("check_ids") or []
        if not ids:
            report.deterministic[cr["id"]] = None
        else:
            report.deterministic[cr["id"]] = sum(report.results.get(i, 0.0) for i in ids) / len(ids)
            for i in ids:
                if i not in report.results:
                    report.errors[i] = "unknown_check"
    return report


# --------------------------------------------------------------------------- sources citées

def cited_source_ids(text: str, declared: list[Any] | None = None) -> set[str]:
    """Identifiants de pièces cités dans le texte ou déclarés comme sources de la version (minuscules)."""
    found = {m.group(0).lower() for m in SOURCE_REF_RE.finditer(text)}
    for s in declared or []:
        if isinstance(s, str) and s.strip():
            found.add(s.strip().lower())
        elif isinstance(s, dict) and isinstance(s.get("id"), str):
            found.add(s["id"].strip().lower())
    return found


def unknown_sources(cited: set[str], known: set[str]) -> list[str]:
    """Références introuvables dans le corpus visible de la tentative (et ses versions de livrable)."""
    known_l = {k.lower() for k in known}
    return sorted(c for c in cited if c not in known_l)


# --------------------------------------------------------------------------- score

@dataclass
class CriterionOutcome:
    id: str
    label: str
    weight: float
    essential: bool
    kind: str
    model_rating: float | None
    deterministic_rating: float | None
    rating: float  # note finale retenue par le serveur
    min_rating: float | None  # seuil d'« essentiel rempli » (None si non essentiel)
    met: bool | None
    evidence: str = ""
    comment: str = ""
    check_ids: list[str] = field(default_factory=list)
    override: str | None = None  # explication si le serveur a écarté la note du modèle


@dataclass
class ScoreResult:
    score: int
    raw_score: int  # avant plafond
    capped: bool
    out_of_scope: bool
    essential_failed: list[str]
    criteria: list[CriterionOutcome]


def to_score(total: float) -> int:
    """Arrondi demi-supérieur (docs/ai/03-evaluateur.md)."""
    return int(Decimal(str(round(total, 9))).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def compute_score(
    rubric: dict[str, Any],
    model_ratings: dict[str, float],
    evidence: dict[str, str],
    comments: dict[str, str],
    report: CheckReport,
    *,
    out_of_scope: bool,
    essential_cap: int,
    default_min_rating: float,
    zero_basis: set[str] | None = None,
    zero_reason: str | None = None,
) -> ScoreResult:
    """Score /100 calculé par le serveur.

    - note finale d'un critère : `deterministic` => note des contrôles ; `semantic` => note du modèle ;
      `mixed` => min(modèle, contrôles). Les contrôles déterministes l'emportent donc quand ils échouent ;
    - `zero_basis` : critères dont la base est dans cet ensemble reçoivent 0 (ex. source citée inexistante) ;
    - hors sujet => 0 ; critère essentiel non rempli (note < seuil) => score plafonné à `essential_cap`.
    Toute autre donnée du modèle (récompense, score, paiement) n'entre jamais ici."""
    outcomes: list[CriterionOutcome] = []
    for c in rubric.get("criteria") or []:
        cid = c["id"]
        kind = c.get("kind") or "semantic"
        det = report.deterministic.get(cid)
        model = model_ratings.get(cid)
        override = None
        if kind == "deterministic" and det is not None:
            rating = det
        elif kind == "mixed" and det is not None:
            rating = min(model if model is not None else 0.0, det)
            if model is not None and det < model:
                override = "controle_deterministe"
        else:
            rating = model if model is not None else 0.0
        if zero_basis and c.get("basis") in zero_basis and rating > 0:
            rating, override = 0.0, zero_reason or "source_inexistante"
        essential = bool(c.get("essential"))
        min_rating = float(c.get("essential_min_rating", default_min_rating)) if essential else None
        met = None if not essential else rating >= (min_rating or 0.0) - 1e-9
        outcomes.append(
            CriterionOutcome(
                id=cid,
                label=str(c.get("label", cid)),
                weight=float(c.get("weight", 0)),
                essential=essential,
                kind=kind,
                model_rating=model,
                deterministic_rating=det,
                rating=max(0.0, min(1.0, rating)),
                min_rating=min_rating,
                met=met,
                evidence=evidence.get(cid, ""),
                comment=comments.get(cid, ""),
                check_ids=list(c.get("check_ids") or []),
                override=override,
            )
        )
    total_weight = sum(o.weight for o in outcomes) or 1.0
    raw = to_score(sum(o.weight * o.rating for o in outcomes) * 100.0 / total_weight)
    raw = max(0, min(100, raw))
    if out_of_scope:
        return ScoreResult(0, raw, False, True, [o.id for o in outcomes if o.essential], outcomes)
    failed = [o.id for o in outcomes if o.essential and o.met is False]
    score = min(raw, essential_cap) if failed else raw
    return ScoreResult(score, raw, bool(failed) and raw > essential_cap, False, failed, outcomes)
