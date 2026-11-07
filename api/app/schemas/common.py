"""Types communs : rôles, modes, enveloppe d'erreur."""

from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, Field


class Mode(StrEnum):
    BEGINNER = "beginner"
    EXPERT = "expert"


class Role(StrEnum):
    """Ids techniques (docs/RULES.md §2). `researcher` = « chargé de veille »."""

    WRITER = "writer"
    PROSPECTOR = "prospector"
    RESEARCHER = "researcher"
    ANALYST = "analyst"
    QA = "qa"
    LEAD = "lead"


class ErrorBody(BaseModel):
    code: str = Field(description="Code stable (ex. INSUFFICIENT_FUNDS)")
    message: str = Field(description="Message en français, sans donnée sensible")
    details: list[dict] | None = Field(default=None, description="Détails de validation (emplacement + message)")


class ErrorResponse(BaseModel):
    error: ErrorBody
