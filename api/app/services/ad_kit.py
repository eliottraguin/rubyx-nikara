"""Kit de campagne : lecture de la sortie de l'agent `ads` et contrôles par code (docs/RULES.md §14).

La sortie du modèle est un contenu NON FIABLE : elle est lue comme JSON, validée par `AdKit`, nettoyée (caractères de
contrôle), puis soumise aux contrôles de la grille `data/rubrics/ad_kit_v1.json` (types de contrôles implémentés
ici, bornes et listes lues dans `data/`). Aucun contrôle n'est confié au modèle. Les contrôles ne publient rien."""

from __future__ import annotations

import json
import re
import unicodedata
from dataclasses import dataclass
from typing import Any

from pydantic import ValidationError

from ..ads_spec import AdFormat, AdsSpec, FormatField, Platform
from ..schemas.ads import AdKit, AdKitOut, ChecklistItemOut

# Contrôles qui bloquent aussi une copie éditée par le joueur (le joueur reste maître de ses propres faits).
PLAYER_BLOCKING_KINDS = {"section_present", "char_limit_per_format", "ref_in_input", "no_link_markup"}

_FENCE = re.compile(r"^```(?:json)?\s*(.*?)\s*```$", re.S | re.I)
_NUM = re.compile(r"\d+(?:[.,]\d+)?")
_NUM_GROUPED = re.compile(r"\d{1,3}(?:[  ]\d{3})+(?:[.,]\d+)?")
_DIMENSIONS = re.compile(r"\b\d{2,5}\s?(?:[x×]|par)\s?\d{2,5}(?:\s?px)?\b|\b\d{1,2}\s?:\s?\d{1,2}\b", re.I)
_URL_SCHEME = re.compile(r"(?:https?://|ftp://|www\.|javascript:|data:|mailto:)\S*", re.I)
_DOMAIN = re.compile(r"\b[\w\-]+(?:\.[\w\-]+)*\.(?:com|fr|io|net|org|eu|co|app|dev|ai|be|ch|info|biz|shop|store)\b", re.I)
_EMAIL = re.compile(r"[\w.+\-]+@[\w\-]+(?:\.[\w\-]+)+")
_PHONE = re.compile(r"(?<![\w])\+?\d[\d .\-]{6,}\d(?![\w])")
_HTML = re.compile(r"<\s*/?\s*[a-zA-Z!]")
_MD_LINK = re.compile(r"\]\s*\(")
_PROMISE_FIGURE = re.compile(
    r"(?<![\w])[+\-−–]\s?\d+(?:[.,]\d+)?\s?(?:%|pour\s?cent)"
    r"|\d+(?:[.,]\d+)?\s?(?:%|pour\s?cent)\s+(?:de|d['’])\s?\w+"
    r"|(?:moins|plus|jusqu['’]à|économis\w+)\s+(?:de\s+)?\d+(?:[.,]\d+)?\s?(?:%|pour\s?cent)"
    r"|(?<![\w])[x×]\s?\d+(?:[.,]\d+)?(?![\w])"
    r"|(?:deux|trois|quatre|cinq|dix)\s+fois\s+plus|multipli\w+\s+par\s+\w+|doubl\w+\s+(?:vos|votre|le|la|les)\s+\w+",
    re.I,
)


@dataclass
class ParsedKit:
    kit: AdKit | None
    problems: list[str]  # raisons de structure invalide (sans la valeur reçue)


# ------------------------------------------------------------------ lecture et nettoyage


def clean_text(value: str, multiline: bool = False) -> str:
    keep = "\n\t" if multiline else ""
    out = "".join(" " if (unicodedata.category(c) == "Cc" and c not in keep) else c for c in value)
    if not multiline:
        out = " ".join(out.split())
    else:
        out = "\n".join(" ".join(line.split()) for line in out.split("\n")).strip()
    return out.strip()


def _clean_obj(obj: Any, multiline: bool = False) -> Any:
    if isinstance(obj, str):
        return clean_text(obj, multiline)
    if isinstance(obj, list):
        return [_clean_obj(x, multiline) for x in obj]
    if isinstance(obj, dict):
        return {k: _clean_obj(v, multiline) for k, v in obj.items()}
    return obj


