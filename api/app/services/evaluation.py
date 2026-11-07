"""Évaluation d'une livraison (BE06) : appel du client évaluateur, validation, score serveur, paiement, clôture.

Principes (docs/ai/03-evaluateur.md, docs/RULES.md §5, CLAUDE.md règles 2, 3, 4, 7) :
- le modèle ne note que les critères ; il ne produit ni score, ni récompense, ni montant (tout champ inconnu est ignoré) ;
- le texte noté, la grille et le brief sont ceux FIGÉS dans la livraison (`Submission.rubric`), jamais relus depuis `data/` ;
- les contrôles déterministes (`checks.py`) et le score (`compute_score`) sont exécutés par le serveur ;
- l'appel fournisseur se fait HORS transaction : phase 1 (préparer, commit) -> appel -> phase 2 (régler, un seul commit) ;
- règlement atomique : `Evaluation` + paiement (`award_submission`) + clôture de la tentative (`settle_attempt`) ensemble ;
  `Evaluation.submission_id` est unique et le paiement a une source unique : un rejeu ne paie jamais deux fois ;
- sortie invalide ou panne : UNE réparation, sinon la livraison reste EVALUATING (récupérable : rejouer `submit`),
  aucun score ni récompense inventés."""

from __future__ import annotations

import json
import logging
import re
import secrets
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from pydantic import ValidationError
from sqlalchemy import select

from ..errors import ApiError, ErrorCode
from ..llm.base import LLMRequest, LLMResponse
from ..models import ActionRun, ArtifactVersion, Evaluation, GameSession, LLMCall, MissionAttempt, Submission
from ..rules import Rules
from ..schemas.common import Role
from ..schemas.evaluator import EvaluatorOutput
from . import artifacts as art
from . import campaign as camp
from . import checks, ledger
from . import ledger_payments as pay
from .actions import ActionEngine, Outcome, call_provider, error_dict

log = logging.getLogger("rubix.evaluation")

JUDGE_ID = "client_evaluator"
TEXT_MAX = 2000  # bornes de stockage des champs libres du modèle (donnée non fiable)
DOC_MAX_CHARS = 3000
_DELIMITER = re.compile(r"<<<\s*(?:LIVRABLE|FIN)[^>\n]*>*", re.I)
_FENCE = re.compile(r"^\s*```(?:json)?\s*|\s*```\s*$", re.I)


# ---------------------------------------------------------------- rôle système et contexte


def load_judge_role(data_dir: Path) -> tuple[int, str]:
    """(version, consignes) du rôle système `client_evaluator` ; consignes minimales si le fichier est absent."""
    path = data_dir / "roles" / "system" / f"{JUDGE_ID}.json"
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return int(data.get("version", 1)), str(data.get("system_instructions") or "")
    except (OSError, ValueError):
        return 1, "Tu évalues UN livrable figé selon UNE grille et rends un JSON strict. Aucune récompense, aucun score."


def sanitize_deliverable(text: str) -> str:
    """Supprime toute occurrence d'un délimiteur du livrable avant envoi (le nonce est de toute façon aléatoire)."""
    return _DELIMITER.sub("", text)


def build_context(
    role_text: str, rubric: dict[str, Any], mode: str, brief: dict[str, Any] | None, documents: list[dict[str, Any]],
    trace: dict[str, Any], text: str, nonce: str, repair_errors: list[str] | None = None,
) -> str:
    criteria = []
    for c in rubric.get("criteria") or []:
        item = {k: c.get(k) for k in ("id", "label", "weight", "essential", "kind", "description", "guidance_for_evaluator")}
        vg = (c.get("variant_guidance") or {}).get(mode)
        if vg:
            item["variant_guidance"] = vg
        criteria.append(item)
    docs = "\n\n".join(f"[{d.get('id')}] {d.get('title')}\n{str(d.get('text') or '')[:DOC_MAX_CHARS]}" for d in documents) or "aucun"
    parts = [
        f"[RÈGLES]\n{role_text}",
        f"[GRILLE {rubric.get('id')}]\n{json.dumps(criteria, ensure_ascii=False)}",
        f"[BRIEF]\n{json.dumps(brief, ensure_ascii=False) if brief else 'non rédigé'}",
        f"[DOCUMENTS DE RÉFÉRENCE]\n{docs}",
        f"[FAITS DE TRACE]\n{json.dumps(trace, ensure_ascii=False)}",
        f"<<<LIVRABLE nonce={nonce}>>>\n{sanitize_deliverable(text)}\n<<<FIN nonce={nonce}>>>",
    ]
    if repair_errors:
        parts.append("[RÉPARATION] Ta sortie précédente était invalide : " + " ; ".join(repair_errors[:10]))
    parts.append("[RAPPEL] JSON evaluator_output uniquement ; tous les critères ; aucune récompense, aucun score, aucun montant.")
    return "\n\n".join(parts)


