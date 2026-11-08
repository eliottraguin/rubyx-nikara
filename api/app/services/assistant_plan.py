"""Validation d'un plan d'assistant (docs/ASSISTANT.md §3 à §5). Fonctions **pures** : aucun accès base ni réseau.

Le modèle ne propose que `type`, `target_id` et `instruction`. Le code décide de tout le reste : coût (lu dans
`rules_v2`), agent exécutant, droit de faire l'étape. Deux sortes de problèmes :
- **échec** (`failures`) : le plan est inutilisable (JSON invalide, type interdit pour cet assistant, cible inconnue,
  doublon, trop d'étapes…) → une réparation, puis `INVALID_OUTPUT` sans débit ;
- **étape bloquée** (`blocked_reason`) : le plan est valable mais cette étape ne peut pas se faire maintenant (agent
  non possédé, limite atteinte, argent insuffisant) → elle est affichée grisée avec une phrase claire, le reste reste
  confirmable. Les raisons sont en français courant, sans mot technique : elles sont montrées au joueur."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any

from ..rules_v2 import RulesV2

_FENCE = re.compile(r"^```(?:json)?\s*(.*?)\s*```$", re.DOTALL)
_CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


@dataclass(frozen=True)
class PlanFacts:
    """Faits de la partie, relevés par le serveur (jamais fournis par le modèle ni le navigateur)."""

    assistant: str  # rôle de l'assistant qui répond
    owned_roles: frozenset[str]
    targets: dict[str, frozenset[str]]  # genre de cible -> ids possédés (`planet` = lieux débloqués)
    quota_left: dict[tuple[str, str], int] = field(default_factory=dict)  # (type d'étape, cible) -> restant ; absent = quota entier
    balance: int = 0  # solde disponible


@dataclass(frozen=True)
class PlanFailure:
    index: int | None  # None : le plan entier
    code: str  # stable : voir FAILURE_CODES
    detail: str  # destiné à la réparation du modèle, jamais au joueur


@dataclass(frozen=True)
class ValidatedStep:
    index: int
    type: str
    target_id: str
    instruction: str
    agent: str
    cost: int
    blocked_reason: str | None  # phrase en français courant, affichable ; None = faisable


@dataclass(frozen=True)
class ValidatedPlan:
    summary: str
    steps: list[ValidatedStep]
    failures: list[PlanFailure]

    @property
    def ok(self) -> bool:
        return not self.failures

    @property
    def total_cost(self) -> int:
        """Coût des seules étapes faisables : c'est ce que le joueur dépensera s'il confirme."""
        return sum(s.cost for s in self.steps if s.blocked_reason is None)


FAILURE_CODES = (
    "NOT_JSON", "BAD_SHAPE", "TOO_MANY_STEPS", "UNKNOWN_TYPE", "WRONG_ASSISTANT", "UNKNOWN_TARGET", "DUPLICATE", "BAD_TEXT",
)


def _clean(text: str) -> str:
    return _CONTROL.sub("", text).strip()


def _parse(content: str) -> Any:
    raw = content.strip()
    m = _FENCE.match(raw)
    if m:
        raw = m.group(1)
    try:
        return json.loads(raw)
    except (ValueError, RecursionError):
        return None


def step_cost(rules: RulesV2, step_type: str, target_id: str) -> int:
    """Coût fixé par les règles : jamais par le modèle. Une étape de recherche affiche le prix unitaire du lieu (la recherche elle-même est gratuite, API-S1)."""
    action = rules.prospect_actions.get(step_type)
    if action is not None:
        return action.cost
    return rules.planet(target_id).unit_price


def validate_plan(rules: RulesV2, facts: PlanFacts, content: str) -> ValidatedPlan:
    ar = rules.assistant
    fail = PlanFailure
    data = _parse(content)
    if data is None:
        return ValidatedPlan("", [], [fail(None, "NOT_JSON", "La réponse n'est pas un objet JSON.")])
    if not isinstance(data, dict) or not isinstance(data.get("steps"), list) or not isinstance(data.get("summary"), str):
        return ValidatedPlan("", [], [fail(None, "BAD_SHAPE", "Attendu : {summary: texte, steps: liste}.")])

    failures: list[PlanFailure] = []
    summary = _clean(data["summary"])
    if not summary or len(summary) > ar.summary_max_chars:
        failures.append(fail(None, "BAD_TEXT", f"summary : 1 à {ar.summary_max_chars} caractères."))
    raw_steps = data["steps"]
    if len(raw_steps) > ar.max_steps:
        failures.append(fail(None, "TOO_MANY_STEPS", f"Au plus {ar.max_steps} étapes."))
        raw_steps = raw_steps[: ar.max_steps]

    steps: list[ValidatedStep] = []
    seen: set[tuple[str, str]] = set()
    running = facts.balance
    for i, raw in enumerate(raw_steps):
        if not isinstance(raw, dict) or not isinstance(raw.get("type"), str) or not isinstance(raw.get("target_id"), str):
            failures.append(fail(i, "BAD_SHAPE", "Une étape = {type, target_id, instruction}."))
            continue
        # Tout champ hors {type, target_id, instruction} (coût, gain, score…) est ignoré : seul le serveur les fixe.
        st_type, target = raw["type"], raw["target_id"]
        spec = ar.step_types.get(st_type)
        if spec is None:
            failures.append(fail(i, "UNKNOWN_TYPE", f"Type d'étape inconnu : {st_type[:40]!r}."))
            continue
        if spec.assistant.value != facts.assistant:
            failures.append(fail(i, "WRONG_ASSISTANT", f"{st_type} n'est pas proposable par {facts.assistant}."))
            continue
        if target not in facts.targets.get(spec.target, frozenset()):
            failures.append(fail(i, "UNKNOWN_TARGET", f"Cible absente de la liste fournie : {target[:40]!r}."))
            continue
        if (st_type, target) in seen:
            failures.append(fail(i, "DUPLICATE", "Même étape sur la même cible deux fois."))
            continue
        seen.add((st_type, target))
        instr = raw.get("instruction", "")
        if instr is None:
            instr = ""
        if not isinstance(instr, str) or len(_clean(instr)) > ar.instruction_max_chars:
            failures.append(fail(i, "BAD_TEXT", f"instruction : texte de {ar.instruction_max_chars} caractères au plus."))
            continue
        cost = step_cost(rules, st_type, target)
        agent = spec.agent.value
        blocked: str | None = None
        quota = rules.prospect_actions[st_type].quota_per_target if st_type in rules.prospect_actions else None
        if agent not in facts.owned_roles:
            blocked = "Il vous manque l'agent qui ferait cette tâche : vous pouvez l'acheter dans votre immeuble."
        elif quota is not None and facts.quota_left.get((st_type, target), quota) <= 0:
            blocked = "Cette tâche a déjà été demandée le nombre maximal de fois pour cet élément."
        elif cost > running:
            blocked = "Vous n'avez pas assez d'argent pour cette tâche."
        else:
            running -= cost
        steps.append(ValidatedStep(i, st_type, target, _clean(instr), agent, cost, blocked))
    return ValidatedPlan(summary, steps, failures)
