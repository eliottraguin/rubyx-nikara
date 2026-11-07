"""Modèle SQLAlchemy (docs/DATA-MODEL.md). Le schéma réel est créé par Alembic."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    MetaData,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

NAMING = {
    "ix": "ix_%(table_name)s_%(column_0_N_name)s",
    "uq": "uq_%(table_name)s_%(column_0_N_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING)


def utcnow() -> datetime:
    return datetime.now(UTC)


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:16]}"


def _fk(target: str) -> Mapped[str]:
    return mapped_column(String, ForeignKey(target, ondelete="CASCADE"), nullable=False)


class GameSession(Base):
    __tablename__ = "game_sessions"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("ses"))
    token_hash: Mapped[str] = mapped_column(String, unique=True, nullable=False)  # sha256 du cookie opaque
    mode: Mapped[str] = mapped_column(String, nullable=False)
    company: Mapped[dict] = mapped_column(JSON, nullable=False)
    state: Mapped[str] = mapped_column(String, nullable=False, default="ACTIVE")
    stage: Mapped[str] = mapped_column(String, nullable=False)
    seed: Mapped[int] = mapped_column(Integer, nullable=False)
    rules_version: Mapped[str] = mapped_column(String, nullable=False)
    # Idempotence de la création (migration 0004) : empreintes (jamais la clé en clair) ; unique => pas de 2e partie
    creation_key_hash: Mapped[str | None] = mapped_column(String, unique=True)
    creation_request_hash: Mapped[str | None] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)


class TargetProfileVersion(Base):
    """Une version de la fiche entreprise et cible (docs/PRODUIT-PROSPECTION.md §11). Immuable : trigger SQLite (migration 0005)."""

    __tablename__ = "target_profile_versions"
    __table_args__ = (UniqueConstraint("session_id", "version"), UniqueConstraint("session_id", "key_hash"))
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("tpv"))
    session_id: Mapped[str] = _fk("game_sessions.id")
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    data: Mapped[dict] = mapped_column(JSON, nullable=False)  # champs de la fiche (texte non fiable : une donnée, jamais une consigne)
    key_hash: Mapped[str | None] = mapped_column(String)  # empreinte de l'Idempotency-Key de l'écriture (jamais la clé)
    request_hash: Mapped[str | None] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class AgentOwnership(Base):
    __tablename__ = "agent_ownerships"
    __table_args__ = (UniqueConstraint("session_id", "role"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[str] = _fk("game_sessions.id")
    role: Mapped[str] = mapped_column(String, nullable=False)
    price_paid: Mapped[int] = mapped_column(Integer, nullable=False)
    purchased_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class MissionDefinition(Base):
    """Copie en base d'une définition de mission (la source reste data/missions/)."""

    __tablename__ = "mission_definitions"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    version: Mapped[str] = mapped_column(String, primary_key=True)
    mode: Mapped[str] = mapped_column(String, primary_key=True)
    brief: Mapped[str] = mapped_column(Text, nullable=False)
    corpus: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    criteria: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    max_reward: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price: Mapped[int] = mapped_column(Integer, nullable=False)
    events: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    prerequisites: Mapped[list] = mapped_column(JSON, nullable=False, default=list)


class MissionAttempt(Base):
    __tablename__ = "mission_attempts"
    __table_args__ = (UniqueConstraint("session_id", "mission_id", "attempt_no"), Index("ix_mission_attempts_session_id", "session_id"))
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("att"))
    session_id: Mapped[str] = _fk("game_sessions.id")
    mission_id: Mapped[str] = mapped_column(String, nullable=False)
    brief_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    status: Mapped[str] = mapped_column(String, nullable=False, default="ACTIVE")
    spend_cap: Mapped[int | None] = mapped_column(Integer)
    message_counts: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    clarifications_used: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    model_calls: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    attempt_no: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    unit_price: Mapped[int] = mapped_column(Integer, nullable=False)  # figé à l'ouverture
    open_key_hash: Mapped[str | None] = mapped_column(String)  # empreinte de l'Idempotency-Key d'ouverture (rejeu de retry)
    profile_version: Mapped[int | None] = mapped_column(Integer)  # version de la fiche entreprise à l'ouverture (figée, API-H2)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)


class ActionRun(Base):
    __tablename__ = "action_runs"
    # Clé d'idempotence unique PAR SESSION (migration 0002) : une clé d'une autre partie ne collisionne jamais.
    __table_args__ = (UniqueConstraint("session_id", "idempotency_key"), Index("ix_action_runs_session_id", "session_id"))
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("act"))
    session_id: Mapped[str] = _fk("game_sessions.id")
    attempt_id: Mapped[str | None] = mapped_column(String, ForeignKey("mission_attempts.id", ondelete="CASCADE"))
    idempotency_key: Mapped[str] = mapped_column(String, nullable=False)
    request_hash: Mapped[str | None] = mapped_column(String)  # empreinte de la requête : même clé + autre requête = refus
    confirm_keys: Mapped[list] = mapped_column(JSON, nullable=False, default=list, server_default="[]")  # clés des confirmations déjà reçues
    type: Mapped[str] = mapped_column(String, nullable=False)
    reservation_id: Mapped[str | None] = mapped_column(String)
    status: Mapped[str] = mapped_column(String, nullable=False, default="PENDING")
    steps: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    error: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)