# ---------------------------------------------------------------- validation de la sortie


def _norm(s: str) -> str:
    return checks.norm_ws(s)


def parse_output(raw: str, rubric: dict[str, Any], submission_id: str, text: str) -> tuple[EvaluatorOutput | None, list[str]]:
    """Valide la sortie du modèle (schéma, ids, complétude, bornes, preuves). Retourne (sortie, erreurs)."""
    try:
        data = json.loads(_FENCE.sub("", raw.strip()))
    except ValueError:
        return None, ["JSON illisible"]
    if not isinstance(data, dict):
        return None, ["la sortie doit être un objet JSON"]
    try:
        out = EvaluatorOutput.model_validate(data)  # extra="ignore" : reward/score/payment écartés sans erreur
    except ValidationError as exc:
        return None, [f"{'.'.join(str(p) for p in e['loc'])}: {e['msg']}" for e in exc.errors()[:10]]
    errors: list[str] = []
    expected = {c["id"]: c for c in rubric.get("criteria") or []}
    given = {c.id for c in out.criteria}
    if out.submission_id != submission_id:
        errors.append("submission_id inconnu")
    if out.rubric_version != rubric.get("id"):
        errors.append("rubric_version inattendue")
    for cid in sorted(given - expected.keys()):
        errors.append(f"critère inconnu : {cid}")
    for cid in sorted(expected.keys() - given):
        errors.append(f"critère manquant : {cid}")
    haystack = _norm(text)
    for c in out.criteria:
        spec = expected.get(c.id)
        if spec is None or spec.get("kind") == "deterministic":
            continue  # le contrôle déterministe tient lieu de preuve
        if c.rating > 0 and not (c.evidence.strip() and _norm(c.evidence) in haystack):
            errors.append(f"preuve absente ou non littérale pour {c.id}")
    return (None, errors) if errors else (out, [])


# ---------------------------------------------------------------- étapes


@dataclass
class Prepared:
    action_id: str
    submission_id: str
    attempt_id: str
    session_id: str
    rubric: dict[str, Any]
    text: str
    request_base: dict[str, Any]
    calls_available: int
    versions: dict[str, Any]


def _judge_request(prep: Prepared, rules: Rules, repair_errors: list[str] | None, nonce: str) -> LLMRequest:
    b = prep.request_base
    context = build_context(b["role_text"], prep.rubric, b["mode"], b["brief"], b["documents"], b["trace"], prep.text, nonce, repair_errors)
    schema = {"title": "EvaluatorOutput", **EvaluatorOutput.model_json_schema()}
    return LLMRequest(
        role=Role.QA,  # porteur technique : le rôle système `client_evaluator` n'est pas un rôle de jeu
        context=context,
        allowed_tools=[],
        expected_schema=schema,
        max_output_tokens=rules.limits.client_or_lead_max_output_tokens,
        purpose="evaluation_repair" if repair_errors else "evaluation",
        metadata={
            "submission_id": prep.submission_id,
            "rubric_id": prep.rubric.get("id"),
            "criteria_ids": [c["id"] for c in prep.rubric.get("criteria") or []],
        },
    )


