"""L'immeuble du joueur (docs/VILLE-ET-BATIMENT.md §4, API-Q1) : niveau calculé par le serveur depuis le ledger.

Total gagné = somme des **paiements d'expédition** (catégorie `reward`, écritures POSTED). Sont exclus par
construction : le capital de départ (`initial_capital`), les achats et coûts d'actions (négatifs), les
remboursements, les actions sans gain (aucune écriture `reward`). Les écritures `reward` sont toutes >= 0 (paiement
différentiel) et ne sont jamais supprimées : le total, donc le niveau, ne baisse jamais, même après un achat.
Une source unique par livraison (`reward:<planète>:<livraison>`) fait qu'un paiement rejoué n'est compté qu'une fois.
Cosmétique : aucune règle de jeu ne dépend de ce niveau."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import LedgerEntry
from ..rules_v2 import RulesV2
from ..schemas.state import BuildingOut
from . import ledger


def total_earned(db: Session, session_id: str) -> int:
    return db.scalar(
        select(func.coalesce(func.sum(LedgerEntry.amount), 0)).where(
            LedgerEntry.session_id == session_id,
            LedgerEntry.category == ledger.CATEGORY_REWARD,
            LedgerEntry.state == "POSTED",
            LedgerEntry.amount > 0,
        )
    )


def building_for(rules: RulesV2, total: int) -> BuildingOut:
    levels = rules.building.levels
    current = max((lv for lv in levels if lv.min_total_earned <= total), key=lambda lv: lv.level)
    nxt = next((lv for lv in levels if lv.level == current.level + 1), None)
    return BuildingOut(level=current.level, total_earned=total, next_level_at=nxt.min_total_earned if nxt else None)


def building_view(db: Session, rules: RulesV2, session_id: str) -> BuildingOut:
    return building_for(rules, total_earned(db, session_id))