def parse_kit(content: str) -> ParsedKit:
    """JSON `ad_kit` → `AdKit` nettoyé. Une réponse qui n'est pas ce JSON est une structure invalide (jamais exécutée)."""
    text = content.strip()
    m = _FENCE.match(text)
    if m:
        text = m.group(1)
    try:
        raw = json.loads(text)
    except (ValueError, RecursionError):
        return ParsedKit(None, ["La réponse n'est pas un JSON `ad_kit`."])
    if not isinstance(raw, dict):
        return ParsedKit(None, ["La réponse n'est pas un objet JSON."])
    return validate_kit_object(raw)


def validate_kit_object(raw: dict[str, Any]) -> ParsedKit:
    try:
        kit = AdKit.model_validate(_clean_obj(raw, multiline=False))
    except ValidationError as exc:
        # emplacement et type seulement : jamais la valeur reçue
        problems = [f"{'.'.join(str(p) for p in e['loc'])} : {e['type']}" for e in exc.errors()[:6]]
        return ParsedKit(None, problems)
    return ParsedKit(kit, [])


# ------------------------------------------------------------------ texte de la fiche (référence des faits)


def _profile_texts(profile: dict[str, Any]) -> list[str]:
    parts: list[str] = []
    for value in profile.values():
        if isinstance(value, str):
            parts.append(value)
        elif isinstance(value, list):
            parts.extend(str(v) for v in value)
        elif isinstance(value, dict):  # cible_taille : effectifs
            parts.extend(str(v) for v in value.values())
    return parts


def profile_corpus(profile: dict[str, Any]) -> str:
    return "\n".join(_profile_texts(profile))


def _numbers(text: str) -> set[str]:
    text = _DIMENSIONS.sub(" ", text)
    out = {n.replace(",", ".") for n in _NUM.findall(text)}
    for g in _NUM_GROUPED.findall(text):
        out.add(re.sub(r"[  ]", "", g).replace(",", "."))
    return out


def _has_term(text: str, term: str) -> bool:
    return re.search(rf"(?<!\w){re.escape(term.lower())}(?!\w)", text.lower()) is not None


def missing_facts(spec: AdsSpec, profile: dict[str, Any], objectif: str) -> list[str]:
    """Faits utiles absents de la fiche (calcul serveur) : `chiffre`, et ceux que l'objectif exige (`prix`, `date`)."""
    body = " ".join(str(profile.get(k) or "") for k in ("offre", "besoin"))
    has_digit = bool(_NUM.search(profile_corpus(profile)))
    out: list[str] = []
    if not has_digit:
        out.append("chiffre")
    for need in spec.rules.required_facts_by_objective.get(objectif, []):
        if need == "prix" and not _NUM.search(body):
            out.append("prix")
        if need == "date" and not _NUM.search(body) and not any(
            _has_term(profile_corpus(profile), m) for m in ("janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre")
        ):
            out.append("date")
    return out


# ------------------------------------------------------------------ extraction des textes du kit


def _texts(kit: AdKit, *, skip: tuple[str, ...] = ()) -> list[tuple[str, str]]:
    items: list[tuple[str, str]] = [("positionnement", kit.positionnement), ("audience_resume", kit.audience_resume)]
    items += [("accroches", a.texte) for a in kit.accroches]
    for t in kit.textes:
        for field, values in t.champs.items():
            items += [(f"textes.{t.format}.{field}", v) for v in values]
    b = kit.brief_visuel
    items += [("brief_visuel.sujet", b.sujet), ("brief_visuel.style", b.style), ("brief_visuel.texte_image", b.texte_image),
              ("brief_visuel.format_dimensions", b.format_dimensions), ("brief_visuel.prompt", b.prompt)]
    items += [("plan.calendrier", x) for x in kit.plan.calendrier]
    items += [("plan.repartition_budget", x) for x in kit.plan.repartition_budget]
    items += [("plan.indicateurs", x) for x in kit.plan.indicateurs]
    items += [("a_verifier", x) for x in kit.a_verifier]
    return [(s, t) for s, t in items if not any(s == k or s.startswith(k + ".") for k in skip)]


