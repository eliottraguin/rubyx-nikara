"""Données de la messagerie (docs/PRODUIT-CLIENTS-PUB.md §3) : personas fictives, mentions, mots-clés de désinscription,
libellés des contrôles et grilles. Tout vient de `data/clients/` et `data/rubrics/` ; aucun texte métier en dur ici.

Fonctions de texte partagées : normalisation (minuscules, sans accents, apostrophes droites) et détection de
désinscription **par le code** (mots-clés entiers, frontières de mots), qui l'emporte toujours sur le modèle."""

from __future__ import annotations

import json
import re
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


def norm(text: str) -> str:
    """Minuscules, sans accents, apostrophes typographiques remplacées, espaces réduits (comme `optout_keywords.json`)."""
    t = unicodedata.normalize("NFKD", text.replace("’", "'").replace("‘", "'").replace("«", " ").replace("»", " "))
    t = "".join(c for c in t if not unicodedata.combining(c)).lower()
    return " ".join(t.split())


def contains_phrase(normalized_text: str, normalized_phrase: str) -> bool:
    """Locution entière (frontières de mots) dans un texte déjà normalisé."""
    return re.search(rf"(?<![a-z0-9]){re.escape(normalized_phrase)}(?![a-z0-9])", normalized_text) is not None


@dataclass(frozen=True)
class Persona:
    id: str
    label: str
    objective: str
    tone: str
    traps: tuple[str, ...]
    lines: tuple[str, ...]  # opens_with puis follow_ups ; vide si silencieuse
    silent: bool
    goal_description: str
    goal_checks: tuple[str, ...]


@dataclass(frozen=True)
class RubricCheck:
    id: str
    essential: bool
    kind: str
    label: str


@dataclass
class MessagingData:
    personas: list[Persona]
    origine: str
    opposition: str
    mention_keywords: dict[str, list[str]]
    optout_keywords: list[str]
    check_labels: dict[str, dict[str, str]]
    synthese_checks: list[RubricCheck]
    reponse_checks: list[RubricCheck]
    _persona_by_id: dict[str, Persona] = field(default_factory=dict, repr=False)

    def persona(self, persona_id: str | None) -> Persona | None:
        return self._persona_by_id.get(persona_id or "")

    def detects_opt_out(self, text: str) -> bool:
        """Désinscription détectée par le code (mots-clés de `optout_keywords.json`, après normalisation)."""
        n = norm(text)
        return any(contains_phrase(n, k) for k in self.optout_keywords)

    def has_opposition(self, text: str) -> bool:
        n = norm(text)
        return any(norm(k) in n for k in self.mention_keywords.get("opposition", []))

    def has_origin(self, text: str) -> bool:
        n = norm(text)
        return any(norm(k) in n for k in self.mention_keywords.get("origine", []))

    def mentions_text(self, source: str | None, collecte_le: str | None) -> tuple[str, str]:
        origine = self.origine.replace("{source}", source or "une source publique").replace("{collecte_le}", collecte_le or "récemment")
        return origine, self.opposition


def _rubric(path: Path) -> list[RubricCheck]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    return [RubricCheck(id=c["id"], essential=bool(c["essential"]), kind=c["kind"], label=c["label"]) for c in raw["checks"]]


def load_messaging_data(data_dir: Path) -> MessagingData:
    clients = data_dir / "clients"
    personas_raw: dict[str, Any] = json.loads((clients / "personas_v1.json").read_text(encoding="utf-8"))
    mentions: dict[str, Any] = json.loads((clients / "mentions_v1.json").read_text(encoding="utf-8"))
    optout: dict[str, Any] = json.loads((clients / "optout_keywords.json").read_text(encoding="utf-8"))
    labels: dict[str, Any] = json.loads((clients / "check_labels_v1.json").read_text(encoding="utf-8"))
    personas: list[Persona] = []
    for p in personas_raw["personas"]:
        silent = bool(p["silent"])
        lines = () if silent else (p["opens_with"], *p.get("follow_ups", []))
        personas.append(
            Persona(
                id=p["id"], label=p["label"], objective=p["objective"], tone=p["tone"], traps=tuple(p["traps"]), lines=lines,
                silent=silent, goal_description=p["goal"]["description"], goal_checks=tuple(p["goal"]["checks"]),
            )
        )
    if not personas:
        raise ValueError("aucune persona de client simulé")
    data = MessagingData(
        personas=personas,
        origine=mentions["origine"],
        opposition=mentions["opposition"],
        mention_keywords=mentions["detection_keywords"],
        optout_keywords=[norm(k) for k in optout["keywords"]],
        check_labels=labels["labels"],
        synthese_checks=_rubric(data_dir / "rubrics" / "conversation_synthese_v1.json"),
        reponse_checks=_rubric(data_dir / "rubrics" / "conversation_reponse_v1.json"),
    )
    data._persona_by_id = {p.id: p for p in personas}
    return data
