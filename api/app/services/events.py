"""Événements versionnés (docs/RULES.md §6) : nouvelle version du brief + diff, crédit de correction.

Les définitions d'événements viennent du contenu de mission (P3). Le serveur décide de tout le reste :
  - chaque événement appliqué crée la version de brief `courante + 1` (comparaison atomique, jamais de saut ni de doublon) ;
  - un événement ne s'applique qu'une fois par tentative (unicité `(attempt, event)`) ;
  - le crédit de correction rend UN message gratuit par rôle concerné, une seule fois par rôle et par tentative ;
    il ne crée jamais de 6e message : le message gratuit compte dans le quota de 5 (c'est BE04 qui consomme le crédit).

Stockage du crédit sans migration : clés réservées dans `MissionAttempt.message_counts` (les clés de rôle restent
les compteurs de messages) : `credit:<rôle>` = 1 tant que le message gratuit n'est pas consommé,
`credit_granted:<rôle>` = 1 dès l'octroi (empêche tout second crédit pour ce rôle)."""

from __future__ import annotations

import copy

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..errors import ApiError, ErrorCode
from ..models import ActionRun, AppliedEvent, MissionAttempt
from ..rules import Rules
from ..schemas.campaign import AppliedEventView, BriefChange, BriefDiffItem, BriefView
from ..schemas.common import Role
from .missions import EventDef, MissionContent

CREDIT = "credit:"
GRANTED = "credit_granted:"

TRIGGERS_AT_START = {"mission_start", "before_first_action"}
TRIGGER_FIRST_PROPOSAL = "after_first_proposal"


def role_counts(attempt: MissionAttempt) -> dict[str, int]:
    """Compteurs de messages par rôle (sans les clés réservées du crédit)."""
    return {k: v for k, v in (attempt.message_counts or {}).items() if ":" not in k and isinstance(v, int)}


def free_credit_roles(attempt: MissionAttempt) -> list[Role]:
    counts = attempt.message_counts or {}
    return [r for r in Role if counts.get(CREDIT + r.value, 0) > 0]


def has_correction_credit(attempt: MissionAttempt, role: str) -> bool:
    return (attempt.message_counts or {}).get(CREDIT + role, 0) > 0


def credit_in_flight(db: Session, attempt_id: str, role: str) -> bool:
    """Vrai si une action encore en cours (réservée ou en exécution) détient déjà le message gratuit de ce rôle.
    Le crédit n'est consommé qu'au règlement d'une réponse exploitable ; cette garde empêche deux envois
    simultanés (réservés sous verrou d'écriture, donc en série) d'être gratuits tous les deux."""
    rows = db.scalars(select(ActionRun).where(ActionRun.attempt_id == attempt_id, ActionRun.status.in_(("RESERVED", "RUNNING"))))
    for action in rows:
        for step in action.steps or []:
            if step.get("free_credit") and step.get("role") == role and step.get("status") in ("PENDING", "RUNNING"):
                return True
    return False


def free_message_applies(db: Session, attempt: MissionAttempt, role: str) -> bool:
    """Le prochain message à ce rôle est gratuit : crédit de correction disponible et pas déjà engagé ailleurs."""
    return has_correction_credit(attempt, role) and not credit_in_flight(db, attempt.id, role)


def consume_correction_credit(attempt: MissionAttempt, role: str) -> bool:
    """Marque le message gratuit du rôle comme consommé (sans commit). Retourne False s'il n'y a pas de crédit.
    Le message compte quand même dans le quota de 5 : le crédit n'ajoute jamais de message."""
    if not has_correction_credit(attempt, role):
        return False
    attempt.message_counts = {**attempt.message_counts, CREDIT + role: 0}
    return True


def applied_events(db: Session, attempt_id: str) -> list[AppliedEvent]:
    return list(
        db.scalars(select(AppliedEvent).where(AppliedEvent.attempt_id == attempt_id).order_by(AppliedEvent.brief_version))
    )


def _diff_items(raw: list[dict]) -> list[BriefDiffItem]:
    items = []
    for d in raw:
        if isinstance(d, dict) and "field" in d:
            items.append(BriefDiffItem(field=str(d["field"]), before=str(d.get("before", "")), after=str(d.get("after", ""))))
    return items


def _apply_diff(brief: dict, diffs: list[BriefDiffItem]) -> None:
    facts = brief.get("facts") if isinstance(brief.get("facts"), list) else []
    for d in diffs:
        name = d.field
        if isinstance(brief.get(name), str):
            brief[name] = d.after
            continue
        if name == "constraints" and isinstance(brief.get("constraints"), list):
            cons = brief["constraints"]
            if d.before in cons:
                cons[cons.index(d.before)] = d.after
            elif d.after:
                cons.append(d.after)
            continue
        fact_id = name.split(".", 1)[1] if name.startswith("facts.") else name
        for fact in facts:
            if isinstance(fact, dict) and fact.get("id") == fact_id:
                fact["value"] = d.after