# Sections où des chiffres propres au plan sont légitimes (durées, parts d'un budget indicatif saisi par le joueur,
# dimensions du visuel) ; les chiffres y sont tolérés, pas les URL, les promesses ni les faits.
_NUMBER_EXEMPT = ("plan.calendrier", "plan.repartition_budget", "brief_visuel.format_dimensions", "a_verifier")


def _structure_problems(spec: AdsSpec, kit: AdKit) -> list[str]:
    tb = spec.rules.text_bounds
    out: list[str] = []

    def nonempty(name: str, value: str) -> None:
        if not value.strip():
            out.append(f"{name} : vide")

    nonempty("positionnement", kit.positionnement)
    nonempty("audience_resume", kit.audience_resume)
    if len(kit.positionnement) > tb["positionnement_hard_max"]:
        out.append("positionnement : trop long")
    if len(kit.audience_resume) > tb["audience_resume_max"]:
        out.append("audience_resume : trop long")
    for i, a in enumerate(kit.accroches):
        nonempty(f"accroches.{i}", a.texte)
        if len(a.texte) > tb["accroche_max"]:
            out.append(f"accroches.{i} : trop longue")
    if not kit.textes:
        out.append("textes : aucun texte")
    b = kit.brief_visuel
    for name in ("sujet", "style", "texte_image", "format_dimensions", "prompt"):
        v = getattr(b, name)
        nonempty(f"brief_visuel.{name}", v)
        if len(v) > (tb["prompt_max"] if name == "prompt" else tb["brief_field_max"]):
            out.append(f"brief_visuel.{name} : trop long")
    for name, items in (("plan.calendrier", kit.plan.calendrier), ("plan.repartition_budget", kit.plan.repartition_budget), ("plan.indicateurs", kit.plan.indicateurs)):
        if len(items) > tb["plan_items_max"]:
            out.append(f"{name} : trop d'éléments")
        for i, x in enumerate(items):
            nonempty(f"{name}.{i}", x)
            if len(x) > tb["plan_item_max"]:
                out.append(f"{name}.{i} : trop long")
    if len(kit.a_verifier) > tb["a_verifier_items_max"]:
        out.append("a_verifier : trop d'éléments")
    for i, x in enumerate(kit.a_verifier):
        if len(x) > tb["a_verifier_item_max"]:
            out.append(f"a_verifier.{i} : trop long")
    return out


# ------------------------------------------------------------------ contrôles


@dataclass
class Ctx:
    spec: AdsSpec
    kit: AdKit
    platform: Platform
    objectif: str
    profile: dict[str, Any]
    profile_fields: list[str]

    @property
    def corpus(self) -> str:
        return profile_corpus(self.profile)


def _dotted(kit: AdKit, field: str) -> Any:
    cur: Any = kit
    for part in field.split("."):
        cur = getattr(cur, part, None)
    return cur


def _fmt(platform: Platform, format_id: str) -> AdFormat | None:
    return next((f for f in platform.formats if f.id == format_id), None)


def _field_problems(f: FormatField, values: list[str]) -> list[str]:
    out: list[str] = []
    lo, hi = (f.count.min, f.count.max) if f.count else (1, 1)
    if not (lo <= len(values) <= hi):
        out.append(f"{f.id} : {len(values)} texte(s) au lieu de {lo} à {hi}" if lo != hi else f"{f.id} : un seul texte attendu")
    for v in values:
        if not v.strip():
            out.append(f"{f.id} : texte vide")
        elif len(v) > f.max_chars:
            out.append(f"{f.id} : {len(v)} caractères pour {f.max_chars} au plus")
    return out


def _check_char_limits(c: Ctx, _params: dict) -> list[str]:
    out: list[str] = []
    seen: dict[str, int] = {}
    per_fmt_max = c.spec.rules.text_bounds["texts_per_format_max"]
    for t in c.kit.textes:
        fmt = _fmt(c.platform, t.format)
        if fmt is None:
            out.append(f"{t.format} : format inconnu pour la plateforme {c.platform.id}")
            continue
        seen[fmt.id] = seen.get(fmt.id, 0) + 1
        known = {f.id: f for f in fmt.fields}
        for name in t.champs:
            if name not in known:
                out.append(f"{fmt.id}.{name} : champ inconnu")
        for f in fmt.fields:
            values = t.champs.get(f.id)
            if values is None:
                if f.required:
                    out.append(f"{fmt.id}.{f.id} : champ obligatoire absent")
                continue
            out += [f"{fmt.id}.{p}" for p in _field_problems(f, values)]
    for fmt in c.platform.formats:
        if fmt.id not in seen:
            out.append(f"{fmt.id} : format sans texte")
        elif seen[fmt.id] > per_fmt_max:
            out.append(f"{fmt.id} : plus de {per_fmt_max} variantes")
    return out


