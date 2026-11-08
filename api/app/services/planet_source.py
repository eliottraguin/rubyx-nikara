"""Sources de lieux (API-S1). `SimulatedPlanetSource` lit `data/planets/<id>/` (planet.json + corpus.json, validés par
`data/schemas/planet*.schema.json`) : corpus fictif du Tutoriel. Seule cette couche interroge une source (règle 12) ;
aucun scraping. Le mode Réel n'a pas d'adaptateur : la recherche échoue en `LLM_UNAVAILABLE`.

Filtres : ceux de `operations_autorisees`, remplis d'après la fiche du joueur (zone, secteurs, taille) ; un filtre dont le piège
correspondant figure dans `pieges_inclus` de la variante est **relâché** (annuaire imprécis : le code écarte ensuite les
hors-zone, fermés, etc.). Les enregistrements sont bornés par `max_resultats` de la variante et rendus dans un ordre
déterministe. La valeur renvoyée est une copie : le corpus n'est jamais modifié."""

from __future__ import annotations

import hashlib
import json
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Protocol

import jsonschema

VARIANT = {"beginner": "beginner", "expert": "expert"}
# piège de la variante -> nom du filtre qu'il relâche, par lieu
RELAX = {"hors_zone": {"ville", "region"}, "ferme_ou_radie": {"statut", "statut_actif"}, "taille_voisine": {"effectif_tranche"}, "secteur_voisin": {"secteur", "secteur_code"}}
SECTOR_FILTERS = ("secteur", "secteur_code")


def fold(text: Any) -> str:
    t = unicodedata.normalize("NFKD", str(text)).casefold()
    return " ".join("".join(c for c in t if not unicodedata.combining(c)).split())


@dataclass(frozen=True)
class Planet:
    id: str
    label: str
    description: str
    source: str
    spec: dict[str, Any]  # planet.json
    records: list[dict[str, Any]]
    date_reference: str

    def variant(self, mode: str) -> dict[str, Any]:
        return self.spec["variantes"][VARIANT.get(mode, "beginner")]

    @property
    def sector_map(self) -> dict[str, dict[str, str]]:
        return self.spec.get("correspondance_secteurs", {})

    @property
    def unlock(self) -> dict[str, Any]:
        return self.spec["deblocage"]


@dataclass(frozen=True)
class SearchFilters:
    """Ce que la fiche du joueur demande, déjà normalisé (voir `filters_from_profile`)."""

    zones: list[str] = field(default_factory=list)
    sectors: list[str] = field(default_factory=list)  # identifiants de secteurs de la fiche
    size: tuple[int, int] | None = None


class PlanetSource(Protocol):
    simulated: bool

    def planet(self, planet_id: str) -> Planet | None: ...

    def planet_ids(self) -> list[str]: ...

    def search(self, planet: Planet, mode: str, filters: SearchFilters) -> list[dict[str, Any]]: ...


def filters_from_profile(profile: dict[str, Any]) -> SearchFilters:
    size = profile.get("cible_taille")
    rng = (int(size["effectif_min"]), int(size["effectif_max"])) if isinstance(size, dict) and size.get("effectif_min") is not None and size.get("effectif_max") is not None else None
    return SearchFilters(
        zones=[z for z in (profile.get("cible_zone") or []) if isinstance(z, str) and z.strip()],
        sectors=[s for s in (profile.get("cible_secteurs") or []) if isinstance(s, str)],
        size=rng,
    )


def tranche_range(planet: Planet, label: Any) -> tuple[int, int | None] | None:
    for t in planet.spec.get("tranches_effectif", []):
        if t["label"] == label:
            return int(t["min"]), (None if t.get("max") is None else int(t["max"]))
    return None


def size_ok(planet: Planet, label: Any, size: tuple[int, int] | None) -> bool | None:
    """`True` / `False` ; `None` si la taille est inconnue (tranche absente ou inconnue du lieu)."""
    if size is None:
        return True
    rng = tranche_range(planet, label)
    if rng is None:
        return None
    lo, hi = rng
    return lo <= size[1] and (hi is None or hi >= size[0])