def prepare(eng: ActionEngine, data_dir: Path, submission_id: str) -> Prepared | Evaluation | None:
    """Phase 1 (courte transaction) : vérifie l'état, ouvre l'action d'évaluation. Retourne l'évaluation existante si
    déjà faite, `None` si la livraison n'est pas évaluable (grille absente, tentative déjà close)."""
    with eng.sf() as db:
        ledger.begin_immediate(db)
        sub = db.get(Submission, submission_id)
        if sub is None:
            return None
        existing = db.scalar(select(Evaluation).where(Evaluation.submission_id == sub.id))
        if existing is not None:
            db.commit()  # (pas rollback : l'objet renvoyé doit rester lisible une fois la session fermée)
            return existing
        attempt = db.get(MissionAttempt, sub.attempt_id)
        game = db.get(GameSession, attempt.session_id)
        rubric = (sub.rubric or {}).get("rubric")
        if attempt.status != "EVALUATING" or not rubric:
            db.rollback()  # grille non rédigée : on refuse d'évaluer plutôt que d'inventer un score
            return None
        artifact = db.get(ArtifactVersion, sub.artifact_version_id)
        ctx_docs = camp.Ctx(rules=eng.rules, data_dir=data_dir)
        content = camp.load_content(ctx_docs, game, attempt.mission_id)
        documents = art.visible_documents(db, ctx_docs, attempt, content)
        role_version, role_text = load_judge_role(data_dir)
        trace = {
            "clarification_obtained": attempt.clarifications_used > 0,
            "contributing_roles": len(camp.contributing_roles(db, artifact.id)),
        }
        n = db.scalar(select(ActionRun.id).where(ActionRun.session_id == game.id, ActionRun.idempotency_key == f"evaluation:{sub.id}:1"))
        key = f"evaluation:{sub.id}:{'1' if n is None else secrets.token_hex(4)}"
        action = ActionRun(session_id=game.id, attempt_id=attempt.id, idempotency_key=key, type="evaluation", status="RUNNING", steps=[])
        db.add(action)
        db.flush()
        prep = Prepared(
            action_id=action.id,
            submission_id=sub.id,
            attempt_id=attempt.id,
            session_id=game.id,
            rubric=rubric,
            text=artifact.content,
            request_base={
                "role_text": role_text,
                "mode": game.mode,
                "brief": ((sub.rubric or {}).get("brief") or {}).get("content"),
                "documents": [{"id": d.get("id"), "title": d.get("title"), "text": d.get("text")} for d in documents if d.get("visibility", "public") == "public"],
                "trace": trace,
            },
            calls_available=max(0, eng.rules.quotas.model_calls_per_attempt - attempt.model_calls),
            versions={"rubric": rubric.get("id"), "judge": f"{JUDGE_ID}_v{role_version}", "rules": eng.rules.version, "mission": attempt.mission_id},
        )
        db.commit()
        return prep


def _log_calls(db, eng: ActionEngine, prep: Prepared, outcomes: list[Outcome]) -> int:  # noqa: ANN001
    total = 0
    for o in outcomes:
        resp: LLMResponse | None = o.response
        db.add(
            LLMCall(
                action_id=prep.action_id, role=JUDGE_ID, model=eng.llm.name,
                usage=resp.usage.model_dump() if resp and resp.usage else None,
                usage_measured=bool(resp and resp.usage and resp.usage.measured),
                duration_ms=o.duration_ms, attempts=max(1, o.calls), versions=prep.versions,
            )
        )
        total += o.calls
    return total


def _fail(eng: ActionEngine, prep: Prepared, outcomes: list[Outcome], error: dict[str, Any]) -> None:
    """Échec récupérable : la livraison reste EVALUATING, aucun paiement, aucun score ; les appels sont comptés et journalisés."""
    with eng.sf() as db:
        ledger.begin_immediate(db)
        action = db.get(ActionRun, prep.action_id)
        action.status = "FAILED"
        action.error = error
        attempt = db.get(MissionAttempt, prep.attempt_id)
        attempt.model_calls += _log_calls(db, eng, prep, outcomes)
        db.commit()


def _settle(eng: ActionEngine, prep: Prepared, out: EvaluatorOutput, outcomes: list[Outcome]) -> Evaluation | None:
    """Phase 2 : score serveur, paiement et clôture dans UNE transaction."""
    rules = eng.rules
    with eng.sf() as db:
        ledger.begin_immediate(db)
        existing = db.scalar(select(Evaluation).where(Evaluation.submission_id == prep.submission_id))
        attempt = db.get(MissionAttempt, prep.attempt_id)
        action = db.get(ActionRun, prep.action_id)
        if existing is not None or attempt.status != "EVALUATING":  # une autre évaluation a réglé entre-temps : rien à payer
            action.status = "FAILED"
            action.error = error_dict(ErrorCode.INVALID_STATE, "Livraison déjà évaluée.")
            attempt.model_calls += _log_calls(db, eng, prep, outcomes)
            db.commit()
            return existing
        game = db.get(GameSession, prep.session_id)
        sub = db.get(Submission, prep.submission_id)
        rubric = prep.rubric
        trace = prep.request_base["trace"]
        report = checks.run_rubric_checks(rubric, prep.text, trace)
        ratings = {c.id: c.rating for c in out.criteria}
        evidence = {c.id: c.evidence[:TEXT_MAX] for c in out.criteria}
        comments = {c.id: c.comment[:TEXT_MAX] for c in out.criteria}
        result = checks.compute_score(
            rubric, ratings, evidence, comments, report,
            out_of_scope=out.out_of_scope,
            essential_cap=rules.scoring.essential_failure_cap,  # plafond issu de data/rules/, pas de la grille
            default_min_rating=float(rubric.get("essential_min_rating", 0.5)),
        )
        failed = bool(result.essential_failed) and not out.out_of_scope
        spent = camp.attempt_spend(db, attempt)
        passed, reasons = camp.judge(db, rules, attempt, result.score, failed, spent, sub.artifact_version_id)
        mission = camp.mission_rule(rules, attempt.mission_id)
        evaluation = Evaluation(
            submission_id=sub.id,
            model=eng.llm.name,
            judge_version=prep.versions["judge"],
            criteria=[
                {
                    "id": o.id, "label": o.label, "weight": o.weight, "essential": o.essential, "kind": o.kind,
                    "model_rating": o.model_rating, "deterministic_rating": o.deterministic_rating, "rating": o.rating,
                    "met": o.met, "override": o.override, "comment": o.comment,
                }
                for o in result.criteria
            ],
            score=result.score,
            evidence=[{"id": o.id, "evidence": o.evidence} for o in result.criteria if o.evidence],
            status="DONE",
            report={
                "rubric_id": rubric.get("id"),
                "out_of_scope": out.out_of_scope,
                "client_feedback": out.client_feedback[:TEXT_MAX],
                "next_action": out.next_action[:TEXT_MAX],
                "raw_score": result.raw_score,
                "capped_by_essential": result.capped,
                "essential_failed": result.essential_failed,
                "passed": passed,
                "reasons": reasons,
                "spent": spent,
                "check_errors": sorted(report.errors),
                "payment": None,  # complété ci-dessous (même transaction)
            },
        )
        db.add(evaluation)
        db.flush()
        paid = pay.award_submission(db, rules, game.id, attempt.mission_id, sub.id, result.score)
        evaluation.report = {
            **evaluation.report,
            "payment": {
                "max_reward": mission.max_reward, "target": paid.target, "already_acquired": paid.previously_paid,
                "credited": paid.amount, "already_awarded": not paid.created,
            },
        }
        sub.status = "EVALUATED"
        action.status = "SUCCEEDED"
        attempt.model_calls += _log_calls(db, eng, prep, outcomes)
        db.flush()
        camp.settle_attempt(db, rules, game, attempt, evaluation, essential_failed=failed, spend=spent)  # commit
        return evaluation