class Message(Base):
    __tablename__ = "messages"
    __table_args__ = (Index("ix_messages_attempt_id", "attempt_id"),)
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("msg"))
    attempt_id: Mapped[str] = _fk("mission_attempts.id")
    role: Mapped[str] = mapped_column(String, nullable=False)
    author: Mapped[str] = mapped_column(String, nullable=False)  # player | agent
    text: Mapped[str] = mapped_column(Text, nullable=False)
    linked_artifact_ids: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    status: Mapped[str] = mapped_column(String, nullable=False)
    action_id: Mapped[str | None] = mapped_column(String, ForeignKey("action_runs.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class ArtifactVersion(Base):
    """Immuable : un trigger SQLite refuse tout UPDATE (voir migration)."""

    __tablename__ = "artifact_versions"
    __table_args__ = (Index("ix_artifact_versions_attempt_id", "attempt_id"),)
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("art"))
    attempt_id: Mapped[str] = _fk("mission_attempts.id")
    type: Mapped[str] = mapped_column(String, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    parent_id: Mapped[str | None] = mapped_column(String, ForeignKey("artifact_versions.id", ondelete="CASCADE"))
    author: Mapped[str] = mapped_column(String, nullable=False)  # agent | player
    sources: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    contributions: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class Submission(Base):
    __tablename__ = "submissions"
    __table_args__ = (Index("ix_submissions_attempt_id", "attempt_id"),)
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("sub"))
    attempt_id: Mapped[str] = _fk("mission_attempts.id")
    artifact_version_id: Mapped[str] = mapped_column(String, ForeignKey("artifact_versions.id", ondelete="CASCADE"), nullable=False)
    brief_version: Mapped[int] = mapped_column(Integer, nullable=False)
    content_hash: Mapped[str] = mapped_column(String, nullable=False)
    rubric: Mapped[dict] = mapped_column(JSON, nullable=False)  # grille figée
    status: Mapped[str] = mapped_column(String, nullable=False, default="EVALUATING")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class Evaluation(Base):
    __tablename__ = "evaluations"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("evl"))
    submission_id: Mapped[str] = mapped_column(String, ForeignKey("submissions.id", ondelete="CASCADE"), unique=True, nullable=False)
    model: Mapped[str] = mapped_column(String, nullable=False)
    judge_version: Mapped[str] = mapped_column(String, nullable=False)
    criteria: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    score: Mapped[int | None] = mapped_column(Integer)
    evidence: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    status: Mapped[str] = mapped_column(String, nullable=False)
    # BE06 : rapport serveur (retour client, réussite, paiement, plafond essentiel…). Jamais écrit par le modèle.
    report: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class LedgerEntry(Base):
    __tablename__ = "ledger_entries"
    __table_args__ = (Index("ix_ledger_entries_session_id", "session_id"),)
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("led"))
    session_id: Mapped[str] = _fk("game_sessions.id")
    amount: Mapped[int] = mapped_column(Integer, nullable=False)  # entier signé
    category: Mapped[str] = mapped_column(String, nullable=False)
    source_action: Mapped[str] = mapped_column(String, unique=True, nullable=False)  # source unique : pas de double paiement
    state: Mapped[str] = mapped_column(String, nullable=False, default="POSTED")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class LLMCall(Base):
    __tablename__ = "llm_calls"
    __table_args__ = (Index("ix_llm_calls_action_id", "action_id"),)
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("llm"))
    action_id: Mapped[str] = _fk("action_runs.id")
    role: Mapped[str] = mapped_column(String, nullable=False)
    model: Mapped[str] = mapped_column(String, nullable=False)
    usage: Mapped[dict | None] = mapped_column(JSON)
    usage_measured: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    duration_ms: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    real_cost: Mapped[float | None] = mapped_column(Float)
    versions: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)  # versions rôle/mission/grille utilisées
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class NotebookEntry(Base):
    __tablename__ = "notebook_entries"
    __table_args__ = (Index("ix_notebook_entries_session_id", "session_id"),)
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("nbk"))
    session_id: Mapped[str] = _fk("game_sessions.id")
    title: Mapped[str] = mapped_column(String, nullable=False)
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    role: Mapped[str] = mapped_column(String, nullable=False)
    mission_id: Mapped[str | None] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class Reservation(Base):
    """Réservation d'argent + quota avant appel ; échéance et réconciliation."""

    __tablename__ = "reservations"
    __table_args__ = (Index("ix_reservations_session_id", "session_id"),)
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("rsv"))
    session_id: Mapped[str] = _fk("game_sessions.id")
    action_id: Mapped[str] = mapped_column(String, ForeignKey("action_runs.id", ondelete="CASCADE"), nullable=False)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    role: Mapped[str | None] = mapped_column(String)
    attempt_id: Mapped[str | None] = mapped_column(String, ForeignKey("mission_attempts.id", ondelete="CASCADE"))
    quota: Mapped[int] = mapped_column(Integer, nullable=False, default=0)  # messages réservés
    status: Mapped[str] = mapped_column(String, nullable=False, default="ACTIVE")  # ACTIVE | SETTLED | RELEASED
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class ArtifactShare(Base):
    """Journal des partages de pièces vers un rôle."""

    __tablename__ = "artifact_shares"
    __table_args__ = (Index("ix_artifact_shares_attempt_id", "attempt_id"),)
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("shr"))
    attempt_id: Mapped[str] = _fk("mission_attempts.id")
    artifact_version_id: Mapped[str] = mapped_column(String, ForeignKey("artifact_versions.id", ondelete="CASCADE"), nullable=False)
    role: Mapped[str] = mapped_column(String, nullable=False)
    action_id: Mapped[str | None] = mapped_column(String, ForeignKey("action_runs.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class AppliedEvent(Base):
    __tablename__ = "applied_events"
    __table_args__ = (UniqueConstraint("attempt_id", "event_id"),)
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("evt"))
    attempt_id: Mapped[str] = _fk("mission_attempts.id")
    event_id: Mapped[str] = mapped_column(String, nullable=False)
    brief_version: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
