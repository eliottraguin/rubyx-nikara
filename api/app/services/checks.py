"""Contrôles déterministes des leads (jalon R : le tri des doublons, hors-cible et exclusions est un contrôle PAR CODE,
jamais un rôle d'agent). Fonctions pures : aucune base, aucun réseau. Les contrôles de grille de l'ancien parcours
(`run_rubric_checks`, `compute_score`) sont retirés (6e décision, API-R2)."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

EVIDENCE_WS = re.compile(r"[\s\u00a0\u202f]+")


def norm_ws(s: str) -> str:
    return EVIDENCE_WS.sub(" ", s).strip().lower()


TRIAGE_DUPLICATE = "doublon"
TRIAGE_NO_SOURCE_REF = "sans_source_ref"
TRIAGE_OUT_OF_TARGET = "hors_cible"
TRIAGE_EXCLUDED = "exclu"


def _fold(s: Any) -> str:
    return norm_ws(s) if isinstance(s, str) else ""


@dataclass
class LeadTriage:
    kept: list[dict[str, Any]] = field(default_factory=list)
    rejected: list[tuple[dict[str, Any], str]] = field(default_factory=list)  # (lead, motif)


def triage_leads(leads: list[dict[str, Any]], target: dict[str, Any], known_refs: set[str] | None = None) -> LeadTriage:
    """Écarte, dans l'ordre : lead sans `source_ref`, doublon (même `source_ref` ou même nom+zone, y compris contre
    `known_refs`), mot d'exclusion présent dans le nom ou le secteur, secteur hors `cible_secteurs`, zone hors
    `cible_zone`. Un critère de la fiche vide ne filtre rien. Comparaison insensible à la casse et aux espaces."""
    out = LeadTriage()
    seen_refs = {_fold(r) for r in (known_refs or set())}
    seen_names: set[tuple[str, str]] = set()
    sectors = [_fold(x) for x in target.get("cible_secteurs") or []]
    zones = [_fold(x) for x in target.get("cible_zone") or []]
    banned = [_fold(x) for x in target.get("exclusions") or [] if _fold(x)]
    for lead in leads:
        ref, name, sector, zone = _fold(lead.get("source_ref")), _fold(lead.get("nom")), _fold(lead.get("secteur")), _fold(lead.get("zone"))
        if not ref:
            out.rejected.append((lead, TRIAGE_NO_SOURCE_REF))
        elif ref in seen_refs or (name and (name, zone) in seen_names):
            out.rejected.append((lead, TRIAGE_DUPLICATE))
        elif any(b in name or b in sector for b in banned):
            out.rejected.append((lead, TRIAGE_EXCLUDED))
        elif sectors and sector not in sectors:
            out.rejected.append((lead, TRIAGE_OUT_OF_TARGET))
        elif zones and not any(z in zone or zone in z for z in zones if zone):
            out.rejected.append((lead, TRIAGE_OUT_OF_TARGET))
        else:
            out.kept.append(lead)
        seen_refs.add(ref)
        if name:
            seen_names.add((name, zone))
    return out
