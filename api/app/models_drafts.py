"""Versions de fiche client et de premier message d'un prospect (docs/CONTRACTS.md §3). Schéma réel : migration 0014."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from .models import Base, _fk, new_id, utcnow


class ProspectDraft(Base):
    """Version **immuable** (trigger SQLite : aucun UPDATE) d'une fiche client (`kind = fiche`) ou d'un brouillon de premier
    message (`kind = message`). Numérotée par `(prospect, kind)`. Une édition du joueur est une version enfant (`parent_id`,
    `auteur = joueur`) ; l'original reste intact. Supprimée en cascade avec le prospect et la partie.

    `contenu` est du **texte non fiable** (jamais rendu en HTML). Il ne contient jamais d'adresse ni de numéro (contrôle par code)."""

    __tablename__ = "prospect_drafts"
    __table_args__ = (
        UniqueConstraint("prospect_id", "kind", "numero"),
        Index("ix_prospect_drafts_prospect_id", "prospect_id"),
        Index("ix_prospect_drafts_session_id", "session_id"),
    )
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("pdr"))
    session_id: Mapped[str] = _fk("game_sessions.id")
    prospect_id: Mapped[str] = _fk("prospects.id")
    kind: Mapped[str] = mapped_column(String, nullable=False)  # fiche | message
    numero: Mapped[int] = mapped_column(Integer, nullable=False)
    parent_id: Mapped[str | None] = mapped_column(String, ForeignKey("prospect_drafts.id", ondelete="CASCADE"))
    auteur: Mapped[str] = mapped_column(String, nullable=False)  # agent | joueur
    contenu: Mapped[dict] = mapped_column(JSON, nullable=False)
    controles: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    consigne: Mapped[str | None] = mapped_column(Text)
    profile_version: Mapped[int] = mapped_column(Integer, nullable=False)
    simule: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    action_id: Mapped[str | None] = mapped_column(String)  # pas de FK : un UPDATE (SET NULL) violerait l'immutabilité
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
