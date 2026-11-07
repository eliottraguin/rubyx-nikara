#!/usr/bin/env python3
"""Validation d'intégrité du contenu P3 (rôles, missions, grilles, annotés, fixtures).

Bibliothèque standard uniquement. Usage : python3 tools/validate_content.py [--root CHEMIN]
Code de sortie 0 si tout est valide, 1 sinon. Aucun appel réseau, aucun secret lu.

Ce script contient aussi une IMPLÉMENTATION DE RÉFÉRENCE des contrôles déterministes
déclarés dans data/rubrics/*.json (regex, mots, montants, tolérances...). Elle sert à
vérifier la cohérence des données (solutions de référence, livrables annotés) ; elle ne
remplace pas l'implémentation serveur de BE06, qui devra reproduire la même sémantique
(voir docs/ai/03-evaluateur.md).
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path

MISSIONS = ["m1", "m2", "m3", "m4", "m5", "m6", "rescue"]
MODES = ["beginner", "expert"]
ROLES = ["writer", "prospector", "researcher", "analyst", "qa", "lead"]
SYSTEM_ROLES = ["client_evaluator", "client_clarifier", "coach"]
LEVELS = ["off_topic", "incomplete", "acceptable", "complete"]

ERRORS: list[str] = []
WARNINGS: list[str] = []


def err(msg: str) -> None:
    ERRORS.append(msg)


def warn(msg: str) -> None:
    WARNINGS.append(msg)


# --------------------------------------------------------------------------- JSON Schema (sous-ensemble)
def _type_ok(v, t: str) -> bool:
    if t == "string":
        return isinstance(v, str)
    if t == "boolean":
        return isinstance(v, bool)
    if t == "integer":
        return isinstance(v, int) and not isinstance(v, bool)
    if t == "number":
        return isinstance(v, (int, float)) and not isinstance(v, bool)
    if t == "array":
        return isinstance(v, list)
    if t == "object":
        return isinstance(v, dict)
    if t == "null":
        return v is None
    return False


def schema_errors(v, s: dict, path: str = "$") -> list[str]:
    out: list[str] = []
    t = s.get("type")
    if t is not None:
        ts = t if isinstance(t, list) else [t]
        if not any(_type_ok(v, x) for x in ts):
            return [f"{path}: type attendu {ts}, obtenu {type(v).__name__}"]
    if "const" in s and v != s["const"]:
        out.append(f"{path}: valeur attendue {s['const']!r}")
    if "enum" in s and v not in s["enum"]:
        out.append(f"{path}: {v!r} hors énumération {s['enum']}")
    if isinstance(v, str):
        if "minLength" in s and len(v) < s["minLength"]:
            out.append(f"{path}: chaîne trop courte ({len(v)} < {s['minLength']})")
        if "maxLength" in s and len(v) > s["maxLength"]:
            out.append(f"{path}: chaîne trop longue ({len(v)} > {s['maxLength']})")
        if "pattern" in s and not re.search(s["pattern"], v):
            out.append(f"{path}: {v!r} ne respecte pas {s['pattern']}")
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        if "minimum" in s and v < s["minimum"]:
            out.append(f"{path}: {v} < minimum {s['minimum']}")
        if "maximum" in s and v > s["maximum"]:
            out.append(f"{path}: {v} > maximum {s['maximum']}")
    if isinstance(v, list):
        if "minItems" in s and len(v) < s["minItems"]:
            out.append(f"{path}: au moins {s['minItems']} éléments requis")
        if "maxItems" in s and len(v) > s["maxItems"]:
            out.append(f"{path}: au plus {s['maxItems']} éléments")
        if "items" in s:
            for i, x in enumerate(v):
                out += schema_errors(x, s["items"], f"{path}[{i}]")
    if isinstance(v, dict):
        for k in s.get("required", []):
            if k not in v:
                out.append(f"{path}: champ requis manquant « {k} »")
        props = s.get("properties", {})
        ap = s.get("additionalProperties", True)
        for k, x in v.items():
            if k in props:
                out += schema_errors(x, props[k], f"{path}.{k}")
            elif ap is False:
                out.append(f"{path}: champ inconnu « {k} »")
            elif isinstance(ap, dict):
                out += schema_errors(x, ap, f"{path}.{k}")
    return out


# --------------------------------------------------------------------------- Contrôles déterministes (référence)
SP = r"[\s\u00a0\u202f]*"
NUM = r"\d{1,3}(?:[ \u00a0\u202f]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?"
AMOUNT_RE = re.compile(rf"({NUM}){SP}(?:€|euros?\b|EUR\b)", re.I)
PERCENT_RE = re.compile(rf"({NUM}){SP}%")


def parse_num(s: str) -> float:
    return float(re.sub(r"[\s\u00a0\u202f]", "", s).replace(",", "."))


def word_count(text: str) -> int:
    return sum(1 for tok in text.split() if re.search(r"\w", tok))


def scoped(text: str, scope: dict | None) -> str:
    if not scope:
        return text
    m = re.search(scope["start"], text)
    if not m:
        return ""
    rest = text[m.end():]
    e = re.search(scope["end"], rest) if scope.get("end") else None
    return rest[: e.start()] if e else rest


def _rx(p: str) -> re.Pattern:
    return re.compile(p, re.I | re.U)


def run_check(chk: dict, text: str, trace: dict, results: dict) -> float:
    """Retourne une fraction dans [0, 1]."""
    p = chk["params"]
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
        hits = 0
        for t in p["targets"]:
            good = False
            for line in seg.splitlines():
                if not _rx(t["line_pattern"]).search(line):
                    continue
                for m in re.finditer(rf"({NUM}){SP}(?:{t['unit_regex']})", line, re.I):
                    if abs(parse_num(m.group(1)) - t["expected"]) <= t["tolerance"] + 1e-9:
                        good = True
            hits += good
        return hits / len(p["targets"])
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


def run_rubric_checks(rubric: dict, text: str, trace: dict) -> tuple[dict, dict]:
    """Retourne (fractions par contrôle, note déterministe par critère ou None)."""
    results: dict[str, float] = {}
    pending = list(rubric["deterministic_checks"])
    guard = 0
    while pending and guard < 50:
        guard += 1
        rest = []
        for c in pending:
            if c["kind"] == "any_of" and not all(i in results for i in c["params"]["check_ids"]):
                rest.append(c)
                continue
            results[c["id"]] = run_check(c, text, trace, results)
        pending = rest
    det: dict[str, float | None] = {}
    for cr in rubric["criteria"]:
        ids = cr["check_ids"]
        det[cr["id"]] = (sum(results[i] for i in ids) / len(ids)) if ids else None
    return results, det


def compute_score(rubric: dict, ratings: dict, out_of_scope: bool) -> tuple[int, list[str]]:
    """Formule de référence (docs/ai/03-evaluateur.md) : somme pondérée arrondie demi-supérieur,
    plafonnée à `essential_cap` si un essentiel n'est pas rempli, 0 si hors sujet."""
    if out_of_scope:
        return 0, [c["id"] for c in rubric["criteria"] if c["essential"]]
    total = sum(c["weight"] * ratings[c["id"]] for c in rubric["criteria"])
    score = int(Decimal(str(total)).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
    failed = []
    for c in rubric["criteria"]:
        if c["essential"] and ratings[c["id"]] < c.get("essential_min_rating", rubric["essential_min_rating"]) - 1e-9:
            failed.append(c["id"])
    if failed:
        score = min(score, rubric["essential_cap"])
    return score, failed


def compute_metrics(op: str, a: float, b: float, decimals: int) -> float:
    q = Decimal(1).scaleb(-decimals)
    da, db = Decimal(str(a)), Decimal(str(b))
    if op == "ratio_percent":
        v = da / db * 100
    elif op in ("cost_per", "divide"):
        v = da / db
    elif op == "multiply":
        v = da * db
    else:
        raise ValueError(op)
    return float(v.quantize(q, rounding=ROUND_HALF_UP))


def norm_ws(s: str) -> str:
    return re.sub(r"[\s\u00a0\u202f]+", " ", s).strip().lower()


def evaluator_errors(out: dict, rubric: dict, text: str | None) -> list[str]:
    """Contrôles serveur attendus sur la sortie du client évaluateur (hors récompense, ignorée)."""
    errs = []
    if out.get("rubric_version") != rubric["id"]:
        errs.append("rubric_version ne correspond pas à la grille")
    ids = [c.get("id") for c in out.get("criteria", [])]
    known = {c["id"] for c in rubric["criteria"]}
    for i in ids:
        if i not in known:
            errs.append(f"identifiant de critère inconnu : {i}")
    for i in known - set(ids):
        errs.append(f"critère manquant : {i}")
    if len(set(ids)) != len(ids):
        errs.append("identifiant de critère dupliqué")
    for c in out.get("criteria", []):
        r = c.get("rating")
        if not isinstance(r, (int, float)) or isinstance(r, bool) or r < 0 or r > 1:
            errs.append(f"rating hors [0,1] pour {c.get('id')}")
            continue
        ev = c.get("evidence", "")
        if r > 0 and not ev and not out.get("out_of_scope"):
            errs.append(f"preuve vide pour un critère noté > 0 : {c.get('id')}")
        if ev and text is not None and norm_ws(ev) not in norm_ws(text):
            errs.append(f"preuve non littérale pour {c.get('id')}")
    return errs


def plan_errors(plan: dict, ctx: dict, max_steps: int) -> list[str]:
    """Contrôles sémantiques du plan du chef (RULES.md §4)."""
    errs = []
    steps = plan.get("steps", [])
    if not 1 <= len(steps) <= max_steps:
        errs.append(f"nombre d'étapes invalide ({len(steps)})")
    for i, s in enumerate(steps):
        if s.get("role") == "lead":
            errs.append("appel récursif chef vers chef interdit")
        if s.get("role") == "client":
            errs.append("appel vers le client interdit")
        if s.get("role") not in ctx.get("owned_roles", []):
            errs.append(f"rôle non possédé : {s.get('role')}")
        d = s.get("depends_on")
        if d is not None and d >= i:
            errs.append("dépendance invalide (cycle ou étape postérieure)")
        for sid in s.get("source_ids", []):
            if sid not in ctx.get("attempt_source_ids", []):
                errs.append(f"pièce hors tentative : {sid}")
    return errs


# --------------------------------------------------------------------------- Chargement
class Ctx:
    def __init__(self, root: Path):
        self.root = root
        self.d = root / "data"
        self.schemas: dict[str, dict] = {}
        self.rules: dict | None = None

    def load(self, p: Path):
        try:
            return json.loads(p.read_text(encoding="utf-8"))
        except Exception as e:  # noqa: BLE001
            err(f"{p.relative_to(self.root)} : JSON illisible ({e})")
            return None

    def validate(self, obj, schema_name: str, label: str) -> bool:
        errs = schema_errors(obj, self.schemas[schema_name])
        for e in errs[:8]:
            err(f"{label} [{schema_name}] {e}")
        return not errs


def check_unique(ids: list[str], what: str) -> None:
    seen = set()
    for i in ids:
        if i in seen:
            err(f"id dupliqué ({what}) : {i}")
        seen.add(i)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=str(Path(__file__).resolve().parent.parent))
    args = ap.parse_args()
    c = Ctx(Path(args.root))
    stats: dict[str, int] = {}

    # --- schémas
    for p in sorted((c.d / "schemas").glob("*.schema.json")):
        s = c.load(p)
        if s is not None:
            c.schemas[p.name.replace(".schema.json", "")] = s
    for need in ["evaluator_output", "lead_plan", "role", "tools", "agent_response", "model_output_case", "rubric", "mission_variant",
                 "corpus", "annotated", "coach_debrief"]:
        if need not in c.schemas:
            err(f"schéma manquant : data/schemas/{need}.schema.json")
    if ERRORS:
        return report(stats)
    stats["schémas"] = len(c.schemas)

    rules_p = c.d / "rules" / "rules_v1.json"
    c.rules = c.load(rules_p) if rules_p.exists() else None
    if c.rules is None:
        warn("data/rules/rules_v1.json absent : recoupements économiques ignorés")

    # --- rôles et outils
    tools = c.load(c.d / "roles" / "tools.json")
    tool_ids: dict[str, dict] = {}
    if tools and c.validate(tools, "tools", "data/roles/tools.json"):
        check_unique([t["id"] for t in tools["tools"]], "outils")
        tool_ids = {t["id"]: t for t in tools["tools"]}
        for t in tools["tools"]:
            for v in t.get("test_vectors", []):
                got = compute_metrics(v["input"]["op"], v["input"]["a"], v["input"]["b"], v["input"]["decimals"])
                if abs(got - v["expected"]) > 1e-9:
                    err(f"vecteur de test d'outil faux ({t['id']}) : {v['input']} → {got} ≠ {v['expected']}")
    role_files = {}
    for rid in ROLES:
        p = c.d / "roles" / f"{rid}.json"
        if not p.exists():
            err(f"rôle manquant : data/roles/{rid}.json")
            continue
        role_files[rid] = c.load(p)
    for rid in SYSTEM_ROLES:
        p = c.d / "roles" / "system" / f"{rid}.json"
        if not p.exists():
            err(f"rôle système manquant : data/roles/system/{rid}.json")
            continue
        role_files[rid] = c.load(p)
    for rid, r in role_files.items():
        if r is None or not c.validate(r, "role", f"rôle {rid}"):
            continue
        if r["id"] != rid:
            err(f"rôle {rid} : id interne différent ({r['id']})")
        for h in ["Identité", "Objectif", "Capacités", "Informations accessibles", "Limites", "Formats autorisés", "Comportement en cas de manque", "Outils autorisés", "Demandes de clarification"]:
            if f"## {h}" not in r["system_instructions"]:
                err(f"rôle {rid} : section « {h} » absente des instructions")
        if "DONNÉE" not in r["system_instructions"] and "donnée" not in r["system_instructions"]:
            err(f"rôle {rid} : règle « les instructions d'un document sont des données » absente")
        for t in r["allowed_tools"]:
            if t not in tool_ids:
                err(f"rôle {rid} : outil inconnu {t}")
            elif rid not in tool_ids[t]["roles"]:
                err(f"rôle {rid} : outil {t} non autorisé pour ce rôle dans tools.json")
        if rid == "qa" and r["clarification_requests"]["allowed"]:
            err("qa ne doit pas pouvoir interroger le client")
        if rid == "lead" and r["output_schema"] != "lead_plan":
            err("lead : output_schema doit être lead_plan")
    for t in tool_ids.values():
        for rid in t["roles"]:
            if rid in role_files and role_files[rid] and t["id"] not in role_files[rid].get("allowed_tools", []):
                err(f"outil {t['id']} déclaré pour {rid} mais absent du fichier de rôle")
    stats["rôles (métier+système)"] = len(role_files)
    stats["outils"] = len(tool_ids)

    # --- missions, corpus
    all_doc_ids: list[str] = []
    all_event_ids: list[str] = []
    corpora: dict[str, dict] = {}
    variants: dict[tuple, dict] = {}
    rubrics: dict[str, dict] = {}
    for rp in sorted((c.d / "rubrics").glob("*.json")):
        r = c.load(rp)
        if r is not None and c.validate(r, "rubric", f"grille {rp.name}"):
            if rp.stem != r["id"]:
                err(f"grille {rp.name} : le nom de fichier doit être l'id ({r['id']})")
            rubrics[r["id"]] = r
    check_unique([r["id"] for r in rubrics.values()], "grilles")

    for mid in MISSIONS:
        cp = c.d / "missions" / mid / "corpus.json"
        if not cp.exists():
            err(f"corpus manquant : {cp.relative_to(c.root)}")
            continue
        co = c.load(cp)
        if co is None or not c.validate(co, "corpus", f"corpus {mid}"):
            continue
        corpora[mid] = co
        ids = [d["id"] for d in co["documents"]]
        all_doc_ids += ids
        for d in co["documents"]:
            if not d["id"].startswith(f"{mid}_"):
                err(f"corpus {mid} : l'id {d['id']} doit commencer par « {mid}_ »")
        for mode in MODES:
            vp = c.d / "missions" / mid / f"{mode}_v1.json"
            if not vp.exists():
                err(f"variante manquante : {vp.relative_to(c.root)}")
                continue
            v = c.load(vp)
            if v is None or not c.validate(v, "mission_variant", f"variante {mid}/{mode}"):
                continue
            variants[(mid, mode)] = v
            if v["id"] != f"{mid}_{mode}_v1" or v["mission_id"] != mid or v["mode"] != mode:
                err(f"variante {mid}/{mode} : id/mission/mode incohérents")
    check_unique(all_doc_ids, "documents de corpus")
    stats["missions"] = len({m for m, _ in variants})
    stats["variantes beginner/expert"] = len(variants)
    stats["documents de corpus"] = len(all_doc_ids)

    unlock_order = {"m1": [], "m2": ["prospector"], "m3": ["prospector", "researcher", "qa"], "m4": ["prospector", "researcher", "qa", "analyst"],
                    "m5": ["prospector", "researcher", "qa", "analyst"], "m6": ["prospector", "researcher", "qa", "analyst", "lead"], "rescue": []}
    rules_missions = {m["id"]: m for m in c.rules["missions"]} if c.rules else {}

    for (mid, mode), v in variants.items():
        lab = f"{mid}/{mode}"
        co = corpora[mid]
        docs = {d["id"]: d for d in co["documents"]}
        for ref in v["corpus_refs"]:
            if ref not in docs:
                err(f"{lab} : corpus_refs inconnu {ref}")
        for f in v["brief"]["facts"]:
            if f["source"] not in docs:
                err(f"{lab} : source de fait inconnue {f['source']} ({f['id']})")
        if v["rubric_id"] not in rubrics:
            err(f"{lab} : grille {v['rubric_id']} introuvable")
        elif rubrics[v["rubric_id"]]["mission_id"] != mid or mode not in rubrics[v["rubric_id"]]["applies_to_variants"]:
            err(f"{lab} : grille {v['rubric_id']} non applicable à cette variante")
        for ev in v["events"]:
            all_event_ids.append(f"{mid}/{mode}/{ev['id']}")
            for dref in ev["added_documents"]:
                if dref not in docs:
                    err(f"{lab} : événement {ev['id']} ajoute un document inconnu {dref}")
                elif docs[dref]["added_by_event"] != ev["id"]:
                    err(f"{lab} : le document {dref} doit déclarer added_by_event={ev['id']}")
        check_unique([e["id"] for e in v["events"]], f"événements {lab}")
        # documents ajoutés par événement doivent être déclarés par un événement de la variante
        for d in co["documents"]:
            if d["added_by_event"] and d["added_by_event"] not in [e["id"] for e in v["events"]]:
                err(f"{lab} : document {d['id']} lié à un événement absent de la variante")
        # économie (recoupement avec rules_v1)
        if c.rules and mid in rules_missions:
            rm = rules_missions[mid]
            e = v["economy"]
            if e["max_reward"] != rm["max_reward"] or e["unit_price"] != rm["unit_price"] or sorted(e["unlocks"]) != sorted(rm["unlocks"]):
                err(f"{lab} : économie incohérente avec rules_v1 ({e} vs {rm})")
            if mid == "m6":
                if e["spend_cap"] != c.rules["scoring"]["final_max_spend"] or e["min_contributing_roles"] != c.rules["scoring"]["final_min_contributing_roles"]:
                    err(f"{lab} : plafond/rôles contributeurs ≠ rules_v1")
        if mid == "m6":
            if v["economy"]["spend_cap"] != 30 or v["economy"]["min_contributing_roles"] < 2:
                err(f"{lab} : M6 exige plafond 30 et ≥ 2 rôles")
            if not v["events"] or any(e["trigger"] != "before_first_action" for e in v["events"]):
                err(f"{lab} : M6 : événement injecté avant la 1re action requis")
        else:
            if v["economy"]["spend_cap"] is not None:
                err(f"{lab} : plafond de dépense réservé à M6")
        if set(v["roles_usable"]) - set(["writer"] + unlock_order[mid]):
            err(f"{lab} : rôles utilisables non débloqués à ce stade : {set(v['roles_usable']) - set(['writer'] + unlock_order[mid])}")
        if "writer" not in v["roles_usable"]:
            err(f"{lab} : le rédacteur doit rester utilisable (M1-M5 faisables avec le seul rédacteur)")
        if mid == "rescue" and v["roles_usable"] != ["writer"]:
            err(f"{lab} : secours = rédacteur seul")
        # M5 : crédit de correction
        if mid == "m5":
            evs = [e for e in v["events"] if e["type"] == "target_change"]
            if len(evs) != 1:
                err(f"{lab} : M5 exige exactement un événement de changement de cible")
            else:
                cc = evs[0]["correction_credit"]
                if not cc or cc.get("free_message_per_concerned_role") != 1 or cc.get("once_per_role") is not True or cc.get("quota_unchanged") != 5 or not cc.get("never_adds_message"):
                    err(f"{lab} : crédit de correction M5 mal défini (1 message gratuit par rôle, une fois, quota 5)")
                if evs[0]["trigger"] != "after_first_proposal":
                    err(f"{lab} : M5 : déclenchement après la 1re proposition requis")
        for e in v["events"]:
            if e["type"] != "target_change" and e["correction_credit"]:
                err(f"{lab} : seul le changement de cible porte un crédit de correction")
        # mode : tutoriel
        if mode == "beginner" and not (v["tutorial"] and v["tutorial"].get("enabled")) and mid != "m6":
            err(f"{lab} : le mode débutant doit avoir un tutoriel (sauf finale sans aide automatique)")
        if mode == "expert" and v["tutorial"]:
            err(f"{lab} : le mode expert n'a pas de parcours guidé")
        if mid == "m6" and v["tutorial"]:
            err(f"{lab} : finale sans aide automatique : pas de tutoriel")
        if mid == "m1" and mode == "beginner":
            qs = v["tutorial"]["framing_questions"]
            if qs != ["Pour qui ?", "Quel résultat ?", "Quelles informations ?"]:
                err(f"{lab} : questions de cadrage M1 attendues")
        # indices : pas de fuite de valeurs
        for h in v["hints"]:
            for term in v["hint_forbidden_terms"]:
                if term.lower() in h["text"].lower():
                    err(f"{lab} : l'indice niveau {h['level']} contient la valeur « {term} »")
        if sorted(h["level"] for h in v["hints"]) != [1, 2]:
            err(f"{lab} : indices niveau 1 et 2 requis")
        # faits non communiqués : jamais essentiels (M3)
        priv_ids = {p["id"] for p in v["client"]["private_facts"]}
        if mid == "m3":
            if "channel" not in priv_ids:
                err(f"{lab} : M3 doit détenir le canal comme fait privé")
            if not v["brief"]["missing_on_purpose"]:
                err(f"{lab} : M3 doit déclarer l'information manquante")
            for p in v["client"]["private_facts"]:
                if p["id"] == "channel" and p["creates_brief_version"] != 3:
                    err(f"{lab} : la clarification du canal crée la version 3 du brief")
        # M2 catalogue
        if mid == "m2":
            cat = docs["m2_cat"]["data"]["entries"]
            if len(cat) != 8:
                err(f"m2_cat : 8 entrées attendues ({len(cat)})")
            if not 0 < sum(1 for x in cat if not x["server_only"]["in_offer"]) < 8:
                err("m2_cat : certaines entrées doivent être hors offre")
            check_unique([x["id"] for x in cat], "catalogue M2")
        # solution de référence : tous les contrôles déterministes passent
        rb = rubrics.get(v["rubric_id"])
        if rb:
            sol = v["reference_solution"]
            results, det = run_rubric_checks(rb, sol["deliverable"], sol["expected_trace"])
            for cid, val in results.items():
                if val < 1.0:
                    err(f"{lab} : la solution de référence échoue au contrôle {cid} ({val:.2f})")
            if mid == "m4" and mode == "beginner":
                pass
        # références aux documents dans les textes de brief
        if mid == "m1":
            facts = {f["id"]: f["value"] for f in v["brief"]["facts"]}
            if "9,90" not in facts.get("price", "") or "12 h" not in facts.get("hours", "") or "14 h" not in facts.get("hours", ""):
                err(f"{lab} : faits M1 (prix 9,90, horaires 12 h–14 h) incohérents avec docs/MISSIONS.md")
            if "80 mots" not in " ".join(v["brief"]["constraints"]):
                err(f"{lab} : contrainte 80 mots absente")
    check_unique(all_event_ids, "événements")
    stats["événements déclarés"] = len(all_event_ids)

    # --- grilles
    for rid, rb in rubrics.items():
        lab = f"grille {rid}"
        total = sum(cr["weight"] for cr in rb["criteria"])
        if total != 100:
            err(f"{lab} : poids = {total} (100 attendu)")
        if not any(cr["essential"] for cr in rb["criteria"]):
            err(f"{lab} : aucun critère essentiel")
        check_unique([cr["id"] for cr in rb["criteria"]], f"critères {rid}")
        check_unique([ck["id"] for ck in rb["deterministic_checks"]], f"contrôles {rid}")
        crit_ids = {cr["id"] for cr in rb["criteria"]}
        chk_ids = {ck["id"]: ck for ck in rb["deterministic_checks"]}
        if rb["mission_id"] + "_v" + str(rb["version"]) != rid:
            err(f"{lab} : id incohérent avec mission/version")
        if not rid.startswith(rb["mission_id"]):
            err(f"{lab} : préfixe d'id")
        if c.rules and rb["mission_id"] in rules_missions:
            if rb["max_reward"] != rules_missions[rb["mission_id"]]["max_reward"]:
                err(f"{lab} : max_reward ≠ rules_v1")
            exp = c.rules["scoring"]["final_pass_score"] if rb["final"] else c.rules["scoring"]["pass_score"]
            if rb["pass_score"] != exp or rb["essential_cap"] != c.rules["scoring"]["essential_failure_cap"]:
                err(f"{lab} : seuils ≠ rules_v1")
        if rb["final"] != (rb["mission_id"] == "m6"):
            err(f"{lab} : « final » doit valoir vrai pour M6 uniquement")
        any_of_members = set()
        for ck in rb["deterministic_checks"]:
            if ck["criterion_id"] not in crit_ids:
                err(f"{lab} : contrôle {ck['id']} rattaché à un critère inconnu")
            if ck["kind"] == "any_of":
                for m in ck["params"].get("check_ids", []):
                    any_of_members.add(m)
                    if m not in chk_ids:
                        err(f"{lab} : any_of {ck['id']} référence {m} inconnu")
            try:
                for pat in ck["params"].get("patterns", []) + [t["line_pattern"] for t in ck["params"].get("targets", [])]:
                    re.compile(pat)
            except re.error as e:
                err(f"{lab} : regex invalide dans {ck['id']} ({e})")
        for cr in rb["criteria"]:
            for i in cr["check_ids"]:
                if i not in chk_ids:
                    err(f"{lab} : check_ids inconnu {i} (critère {cr['id']})")
                elif chk_ids[i]["criterion_id"] != cr["id"]:
                    err(f"{lab} : le contrôle {i} appartient à un autre critère")
            if cr["kind"] in ("deterministic", "mixed") and not cr["check_ids"]:
                err(f"{lab} : critère {cr['id']} {cr['kind']} sans contrôle déclaré")
            if cr["kind"] == "semantic" and cr["check_ids"]:
                err(f"{lab} : critère sémantique {cr['id']} avec contrôles")
            if cr["essential"] and cr["basis"] not in ("public_brief", "corpus", "trace", "calculation"):
                err(f"{lab} : critère essentiel {cr['id']} fondé sur une base non publique ({cr['basis']})")
        for ck in rb["deterministic_checks"]:
            owner = next(cr for cr in rb["criteria"] if cr["id"] == ck["criterion_id"]) if ck["criterion_id"] in crit_ids else None
            if owner and ck["id"] not in owner["check_ids"] and ck["id"] not in any_of_members:
                err(f"{lab} : contrôle {ck['id']} orphelin (ni check_ids ni any_of)")
        # fait non communiqué : jamais essentiel
        for mode in MODES:
            v = variants.get((rb["mission_id"], mode))
            if not v:
                continue
            priv = {p["id"] for p in v["client"]["private_facts"]}
            for cr in rb["criteria"]:
                if cr["essential"] and set(cr["depends_on_facts"]) & priv:
                    err(f"{lab} : critère essentiel {cr['id']} dépend d'un fait privé non déductible ({set(cr['depends_on_facts']) & priv})")
        # tolérances M4 recalculées depuis le tableau
        for ck in rb["deterministic_checks"]:
            d = ck["params"].get("derive")
            if ck["kind"] != "number_tolerance" or not d or "table_doc" not in d:
                continue
            tbl = None
            for co in corpora.values():
                for dd in co["documents"]:
                    if dd["id"] == d["table_doc"]:
                        tbl = dd
            if not tbl:
                err(f"{lab} : table {d['table_doc']} introuvable")
                continue
            rows = tbl["data"]["rows"]
            if "numerator_col" in d:
                for t, row in zip(ck["params"]["targets"], rows):
                    calc = float(Decimal(str(row[d["numerator_col"]])) / Decimal(str(row[d["denominator_col"]])) * d["scale"])
                    calc = float(Decimal(str(calc)).quantize(Decimal(1).scaleb(-d["decimals"]), rounding=ROUND_HALF_UP))
                    if abs(calc - t["expected"]) > 1e-9:
                        err(f"{lab} : {ck['id']} {t['label']} attendu {t['expected']} mais le tableau donne {calc}")
                    if t["tolerance"] < 0.5 * 10 ** (-d["decimals"]):
                        err(f"{lab} : tolérance {t['tolerance']} < demi-unité d'arrondi")
            if "budget" in d:
                r0 = rows[d["projection_channel_row"]]
                cpa = r0[3] / r0[2]
                proj = [t for t in ck["params"]["targets"] if "Projection" in t["label"]][0]
                if abs(d["budget"] / cpa - proj["expected"]) > 1e-9:
                    err(f"{lab} : projection attendue {proj['expected']} ≠ {d['budget'] / cpa}")
    stats["grilles"] = len(rubrics)
    stats["contrôles déterministes"] = sum(len(r["deterministic_checks"]) for r in rubrics.values())
    for mid in MISSIONS:
        if f"{mid}_v1" not in rubrics:
            err(f"grille manquante : {mid}_v1")

    # --- annotés
    ann: dict[str, dict] = {}
    for ap_ in sorted((c.d / "annotated").glob("*.json")):
        a = c.load(ap_)
        if a is None or not c.validate(a, "annotated", f"annoté {ap_.name}"):
            continue
        if ap_.stem != a["id"]:
            err(f"annoté {ap_.name} : nom de fichier ≠ id")
        ann[a["id"]] = a
    check_unique([a["id"] for a in ann.values()], "annotés")
    split = {"tuning": 0, "reserved": 0}
    cover: dict[str, set] = {m: set() for m in MISSIONS}
    for a in ann.values():
        lab = f"annoté {a['id']}"
        split[a["split"]] += 1
        cover[a["mission_id"]].add(a["quality_level"])
        rb = rubrics.get(a["rubric_id"])
        if not rb or rb["mission_id"] != a["mission_id"] or a["variant"] not in rb["applies_to_variants"]:
            err(f"{lab} : grille {a['rubric_id']} invalide")
            continue
        if (a["mission_id"], a["variant"]) not in variants:
            err(f"{lab} : variante inconnue")
        if ("reserved_blind" in a["tags"]) != (a["split"] == "reserved"):
            err(f"{lab} : le tag reserved_blind doit correspondre au split « reserved »")
        if ("injection" in a["tags"]) != a["injection"]["present"]:
            err(f"{lab} : tag injection ≠ injection.present")
        exp = a["expected"]
        ratings = {}
        for cr in rb["criteria"]:
            e = exp["criteria"].get(cr["id"])
            if e is None or not isinstance(e.get("rating"), (int, float)):
                err(f"{lab} : note attendue manquante pour {cr['id']}")
                continue
            ratings[cr["id"]] = float(e["rating"])
        extra = set(exp["criteria"]) - {cr["id"] for cr in rb["criteria"]}
        if extra:
            err(f"{lab} : critères inconnus {extra}")
        if len(ratings) != len(rb["criteria"]):
            continue
        results, det = run_rubric_checks(rb, a["deliverable_text"], a["trace"])
        for cr in rb["criteria"]:
            d_ = det[cr["id"]]
            r_ = ratings[cr["id"]]
            if d_ is None:
                continue
            if exp["out_of_scope"]:
                continue
            if cr["kind"] == "deterministic" and abs(r_ - d_) > 0.01:
                err(f"{lab} : critère déterministe {cr['id']} noté {r_} mais le contrôle donne {d_:.2f}")
            if cr["kind"] == "mixed" and r_ > d_ + 0.01:
                err(f"{lab} : critère mixte {cr['id']} noté {r_} au-dessus du plafond déterministe {d_:.2f}")
        score, failed = compute_score(rb, ratings, exp["out_of_scope"])
        if score != exp["score_indicative"]:
            err(f"{lab} : score indicatif {exp['score_indicative']} ≠ recalcul {score}")
        if sorted(failed) != sorted(exp["essential_failures"]):
            err(f"{lab} : échecs essentiels attendus {exp['essential_failures']} ≠ recalcul {failed}")
        ok = score >= rb["pass_score"] and not failed
        if ok != (exp["outcome"] == "success"):
            err(f"{lab} : outcome incohérent avec le score et les essentiels")
        if a["quality_level"] == "off_topic" and not exp["out_of_scope"]:
            err(f"{lab} : hors sujet ⇒ out_of_scope vrai")
        if exp["out_of_scope"] and score != 0:
            err(f"{lab} : hors sujet ⇒ score 0")
        if a["quality_level"] == "complete" and exp["outcome"] != "success":
            err(f"{lab} : un livrable complet doit réussir")
        if a["quality_level"] in ("off_topic", "incomplete") and exp["outcome"] == "success":
            err(f"{lab} : un livrable {a['quality_level']} ne peut pas réussir")
        if a["injection"]["present"] and a["injection"]["attack"] and a["injection"]["attack"] not in a["deliverable_text"]:
            err(f"{lab} : le texte d'attaque déclaré n'apparaît pas dans le livrable")
        unknown = sorted({m for m in re.findall(r"\b(?:m[1-6]|rescue)_(?:doc|tbl|cat|priv)[a-z0-9_]*", a["deliverable_text"]) if m not in all_doc_ids})
        if unknown and "wrong_source" not in a["tags"]:
            err(f"{lab} : source inexistante citée {unknown} sans tag wrong_source")
        if "wrong_source" in a["tags"] and not unknown and a["mission_id"] != "m4":
            err(f"{lab} : tag wrong_source mais aucune source inexistante")
        if "essential_failure" in a["tags"] and not exp["essential_failures"] and not exp["out_of_scope"]:
            err(f"{lab} : tag essential_failure sans échec essentiel attendu")
    if len(ann) < 24:
        err(f"annotés : {len(ann)} < 24")
    if split["tuning"] < 18 or split["reserved"] < 6:
        err(f"annotés : réglage/réservés = {split['tuning']}/{split['reserved']} (18/6 minimum)")
    for m in MISSIONS[:6]:
        if cover[m] != set(LEVELS):
            err(f"annotés {m} : niveaux couverts {sorted(cover[m])} (4 attendus : {LEVELS})")
        if not any(a["split"] == "reserved" for a in ann.values() if a["mission_id"] == m):
            err(f"annotés {m} : aucun livrable réservé")
    inj = [a for a in ann.values() if a["injection"]["present"]]
    if len(inj) < 6:
        err(f"annotés : {len(inj)} cas d'injection (6 minimum)")
    if not any(a["split"] == "reserved" for a in inj):
        err("annotés : au moins un cas d'injection doit être réservé")
    if sum(1 for a in ann.values() if a["expected"]["essential_failures"] and not a["expected"]["out_of_scope"]) < 6:
        err("annotés : au moins 6 cas d'échec essentiel hors hors-sujet attendus")
    stats["livrables annotés"] = len(ann)
    stats["  réglage / réservés"] = f"{split['tuning']} / {split['reserved']}"
    stats["  cas d'injection"] = len(inj)

    # --- fixtures de sorties modèle
    cases = {}
    fx = c.d / "fixtures" / "model_outputs"
    for fp in sorted(fx.rglob("*.json")):
        case = c.load(fp)
        if case is None or not c.validate(case, "model_output_case", f"fixture {fp.relative_to(c.d)}"):
            continue
        cases[case["case_id"]] = case
        lab = f"fixture {case['case_id']}"
        if fp.stem != case["case_id"].split("/")[-1] or fp.parent.name != case["role"]:
            err(f"{lab} : emplacement attendu model_outputs/{case['role']}/<id>.json")
        last = case["exchange"][-1]["response"]
        role = case["role"]
        allowed = set(role_files.get(role, {}).get("allowed_tools", [])) if role_files.get(role) else set()
        for turn in case["exchange"]:
            for tc in turn["response"]["tool_calls"]:
                if tc["name"] not in allowed:
                    if not (case["scenario"] == "injection" or case["expected_server_behavior"]["output_valid"] is False):
                        err(f"{lab} : outil non autorisé {tc['name']}")
                if tc["name"] == "compute_metrics":
                    res = [r for r in turn.get("tool_results", []) if r.get("tool_call_id") == tc["id"]]
                    a_ = tc["arguments"]
                    if res and abs(res[0]["value"] - compute_metrics(a_["op"], a_["a"], a_["b"], a_["decimals"])) > 1e-9:
                        err(f"{lab} : résultat compute_metrics faux")
            if turn["response"]["duration_ms"] is not None or turn["response"]["usage"] is not None:
                err(f"{lab} : durée/usage inventés interdits (mettre null)")
        sb = case["expected_server_behavior"]
        if case["scenario"] == "failure":
            if last["status"] == "ok" or sb["billable"] or sb["message_consumed"]:
                err(f"{lab} : une panne n'est ni facturée ni comptée")
            if sb["error_code"] not in ("LLM_UNAVAILABLE", "INVALID_OUTPUT"):
                err(f"{lab} : code d'erreur stable attendu")
        elif case["scenario"] in ("success", "missing_info", "injection"):
            if last["status"] != "ok" or not sb["billable"] or not sb["message_consumed"]:
                if sb["output_valid"]:
                    err(f"{lab} : une réponse exploitable est facturée et comptée")
        # contenu structuré
        content = last["content"]
        if role in ("writer", "prospector", "researcher", "analyst", "qa") and last["status"] == "ok" and content:
            try:
                obj = json.loads(content)
            except Exception:  # noqa: BLE001
                obj = None
            if obj is None:
                if sb["output_valid"]:
                    err(f"{lab} : contenu non JSON")
            else:
                errs = schema_errors(obj, c.schemas["agent_response"])
                if bool(errs) == sb["output_valid"]:
                    err(f"{lab} : validité agent_response attendue {sb['output_valid']} : {errs[:2]}")
                if case["scenario"] == "missing_info" and obj.get("status") != "needs_info":
                    err(f"{lab} : information manquante ⇒ status needs_info")
                if case["scenario"] == "missing_info" and not obj.get("missing_info"):
                    err(f"{lab} : information manquante ⇒ missing_info non vide")
                if case["scenario"] == "success" and obj.get("status") != "ok":
                    err(f"{lab} : succès ⇒ status ok")
        if role == "lead" and last["status"] == "ok" and case["request"]["expected_schema"] == "lead_plan":
            try:
                obj = json.loads(content)
            except Exception:  # noqa: BLE001
                obj = None
            ctx = case.get("plan_context", {})
            max_steps = c.rules["quotas"]["max_plan_steps"] if c.rules else 2
            if obj is None:
                if sb["output_valid"]:
                    err(f"{lab} : plan non JSON")
            else:
                errs = schema_errors(obj, c.schemas["lead_plan"]) + plan_errors(obj, ctx, max_steps)
                if bool(errs) == sb["output_valid"]:
                    err(f"{lab} : validité du plan attendue {sb['output_valid']} mais erreurs={errs}")
        if role == "client_evaluator" and last["status"] == "ok" and content:
            aid = case.get("evaluates_annotated_id")
            a = ann.get(aid) if aid else None
            if aid and not a:
                err(f"{lab} : annoté {aid} introuvable")
                continue
            try:
                obj = json.loads(content)
            except Exception:  # noqa: BLE001
                obj = None
            if obj is None:
                if sb["output_valid"]:
                    err(f"{lab} : sortie évaluateur non JSON")
            elif a:
                rb = rubrics[a["rubric_id"]]
                errs = schema_errors(obj, c.schemas["evaluator_output"]) + evaluator_errors(obj, rb, a["deliverable_text"])
                if bool(errs) == sb["output_valid"]:
                    err(f"{lab} : validité de l'évaluation attendue {sb['output_valid']} mais erreurs={errs}")
    for role in ROLES + ["client_evaluator"]:
        for scen in ("success", "missing_info", "failure"):
            if not any(k["role"] == role and k["scenario"] == scen for k in cases.values()):
                err(f"fixtures : rôle {role}, scénario {scen} absent")
    if not any(k["scenario"] == "injection" for k in cases.values()):
        err("fixtures : aucun cas d'injection")
    if not any(k["role"] == "lead" and not k["expected_server_behavior"]["output_valid"] and k["scenario"] == "invalid_output" for k in cases.values()):
        err("fixtures : plans invalides du chef absents")
    stats["fixtures de sorties modèle"] = len(cases)

    # --- coach / bilan / parties seedées
    cd = c.load(c.d / "missions" / "_shared" / "coach_and_debrief.json")
    if cd and c.validate(cd, "coach_debrief", "coach_and_debrief.json"):
        sig = {s["id"] for s in cd["trace_signals"]}
        check_unique([s["id"] for s in cd["trace_signals"]], "signaux de trace")
        check_unique([x["id"] for x in cd["competencies"]], "compétences")
        for comp in cd["competencies"]:
            for s in comp["requires_signals"]:
                if s not in sig:
                    err(f"bilan : compétence {comp['id']} référence un signal inconnu {s}")
    sg = c.load(c.d / "missions" / "_shared" / "seeded_games.json")
    if sg:
        check_unique([g["id"] for g in sg.get("games", [])], "parties seedées")
        prices = {a["id"]: a["price"] for a in c.rules["agents"]} if c.rules else {}
        unit = {m["id"]: m["unit_price"] for m in c.rules["missions"]} if c.rules else {}
        reward = {m["id"]: m["max_reward"] for m in c.rules["missions"]} if c.rules else {}
        unlocked_by = {}
        for a_ in (c.rules["agents"] if c.rules else []):
            unlocked_by[a_["id"]] = a_["unlock_mission"]
        for g in sg.get("games", []):
            gl = f"partie seedée {g.get('id')}"
            if not isinstance(g.get("seed"), int):
                err(f"{gl} : graine entière requise")
            if g.get("mode") not in MODES:
                err(f"{gl} : mode invalide")
                continue
            cash = c.rules["initial_capital"] if c.rules else 30
            owned = {"writer"}
            done: list[str] = []
            m6_roles: set = set()
            for s in g.get("steps", []):
                if s.get("type") == "purchase":
                    r = s.get("role")
                    if r not in prices:
                        err(f"{gl} : achat d'un rôle inconnu {r}")
                        continue
                    need = unlocked_by.get(r)
                    if need and need not in done:
                        err(f"{gl} : achat de {r} avant le déblocage ({need})")
                    if cash < prices[r]:
                        err(f"{gl} : fonds insuffisants pour acheter {r} ({cash} < {prices[r]})")
                    cash -= prices[r]
                    owned.add(r)
                    continue
                mid = s.get("mission_id")
                if mid not in MISSIONS or (mid, g["mode"]) not in variants:
                    err(f"{gl} : mission/variante inconnue {mid}")
                    continue
                calls = s.get("calls", {})
                for r, n in calls.items():
                    if r not in owned:
                        err(f"{gl} : {mid} utilise {r} non possédé")
                    if n > 5:
                        err(f"{gl} : {mid} dépasse 5 messages pour {r}")
                    if r not in variants[(mid, g["mode"])]["roles_usable"]:
                        err(f"{gl} : {r} non utilisable en {mid}")
                paid = sum(calls.values()) - s.get("free_calls", 0)
                if s.get("free_calls", 0) and mid != "m5":
                    err(f"{gl} : crédit gratuit réservé à M5")
                cost = unit.get(mid, 0) * paid
                if mid == "m6":
                    if cost > 30:
                        err(f"{gl} : M6 dépense {cost} > 30")
                    m6_roles = {r for r, n in calls.items() if n > 0}
                    if len(m6_roles) < 2:
                        err(f"{gl} : M6 exige au moins 2 rôles contributeurs")
                    if done and done[-1] == "m6":
                        pass
                if cash < cost:
                    err(f"{gl} : fonds insuffisants avant {mid} ({cash} < {cost})")
                cash += -cost + (reward.get(mid, 0) * s.get("assumed_score", 0)) // 100
                done.append(mid)
            if "m6" in done and done[-1] != "m6":
                err(f"{gl} : M6 doit être la dernière mission")
            if g.get("reaches_m6") and "m6" not in done:
                err(f"{gl} : annonce M6 sans la jouer")
            if g.get("reaches_m6") and owned >= set(ROLES):
                err(f"{gl} : T12 : un parcours ne doit pas acheter tous les agents")
            if g.get("expected_final_cash") is not None and g["expected_final_cash"] != cash:
                err(f"{gl} : trésorerie finale annoncée {g['expected_final_cash']} ≠ simulation {cash}")
    stats["parties seedées"] = len(sg.get("games", [])) if sg else 0

    return report(stats)


def report(stats: dict) -> int:
    print("== Validation du contenu P3 ==")
    for k, v in stats.items():
        print(f"  {k} : {v}")
    for w in WARNINGS:
        print("AVERTISSEMENT :", w)
    if ERRORS:
        print(f"\nÉCHEC : {len(ERRORS)} erreur(s)")
        for e in ERRORS:
            print(" -", e)
        return 1
    print("\nOK : contenu valide.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
