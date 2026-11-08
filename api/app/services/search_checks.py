"""Contrôles **par code** d'un lead du bot avant le carnet (API-S1, règles 3 et 12) : le modèle ne décide de rien.

Un lead n'est recevable que si son `source_ref` est un enregistrement renvoyé **pendant cette recherche** ; les autres
contrôles portent sur l'enregistrement de la source (donnée serveur) : fermé, périmé, hors zone, hors secteur, hors taille,
exclusions. Une valeur **inconnue** n'écarte pas (le tri de pertinence la signalera « à vérifier »). Retourne `(code, raison)`."""

from __future__ import annotations

import re
from datetime import date, timedelta
from typing import Any

from .planet_source import (
    Planet,
    SearchFilters,
    fold,
    is_open,
    sector_of,
    size_ok,
    zone_ok,
)

TEXTS = {
    "UNVERIFIED": "Référence inconnue de la source : le lieu ne l'a pas renvoyée pendant cette recherche.",
    "INCOMPLETE": "Fiche incomplète : il manque le nom de l'entreprise ou la date de collecte.",
    "DUPLICATE": "Déjà dans votre carnet ou déjà trouvée dans cette recherche.",
    "CLOSED": "Entreprise fermée ou radiée.",
    "STALE": "Information trop ancienne pour être fiable.",
    "OUT_OF_ZONE": "En dehors de votre zone.",
    "OUT_OF_SECTOR": "En dehors de vos secteurs cibles.",
    "OUT_OF_SIZE": "Taille différente de votre cible.",
    "EXCLUDED": "Correspond à l'une de vos exclusions.",
    "CARNET_FULL": "Votre carnet est plein.",
}
_LEGAL = {"sarl", "sas", "sasu", "sa", "eurl", "snc", "scop"}
_PAREN = re.compile(r"\([^)]*\)")


def dup_key(name: str) -> str:
    """Clé de rapprochement des doublons : sans accents, sans parenthèses ni forme juridique, mots triés."""
    words = re.findall(r"[a-z0-9]+", fold(_PAREN.sub(" ", name)))
    return " ".join(sorted(w for w in words if w not in _LEGAL))


def verdict(code: str) -> tuple[str, str]:
    return code, TEXTS[code]


def check_record(planet: Planet, record: dict[str, Any], profile: dict[str, Any], filters: SearchFilters, today: date, max_age_days: int) -> tuple[str, str] | None:
    """Premier contrôle en échec, ou `None` si l'enregistrement est recevable."""
    if not isinstance(record.get("entreprise"), str) or not record["entreprise"].strip() or not isinstance(record.get("collecte_le"), str):
        return verdict("INCOMPLETE")
    if not is_open(record):
        return verdict("CLOSED")
    try:
        collected = date.fromisoformat(record["collecte_le"][:10])
    except ValueError:
        return verdict("INCOMPLETE")
    if today - collected > timedelta(days=max_age_days):
        return verdict("STALE")
    if zone_ok(record, filters.zones, ("ville", "region")) is False:
        return verdict("OUT_OF_ZONE")
    sector_fields = [k for k in planet.sector_map if isinstance(record.get(k), str)]
    if filters.sectors and sector_fields and sector_of(planet, record) not in filters.sectors:
        return verdict("OUT_OF_SECTOR")
    if size_ok(planet, record.get("effectif_tranche"), filters.size) is False:
        return verdict("OUT_OF_SIZE")
    excl = [fold(x) for x in (profile.get("exclusions") or []) if isinstance(x, str) and x.strip()]
    if any(x in fold(record["entreprise"]) for x in excl):
        return verdict("EXCLUDED")
    return None
