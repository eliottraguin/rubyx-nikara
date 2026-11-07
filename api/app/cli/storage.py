"""Sauvegarde/restauration de la base, purge de rétention, suivi technique des appels IA."""

from __future__ import annotations

import os
import sqlite3
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from sqlalchemy import case, delete, func, select
from sqlalchemy.orm import Session

from ..config import Settings
from ..models import ActionRun, GameSession, LLMCall
from .demo import demo_sessions
from .health import expected_head


class OpsError(Exception):
    """Erreur d'exploitation lisible (message en français)."""


def _integrity(path: Path) -> list[str]:
    con = sqlite3.connect(path)
    try:
        problems = [r[0] for r in con.execute("PRAGMA integrity_check") if r[0] != "ok"]
        tables = {r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if not {"game_sessions", "alembic_version"} <= tables:
            problems.append("tables du jeu absentes")
        else:
            rev = con.execute("SELECT version_num FROM alembic_version").fetchone()
            if rev is None or rev[0] != expected_head():
                # Une base plus ancienne serait migrée au démarrage ; on refuse tout de même pour rester prudent.
                problems.append(f"révision de schéma {rev[0] if rev else 'aucune'} différente de {expected_head()}")
        return problems
    finally:
        con.close()


def _copy_consistent(src: Path, dest: Path) -> None:
    """Copie cohérente à chaud via l'API de sauvegarde de sqlite3 (WAL compris), puis remplacement atomique."""
    tmp = dest.with_name(dest.name + ".tmp")
    tmp.unlink(missing_ok=True)
    s = sqlite3.connect(src, timeout=10)
    d = sqlite3.connect(tmp)
    try:
        s.backup(d)
    finally:
        d.close()
        s.close()
    os.chmod(tmp, 0o600)
    os.replace(tmp, dest)


def backup_db(settings: Settings, dest: Path, force: bool = False) -> dict[str, Any]:
    if not settings.db_path.is_file():
        raise OpsError("Base introuvable : rien à sauvegarder.")
    if dest.exists() and not force:
        raise OpsError("Le fichier de destination existe déjà (utiliser --force pour l'écraser).")
    if dest.resolve() == settings.db_path.resolve():
        raise OpsError("La destination ne peut pas être la base elle-même.")
    dest.parent.mkdir(parents=True, exist_ok=True)
    _copy_consistent(settings.db_path, dest)
    problems = _integrity(dest)
    if problems:
        dest.unlink(missing_ok=True)
        raise OpsError("Sauvegarde invalide, supprimée : " + "; ".join(problems))
    return {"backup": str(dest), "bytes": dest.stat().st_size}


def restore_db(settings: Settings, source: Path, force: bool = False) -> dict[str, Any]:
    """Restaure la base depuis une sauvegarde. Le service DOIT être arrêté. Une copie de sécurité de la base actuelle est faite."""
    if not source.is_file():
        raise OpsError("Fichier de sauvegarde introuvable.")
    problems = _integrity(source)
    if problems:
        raise OpsError("Sauvegarde refusée : " + "; ".join(problems))
    dest = settings.db_path
    safety = None
    if dest.exists():
        if not force:
            raise OpsError("Une base existe déjà (utiliser --force : une copie de sécurité sera créée).")
        safety = dest.with_name(f"{dest.name}.pre-restore-{datetime.now(UTC):%Y%m%dT%H%M%S}")
        _copy_consistent(dest, safety)
    dest.parent.mkdir(parents=True, exist_ok=True)
    for suffix in ("-wal", "-shm"):
        Path(str(dest) + suffix).unlink(missing_ok=True)  # journaux de l'ancienne base : ne jamais les mélanger
    _copy_consistent(source, dest)
    return {"restored": True, "safety_copy": str(safety) if safety else None}


def purge_sessions(
    db: Session, days: int, now: datetime | None = None, dry_run: bool = False, include_demo: bool = False
) -> dict[str, Any]:
    """Supprime (cascade) les parties créées il y a plus de `days` jours. Les parties de démo sont épargnées sauf `include_demo`."""
    if days < 1:
        raise OpsError("La rétention doit être d'au moins 1 jour.")
    cutoff = (now or datetime.now(UTC)) - timedelta(days=days)
    protected = set() if include_demo else {g.id for g in demo_sessions(db)}
    ids = [i for i in db.scalars(select(GameSession.id).where(GameSession.created_at < cutoff)) if i not in protected]
    if ids and not dry_run:
        for i in range(0, len(ids), 200):
            db.execute(delete(GameSession).where(GameSession.id.in_(ids[i : i + 200])))
        db.commit()
    return {"cutoff": cutoff.isoformat(timespec="seconds"), "retention_days": days, "matched": len(ids), "deleted": 0 if dry_run else len(ids), "dry_run": dry_run}


def _tokens(col: str):
    return func.coalesce(func.sum(func.json_extract(LLMCall.usage, f"$.{col}")), 0)


def usage_report(db: Session, settings: Settings) -> dict[str, Any]:
    """Suivi technique agrégé de `LLMCall` : appels, échecs (appel sans réponse exploitable), tokens mesurés vs estimés.
    Aucun contenu de prompt ni de réponse : uniquement des compteurs."""
    measured = LLMCall.usage_measured.is_(True)
    # `usage=None` est stocké comme JSON null (pas NULL SQL) : on teste la présence du compteur
    has_usage = func.json_extract(LLMCall.usage, "$.input_tokens").is_not(None)

    def agg(*group_cols):
        q = select(
            *group_cols,
            func.count(LLMCall.id),
            func.coalesce(func.sum(LLMCall.attempts), 0),
            func.sum(case((has_usage, 0), else_=1)),
            func.coalesce(func.sum(case((measured, func.json_extract(LLMCall.usage, "$.input_tokens")), else_=0)), 0),
            func.coalesce(func.sum(case((measured, func.json_extract(LLMCall.usage, "$.output_tokens")), else_=0)), 0),
            func.coalesce(func.sum(case((has_usage & ~measured, func.json_extract(LLMCall.usage, "$.input_tokens")), else_=0)), 0),
            func.coalesce(func.sum(case((has_usage & ~measured, func.json_extract(LLMCall.usage, "$.output_tokens")), else_=0)), 0),
            func.coalesce(func.avg(LLMCall.duration_ms), 0),
        )
        if group_cols:
            q = q.group_by(*group_cols).order_by(*group_cols)
        return q

    def to_dict(row, n_keys=0):
        k = list(row[:n_keys])
        calls, provider_calls, failed, in_m, out_m, in_e, out_e, avg_ms = row[n_keys:]
        d = {
            "llm_calls": calls,
            "provider_calls": provider_calls,  # appels réellement émis, retries techniques compris
            "failed_calls": int(failed or 0),
            "input_tokens_measured": int(in_m), "output_tokens_measured": int(out_m),
            "input_tokens_estimated": int(in_e), "output_tokens_estimated": int(out_e),
            "avg_duration_ms": round(float(avg_ms)),
        }
        return k, d

    _, total = to_dict(db.execute(agg()).one())
    total_tokens = sum(total[k] for k in ("input_tokens_measured", "output_tokens_measured", "input_tokens_estimated", "output_tokens_estimated"))
    total["total_tokens"] = total_tokens
    total["estimate_flagged"] = (total["input_tokens_estimated"] + total["output_tokens_estimated"]) > 0
    by_model = {k[0]: d for k, d in (to_dict(r, 1) for r in db.execute(agg(LLMCall.model)))}
    by_role = {k[0]: d for k, d in (to_dict(r, 1) for r in db.execute(agg(LLMCall.role)))}

    per_session = db.execute(
        select(
            ActionRun.session_id,
            func.coalesce(func.sum(func.json_extract(LLMCall.usage, "$.input_tokens") + func.json_extract(LLMCall.usage, "$.output_tokens")), 0),
        )
        .join(ActionRun, ActionRun.id == LLMCall.action_id)
        .where(has_usage)
        .group_by(ActionRun.session_id)
    ).all()
    cap_s, cap_g = settings.token_cap_session, settings.token_cap_global
    return {
        "provider": settings.llm_provider,
        "note": "Tokens « estimated » : le fournisseur ne remonte pas de compteurs (usage.measured = false) ; ne pas les assimiler à une mesure.",
        "failed_definition": "appel sans réponse exploitable (aucun compteur d'usage enregistré)",
        "total": total,
        "by_model": by_model,
        "by_role": by_role,
        "caps": {
            "session": cap_s,
            "global": cap_g,
            "global_used_pct": round(100 * total_tokens / cap_g, 1) if cap_g else None,
            "sessions_over_session_cap": sum(1 for _, t in per_session if cap_s and t >= cap_s),
            "max_session_tokens": max((int(t) for _, t in per_session), default=0),
        },
        "sessions": db.scalar(select(func.count(GameSession.id))),
    }
