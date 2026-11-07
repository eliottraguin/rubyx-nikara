"""Modèle de la section Pub (docs/DATA-MODEL.md : `Campaign`, `CampaignVersion`). Schéma réel : migration 0008."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .models import Base, _fk, new_id, utcnow


class Campaign(Base):
    """Campagne d'un joueur. `version` = compteur de concurrence optimiste (changé par toute modification de la
    campagne : champs du joueur ou nouvelle version de kit). `budget_indicatif` est un texte de plan : il ne touche
    jamais la monnaie du jeu."""

    __tablename__ = "campaigns"
    __table_args__ = (Index("ix_campaigns_session_id", "session_id"),)
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("cmp"))
    session_id: Mapped[str] = _fk("game_sessions.id")
    nom: Mapped[str] = mapped_column(String, nullable=False)
    objectif: Mapped[str] = mapped_column(String, nullable=False)
    plateforme: Mapped[str] = mapped_column(String, nullable=False)
    audience: Mapped[str] = mapped_column(Text, nullable=False)
    budget_indicatif: Mapped[str | None] = mapped_column(String)
    consigne: Mapped[str | None] = mapped_column(Text)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)


class CampaignVersion(Base):
    """Kit de campagne. **Immuable** (trigger SQLite de la migration 0008) ; une édition du joueur crée une version
    enfant. `kit` = sections du kit ; `checks` = résultats des contrôles par code ; jamais de clé ni de prompt système."""

    __tablename__ = "campaign_versions"
    __table_args__ = (UniqueConstraint("campaign_id", "numero"), Index("ix_campaign_versions_campaign_id", "campaign_id"))
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("cmv"))
    campaign_id: Mapped[str] = _fk("campaigns.id")
    numero: Mapped[int] = mapped_column(Integer, nullable=False)
    parent_id: Mapped[str | None] = mapped_column(String, ForeignKey("campaign_versions.id", ondelete="CASCADE"))
    auteur: Mapped[str] = mapped_column(String, nullable=False)  # ads | joueur
    kit: Mapped[dict] = mapped_column(JSON, nullable=False)
    checks: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    consigne: Mapped[str | None] = mapped_column(Text)  # consigne effectivement transmise au générateur
    profile_version: Mapped[int | None] = mapped_column(Integer)  # version de la fiche entreprise utilisée
    simule: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    action_id: Mapped[str | None] = mapped_column(String, ForeignKey("action_runs.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class CampaignRequest(Base):
    """Journal d'idempotence des mutations de campagne (création, modification, copie éditée, suppression) : empreintes
    seulement (jamais la clé en clair) et réponse rejouable. Supprimé avec la partie."""

    __tablename__ = "campaign_requests"
    __table_args__ = (UniqueConstraint("session_id", "key_hash"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[str] = _fk("game_sessions.id")
    key_hash: Mapped[str] = mapped_column(String, nullable=False)
    request_hash: Mapped[str] = mapped_column(String, nullable=False)
    status_code: Mapped[int] = mapped_column(Integer, nullable=False)
    response: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
