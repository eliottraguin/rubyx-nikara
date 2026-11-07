"""Chargeur tolérant du contenu de mission (data/missions, data/rubrics).

Le contenu est rédigé par P3 (schémas : data/schemas/mission_variant, rubric, corpus). Convention de fichiers
attendue (la première trouvée gagne, version la plus haute) :
  - variante : `data/missions/<mission>_<mode>_v<N>.json` (ex. m1_beginner_v1.json), au besoin dans un sous-dossier, ou
    `data/missions/<mission>/<mode>_v<N>.json` (disposition du dépôt) ;
  - grille   : `data/rubrics/<rubric_id>.json` (ex. m1_v1.json) ;
  - corpus   : tout JSON de `data/missions/` contenant `documents` et `mission_id` égal à la mission.
Fichier absent => `None` / liste vide (mission sans contenu enrichi). Fichier présent mais invalide =>
`ContentError` (message clair, sans contenu du fichier). Seuls les champs publics sont exposés : jamais
`client.private_facts`, `reference_solution`, `hints`, ni les documents `client_private`.
Les prix, gains et seuils ne viennent jamais d'ici (data/rules/)."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from ..errors import ApiError, ErrorCode

_ID_RE = re.compile(r"^[a-z0-9][a-z0-9_]{0,40}$")
_VARIANT_RE = re.compile(r"_v(\d+)\.json$")


class ContentError(Exception):
    """Contenu de mission présent mais illisible ou invalide."""

    def to_api_error(self) -> ApiError:
        return ApiError(ErrorCode.INTERNAL_ERROR, f"Contenu de mission invalide : {self}")


class EventDef(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    type: str | None = None
    trigger: str = "after_first_proposal"
    normal_play: bool = False
    demo_selectable: bool = False
    description: str | None = None
    brief_diff: list[dict[str, Any]] = Field(default_factory=list)
    added_documents: list[str] = Field(default_factory=list)
    correction_credit: dict[str, Any] | None = None


class MissionContent(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    mission_id: str
    mode: str
    version: int = 1
    title: str | None = None
    rubric_id: str | None = None
    brief: dict[str, Any] | None = None
    corpus_refs: list[str] = Field(default_factory=list)
    events: list[EventDef] = Field(default_factory=list)

    def event(self, event_id: str) -> EventDef | None:
        return next((e for e in self.events if e.id == event_id), None)

    def public_brief(self) -> dict[str, Any] | None:
        if self.brief is None:
            return None
        return {k: v for k, v in self.brief.items() if k != "missing_on_purpose"}  # note d'auteur, pas une information joueur


def safe_id(value: str) -> str:
    if not _ID_RE.match(value):
        raise ContentError("identifiant invalide")
    return value


def _read_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise ContentError(f"{path.name} illisible") from exc


def _best_version(paths: list[Path]) -> Path | None:
    def version(p: Path) -> int:
        m = _VARIANT_RE.search(p.name)
        return int(m.group(1)) if m else 0

    return max(paths, key=version, default=None)


def load_mission_content(data_dir: Path, mission_id: str, mode: str) -> MissionContent | None:
    safe_id(mission_id)
    safe_id(mode)
    root = data_dir / "missions"
    if not root.is_dir():
        return None
    pattern = f"{mission_id}_{mode}_v*.json"
    # deux dispositions acceptées : `missions/m1_beginner_v1.json` et `missions/m1/beginner_v1.json` (contenu du dépôt)
    path = _best_version(sorted(root.glob(pattern)) or sorted(root.rglob(pattern)) or sorted((root / mission_id).glob(f"{mode}_v*.json")))
    if path is None:
        return None
    try:
        content = MissionContent.model_validate(_read_json(path))
    except ValidationError as exc:
        raise ContentError(f"{path.name} ne respecte pas le schéma de variante") from exc
    if content.mission_id != mission_id or content.mode != mode:
        raise ContentError(f"{path.name} ne correspond pas à {mission_id}/{mode}")
    return content


def load_rubric(data_dir: Path, rubric_id: str | None) -> dict[str, Any] | None:
    """Grille complète (donnée, copiée telle quelle dans la livraison). None si absente."""
    if not rubric_id:
        return None
    safe_id(rubric_id)
    root = data_dir / "rubrics"
    if not root.is_dir():
        return None
    path = root / f"{rubric_id}.json"
    if not path.is_file():
        found = sorted(root.rglob(f"{rubric_id}.json"))
        if not found:
            return None
        path = found[0]
    data = _read_json(path)
    if not isinstance(data, dict) or data.get("id") != rubric_id:
        raise ContentError(f"{path.name} ne déclare pas la grille {rubric_id}")
    return data


def load_corpus(data_dir: Path, mission_id: str, refs: list[str] | None = None) -> list[dict[str, Any]]:
    """Documents du corpus de la mission (publics uniquement), ordre des fichiers puis du fichier."""
    safe_id(mission_id)
    root = data_dir / "missions"
    if not root.is_dir():
        return []
    docs: list[dict[str, Any]] = []
    for path in sorted(root.rglob("*.json")):
        if _VARIANT_RE.search(path.name):
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue  # autre type de fichier ou fichier en cours de rédaction : ignoré ici, signalé par les outils de P3
        if not isinstance(data, dict) or data.get("mission_id") != mission_id or not isinstance(data.get("documents"), list):
            continue
        for d in data["documents"]:
            if isinstance(d, dict) and isinstance(d.get("id"), str) and isinstance(d.get("title"), str):
                docs.append(d)
    public = [d for d in docs if d.get("visibility", "public") == "public"]
    if refs:
        wanted = set(refs)
        if any(d["id"] in wanted for d in public):
            public = [d for d in public if d["id"] in wanted or d.get("added_by_event")]
    return public
