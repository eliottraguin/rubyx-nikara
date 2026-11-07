"""Partie de démonstration : initialisation seedée, réinitialisation (F14), export/import de snapshot.

Une partie de démo est une partie ordinaire créée par `services.sessions.create_session` (aucune règle dupliquée),
puis marquée `company.demo = true` et dotée de la graine fixe `DEMO_SEED`. Seules les parties marquées sont touchées
par ces commandes : une partie normale n'est jamais lue, modifiée ni supprimée ici."""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, delete, or_, select, text
from sqlalchemy.orm import Session

from ..models import Base, GameSession
from ..rules import Rules
from ..schemas.common import Mode
from ..schemas.state import SessionCreate
from ..services import sessions as svc
from .health import expected_head

DEMO_SEED = 20260101
DEMO_COMPANY = "Atelier Démo"
DEMO_PROFILE = "Partie de démonstration (graine fixe, mode simulé)"
SNAPSHOT_FORMAT = "rubix-demo-snapshot/1"


class DemoError(Exception):
    """Erreur d'exploitation lisible (message en français, aucune donnée sensible)."""


def demo_sessions(db: Session) -> list[GameSession]:
    return [g for g in db.scalars(select(GameSession).order_by(GameSession.created_at)) if (g.company or {}).get("demo") is True]


def delete_demo(db: Session) -> int:
    """Supprime les parties de démo (cascade sur toutes leurs lignes). Retourne le nombre de parties supprimées."""
    ids = [g.id for g in demo_sessions(db)]
    if ids:
        db.execute(delete(GameSession).where(GameSession.id.in_(ids)))
        db.commit()
    return len(ids)


def init_demo(db: Session, rules: Rules, mode: str = "beginner", replace: bool = True) -> tuple[GameSession, str]:
    """Crée la partie de démo seedée. `replace` : supprime d'abord les parties de démo existantes."""
    if replace:
        delete_demo(db)
    elif demo_sessions(db):
        raise DemoError("Une partie de démo existe déjà ; utiliser demo-reset ou --replace.")
    game, token = svc.create_session(db, rules, SessionCreate(company_name=DEMO_COMPANY, mode=Mode(mode), profile=DEMO_PROFILE))
    game.seed = DEMO_SEED
    game.company = {**game.company, "demo": True}
    db.commit()
    return game, token


def reset_demo(db: Session, rules: Rules, mode: str = "beginner") -> tuple[GameSession, str, int]:
    """F14 : remet la démo à zéro (suppression des parties de démo puis recréation seedée). Retourne (partie, jeton, supprimées)."""
    removed = delete_demo(db)
    game, token = init_demo(db, rules, mode, replace=False)
    return game, token, removed


# --- snapshot ---------------------------------------------------------------------------------------


def _row_filters(session_id: str, collected: dict[str, set[Any]]):
    """Conditions de sélection par table, déduites des clés étrangères (parcours générique depuis game_sessions)."""
    for table in Base.metadata.sorted_tables:
        if table.name == GameSession.__tablename__:
            yield table, table.c.id == session_id
            continue
        conds = []
        for fk in table.foreign_keys:
            target = fk.column.table
            if target is table:
                continue  # clé auto-référente (parent_id) : déjà couverte par l'autre clé
            if target.name == GameSession.__tablename__:
                conds.append(fk.parent == session_id)
            elif target.name in collected:
                conds.append(fk.parent.in_(collected[target.name] or {"__none__"}))
        if conds:
            yield table, or_(*conds)


def export_snapshot(db: Session, session_id: str | None = None) -> dict[str, Any]:
    """Snapshot JSON cohérent (une transaction de lecture) d'UNE partie de démo : toutes ses lignes, tables dans l'ordre des clés."""
    demos = demo_sessions(db)
    if session_id is not None:
        demos = [g for g in demos if g.id == session_id]
    if not demos:
        raise DemoError("Aucune partie de démo à exporter (voir demo-init).")
    if len(demos) > 1:
        raise DemoError("Plusieurs parties de démo : préciser --session.")
    sid = demos[0].id
    collected: dict[str, set[Any]] = {}
    tables: dict[str, list[dict[str, Any]]] = {}
    for table, cond in _row_filters(sid, collected):
        rows = []
        for m in db.execute(select(table).where(cond)).mappings():
            rows.append({k: (v.isoformat() if isinstance(v, datetime) else v) for k, v in m.items()})
        tables[table.name] = rows
        pk = next(iter(table.primary_key.columns))
        collected[table.name] = {r[pk.name] for r in rows}
    return {
        "format": SNAPSHOT_FORMAT,
        "schema_revision": expected_head(),
        "rules_version": demos[0].rules_version,
        "session_id": sid,
        "tables": tables,
    }


def import_snapshot(db: Session, snap: dict[str, Any]) -> str:
    """Restaure un snapshot de démo : remplace les parties de démo existantes, une seule transaction. Retourne l'id de la partie."""
    if snap.get("format") != SNAPSHOT_FORMAT:
        raise DemoError("Fichier inconnu : ce n'est pas un snapshot de démo.")
    if snap.get("schema_revision") != expected_head():
        raise DemoError("Le snapshot a été produit avec un autre schéma de base ; le régénérer.")
    rows_by_table = snap.get("tables") or {}
    sessions = rows_by_table.get(GameSession.__tablename__) or []
    if len(sessions) != 1 or (sessions[0].get("company") or {}).get("demo") is not True:
        raise DemoError("Le snapshot ne contient pas exactement une partie de démo.")
    unknown = set(rows_by_table) - set(Base.metadata.tables)
    if unknown:
        raise DemoError("Le snapshot référence des tables inconnues.")
    sid = sessions[0]["id"]
    if db.get(GameSession, sid) is not None and (db.get(GameSession, sid).company or {}).get("demo") is not True:
        raise DemoError("Un identifiant de partie du snapshot est déjà utilisé par une partie normale ; restauration refusée.")
    try:
        db.execute(delete(GameSession).where(GameSession.id.in_([g.id for g in demo_sessions(db)])))
        db.execute(text("PRAGMA defer_foreign_keys=ON"))  # auto-références (parent_id) : contrôle au commit
        for table in Base.metadata.sorted_tables:
            rows = rows_by_table.get(table.name) or []
            if not rows:
                continue
            fixed = []
            for r in rows:
                row = dict(r)
                for col in table.columns:
                    if isinstance(col.type, DateTime) and isinstance(row.get(col.name), str):
                        row[col.name] = datetime.fromisoformat(row[col.name])
                fixed.append(row)
            db.execute(table.insert(), fixed)
        db.commit()
    except Exception as exc:
        db.rollback()
        raise DemoError(f"Restauration impossible, base inchangée ({type(exc).__name__}).") from exc
    return sid


def write_snapshot(path, snap: dict[str, Any]) -> None:  # noqa: ANN001
    import os

    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)  # contient le hachage du jeton de la démo
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(snap, f, ensure_ascii=False, indent=1, default=str)
