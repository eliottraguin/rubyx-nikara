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
    seed: Mapped[int] = mapped_column(Integer, nullable=False)
    rules_version: Mapped[str] = mapped_column(String, nullable=False)
    # Idempotence de la création (migration 0004) : empreintes (jamais la clé en clair) ; unique => pas de 2e partie
    creation_key_hash: Mapped[str | None] = mapped_column(String, unique=True)
    creation_request_hash: Mapped[str | None] = mapped_column(String)
    # Compte propriétaire (migration 0016) ; NULL = partie anonyme. Jamais fourni par le client.
    user_id: Mapped[str | None] = mapped_column(String, ForeignKey("users.id", ondelete="SET NULL"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)


class User(Base):
    """Compte joueur (ADR 0001) : email normalisé unique, hash argon2id (jamais le mot de passe)."""

    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("usr"))
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    token_hash: Mapped[str | None] = mapped_column(String, unique=True)  # sha256 du cookie de compte opaque (migration 0017) ; NULL = déconnecté
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)


class AuthAttempt(Base):
    """Tentative d'authentification échouée (anti-bruteforce) ; empreintes seules, jamais d'email ni d'IP en clair."""

    __tablename__ = "auth_attempts"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    key_hash: Mapped[str] = mapped_column(String, nullable=False, index=True)
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


class AgentInstance(Base):
    """Exemplaire acheté d'un métier (`scout`/`triage`/`replier`/`ads`), plusieurs par rôle (docs/CONTRACTS-V2.md §2).
    `active_config_id` n'a pas de clé étrangère déclarée ici (cycle avec `agent_configs`, ajoutée par la migration)."""

    __tablename__ = "agent_instances"
    __table_args__ = (Index("ix_agent_instances_session_id", "session_id"),)
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("agi"))
    session_id: Mapped[str] = _fk("game_sessions.id")
    role: Mapped[str] = mapped_column(String, nullable=False)
    tier: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False, default="idle")
    label: Mapped[str | None] = mapped_column(String)
    active_config_id: Mapped[str | None] = mapped_column(String)
    price_paid: Mapped[int] = mapped_column(Integer, nullable=False)
    purchased_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)


class AgentConfig(Base):
    """Version immuable (trigger : aucun UPDATE, comme `prospect_drafts`) des instructions et du contexte d'une
    instance ; la version 1 est créée automatiquement à l'achat, copiée depuis `data/roles/<role>.json`."""

    __tablename__ = "agent_configs"
    __table_args__ = (UniqueConstraint("instance_id", "version"), Index("ix_agent_configs_instance_id", "instance_id"))
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("acf"))
    instance_id: Mapped[str] = mapped_column(String, ForeignKey("agent_instances.id", ondelete="CASCADE"), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    parent_id: Mapped[str | None] = mapped_column(String, ForeignKey("agent_configs.id", ondelete="CASCADE"))
    instructions: Mapped[str] = mapped_column(Text, nullable=False)
    context_note: Mapped[str | None] = mapped_column(Text)
    tools: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    tier_cap: Mapped[int] = mapped_column(Integer, nullable=False)
    price_paid: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_by: Mapped[str] = mapped_column(String, nullable=False)  # system | orchestrator
    action_id: Mapped[str | None] = mapped_column(String)  # pas de FK : un UPDATE (SET NULL) violerait l'immutabilité
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class ActionRun(Base):
    __tablename__ = "action_runs"
    # Clé d'idempotence unique PAR SESSION (migration 0002) : une clé d'une autre partie ne collisionne jamais.
    __table_args__ = (UniqueConstraint("session_id", "idempotency_key"), Index("ix_action_runs_session_id", "session_id"))
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("act"))
    session_id: Mapped[str] = _fk("game_sessions.id")
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


class Reservation(Base):
    """Réservation d'argent avant appel ; échéance et réconciliation. Le quota par cible est dans `TargetActionUse`."""

    __tablename__ = "reservations"
    __table_args__ = (Index("ix_reservations_session_id", "session_id"),)
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("rsv"))
    session_id: Mapped[str] = _fk("game_sessions.id")
    action_id: Mapped[str] = mapped_column(String, ForeignKey("action_runs.id", ondelete="CASCADE"), nullable=False)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    role: Mapped[str | None] = mapped_column(String)
    status: Mapped[str] = mapped_column(String, nullable=False, default="ACTIVE")  # ACTIVE | SETTLED | RELEASED
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
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
    pertinence_etiquette: Mapped[str | None] = mapped_column(String)  # correspond | a_verifier | hors_cible (null : jamais triée = « à vérifier »)
    pertinence_citation: Mapped[str | None] = mapped_column(String)  # extrait littéral de la source, vérifié par le serveur
    pertinence_champ: Mapped[str | None] = mapped_column(String)  # champ de la source dont la citation est tirée
    fiabilite: Mapped[str] = mapped_column(String, nullable=False)  # verifie | partiel | simule
    simule: Mapped[bool] = mapped_column(Boolean, nullable=False)
    instantane: Mapped[dict] = mapped_column(JSON, nullable=False)  # copie minimisée de l'enregistrement de la source
    collecte_le: Mapped[str | None] = mapped_column(String)  # date de collecte (ISO) de l'enregistrement
    search_id: Mapped[str] = mapped_column(String, nullable=False)  # recherche (`searches.id`) d'origine ; pas de FK : provenance immuable
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