def _check_new_facts(c: Ctx, _params: dict) -> list[str]:
    known_numbers = _numbers(c.corpus)
    out: list[str] = []
    for section, text in _texts(c.kit, skip=_NUMBER_EXEMPT):
        for n in sorted(_numbers(text) - known_numbers):
            out.append(f"{section} : chiffre « {n} » absent de la fiche")
    for section, text in _texts(c.kit):
        for term in c.spec.rules.claim_terms:
            if _has_term(text, term) and not _has_term(c.corpus, term):
                out.append(f"{section} : « {term} » absent de la fiche")
    return _dedupe(out)


def _digits(s: str) -> str:
    return re.sub(r"\D", "", s)


def _check_new_urls(c: Ctx, params: dict) -> list[str]:
    corpus = c.corpus.lower()
    corpus_digits = _digits(corpus)
    out: list[str] = []
    for section, text in _texts(c.kit):
        for m in _EMAIL.findall(text) + _DOMAIN.findall(text) + _URL_SCHEME.findall(text):
            if m.lower().rstrip(".,;:)") not in corpus:
                out.append(f"{section} : adresse ou lien absent de la fiche")
        if params.get("also_numbers"):
            for m in _PHONE.findall(_DIMENSIONS.sub(" ", text)):
                d = _digits(m)
                if len(d) >= 8 and d not in corpus_digits:
                    out.append(f"{section} : numéro absent de la fiche")
    return _dedupe(out)


def _check_personal_target(c: Ctx, _params: dict) -> list[str]:
    out: list[str] = []
    exclusions = " ".join(str(x) for x in (c.profile.get("exclusions") or [])).lower()
    titles = "|".join(re.escape(t) for t in c.spec.rules.person_title_terms)
    named = re.compile(rf"(?<!\w)(?:{titles})\.?\s+([A-ZÀ-Ý][\w'’\-]+)", re.I)
    for section, text in _texts(c.kit):
        for m in named.finditer(text):
            if m.group(1)[0].isupper():
                out.append(f"{section} : personne nommée")
                break
        for term in c.spec.rules.individual_target_terms:
            if _has_term(text, term) and not _has_term(exclusions, term):
                out.append(f"{section} : ciblage de particuliers (« {term} »)")
    return _dedupe(out)


def _check_promise_figure(c: Ctx, _params: dict) -> list[str]:
    known = _numbers(c.corpus)
    corpus = c.corpus.lower()
    out: list[str] = []
    for section, text in _texts(c.kit):
        for m in _PROMISE_FIGURE.finditer(_DIMENSIONS.sub(" ", text)):
            nums = _numbers(m.group(0))
            if (nums and not nums <= known) or (not nums and m.group(0).lower() not in corpus):
                out.append(f"{section} : promesse chiffrée absente de la fiche")
        for term in c.spec.rules.promise_terms:
            if _has_term(text, term) and not _has_term(c.corpus, term):
                out.append(f"{section} : promesse « {term} » absente de la fiche")
    return _dedupe(out)


def _check_link_markup(c: Ctx, _params: dict) -> list[str]:
    out: list[str] = []
    for section, text in _texts(c.kit):
        if _HTML.search(text) or _MD_LINK.search(text) or _URL_SCHEME.search(text):
            out.append(f"{section} : balise, lien ou URL")
    return _dedupe(out)


def _check_max_chars(c: Ctx, params: dict) -> list[str]:
    v = _dotted(c.kit, params["field"])
    return [f"{params['field']} : {len(v)} caractères pour {params['max']} au plus"] if isinstance(v, str) and len(v) > params["max"] else []


def _check_count_range(c: Ctx, params: dict) -> list[str]:
    v = _dotted(c.kit, params["field"])
    n = len(v) if isinstance(v, list) else 0
    return [] if params["min"] <= n <= params["max"] else [f"{params['field']} : {n} élément(s) au lieu de {params['min']} à {params['max']}"]