def build_brief(attempt: MissionAttempt, content: MissionContent | None, applied: list[AppliedEvent]) -> BriefView:
    changes: list[BriefChange] = []
    brief = copy.deepcopy(content.public_brief()) if content else None
    for row in applied:
        ev = content.event(row.event_id) if content else None
        diff = _diff_items(ev.brief_diff) if ev else []
        changes.append(
            BriefChange(
                version=row.brief_version,
                event_id=row.event_id,
                type=ev.type if ev else None,
                description=ev.description if ev else None,
                diff=diff,
            )
        )
        if brief is not None:
            _apply_diff(brief, diff)
    if brief is not None:
        brief["version"] = attempt.brief_version
    return BriefView(version=attempt.brief_version, content=brief, changes=changes)


def _grant_credits(rules: Rules, attempt: MissionAttempt, ev: EventDef) -> list[Role]:
    if ev.correction_credit is None:
        return []
    quota = rules.quotas.messages_per_agent_per_attempt
    only = ev.correction_credit.get("roles")
    counts = dict(attempt.message_counts or {})
    credited: list[Role] = []
    for role in Role:
        if isinstance(only, list) and role.value not in only:
            continue
        used = counts.get(role.value, 0)
        # rôle concerné = déjà sollicité dans cette tentative ET il lui reste au moins un message
        if not isinstance(used, int) or not (1 <= used < quota):
            continue
        if counts.get(GRANTED + role.value):
            continue  # au plus un crédit par rôle
        counts[GRANTED + role.value] = 1
        counts[CREDIT + role.value] = 1
        credited.append(role)
    attempt.message_counts = counts
    return credited


def apply_event(
    db: Session,
    rules: Rules,
    attempt: MissionAttempt,
    content: MissionContent | None,
    event_id: str,
    *,
    demo: bool = False,
) -> AppliedEventView:
    """Applique un événement admissible : version de brief +1, diff, crédit éventuel. Commit à la charge de l'appelant.

    Appelée aussi par BE04 pour les clarifications qui créent une nouvelle version du brief (événement `incomplete_context`)."""
    if attempt.status != "ACTIVE":
        raise ApiError(ErrorCode.INVALID_STATE, "La livraison est figée : aucun événement ne peut plus être appliqué.")
    ev = content.event(event_id) if content else None
    if ev is None or (demo and not ev.demo_selectable):
        raise ApiError(ErrorCode.INVALID_REQUEST, "Événement non admissible pour cette tentative.")
    if any(e.event_id == event_id for e in applied_events(db, attempt.id)):
        raise ApiError(ErrorCode.INVALID_STATE, "Cet événement a déjà été appliqué à cette tentative.")

    current = attempt.brief_version
    result = db.execute(
        update(MissionAttempt)
        .where(MissionAttempt.id == attempt.id, MissionAttempt.brief_version == current, MissionAttempt.status == "ACTIVE")
        .values(brief_version=current + 1)
    )
    if result.rowcount != 1:
        db.rollback()
        raise ApiError(ErrorCode.VERSION_CONFLICT)
    db.refresh(attempt)  # avant toute modification locale : le refresh recharge aussi les compteurs
    try:
        db.add(AppliedEvent(attempt_id=attempt.id, event_id=event_id, brief_version=attempt.brief_version))
        db.flush()
    except IntegrityError:
        db.rollback()
        raise ApiError(ErrorCode.INVALID_STATE, "Cet événement a déjà été appliqué à cette tentative.") from None
    credited = _grant_credits(rules, attempt, ev)
    return AppliedEventView(
        event_id=ev.id,
        type=ev.type,
        trigger=ev.trigger,
        description=ev.description,
        brief_version=attempt.brief_version,
        diff=_diff_items(ev.brief_diff),
        credited_roles=credited,
        added_documents=list(ev.added_documents),
    )


def trigger_events(
    db: Session, rules: Rules, attempt: MissionAttempt, content: MissionContent | None, triggers: set[str]
) -> list[AppliedEventView]:
    """Applique, dans l'ordre du contenu, les événements de jeu normal dont le déclencheur est atteint."""
    if content is None:
        return []
    done = {e.event_id for e in applied_events(db, attempt.id)}
    out = []
    for ev in content.events:
        if ev.normal_play and ev.trigger in triggers and ev.id not in done:
            out.append(apply_event(db, rules, attempt, content, ev.id))
    return out


def admissible_demo_events(db: Session, attempt: MissionAttempt, content: MissionContent | None) -> list[str]:
    if content is None or attempt.status != "ACTIVE":
        return []
    done = {e.event_id for e in applied_events(db, attempt.id)}
    return [e.id for e in content.events if e.demo_selectable and e.id not in done]


def revealed_documents(db: Session, attempt: MissionAttempt, content: MissionContent | None) -> set[str]:
    """Ids de documents ajoutés par les événements déjà appliqués (visibles à partir de ce moment)."""
    if content is None:
        return set()
    out: set[str] = set()
    for row in applied_events(db, attempt.id):
        ev = content.event(row.event_id)
        if ev:
            out.update(ev.added_documents)
    return out


__all__ = [
    "apply_event",
    "trigger_events",
    "admissible_demo_events",
    "build_brief",
    "free_credit_roles",
    "has_correction_credit",
    "credit_in_flight",
    "free_message_applies",
    "consume_correction_credit",
    "revealed_documents",
    "role_counts",
    "applied_events",
    "TRIGGERS_AT_START",
    "TRIGGER_FIRST_PROPOSAL",
]
