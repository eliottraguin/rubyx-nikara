"""Types communs : rôles, modes, enveloppe d'erreur."""

from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, Field


class Mode(StrEnum):
    BEGINNER = "beginner"
    EXPERT = "expert"


class Role(StrEnum):
    """Rôles du hangar du cap prospection (docs/RULES.md §2, 5e décision) : un seul bot de prospection (`scout`), trois
    rôles de communication, plus les assistants personnels (docs/ASSISTANT.md). Les rôles de l'ancien parcours
    (`writer`, `prospector`, `researcher`, `analyst`, `qa`, `lead`) sont retirés (6e décision, API-R2)."""

    SCOUT = "scout"
    TRIAGE = "triage"
    REPLIER = "replier"
    ADS = "ads"
    # Assistants personnels (docs/ASSISTANT.md) : un par section, fournis au départ ; ils proposent un plan, ne produisent rien.
    ASSISTANT_PROSPECTION = "assistant_prospection"
    ASSISTANT_CLIENTS = "assistant_clients"
    ASSISTANT_PUB = "assistant_pub"


HangarRole = Role  # nom historique (rôles du hangar) : même énumération


class ErrorBody(BaseModel):
    code: str = Field(description="Code stable (ex. INSUFFICIENT_FUNDS)")
    message: str = Field(description="Message en français, sans donnée sensible")
    details: list[dict] | None = Field(default=None, description="Détails de validation (emplacement + message)")


class ErrorResponse(BaseModel):
    error: ErrorBody