def _check_checklist(c: Ctx, _params: dict) -> list[str]:
    known = {i.id for i in c.spec.checklist}
    return [f"checklist.{r.id[:40]} : point inconnu" for r in c.kit.checklist if r.id not in known]


def _check_required_when_missing(c: Ctx, params: dict) -> list[str]:
    missing = missing_facts(c.spec, c.profile, c.objectif)
    filled = [x for x in c.kit.a_verifier if x.strip()]
    return [f"a_verifier vide alors qu'il manque : {', '.join(missing)}"] if missing and not filled else []


def _dedupe(items: list[str]) -> list[str]:
    seen: set[str] = set()
    return [i for i in items if not (i in seen or seen.add(i))]


_HANDLERS = {
    "max_chars": _check_max_chars,
    "count_range": _check_count_range,
    "char_limit_per_format": _check_char_limits,
    "no_new_facts": _check_new_facts,
    "no_new_urls": _check_new_urls,
    "no_personal_target": _check_personal_target,
    "ref_in_input": _check_checklist,
    "required_when_missing": _check_required_when_missing,
    "no_promise_figure": _check_promise_figure,
    "no_link_markup": _check_link_markup,
}


def run_checks(
    spec: AdsSpec, parsed: ParsedKit, *, platform_id: str, objectif: str, profile: dict[str, Any], profile_fields: list[str]
) -> list[dict[str, Any]]:
    """Résultats de tous les contrôles de la grille : `{id, label, essential, kind, passed, detail}`. Un type de
    contrôle inconnu de la grille échoue (jamais ignoré en silence). Le serveur est seul juge."""
    platform = spec.platform(platform_id)
    results: list[dict[str, Any]] = []
    for chk in spec.checks:
        passed, detail = True, None
        if parsed.kit is None:
            passed = False
            detail = "; ".join(parsed.problems)[:200] if chk.kind == "section_present" else "non évalué : structure invalide"
        elif platform is None:
            passed, detail = False, "plateforme inconnue"
        elif chk.kind == "section_present":
            problems = _structure_problems(spec, parsed.kit)
            problems += [f"accroches.{i} : champ de fiche inconnu" for i, a in enumerate(parsed.kit.accroches) if a.fiche not in profile_fields]
            if problems:
                passed, detail = False, "; ".join(problems[:5])[:300]
        else:
            handler = _HANDLERS.get(chk.kind)
            ctx = Ctx(spec, parsed.kit, platform, objectif, profile, profile_fields)
            problems = handler(ctx, chk.params) if handler else [f"type de contrôle inconnu : {chk.kind}"]
            if problems:
                passed, detail = False, "; ".join(problems[:5])[:300]
        results.append({"id": chk.id, "label": chk.label, "essential": chk.essential, "kind": chk.kind, "passed": passed, "detail": detail})
    return results


def essential_failures(results: list[dict[str, Any]], *, player: bool = False) -> list[dict[str, Any]]:
    return [r for r in results if not r["passed"] and r["essential"] and (not player or r["kind"] in PLAYER_BLOCKING_KINDS)]


def public_checks(results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [{k: v for k, v in r.items() if k != "kind"} for r in results]


# ------------------------------------------------------------------ kit rendu


def finalize_kit(spec: AdsSpec, kit: AdKit, platform_id: str) -> AdKitOut:
    """Kit stocké : checklist résolue depuis les données (libellé, caractère essentiel), complétée des points
    essentiels de la plateforme que le modèle aurait omis ; ordre des données. Rien n'est inventé."""
    chosen = {r.id for r in kit.checklist}
    wanted = [i for i in spec.checklist if i.id in chosen or (i.essential and i.applies_to(platform_id))]
    return AdKitOut(
        positionnement=kit.positionnement,
        audience_resume=kit.audience_resume,
        accroches=kit.accroches,
        textes=kit.textes,
        brief_visuel=kit.brief_visuel,
        plan=kit.plan,
        checklist=[ChecklistItemOut(id=i.id, label=i.label, essential=i.essential) for i in wanted],
        a_verifier=[x for x in kit.a_verifier if x.strip()],
    )
