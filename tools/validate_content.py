#!/usr/bin/env python3
"""Validation d'intégrité du contenu (rôles du hangar, outils, rules_v2, fiche entreprise et cible, sources, clients, pub).

Bibliothèque standard uniquement. Usage : python3 tools/validate_content.py [--root CHEMIN]
Code de sortie 0 si tout est valide, 1 sinon. Aucun appel réseau, aucun secret lu.

L'ancien contenu M1–M6 (missions, grilles de livraison, rapports annotés, rôles `writer`…`lead`, client évaluateur, coach)
est retiré (6e décision, API-R2) : ce script ne valide plus que le contenu du cap prospection.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

# Rôles du hangar (rules_v2) : un fichier `data/roles/<id>.json` chacun.
NEW_ROLES = ["triage", "replier", "ads"]
ASSISTANTS = ["assistant_prospection", "assistant_clients", "assistant_pub"]
V2_ROLES = ["scout"] + NEW_ROLES + ASSISTANTS
PROSPECT_RUBRICS = ["prospect_fiche_v1", "prospect_message_v1", "conversation_synthese_v1", "conversation_reponse_v1", "ad_kit_v1"]
SOURCES = ["annuaire", "registre", "carte-locale", "linkedin", "glassdoor"]

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
    for need in ["role", "tools", "agent_response", "corpus",
                 "rules_v2", "target_profile_spec", "target_profile_example", "source_whitelist", "personas", "ads_formats",
                 "ads_checklist", "prospect_rubric"]:
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
    role_files = {}
    for rid in V2_ROLES:
        p = c.d / "roles" / f"{rid}.json"
        if not p.exists():
            err(f"rôle manquant : data/roles/{rid}.json")
            continue
        role_files[rid] = c.load(p)
    for rid, r in role_files.items():
        if r is None or not c.validate(r, "role", f"rôle {rid}"):
            continue
        if r["id"] != rid:
            err(f"rôle {rid} : id interne différent ({r['id']})")
        if rid in ASSISTANTS:
            continue  # gabarit des assistants validé par leur propre ticket (docs/ASSISTANT.md)
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
    for t in tool_ids.values():
        for rid in t["roles"]:
            if rid in role_files and role_files[rid] and t["id"] not in role_files[rid].get("allowed_tools", []):
                err(f"outil {t['id']} déclaré pour {rid} mais absent du fichier de rôle")
    stats["rôles"] = len(role_files)
    stats["outils"] = len(tool_ids)

    validate_prospect_content(c, role_files, stats)

    return report(stats)


# --------------------------------------------------------------------------- Cap prospection (rules_v2 et données associées)
def validate_prospect_content(c: Ctx, role_files: dict, stats: dict) -> None:
    def load(rel: str, schema: str):
        p = c.d / rel
        if not p.exists():
            err(f"fichier manquant : data/{rel}")
            return None
        o = c.load(p)
        return o if o is not None and c.validate(o, schema, f"data/{rel}") else None

    # --- rules_v2
    r2 = load("rules/rules_v2.json", "rules_v2")
    r1 = c.rules
    prices: dict[str, int] = {}
    if r2:
        ids = [a["id"] for a in r2["agents"]]
        check_unique(ids, "agents rules_v2")
        if set(ids) != set(V2_ROLES):
            err(f"rules_v2 : agents attendus {sorted(V2_ROLES)}, obtenus {sorted(ids)}")
        prices = {a["id"]: a["price"] for a in r2["agents"]}
        expected = {"scout": 0, "triage": 35, "replier": 45, "ads": 50, "assistant_prospection": 0, "assistant_clients": 0, "assistant_pub": 0}
        if prices != expected:
            err(f"rules_v2 : prix des rôles inattendus {prices}")
        if not set(r2["initial_agents"]) <= set(ids):
            err("rules_v2 : agent initial inconnu")
        pids = [p["id"] for p in r2["planets"]]
        check_unique(pids, "planètes rules_v2")
        for p in r2["planets"]:
            if p["requires_pass"] is not None and p["requires_pass"] not in pids:
                err(f"rules_v2 : planète {p['id']} dépend d'une planète inconnue ({p['requires_pass']})")
        for a in r2["agents"]:
            if a["id"] in r2["real_mode_waives_clients_unlock"] and a["unlock_clients"] is None:
                err(f"rules_v2 : {a['id']} n'a pas de condition de clients à lever")
        if r1:
            ms = {m["id"] for m in r1["missions"]}
            for p in r2["planets"]:
                if p["engine_mission"] not in ms:
                    err(f"rules_v2 : planète {p['id']} : mission moteur inconnue ({p['engine_mission']})")
        for k, act_ in r2["prospect_actions"].items():
            if act_["role"] not in ids:
                err(f"rules_v2 : action {k} : rôle inconnu")
        lv = r2["building"]["levels"]
        if [x["level"] for x in lv] != list(range(1, len(lv) + 1)):
            err("rules_v2 : building.levels doit numéroter 1..n sans trou")
        th = [x["min_clients"] for x in lv]
        if th[0] != 0 or any(b <= a for a, b in zip(th, th[1:])):
            err("rules_v2 : building.levels doit commencer à 0 et croître strictement")
        if r2["messaging"]["send_per_hour"] > r2["messaging"]["send_per_day"]:
            err("rules_v2 : messaging.send_per_hour > send_per_day")
        if r2["retention_notice_days"] >= r2["retention_days"]:
            err("rules_v2 : retention_notice_days doit être inférieur à retention_days")
        if r1:  # ne casse pas rules_v1 : économie, quotas et limites communs identiques
            for sec in ("quotas",):
                if r2[sec] != r1[sec]:
                    err(f"rules_v2.{sec} diverge de rules_v1")
            for k, v in r1["limits"].items():
                if r2["limits"].get(k) != v:
                    err(f"rules_v2.limits.{k} diverge de rules_v1")
            if r2["initial_capital"] != r1["initial_capital"]:
                err("rules_v2 : capital initial divergent de rules_v1")
    stats["rules_v2"] = 1 if r2 else 0

    # --- rôles du cap prospection : prix et cohérence
    for rid in NEW_ROLES:
        r = role_files.get(rid)
        if not r:
            continue
        if rid == "replier" and {x["action"] for x in r.get("actions", [])} != {"prospect_profile", "prospect_message", "conversation_reply"}:
            err("rôle replier : une section par action attendue (prospect_profile, prospect_message, conversation_reply)")
        if r["allowed_tools"] or r["clarification_requests"]["allowed"]:
            err(f"rôle {rid} : aucun outil ni clarification au MVP")
        if "envoi" not in r["system_instructions"] and "publication" not in r["system_instructions"]:
            err(f"rôle {rid} : la règle « aucun envoi ni publication » est absente")

    # --- fiche entreprise et cible
    spec = load("profile/target_profile_v1.json", "target_profile_spec")
    sector_ids: set[str] = set()
    n_ex = 0
    if spec:
        sector_ids = {s["id"] for s in spec["sectors"]}
        check_unique([s["id"] for s in spec["sectors"]], "secteurs")
        for k, f in spec["fields"].items():
            if f["type"] == "list" and f.get("min_items", 0) > f.get("max_items", 0):
                err(f"profil : bornes incohérentes pour {k}")
            if f["type"] == "text" and f.get("min_chars", 0) > f["max_chars"]:
                err(f"profil : bornes incohérentes pour {k}")
        if spec["fields"]["ton"].get("default") not in spec["fields"]["ton"].get("values", []):
            err("profil : ton par défaut hors énumération")
        if set(spec["ton_labels"]) != set(spec["fields"]["ton"]["values"]):
            err("profil : ton_labels ne couvre pas exactement les tons")
        exs = sorted((c.d / "profile" / "examples").glob("*.json"))
        if len(exs) < 2:
            err("profil : au moins 2 fiches d'exemple attendues")
        ids_ex = []
        for p in exs:
            e = c.load(p)
            if e is None or not c.validate(e, "target_profile_example", f"fiche {p.name}"):
                continue
            n_ex += 1
            ids_ex.append(e["id"])
            if e["id"] != p.stem:
                err(f"fiche {p.name} : id différent du nom de fichier")
            F = spec["fields"]
            for k in ("entreprise_nom", "offre", "besoin"):
                if not (F[k].get("min_chars", 0) <= len(e[k]) <= F[k]["max_chars"]):
                    err(f"fiche {p.name} : {k} hors bornes")
            for k in ("cible_secteurs", "cible_zone", "cible_fonctions", "exclusions"):
                f = F[k]
                if not (f["min_items"] <= len(e[k]) <= f["max_items"]):
                    err(f"fiche {p.name} : {k} hors bornes ({len(e[k])})")
                if any(len(x) > f["item_max_chars"] for x in e[k]):
                    err(f"fiche {p.name} : élément trop long dans {k}")
            for s in e["cible_secteurs"]:
                if s not in sector_ids:
                    err(f"fiche {p.name} : secteur hors liste courte ({s})")
            t = e["cible_taille"]
            if not (F["cible_taille"]["min_value"] <= t["effectif_min"] <= t["effectif_max"] <= F["cible_taille"]["max_value"]):
                err(f"fiche {p.name} : cible_taille hors bornes")
            if e["ton"] not in F["ton"]["values"]:
                err(f"fiche {p.name} : ton inconnu")
        check_unique(ids_ex, "fiches d'exemple")
    stats["fiches d'exemple"] = n_ex

    # --- sources : liste blanche
    n_src = 0
    for sid in SOURCES:
        s = load(f"sources/{sid}.json", "source_whitelist")
        if not s:
            continue
        n_src += 1
        if s["id"] != sid:
            err(f"source {sid} : id interne différent")
        names = [f["name"] for f in s["allowed_fields"]]
        check_unique(names, f"champs de {sid}")
        for rq in s["required_fields"]:
            if rq not in names:
                err(f"source {sid} : champ obligatoire hors liste blanche ({rq})")
        for ex_ in s["always_excluded"]:
            if ex_ in names:
                err(f"source {sid} : champ exclu présent dans la liste blanche ({ex_})")
        for banned in ("date_naissance", "adresse_personnelle", "photo", "email_personnel", "telephone_personnel"):
            if banned not in s["always_excluded"]:
                err(f"source {sid} : {banned} doit rester exclu")
    stats["sources (liste blanche)"] = n_src

    # --- clients : mots-clés de désinscription, mentions, personas
    ok = c.load(c.d / "clients" / "optout_keywords.json") if (c.d / "clients" / "optout_keywords.json").exists() else None
    if ok is None:
        err("data/clients/optout_keywords.json manquant")
    else:
        kws = ok.get("keywords", [])
        if len(kws) < 5 or not all(isinstance(k, str) and k == k.strip().lower() and k for k in kws):
            err("optout_keywords : mots-clés absents ou non normalisés (minuscules)")
        check_unique(kws, "mots-clés de désinscription")
        if ok.get("code_overrides_model") is not True:
            err("optout_keywords : le code doit l'emporter sur le modèle")
    mp = c.d / "clients" / "mentions_v1.json"
    if not mp.exists():
        err("data/clients/mentions_v1.json manquant")
    else:
        m = c.load(mp)
        if m and not all(isinstance(m.get(k), str) and m[k] for k in ("origine", "opposition")):
            err("mentions_v1 : textes d'origine et d'opposition requis")
    pers = load("clients/personas_v1.json", "personas")
    if pers:
        check_unique([p["id"] for p in pers["personas"]], "personas")
        if not 8 <= len(pers["personas"]) <= 10:
            err("personas : 8 à 10 attendues")
        cat = set(pers["check_catalog"])
        traps = {t for p in pers["personas"] for t in p["traps"]}
        for need in ("price_not_in_profile", "budget_objection", "opt_out_request", "off_topic", "prompt_injection", "hostile", "silence"):
            if need not in traps:
                err(f"personas : piège manquant ({need})")
        for p in pers["personas"]:
            for k in p["goal"]["checks"]:
                if k not in cat:
                    err(f"persona {p['id']} : contrôle inconnu {k}")
            if not p["silent"] and not p["opens_with"]:
                err(f"persona {p['id']} : message d'ouverture requis")
    stats["personas"] = len(pers["personas"]) if pers else 0

    # --- pub
    fm = load("ads/formats.json", "ads_formats")
    ck = load("ads/checklist.json", "ads_checklist")
    check_ids: set[str] = set()
    if fm:
        check_unique([p["id"] for p in fm["plateformes"]], "plateformes")
        if {p["id"] for p in fm["plateformes"]} != {"linkedin", "meta", "google_search", "local", "email"}:
            err("ads : plateformes attendues linkedin, meta, google_search, local, email")
        if fm["verified"] is not False:
            err("ads/formats : `verified` doit rester false tant que les limites ne sont pas vérifiées à la source")
        for p in fm["plateformes"]:
            for f_ in p["formats"]:
                check_unique([x["id"] for x in f_["fields"]], f"champs {p['id']}/{f_['id']}")
                for x in f_["fields"]:
                    if "count" in x and x["count"]["min"] > x["count"]["max"]:
                        err(f"ads : count incohérent pour {p['id']}/{f_['id']}/{x['id']}")
    if ck:
        check_unique([i["id"] for i in ck["items"]], "checklist")
        check_ids = {i["id"] for i in ck["items"]}
        plats = {p["id"] for p in fm["plateformes"]} if fm else set()
        for i in ck["items"]:
            pl = i["platforms"]
            if pl != "all" and not (isinstance(pl, list) and set(pl) <= plats):
                err(f"checklist {i['id']} : plateformes invalides")

    # --- grilles de contrôles par code
    n_rub = 0
    role_by_rub = {"prospect_fiche_v1": "replier", "prospect_message_v1": "replier", "conversation_synthese_v1": "triage",
                   "conversation_reponse_v1": "replier", "ad_kit_v1": "ads"}
    for rid in PROSPECT_RUBRICS:
        rb = load(f"rubrics/{rid}.json", "prospect_rubric")
        if not rb:
            continue
        n_rub += 1
        if rb["id"] != rid or rb["role"] != role_by_rub[rid]:
            err(f"grille {rid} : id ou rôle incohérent")
        check_unique([k["id"] for k in rb["checks"]], f"contrôles de {rid}")
        if not any(k["essential"] for k in rb["checks"]):
            err(f"grille {rid} : au moins un contrôle essentiel attendu")
        if r2:
            act_ = r2["prospect_actions"][rb["action"]]
            if act_["role"] != rb["role"]:
                err(f"grille {rid} : rôle différent de rules_v2.prospect_actions.{rb['action']}.role")
            if rb["quota"]["per_target"] != act_["quota_per_target"] or rb["quota"]["target"] != act_["target"]:
                err(f"grille {rid} : quota différent de rules_v2.prospect_actions")
        for k in rb["checks"]:
            lk = k["params"].get("limit_key")
            if lk and r2:
                cur = r2
                for part in lk.split("."):
                    cur = cur.get(part) if isinstance(cur, dict) else None
                if not isinstance(cur, int):
                    err(f"grille {rid}/{k['id']} : limit_key inconnu {lk}")
            sf = k["params"].get("source_file")
            if sf and not (c.root / sf).exists():
                err(f"grille {rid}/{k['id']} : source_file introuvable {sf}")
        if rid == "ad_kit_v1":
            for need in ("texts_char_limits", "checklist_from_data", "no_new_fact"):
                if not any(k["id"] == need and k["essential"] for k in rb["checks"]):
                    err(f"grille ad_kit_v1 : contrôle essentiel manquant {need}")
        if rid in ("prospect_message_v1", "conversation_reponse_v1"):
            if not any(k["id"] == "mention_opposition" and k["essential"] for k in rb["checks"]):
                err(f"grille {rid} : mention d'opposition essentielle attendue")
    stats["grilles de contrôles (prospect)"] = n_rub


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