def evaluate_submission(eng: ActionEngine, data_dir: Path, submission_id: str) -> Evaluation | None:
    """Évalue une livraison (idempotent). Retourne l'évaluation, ou `None` si elle reste EVALUATING (récupérable)."""
    prep = prepare(eng, data_dir, submission_id)
    if prep is None:
        return None
    if isinstance(prep, Evaluation):
        return prep
    if prep.calls_available < 1:
        _fail(eng, prep, [], error_dict(ErrorCode.LLM_UNAVAILABLE, "Plafond d'appels modèle atteint pour cette tentative.", "call_cap"))
        return None
    outcomes: list[Outcome] = []
    nonce = secrets.token_hex(8)
    repair: list[str] | None = None
    budget = prep.calls_available
    for step in range(2):  # un appel + UNE réparation
        used = sum(o.calls for o in outcomes)
        if budget - used < 1:
            _fail(eng, prep, outcomes, error_dict(ErrorCode.LLM_UNAVAILABLE, None, "call_cap"))
            return None
        request = _judge_request(prep, eng.rules, repair, nonce)
        outcome = call_provider(eng, request, extra_calls_allowed=max(0, budget - used - 1))  # hors transaction
        outcomes.append(outcome)
        if not outcome.ok:
            err = outcome.error or error_dict(ErrorCode.LLM_UNAVAILABLE)
            if err.get("code") == ErrorCode.INVALID_OUTPUT.value and step == 0:
                repair = ["sortie vide ou inexploitable"]
                continue
            _fail(eng, prep, outcomes, err)
            return None
        out, errors = parse_output(outcome.response.content, prep.rubric, prep.submission_id, prep.text)
        if out is not None:
            return _settle(eng, prep, out, outcomes)
        if step == 0:
            repair = errors
            continue
        log.warning("evaluation invalide", extra={"event": "evaluation_invalid", "submission": prep.submission_id, "errors": len(errors)})
        _fail(eng, prep, outcomes, error_dict(ErrorCode.INVALID_OUTPUT, None, "; ".join(errors)[:300]))
        return None
    return None


def recover_pending(eng: ActionEngine, data_dir: Path) -> int:
    """Reprise au démarrage : réévalue les livraisons restées EVALUATING sans évaluation (idempotent)."""
    with eng.sf() as db:
        pending = list(
            db.scalars(
                select(Submission.id)
                .join(MissionAttempt, MissionAttempt.id == Submission.attempt_id)
                .outerjoin(Evaluation, Evaluation.submission_id == Submission.id)
                .where(MissionAttempt.status == "EVALUATING", Evaluation.id.is_(None))
            )
        )
    done = 0
    for sid in pending:
        try:
            done += 1 if evaluate_submission(eng, data_dir, sid) else 0
        except ApiError:
            log.exception("recovery failed")
    return done
