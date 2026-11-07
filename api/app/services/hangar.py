"""Hangar du cap prospection (docs/RULES.md §2, 5e décision) : `scout`, `triage`, `replier`, `ads`.

Déblocage : en Tutoriel (`beginner`), meilleur score de la mission du moteur qui porte le lieu >= `unlock_min_score`
(données `rules_v2`) ; en Réel (`expert`), la condition de score est levée pour les rôles de
`real_mode_waives_score_unlock` (seul le prix reste). Calculé par le serveur ; le navigateur ne choisit rien."""

from __future__ import annotations

from sqlalchemy.orm import Session

from ..models import MissionAttempt
from ..rules_v2 import AgentRuleV2, RulesV2
from ..schemas.common import Mode
from ..schemas.state import HangarAgentView
from . import campaign


def best_scores_by_planet(db: Session, rules_v2: RulesV2, attempts: list[MissionAttempt]) -> dict[str, int]:
    best = campaign._best_scores(db, attempts)
    return {p.id: best[p.engine_mission] for p in rules_v2.planets if p.engine_mission in best}


def is_unlocked(rules_v2: RulesV2, rule: AgentRuleV2, mode: str, scores: dict[str, int]) -> bool:
    if rule.unlock_planet is None:
        return True
    if mode == Mode.EXPERT.value and rule.id in rules_v2.real_mode_waives_score_unlock:
        return True
    return scores.get(rule.unlock_planet, -1) >= (rule.unlock_min_score or 0)


def owned_hangar_roles(rules_v2: RulesV2, owned: set[str]) -> set[str]:
    """Rôles possédés : achats + rôles de départ (`scout`, gratuit, sans ligne d'achat)."""
    return set(owned) | {r.value for r in rules_v2.initial_agents}


def hangar_view(db: Session, rules_v2: RulesV2, mode: str, owned: set[str], attempts: list[MissionAttempt]) -> list[HangarAgentView]:
    scores = best_scores_by_planet(db, rules_v2, attempts)
    return [
        HangarAgentView(
            role=a.id, label=a.label, section=a.section, price=a.price, owned=a.id.value in owned or a.id in rules_v2.initial_agents,
            unlock_planet=a.unlock_planet, unlock_min_score=a.unlock_min_score,
            score_condition_waived=mode == Mode.EXPERT.value and a.id in rules_v2.real_mode_waives_score_unlock,
            unlocked=is_unlocked(rules_v2, a, mode, scores),
        )
        for a in rules_v2.agents
    ]
