"""Moteur de campagne (BE02) : états de mission, passages, déblocages, victoire. Le serveur seul décide.

Ordre de la campagne = ordre de `rules.missions` : la première mission est ouverte au départ, chacune des suivantes
(non « initialement disponible ») exige la réussite de la précédente. Les autres missions « initialement
disponibles » (secours) sont autonomes : toujours ouvertes, sans argent, rejouables.

États d'une mission (dérivés des tentatives, jamais saisis) : LOCKED, AVAILABLE, ACTIVE, EVALUATING, COMPLETED, FAILED.
États d'une tentative persistée : ACTIVE -> EVALUATING -> COMPLETED | FAILED (une reprise crée une nouvelle tentative).

Point d'extension BE06 : après avoir stocké l'`Evaluation` (score calculé par le serveur), appeler `settle_attempt`."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..errors import ApiError, ErrorCode
from ..models import (
    ArtifactVersion,
    Evaluation,
    GameSession,
    MissionAttempt,
    Submission,
)
from ..rules import MissionRule, Rules
from ..schemas.campaign import AttemptSummary, MissionStatus, NextAction, Progress
from ..schemas.common import Role
from ..schemas.state import MissionView
from . import events as ev
from . import ledger
from .missions import ContentError, MissionContent, load_mission_content

OPEN_STATUSES = ("ACTIVE", "EVALUATING")
FINAL_STATUSES = ("COMPLETED", "FAILED")


@dataclass(frozen=True)
class Ctx:
    """Règles chargées + dossier de données (contenu de mission)."""

    rules: Rules
    data_dir: Path


# ---------------------------------------------------------------- structure de la campagne

def campaign_order(rules: Rules) -> list[MissionRule]:
    first = rules.missions[0].id
    return [m for m in rules.missions if m.id == first or not m.initially_available]


def standalone_missions(rules: Rules) -> list[MissionRule]:
    ids = {m.id for m in campaign_order(rules)}
    return [m for m in rules.missions if m.id not in ids]


def required_mission(rules: Rules, mission_id: str) -> str | None:
    """Mission à réussir avant d'ouvrir `mission_id` (None si ouverte d'emblée)."""
    order = campaign_order(rules)
    for i, m in enumerate(order):
        if m.id == mission_id:
            return order[i - 1].id if i > 0 and not m.initially_available else None
    return None


def mission_rule(rules: Rules, mission_id: str) -> MissionRule:
    for m in rules.missions:
        if m.id == mission_id:
            return m
    raise ApiError(ErrorCode.NOT_FOUND)


def load_content(ctx: Ctx, game: GameSession, mission_id: str) -> MissionContent | None:
    try:
        return load_mission_content(ctx.data_dir, mission_id, game.mode)
    except ContentError as exc:
        raise exc.to_api_error() from exc


# ---------------------------------------------------------------- lectures

def attempts_of(db: Session, session_id: str) -> list[MissionAttempt]:
    return list(
        db.scalars(
            select(MissionAttempt)
            .where(MissionAttempt.session_id == session_id)
            .order_by(MissionAttempt.created_at, MissionAttempt.attempt_no)
        )
    )


def _latest_evaluated(db: Session, attempt_id: str) -> tuple[int | None, str | None]:
    """(score, id de livraison) de la dernière livraison de la tentative."""
    sub = db.scalar(select(Submission).where(Submission.attempt_id == attempt_id).order_by(Submission.created_at.desc()))
    if sub is None:
        return None, None
    score = db.scalar(select(Evaluation.score).where(Evaluation.submission_id == sub.id))
    return score, sub.id


def attempt_score(db: Session, attempt_id: str) -> int | None:
    return _latest_evaluated(db, attempt_id)[0]


def attempt_spend(db: Session, attempt: MissionAttempt) -> int:
    """Dépense comptabilisée de la tentative (débits d'actions du ledger, BE03/BE04)."""
    return ledger.attempt_spend(db, attempt.id)


def contributing_roles(db: Session, artifact_version_id: str | None) -> set[str]:
    """Rôles ayant contribué au livrable : contributions de la version et de ses ancêtres (édition, assemblage)."""
    roles: set[str] = set()
    seen: set[str] = set()
    current = artifact_version_id
    while current and current not in seen:
        seen.add(current)
        row = db.get(ArtifactVersion, current)
        if row is None:
            break
        for c in row.contributions or []:
            if isinstance(c, dict) and isinstance(c.get("role"), str):
                roles.add(c["role"])
        current = row.parent_id
    return roles


def _best_scores(db: Session, attempts: list[MissionAttempt]) -> dict[str, int]:
    best: dict[str, int] = {}
    for a in attempts:
        if a.status != "COMPLETED":
            continue
        score = attempt_score(db, a.id)
        if score is not None:
            best[a.mission_id] = max(best.get(a.mission_id, 0), score)
    return best


def completed_mission_ids(attempts: list[MissionAttempt]) -> set[str]:
    return {a.mission_id for a in attempts if a.status == "COMPLETED"}


def reputation(rules: Rules, best: dict[str, int]) -> float | None:
    """Moyenne des meilleurs scores des missions de campagne terminées (informative, aucun seuil caché)."""
    scores = [best[m.id] for m in campaign_order(rules) if m.id in best]
    return round(sum(scores) / len(scores), 1) if scores else None


def unlocked_roles(rules: Rules, attempts: list[MissionAttempt]) -> set[Role]:
    """Rôles dont la mission de déblocage est réussie (+ rôles de départ). Utilisé par la boutique (BE03)."""
    done = completed_mission_ids(attempts)
    out = set(rules.initial_agents)
    out.update(a.id for a in rules.agents if a.unlock_mission in done or a.price == 0)
    return out


def _mission_status(rules: Rules, rule: MissionRule, mine: list[MissionAttempt], done: set[str]) -> MissionStatus:
    if mine:
        latest = mine[-1]
        if any(a.status == "ACTIVE" for a in mine):
            return "ACTIVE"
        if latest.status == "EVALUATING":
            return "EVALUATING"
        if rule.id in done:
            return "COMPLETED"
        return "FAILED"
    return "AVAILABLE" if _is_open(rules, rule.id, done) else "LOCKED"


def _is_open(rules: Rules, mission_id: str, done: set[str]) -> bool:
    req = required_mission(rules, mission_id)
    return req is None or req in done


def build_missions(db: Session, rules: Rules, attempts: list[MissionAttempt]) -> list[MissionView]:
    done = completed_mission_ids(attempts)
    best = _best_scores(db, attempts)
    standalone = {m.id for m in standalone_missions(rules)}
    views = []
    for rule in rules.missions:
        mine = [a for a in attempts if a.mission_id == rule.id]
        status = _mission_status(rules, rule, mine, done)
        is_open = _is_open(rules, rule.id, done)
        has_open = any(a.status in OPEN_STATUSES for a in mine)
        active = next((a for a in reversed(mine) if a.status == "ACTIVE"), None)
        views.append(
            MissionView(
                id=rule.id,
                label=rule.label,
                max_reward=rule.max_reward,
                unit_price=rule.unit_price,
                status=status,
                requires=required_mission(rules, rule.id),
                unlocks=list(rule.unlocks),
                attempts_count=len(mine),
                best_score=best.get(rule.id),
                active_attempt_id=active.id if active else None,
                can_start=is_open and not has_open and (not mine or rule.id in standalone),
                can_retry=is_open and bool(mine) and not has_open,
            )
        )
    return views


def victory(rules: Rules, attempts: list[MissionAttempt]) -> bool:
    return rules.scoring.final_mission_id in completed_mission_ids(attempts)


def next_action(db: Session, rules: Rules, attempts: list[MissionAttempt], available_balance: int) -> NextAction:
    done = completed_mission_ids(attempts)
    active = next((a for a in attempts if a.status == "ACTIVE"), None)
    if active:
        return NextAction(
            type="continue_attempt", mission_id=active.mission_id, attempt_id=active.id,
            message="Poursuivez la commande en cours : échangez avec vos agents, puis livrez.",
        )
    waiting = next((a for a in attempts if a.status == "EVALUATING"), None)
    if waiting:
        return NextAction(
            type="await_evaluation", mission_id=waiting.mission_id, attempt_id=waiting.id,
            message="Votre livraison est en cours d'évaluation.",
        )
    for rule in campaign_order(rules):
        if rule.id in done:
            continue
        mine = [a for a in attempts if a.mission_id == rule.id]
        rescue = standalone_missions(rules)
        if rescue and rule.unit_price > available_balance:
            return NextAction(
                type="start_rescue", mission_id=rescue[0].id,
                message="Solde insuffisant pour la prochaine commande : la mission de secours est gratuite et rejouable.",
            )
        if mine:
            return NextAction(
                type="retry_mission", mission_id=rule.id,
                message="Reprenez cette commande : votre historique est conservé.",
            )
        return NextAction(type="start_mission", mission_id=rule.id, message="Acceptez la prochaine commande.")
    return NextAction(type="campaign_complete", message="Campagne terminée.")


def stage_of(rules: Rules, attempts: list[MissionAttempt]) -> str:
    done = completed_mission_ids(attempts)
    for rule in campaign_order(rules):
        if rule.id not in done:
            return rule.id
    return "done"


def build_progress(db: Session, rules: Rules, game: GameSession, attempts: list[MissionAttempt], available_balance: int) -> Progress:
    done = completed_mission_ids(attempts)
    order = campaign_order(rules)
    return Progress(
        completed_missions=[m.id for m in order if m.id in done],
        total_missions=len(order),
        reputation=reputation(rules, _best_scores(db, attempts)),
        victory=victory(rules, attempts),
        stage=game.stage,
        next_action=next_action(db, rules, attempts, available_balance),
    )


def summarize_attempt(db: Session, rules: Rules, attempt: MissionAttempt) -> AttemptSummary:
    score, sub_id = _latest_evaluated(db, attempt.id)
    reasons: list[str] = []
    if attempt.status == "FAILED" and score is not None:
        sub = db.get(Submission, sub_id) if sub_id else None
        _, reasons = judge(db, rules, attempt, score, False, attempt_spend(db, attempt), sub.artifact_version_id if sub else None)
    count = db.scalar(select(func.count()).select_from(ArtifactVersion).where(ArtifactVersion.attempt_id == attempt.id))
    return AttemptSummary(
        id=attempt.id,
        mission_id=attempt.mission_id,
        attempt_no=attempt.attempt_no,
        status=attempt.status,
        brief_version=attempt.brief_version,
        unit_price=attempt.unit_price,
        spend_cap=attempt.spend_cap,
        message_counts=ev.role_counts(attempt),
        free_credit_roles=ev.free_credit_roles(attempt),
        clarifications_used=attempt.clarifications_used,
        model_calls=attempt.model_calls,
        score=score,
        submission_id=sub_id,
        artifacts_count=count or 0,
        failure_reasons=reasons,
        created_at=attempt.created_at,
    )


def get_owned_attempt(db: Session, game: GameSession, attempt_id: str) -> MissionAttempt:
    """Une tentative d'une autre session est indiscernable d'une tentative inexistante (T13)."""
    attempt = db.get(MissionAttempt, attempt_id)
    if attempt is None or attempt.session_id != game.id:
        raise ApiError(ErrorCode.NOT_FOUND)
    return attempt


# ---------------------------------------------------------------- ouverture et reprise

def _key_hash(key: str | None) -> str | None:
    return hashlib.sha256(key.encode()).hexdigest() if key else None


def _replayed_open(attempts: list[MissionAttempt], rule: MissionRule, key: str | None) -> MissionAttempt | None:
    """Tentative déjà ouverte avec cette `Idempotency-Key` (rejeu : même résultat, aucune 2e tentative)."""
    kh = _key_hash(key)
    prev = next((a for a in attempts if kh and a.open_key_hash == kh), None)
    if prev is not None and prev.mission_id != rule.id:
        raise ApiError(ErrorCode.INVALID_REQUEST, "Cette Idempotency-Key a déjà servi pour une autre requête.")
    return prev


def _open_attempt(
    db: Session, ctx: Ctx, game: GameSession, rule: MissionRule, attempts: list[MissionAttempt], key: str | None = None
) -> MissionAttempt:
    mine = [a for a in attempts if a.mission_id == rule.id]
    scoring = ctx.rules.scoring
    attempt = MissionAttempt(
        session_id=game.id,
        mission_id=rule.id,
        brief_version=1,
        status="ACTIVE",
        spend_cap=scoring.final_max_spend if rule.id == scoring.final_mission_id else None,
        message_counts={},
        attempt_no=max((a.attempt_no for a in mine), default=0) + 1,
        unit_price=rule.unit_price,  # tarif figé : la campagne peut progresser, pas ce prix
        open_key_hash=_key_hash(key),
    )
    db.add(attempt)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise ApiError(ErrorCode.INVALID_STATE, "Une tentative vient d'être ouverte pour cette mission ; rechargez l'état.") from None
    # M6 : événement injecté avant la première action (et tout événement de début de mission)
    ev.trigger_events(db, ctx.rules, attempt, load_content(ctx, game, rule.id), ev.TRIGGERS_AT_START)
    db.commit()
    return attempt


def start_mission(db: Session, ctx: Ctx, game: GameSession, mission_id: str, key: str | None = None) -> tuple[MissionAttempt, bool]:
    """Ouvre la tentative d'une mission ouverte. Retourne (tentative, créée). Rejouable sans effet :
    si une tentative ACTIVE existe déjà, ou si la clé a déjà ouvert une tentative, elle est renvoyée telle quelle."""
    rule = mission_rule(ctx.rules, mission_id)
    attempts = attempts_of(db, game.id)
    replayed = _replayed_open(attempts, rule, key)
    if replayed is not None:
        return replayed, False
    done = completed_mission_ids(attempts)
    if not _is_open(ctx.rules, rule.id, done):
        raise ApiError(ErrorCode.INVALID_STATE, "Cette mission n'est pas encore débloquée.")
    mine = [a for a in attempts if a.mission_id == rule.id]
    active = next((a for a in reversed(mine) if a.status == "ACTIVE"), None)
    if active:
        return active, False
    if any(a.status == "EVALUATING" for a in mine):
        raise ApiError(ErrorCode.INVALID_STATE, "Une livraison de cette mission est en cours d'évaluation.")
    standalone = {m.id for m in standalone_missions(ctx.rules)}
    if mine and rule.id not in standalone:
        raise ApiError(ErrorCode.INVALID_STATE, "Cette mission a déjà été tentée : utilisez la reprise.")
    return _open_attempt(db, ctx, game, rule, attempts, key), True


def retry_mission(db: Session, ctx: Ctx, game: GameSession, mission_id: str, key: str | None = None) -> tuple[MissionAttempt, bool]:
    """Nouvelle tentative : compteurs neufs, tarif re-figé, historique conservé ; ne rouvre jamais une livraison figée.
    Retourne (tentative, créée) ; rejouable : la même clé renvoie la tentative qu'elle a ouverte (créée = False)."""
    rule = mission_rule(ctx.rules, mission_id)
    attempts = attempts_of(db, game.id)
    replayed = _replayed_open(attempts, rule, key)
    if replayed is not None:
        return replayed, False
    mine = [a for a in attempts if a.mission_id == rule.id]
    if not mine:
        raise ApiError(ErrorCode.INVALID_STATE, "Cette mission n'a pas encore été tentée : ouvrez-la d'abord.")
    if any(a.status in OPEN_STATUSES for a in mine):
        raise ApiError(ErrorCode.INVALID_STATE, "Une tentative est déjà en cours pour cette mission.")
    return _open_attempt(db, ctx, game, rule, attempts, key), True


# ---------------------------------------------------------------- résultat d'une évaluation (point d'extension BE06)

@dataclass
class AttemptOutcome:
    passed: bool
    victory: bool
    score: int
    reasons: list[str] = field(default_factory=list)
    spend: int = 0
    contributing_roles: list[str] = field(default_factory=list)
    newly_unlocked_roles: list[Role] = field(default_factory=list)


def judge(
    db: Session,
    rules: Rules,
    attempt: MissionAttempt,
    score: int,
    essential_failed: bool,
    spend: int,
    artifact_version_id: str | None,
) -> tuple[bool, list[str]]:
    """Conditions de passage (docs/RULES.md §5 et §7). Retourne (réussi, motifs d'échec)."""
    sc = rules.scoring
    final = attempt.mission_id == sc.final_mission_id
    reasons: list[str] = []
    if essential_failed:
        score = min(score, sc.essential_failure_cap)
        reasons.append("ESSENTIAL_FAILED")
    threshold = sc.final_pass_score if final else sc.pass_score
    if score < threshold:
        reasons.append("SCORE_BELOW_THRESHOLD")
    if final:
        cap = attempt.spend_cap if attempt.spend_cap is not None else sc.final_max_spend
        if spend > cap:
            reasons.append("SPEND_CAP_EXCEEDED")
        if len(contributing_roles(db, artifact_version_id)) < sc.final_min_contributing_roles:
            reasons.append("NOT_ENOUGH_CONTRIBUTING_ROLES")
    return not reasons, reasons


def settle_attempt(
    db: Session,
    rules: Rules,
    game: GameSession,
    attempt: MissionAttempt,
    evaluation: Evaluation,
    *,
    essential_failed: bool = False,
    spend: int | None = None,
) -> AttemptOutcome:
    """Clôt une tentative EVALUATING d'après une évaluation dont le score a été calculé par le serveur (BE06).

    - réussite ordinaire : score >= pass_score sans échec essentiel ;
    - finale : score >= final_pass_score, essentiels, dépense <= plafond, >= N rôles contributeurs ;
    - met à jour étape et état de la partie ; ne verse aucun argent (BE03/BE06 paient à partir de l'évaluation).
    `spend` : dépense de la tentative ; par défaut déduite des réservations (`attempt_spend`)."""
    if attempt.session_id != game.id:
        raise ApiError(ErrorCode.NOT_FOUND)
    if attempt.status != "EVALUATING":
        raise ApiError(ErrorCode.INVALID_STATE, "Seule une tentative en cours d'évaluation peut être clôturée.")
    sub = db.get(Submission, evaluation.submission_id)
    if sub is None or sub.attempt_id != attempt.id:
        raise ApiError(ErrorCode.INVALID_STATE, "Cette évaluation ne correspond pas à la livraison de la tentative.")
    if evaluation.score is None:
        raise ApiError(ErrorCode.INVALID_STATE, "Évaluation sans score : la tentative reste en attente.")
    score = max(0, min(100, int(evaluation.score)))
    spent = attempt_spend(db, attempt) if spend is None else spend
    passed, reasons = judge(db, rules, attempt, score, essential_failed, spent, sub.artifact_version_id)
    attempt.status = "COMPLETED" if passed else "FAILED"
    db.flush()
    attempts = attempts_of(db, game.id)
    rule = mission_rule(rules, attempt.mission_id)
    first_completion = passed and sum(1 for a in attempts if a.mission_id == rule.id and a.status == "COMPLETED") == 1
    won = passed and attempt.mission_id == rules.scoring.final_mission_id
    game.stage = stage_of(rules, attempts)
    if won:
        game.state = "COMPLETED"
    db.commit()
    return AttemptOutcome(
        passed=passed,
        victory=won,
        score=score,
        reasons=reasons,
        spend=spent,
        contributing_roles=sorted(contributing_roles(db, sub.artifact_version_id)),
        newly_unlocked_roles=list(rule.unlocks) if first_completion else [],
    )


__all__ = [
    "Ctx",
    "AttemptOutcome",
    "settle_attempt",
    "start_mission",
    "retry_mission",
    "build_missions",
    "build_progress",
    "summarize_attempt",
    "unlocked_roles",
    "get_owned_attempt",
]

def ctx_from_app(app) -> Ctx:  # noqa: ANN001
    return Ctx(rules=app.state.rules, data_dir=app.state.settings.data_dir)
