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


class HangarRole(StrEnum):
    """Rôles du hangar du cap prospection (docs/RULES.md §2, 5e décision) : un seul bot de prospection, trois rôles
    de communication. `qualifier`, `profiler` et `outreach` n'existent plus (tri par code, actions portées par `replier`).
    Le moteur d'expédition livré (BE01–BE07) garde l'énumération `Role` tant que le contenu M1–M6 n'est pas remplacé."""

    SCOUT = "scout"
    TRIAGE = "triage"
    REPLIER = "replier"
    ADS = "ads"


class ErrorBody(BaseModel):
    code: str = Field(description="Code stable (ex. INSUFFICIENT_FUNDS)")
    message: str = Field(description="Message en français, sans donnée sensible")
    details: list[dict] | None = Field(default=None, description="Détails de validation (emplacement + message)")


class ErrorResponse(BaseModel):
    error: ErrorBody
