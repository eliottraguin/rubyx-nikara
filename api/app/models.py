"""Modèle SQLAlchemy (docs/DATA-MODEL.md). Le schéma réel est créé par Alembic."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
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


class AuthUser(Base):
    """Email/password user account (Epic 1: authentication)."""

    __tablename__ = "auth_users"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("usr"))
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


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


class TargetActionUse(Base):
    """Compteur de générations d'une action sur une cible (cap prospection, RULES §4 et §11) : quota 5 jamais 6.

    Clé `(session, kind, target_id, key)` : `kind` = `prospect` (key = action : `prospect_profile`, `prospect_message`),
    `conversation` ou `campaign` (key = rôle). `used` = générations consommées ; `reserved` = en cours d'appel modèle
    (rendues si la réponse est inexploitable : jamais de génération comptée sans réponse)."""

    __tablename__ = "target_action_uses"
    __table_args__ = (
        UniqueConstraint("session_id", "kind", "target_id", "key"),
        CheckConstraint("used >= 0 AND reserved >= 0", name="ck_target_action_uses_non_negative"),
    )
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[str] = _fk("game_sessions.id")
    kind: Mapped[str] = mapped_column(String, nullable=False)
    target_id: Mapped[str] = mapped_column(String, nullable=False)
    key: Mapped[str] = mapped_column(String, nullable=False)
    used: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    reserved: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class ExpeditionRecord(Base):
    """Enregistrement **renvoyé par une source pendant une expédition** (déjà minimisé par liste blanche). C'est la seule
    référence de vérification d'un `source_ref` (règle 12) : écrit par le serveur (moteur d'expédition), jamais par le navigateur."""

    __tablename__ = "expedition_records"
    __table_args__ = (UniqueConstraint("attempt_id", "source", "source_ref"), Index("ix_expedition_records_session_id", "session_id"))
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("rec"))
    session_id: Mapped[str] = _fk("game_sessions.id")
    attempt_id: Mapped[str] = _fk("mission_attempts.id")
    source: Mapped[str] = mapped_column(String, nullable=False)
    source_ref: Mapped[str] = mapped_column(String, nullable=False)
    record: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class Prospect(Base):
    """Prospect du carnet (docs/PRODUIT-PROSPECTION.md §12). Provenance **immuable** (trigger SQLite, migration 0006) :
    seuls `statut`, `notes` et les colonnes de suivi changent. Données personnelles : jamais dans les journaux."""

    __tablename__ = "prospects"
    __table_args__ = (
        UniqueConstraint("session_id", "source", "source_ref"),
        Index("ix_prospects_session_id", "session_id"),
        Index("ix_prospects_session_id_entreprise_cle", "session_id", "entreprise_cle"),
    )
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("pro"))
    session_id: Mapped[str] = _fk("game_sessions.id")
    entreprise: Mapped[str] = mapped_column(String, nullable=False)
    entreprise_cle: Mapped[str] = mapped_column(String, nullable=False)  # nom normalisé : tri et « possible doublon »
    contact_nom: Mapped[str | None] = mapped_column(String)
    contact_fonction: Mapped[str | None] = mapped_column(String)
    canal_type: Mapped[str | None] = mapped_column(String)
    canal_valeur: Mapped[str | None] = mapped_column(String)
    source: Mapped[str] = mapped_column(String, nullable=False)
    source_ref: Mapped[str] = mapped_column(String, nullable=False)
    raisons_fit: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    signal: Mapped[str | None] = mapped_column(String)
    pertinence: Mapped[int] = mapped_column(Integer, nullable=False)  # calculé par le serveur
    fiabilite: Mapped[str] = mapped_column(String, nullable=False)  # verifie | partiel | simule
    simule: Mapped[bool] = mapped_column(Boolean, nullable=False)
    instantane: Mapped[dict] = mapped_column(JSON, nullable=False)  # copie minimisée de l'enregistrement de la source
    collecte_le: Mapped[str | None] = mapped_column(String)  # date de collecte (ISO) de l'enregistrement
    expedition_id: Mapped[str] = mapped_column(String, nullable=False)
    rapport_version_id: Mapped[str] = mapped_column(String, nullable=False)
    profile_version: Mapped[int] = mapped_column(Integer, nullable=False)
    statut: Mapped[str] = mapped_column(String, nullable=False, default="nouveau")
    notes: Mapped[str] = mapped_column(Text, nullable=False, default="")
    historique: Mapped[list] = mapped_column(JSON, nullable=False, default=list)  # [{statut, le}]
    cree_le: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    modifie_le: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    contacte_le: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    derniere_activite_le: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)


class ProspectIdempotency(Base):
    """Rejeu des mutations du carnet : empreintes (jamais la clé en clair) et identifiants seulement, **aucun contenu**."""

    __tablename__ = "prospect_idempotency"
    __table_args__ = (UniqueConstraint("session_id", "key_hash"),)
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("pid"))
    session_id: Mapped[str] = _fk("game_sessions.id")
    key_hash: Mapped[str] = mapped_column(String, nullable=False)
    request_hash: Mapped[str] = mapped_column(String, nullable=False)
    status_code: Mapped[int] = mapped_column(Integer, nullable=False)
    result: Mapped[dict | None] = mapped_column(JSON)  # identifiants et positions seulement
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class Conversation(Base):
    """Une conversation par prospect du carnet (docs/PRODUIT-CLIENTS-PUB.md §3). `prospect_id` n'a PAS de clé étrangère
    ici : le carnet (`prospects`) est construit en parallèle ; au raccord, la suppression d'un prospect appelle
    `services.conversations.delete_for_prospect` (cascade) et une FK pourra être ajoutée."""

    __tablename__ = "conversations"
    __table_args__ = (UniqueConstraint("session_id", "prospect_id"), Index("ix_conversations_session_id", "session_id"))
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("cnv"))
    session_id: Mapped[str] = _fk("game_sessions.id")
    prospect_id: Mapped[str] = mapped_column(String, nullable=False)
    simule: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    persona_id: Mapped[str | None] = mapped_column(String)  # client simulé (Tutoriel) : choisi par la graine de la partie
    client_turns: Mapped[int] = mapped_column(Integer, nullable=False, default=0)  # tours du client simulé déjà joués
    opted_out: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)  # désinscription (code OU modèle)
    closed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    outcome: Mapped[dict | None] = mapped_column(JSON)  # résultat de conversation, calculé par code (Tutoriel)
    last_message_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)


class ConversationMessage(Base):
    __tablename__ = "conversation_messages"
    __table_args__ = (UniqueConstraint("conversation_id", "seq"),)
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("cmg"))
    conversation_id: Mapped[str] = _fk("conversations.id")
    seq: Mapped[int] = mapped_column(Integer, nullable=False)
    sens: Mapped[str] = mapped_column(String, nullable=False)  # envoye | recu
    etat: Mapped[str | None] = mapped_column(String)  # ENVOYE | NON_ENVOYE (messages envoyés seulement)
    text: Mapped[str] = mapped_column(Text, nullable=False)  # contenu non fiable : rendu texte, jamais HTML
    simule: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    draft_version_id: Mapped[str | None] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class ReplyDraft(Base):
    """Version immuable d'un brouillon de réponse (agent `replier`) ou copie éditée par le joueur (`parent_id`)."""

    __tablename__ = "reply_drafts"
    __table_args__ = (Index("ix_reply_drafts_conversation_id", "conversation_id"),)
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("drf"))
    conversation_id: Mapped[str] = _fk("conversations.id")
    parent_id: Mapped[str | None] = mapped_column(String, ForeignKey("reply_drafts.id", ondelete="CASCADE"))
    auteur: Mapped[str] = mapped_column(String, nullable=False)  # agent | joueur
    objet: Mapped[str | None] = mapped_column(String)
    corps: Mapped[str] = mapped_column(Text, nullable=False)
    a_verifier: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    controles: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    action_id: Mapped[str | None] = mapped_column(String)  # pas de FK : un UPDATE (SET NULL) violerait l'immutabilité
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class ConversationSynthesis(Base):
    """Synthèse immuable d'une conversation (agent `triage`)."""

    __tablename__ = "conversation_syntheses"
    __table_args__ = (Index("ix_conversation_syntheses_conversation_id", "conversation_id"),)
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("syn"))
    conversation_id: Mapped[str] = _fk("conversations.id")
    intention: Mapped[str] = mapped_column(String, nullable=False)
    points: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    urgence: Mapped[str] = mapped_column(String, nullable=False)
    statut_suggere: Mapped[str | None] = mapped_column(String)
    desinscription_code: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)  # détecté par le code
    controles: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    action_id: Mapped[str | None] = mapped_column(String)  # pas de FK : un UPDATE (SET NULL) violerait l'immutabilité
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
