"""Recherches du bot `scout` (docs/PARCOURS-BOT.md, docs/CONTRACTS.md §11). Schéma réel : migration 0012."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .models import Base, _fk, new_id, utcnow


class Search(Base):
    """Une recherche gratuite du bot sur un lieu. Aucun montant. `precision` est une donnée saisie par le joueur (jamais une
    consigne). `result` : identifiants de prospects ajoutés et raisons simples des écartés, **sans contact ni contenu de source**."""

    __tablename__ = "searches"
    __table_args__ = (Index("ix_searches_session_id", "session_id"),)
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("src"))
    session_id: Mapped[str] = _fk("game_sessions.id")
    planet_id: Mapped[str] = mapped_column(String, nullable=False)
    precision: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String, nullable=False, default="PENDING")  # PENDING | RUNNING | DONE | FAILED
    found: Mapped[int] = mapped_column(Integer, nullable=False, default=0)  # leads rapportés par le bot
    kept: Mapped[int] = mapped_column(Integer, nullable=False, default=0)  # ajoutés au carnet
    discarded: Mapped[int] = mapped_column(Integer, nullable=False, default=0)  # écartés par le code
    examined: Mapped[int] = mapped_column(Integer, nullable=False, default=0)  # enregistrements renvoyés par le lieu
    profile_version: Mapped[int] = mapped_column(Integer, nullable=False)
    simule: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    action_id: Mapped[str | None] = mapped_column(String)
    result: Mapped[dict | None] = mapped_column(JSON)
    error: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