def sector_of(planet: Planet, record: dict[str, Any]) -> str | None:
    """Identifiant de secteur de la fiche correspondant à l'enregistrement (table `correspondance_secteurs` du lieu)."""
    for field_name, table in planet.sector_map.items():
        v = record.get(field_name)
        if isinstance(v, str) and v in table:
            return table[v]
    return None


def zone_ok(record: dict[str, Any], zones: list[str], fields: tuple[str, ...]) -> bool | None:
    if not zones:
        return True
    have = [fold(record[f]) for f in fields if isinstance(record.get(f), str)]
    if not have:
        return None
    wanted = {fold(z) for z in zones}
    return any(h in wanted for h in have)


def is_open(record: dict[str, Any]) -> bool:
    if "statut_actif" in record:
        return record["statut_actif"] is True
    return record.get("statut", "ouvert") == "ouvert"


def _order_key(planet_id: str, record: dict[str, Any]) -> str:
    return hashlib.sha256(f"{planet_id}:{record['record_id']}".encode()).hexdigest()


def load_planet(base: Path, planet_id: str, schemas: Path) -> Planet:
    spec = json.loads((base / planet_id / "planet.json").read_text(encoding="utf-8"))
    corpus = json.loads((base / planet_id / spec["corpus"]).read_text(encoding="utf-8"))
    jsonschema.Draft202012Validator(json.loads((schemas / "planet.schema.json").read_text(encoding="utf-8"))).validate(spec)
    jsonschema.Draft202012Validator(json.loads((schemas / "planet_corpus.schema.json").read_text(encoding="utf-8"))).validate(corpus)
    if spec["id"] != planet_id or corpus["planet_id"] != planet_id:
        raise ValueError(f"lieu {planet_id} : identifiants incohérents")
    return Planet(planet_id, spec["label"], spec["description"], spec["source"], spec, list(corpus["records"]), corpus["date_reference"])


class SimulatedPlanetSource:
    """Corpus fictif des lieux (Tutoriel). Les lieux sans dossier `data/planets/<id>/` sont simplement absents."""

    simulated = True

    def __init__(self, data_dir: Path):
        base = data_dir / "planets"
        schemas = data_dir / "schemas"
        self._planets: dict[str, Planet] = {}
        if base.is_dir():
            for d in sorted(p for p in base.iterdir() if (p / "planet.json").is_file()):
                self._planets[d.name] = load_planet(base, d.name, schemas)

    def planet(self, planet_id: str) -> Planet | None:
        return self._planets.get(planet_id)

    def planet_ids(self) -> list[str]:
        return list(self._planets)

    def search(self, planet: Planet, mode: str, filters: SearchFilters) -> list[dict[str, Any]]:
        op = next(o for o in planet.spec["operations_autorisees"] if o["id"] == "search")
        variant = planet.variant(mode)
        names = {f["name"] for f in op["filtres"]}
        relaxed: set[str] = set()
        for piege in variant.get("pieges_inclus", []):
            relaxed |= RELAX.get(piege, set())
        out: list[dict[str, Any]] = []
        for rec in planet.records:
            if self._matches(planet, rec, names - relaxed, filters):
                out.append(dict(rec))
        out.sort(key=lambda r: _order_key(planet.id, r))
        return out[: min(int(variant["max_resultats"]), int(op["max_resultats"]))]

    @staticmethod
    def _matches(planet: Planet, rec: dict[str, Any], active: set[str], f: SearchFilters) -> bool:
        if {"ville", "region"} & active and f.zones and zone_ok(rec, f.zones, tuple(n for n in ("ville", "region") if n in active)) is not True:
            return False
        if set(SECTOR_FILTERS) & active and f.sectors and sector_of(planet, rec) not in f.sectors:
            return False
        if "effectif_tranche" in active and f.size is not None and size_ok(planet, rec.get("effectif_tranche"), f.size) is not True:
            return False
        if "statut" in active and rec.get("statut", "ouvert") != "ouvert":
            return False
        return not ("statut_actif" in active and rec.get("statut_actif", True) is not True)
