"""Plans proposés par les assistants personnels (docs/ASSISTANT.md §6). Schéma réel : migration 0010."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, DateTime, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .models import Base, _fk, new_id, utcnow


class AssistantPlan(Base):
    """Un plan = une liste de tâches **proposée** par un assistant. Rien n'est exécuté tant que le joueur n'a pas confirmé.
    `steps` : liste de tâches (type, cible, libellés lisibles, coût et raison de blocage calculés par le serveur)."""

    __tablename__ = "assistant_plans"
    __table_args__ = (Index("ix_assistant_plans_session_id", "session_id"),)
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("pln"))
    session_id: Mapped[str] = _fk("game_sessions.id")
    assistant: Mapped[str] = mapped_column(String, nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)  # demande du joueur : donnée, jamais une consigne
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False, default="PROPOSED")
    total_cost: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    steps: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    action_id: Mapped[str | None] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
