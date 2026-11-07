"""Construction d'un prospect à partir d'un lead de rapport et de l'enregistrement de la source (API-I2).

Principe (règles 12 et 14) : **le contenu vient de l'enregistrement renvoyé par la source** (donnée serveur, minimisée par
liste blanche), pas du lead écrit par le modèle ni, bien sûr, du navigateur. Du lead on ne garde que des textes libres
courts (`signal`, `raisons_fit`, fonction visée), nettoyés et bornés. Entreprise, nom du contact, canal, date de collecte et
instantané sont recopiés de l'enregistrement ; `pertinence` et `fiabilite` sont calculées par code."""

from __future__ import annotations

import json
import re
import unicodedata
from typing import Any

from ..models import TargetProfileVersion
from ..sources_spec import SourcesSpec, clean_text

CANAL_TYPES = ("email_generique", "formulaire", "telephone_standard", "adresse", "reseau_pro")
# type de canal -> champ de l'enregistrement qui porte la valeur (jamais inventée : absente de l'enregistrement => pas de canal)
CANAL_FIELDS = {
    "email_generique": "email_generique",
    "formulaire": "site_web",
    "telephone_standard": "telephone_standard",
    "adresse": "adresse_pro",
    "reseau_pro": "profil_pro_ref",
}
_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE)
SIGNAL_MAX, FIT_MAX, FIT_ITEMS, FONCTION_MAX = 300, 120, 8, 100


def norm(text: str) -> str:
    """Forme comparable : minuscules, sans accents, espaces simples."""
    t = unicodedata.normalize("NFKD", text).casefold()
    return " ".join("".join(c for c in t if not unicodedata.combining(c)).split())


def parse_leads(content: str) -> list[dict[str, Any]] | None:
    """Leads d'un rapport (`{"leads": [...]}` ou liste), ou `None` si le contenu n'est pas un rapport structuré.
    Le contenu est une donnée non fiable : analysé comme JSON, jamais interprété."""
    try:
        data = json.loads(_FENCE.sub("", content.strip()))
    except (ValueError, TypeError):
        return None
    leads = data.get("leads") if isinstance(data, dict) else data
    if not isinstance(leads, list):
        return None
    return [x if isinstance(x, dict) else {} for x in leads]


def _text(value: Any, limit: int) -> str | None:
    if not isinstance(value, str):
        return None
    out = clean_text(value)[:limit]
    return out or None


def pick_canal(record: dict[str, Any], lead: dict[str, Any]) -> tuple[str, str] | None:
    """Canal d'après l'enregistrement. Le type préféré par le lead est honoré s'il est disponible ; la valeur est
    toujours celle de l'enregistrement (aucune coordonnée inventée par le modèle)."""
    asked = lead.get("canal")
    asked = asked.get("type") if isinstance(asked, dict) else asked
    order = ([asked] if asked in CANAL_FIELDS else []) + list(CANAL_TYPES)
    for t in order:
        v = record.get(CANAL_FIELDS[t])
        if isinstance(v, str) and v.strip():
            return t, v.strip()
    return None


def _size_range(tranche: str) -> tuple[int, int] | None:
    nums = [int(n) for n in re.findall(r"\d+", tranche)]
    if not nums:
        return None
    return (nums[0], nums[1]) if len(nums) > 1 else (nums[0], nums[0] if "+" not in tranche else 10**9)


def criteria(profile: dict[str, Any] | None, record: dict[str, Any], spec_sectors: list[dict[str, str]], has_canal: bool) -> dict[str, str]:
    """Critères structurés de la fiche cible vérifiés **par code** sur l'enregistrement : `ok` | `ko` | `inconnu`."""
    out: dict[str, str] = {"canal": "ok" if has_canal else "ko"}
    p = profile or {}
    secteurs = p.get("cible_secteurs") or []
    if secteurs:
        labels = {s["id"]: s.get("label", "") for s in spec_sectors}
        wanted = {norm(x) for s in secteurs for x in (s.replace("_", " "), labels.get(s, "")) if x}
        have = norm(" ".join(str(record.get(k, "")) for k in ("secteur", "secteur_libelle", "categorie")))
        out["secteur"] = "inconnu" if not have else ("ok" if any(w in have or have in w for w in wanted) else "ko")
    zones = [norm(z) for z in (p.get("cible_zone") or []) if isinstance(z, str)]
    if zones:
        have = norm(" ".join(str(record.get(k, "")) for k in ("ville", "region", "adresse_pro", "code_postal")))
        out["zone"] = "inconnu" if not have else ("ok" if any(z in have for z in zones) else "ko")
    size = p.get("cible_taille")
    if isinstance(size, dict) and size.get("effectif_min") is not None:
        rng = _size_range(str(record.get("effectif_tranche", "")))
        if rng is None:
            out["taille"] = "inconnu"
        else:
            out["taille"] = "ok" if rng[0] <= size["effectif_max"] and rng[1] >= size["effectif_min"] else "ko"
    excl = [norm(x) for x in (p.get("exclusions") or []) if isinstance(x, str) and x.strip()]
    if excl:
        out["exclusions"] = "ko" if any(x in norm(str(record.get("entreprise", ""))) for x in excl) else "ok"
    return out


def pertinence(crit: dict[str, str]) -> int:
    return round(100 * sum(1 for v in crit.values() if v == "ok") / len(crit)) if crit else 0


def build_prospect_fields(
    *, sources: SourcesSpec, source: str, record: dict[str, Any], lead: dict[str, Any], profile: TargetProfileVersion | None,
    spec_sectors: list[dict[str, str]], simulated: bool,
) -> dict[str, Any] | None:
    """Champs du prospect, ou `None` si l'enregistrement n'a pas les champs obligatoires de la source (non recevable)."""
    snap = sources.minimize(source, record)
    if sources.missing_required(source, snap):
        return None
    canal = pick_canal(snap, lead)
    crit = criteria(profile.data if profile is not None else None, snap, spec_sectors, canal is not None)
    fonction = snap.get("contact_fonction") or snap.get("dirigeant_fonction") or _text(lead.get("contact"), FONCTION_MAX)
    raisons = lead.get("raisons_fit")
    raisons = [t for t in (_text(x, FIT_MAX) for x in raisons) if t][:FIT_ITEMS] if isinstance(raisons, list) else []
    if simulated:
        fiabilite = "simule"
    else:  # Réel : `verifie` seulement si le canal existe et que chaque critère de la fiche cible est établi
        fiabilite = "verifie" if all(v == "ok" for v in crit.values()) else "partiel"
    return {
        "entreprise": snap["entreprise"],
        "entreprise_cle": norm(snap["entreprise"]),
        "contact_nom": snap.get("contact_nom"),
        "contact_fonction": fonction,
        "canal_type": canal[0] if canal else None,
        "canal_valeur": canal[1] if canal else None,
        "raisons_fit": raisons,
        "signal": _text(lead.get("signal"), SIGNAL_MAX),
        "pertinence": pertinence(crit),
        "fiabilite": fiabilite,
        "simule": simulated,
        "instantane": snap,
        "collecte_le": snap.get("collecte_le"),
    }
