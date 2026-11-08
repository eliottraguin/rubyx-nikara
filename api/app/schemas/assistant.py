"""Contrats des assistants personnels (docs/ASSISTANT.md). Textes en français courant : aucun mot technique."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class PlanIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    assistant: str = Field(description="`assistant_prospection` | `assistant_clients` | `assistant_pub`")
    message: str = Field(min_length=1, max_length=500, description="Ce que le joueur demande, en une ou deux phrases")


class PlanStepOut(BaseModel):
    index: int
    type: str
    target_id: str
    target_label: str
    title: str = Field(description="Phrase d'action en français courant")
    who: str = Field(description="Qui s'en occupe")
    you_get: str = Field(description="Ce que le joueur obtiendra")
    instruction: str
    cost: int
    blocked_reason: str | None = Field(description="Phrase simple si la tâche ne peut pas se faire maintenant ; sinon null")
    status: str  # READY | BLOCKED | RUNNING | DONE | FAILED
    action_id: str | None = Field(default=None, description="Travail lancé par cette tâche (suivi via /api/actions/{id})")
    result_text: str | None = Field(default=None, description="Phrase simple : ce qui s'est passé (réussi ou raison de l'échec)")
    tries: int = 0


class PlanOut(BaseModel):
    id: str
    assistant: str
    assistant_label: str
    headline: str
    banner: str
    summary: str
    status: str  # PROPOSED | RUNNING | DONE | PARTIAL | REJECTED
    steps: list[PlanStepOut]
    total_cost: int = Field(description="Ce que le joueur dépensera s'il confirme (tâches faisables seulement)")
    balance: int
    balance_after: int
    plans_left: int
    simule: bool
    created_at: datetime


class PlanListOut(BaseModel):
    items: list[PlanOut]
    plans_left: int
