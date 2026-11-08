"""Instances d'agent achetées en boutique (docs/CONTRACTS-V2.md §2, ticket C2) : plusieurs exemplaires possibles
par métier, chacune avec sa configuration versionnée courante. `AgentOwnership` reste la source du déblocage du
rôle (nombre de clients obtenus, `services.hangar.is_unlocked`) ; `AgentInstance` est la source de la possession
physique d'un exemplaire."""

from __future__ import annotations

import json
from datetime import UTC
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..errors import ApiError, ErrorCode
from ..models import AgentConfig, AgentInstance, utcnow
from ..schemas.agent_instances import (
    AgentConfigOut,
    AgentInstanceOut,
    AgentInstanceSummaryOut,
)

INSTRUCTIONS_MAX_CHARS = 1500
ROLES: tuple[str, ...] = ("scout", "triage", "replier", "ads")


def _aware(dt):
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


def _initial_instructions(data_dir: Path, role: str) -> str:
    """Copie l'identité et l'objectif du rôle (`data/roles/<role>.json`) : contenu, jamais une consigne au joueur."""
    doc = json.loads((data_dir / "roles" / f"{role}.json").read_text(encoding="utf-8"))
    text = f"{doc['identity']} {doc['objective']}"
    return text[:INSTRUCTIONS_MAX_CHARS]


def count_by_role(db: Session, session_id: str, role: str) -> int:
    return db.scalar(
        select(func.count()).select_from(AgentInstance).where(AgentInstance.session_id == session_id, AgentInstance.role == role)
    )


def list_instances(db: Session, session_id: str) -> list[AgentInstance]:
    return list(
        db.scalars(
            select(AgentInstance)
            .where(AgentInstance.session_id == session_id)
            .order_by(AgentInstance.role, AgentInstance.purchased_at, AgentInstance.id)
        )
    )


def get_owned(db: Session, session_id: str, instance_id: str) -> AgentInstance:
    instance = db.get(AgentInstance, instance_id)
    if instance is None or instance.session_id != session_id:
        raise ApiError(ErrorCode.NOT_FOUND)
    return instance


def active_config(db: Session, instance: AgentInstance) -> AgentConfig:
    config = db.get(AgentConfig, instance.active_config_id)
    assert config is not None
    return config


def create_instance(db: Session, data_dir: Path, session_id: str, role: str, tier: int, price_paid: int, max_tier: int) -> AgentInstance:
    """Crée l'instance et sa configuration v1 (`created_by="system"`), immuable. Les contrôles (déblocage, limite
    d'instances, solde) sont faits par l'appelant, dans la même transaction d'écriture."""
    instance = AgentInstance(session_id=session_id, role=role, tier=tier, status="idle", price_paid=price_paid)
    db.add(instance)
    db.flush()  # id généré, nécessaire pour la configuration
    config = AgentConfig(
        instance_id=instance.id,
        version=1,
        parent_id=None,
        instructions=_initial_instructions(data_dir, role),
        context_note=None,
        tools=[],
        tier_cap=min(tier + 1, max_tier),
        price_paid=0,
        created_by="system",
        action_id=None,
    )
    db.add(config)
    db.flush()
    instance.active_config_id = config.id
    db.flush()
    return instance


def set_label(db: Session, session_id: str, instance_id: str, label: str | None) -> AgentInstance:
    instance = get_owned(db, session_id, instance_id)
    if instance.label != label:
        instance.label = label
        instance.updated_at = utcnow()
        db.commit()
    return instance


def to_out(db: Session, instance: AgentInstance) -> AgentInstanceOut:
    config = active_config(db, instance)
    return AgentInstanceOut(
        id=instance.id, role=instance.role, tier=instance.tier, status=instance.status, label=instance.label,
        active_config_id=instance.active_config_id,
        config=AgentConfigOut(version=config.version, instructions=config.instructions, context_note=config.context_note, tools=config.tools, tier_cap=config.tier_cap),
        price_paid=instance.price_paid, purchased_at=_aware(instance.purchased_at),
    )


def summary_view(db: Session, session_id: str) -> list[AgentInstanceSummaryOut]:
    """Vue courte pour `GameState.agents` (docs/CONTRACTS-V2.md §8) : pas de lecture séparée de la configuration
    (seul le numéro de version compte ici)."""
    out = []
    for instance in list_instances(db, session_id):
        config = active_config(db, instance)
        out.append(
            AgentInstanceSummaryOut(
                id=instance.id, role=instance.role, tier=instance.tier, status=instance.status, label=instance.label,
                active_config_id=instance.active_config_id, config_version=config.version,
            )
        )
    return out
