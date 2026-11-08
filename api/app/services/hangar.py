"""Hangar du cap prospection (docs/RULES.md §2, 5e et 6e décisions) : `scout`, `triage`, `replier`, `ads` (+ assistants).

Déblocage par **clients obtenus** (API-S4) : un rôle est débloqué quand le nombre de clients obtenus atteint
`unlock_clients` (données `rules_v2`) ; en Réel (`expert`), la condition est levée pour les rôles de
`real_mode_waives_clients_unlock` (seul le prix reste). Calculé par le serveur ; le navigateur ne choisit rien."""

from __future__ import annotations

from sqlalchemy.orm import Session

from ..rules_v2 import AgentRuleV2, RulesV2
from ..schemas.common import Mode
from ..schemas.state import HangarAgentView
from . import clients


def waived(rules_v2: RulesV2, rule: AgentRuleV2, mode: str) -> bool:
    return mode == Mode.EXPERT.value and rule.id in rules_v2.real_mode_waives_clients_unlock


def is_unlocked(rules_v2: RulesV2, rule: AgentRuleV2, mode: str, clients_obtained: int) -> bool:
    if rule.unlock_clients is None or waived(rules_v2, rule, mode):
        return True
    return clients_obtained >= rule.unlock_clients


def unlock_condition(rule: AgentRuleV2) -> str | None:
    """Phrase simple affichée au joueur ; null si le rôle est disponible d'emblée."""
    n = rule.unlock_clients
    if n is None:
        return None
    noun = "client" if n == 1 else "clients"
    if rule.id.value == "triage":
        what = "ce trieur"
    elif rule.id.value == "replier":
        what = "ce rédacteur"
    elif rule.id.value == "ads":
        what = "ce directeur de campagne"
    else:
        what = "cet agent"
    return f"Obtenez {n} {noun} pour débloquer {what}"


def owned_hangar_roles(rules_v2: RulesV2, owned: set[str]) -> set[str]:
    """Rôles possédés : achats + rôles de départ (`scout`, gratuit, sans ligne d'achat)."""
    return set(owned) | {r.value for r in rules_v2.initial_agents}


def hangar_view(db: Session, rules_v2: RulesV2, mode: str, owned: set[str], session_id: str) -> list[HangarAgentView]:
    n = clients.obtained_count(db, session_id)
    return [
        HangarAgentView(
            role=a.id, label=a.label, section=a.section, price=a.price, owned=a.id.value in owned or a.id in rules_v2.initial_agents,
            unlock_clients=a.unlock_clients, unlock_condition=unlock_condition(a),
            clients_condition_waived=waived(rules_v2, a, mode),
            unlocked=is_unlocked(rules_v2, a, mode, n),
        )
        for a in rules_v2.agents
    ]
