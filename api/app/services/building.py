"""L'immeuble du joueur (docs/VILLE-ET-BATIMENT.md §4, API-Q1, API-S4) : niveau calculé par le serveur.

Le niveau dépend UNIQUEMENT du nombre de clients obtenus (`clients.obtained_count` : prospects distincts payés, lus dans
le ledger), jamais du total gagné ni du solde. Le compteur ne baisse jamais (écritures jamais supprimées ; repasser un
prospect de `gagne` à autre chose ne l'annule pas), donc le niveau non plus. Cosmétique : aucune règle de jeu n'en dépend."""

from __future__ import annotations

from sqlalchemy.orm import Session

from ..rules_v2 import RulesV2
from ..schemas.state import BuildingOut
from . import clients


def building_for(rules: RulesV2, n_clients: int) -> BuildingOut:
    levels = rules.building.levels
    current = max((lv for lv in levels if lv.min_clients <= n_clients), key=lambda lv: lv.level)
    nxt = next((lv for lv in levels if lv.level == current.level + 1), None)
    return BuildingOut(level=current.level, clients_obtained=n_clients, next_level_at=nxt.min_clients if nxt else None)


def building_view(db: Session, rules: RulesV2, session_id: str) -> BuildingOut:
    return building_for(rules, clients.obtained_count(db, session_id))
